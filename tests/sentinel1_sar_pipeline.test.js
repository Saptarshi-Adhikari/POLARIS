/**
 * POLARIS — Sentinel-1 SAR Product Discovery & Observation Test Suite (Phase 4A)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Sentinel1ProductProvider,
  createCanonicalSarProduct,
  createSarObservation,
  SAR_PRODUCT_TYPE,
  SAR_POLARIZATION,
  SAR_ORBIT_DIRECTION,
  SAR_RETRIEVAL_STATUS
} from '../src/js/data/providers/Sentinel1ProductProvider.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { ENVIRONMENTAL_SOURCE_TYPE, PROVIDER_HEALTH_STATE } from '../src/js/data/ProviderHealthModel.js';

describe('POLARIS Phase 4A — Sentinel-1 SAR Pipeline', () => {
  let provider;

  beforeEach(() => {
    provider = new Sentinel1ProductProvider();
  });

  it('1. Product schema validates canonical format', () => {
    const p = createCanonicalSarProduct({
      productId: 'S1A_IW_GRDH_1SDV_20260315',
      productType: 'GRD',
      acquisitionStart: '2026-03-15T12:00:00Z'
    });

    expect(p.productId).toBe('S1A_IW_GRDH_1SDV_20260315');
    expect(p.mission).toBe('SENTINEL-1');
    expect(p.platform).toBe('SENTINEL-1A');
    expect(p.productType).toBe(SAR_PRODUCT_TYPE.GRD);
    expect(p.acquisitionStart).toBe(Date.parse('2026-03-15T12:00:00Z'));
  });

  it('2. Missing metadata handled safely with UNKNOWN/defaults', () => {
    const p = createCanonicalSarProduct({});
    expect(p.productId).toBeDefined();
    expect(p.productType).toBe(SAR_PRODUCT_TYPE.UNKNOWN);
    expect(p.polarization).toBe(SAR_POLARIZATION.HH);
    expect(p.orbitDirection).toBe(SAR_ORBIT_DIRECTION.UNKNOWN);
  });

  it('3. Spatial bbox filtering detects intersection correctly', () => {
    const b1 = { minX: 10, minY: 10, maxX: 50, maxY: 50 };
    const b2 = { minX: 40, minY: 40, maxX: 80, maxY: 80 };
    const b3 = { minX: 60, minY: 60, maxX: 100, maxY: 100 };

    expect(provider.intersectsBbox(b1, b2)).toBe(true);
    expect(provider.intersectsBbox(b1, b3)).toBe(false);
  });

  it('4. Search products returns replay fixtures when un-credentialed offline', async () => {
    const res = await provider.searchProducts({ limit: 5 });
    expect(res.products).toBeDefined();
    expect(res.products.length).toBeGreaterThan(0);
    expect(res.selectedProduct).toBeDefined();
    expect(res.selectionReasons.length).toBeGreaterThan(0);
  });

  it('5. Product selection policy is deterministic and ranks by recency and GRD type', () => {
    const p1 = createCanonicalSarProduct({ productId: 'P1', acquisitionStart: '2026-03-10T00:00:00Z', productType: 'GRD' });
    const p2 = createCanonicalSarProduct({ productId: 'P2', acquisitionStart: '2026-03-15T00:00:00Z', productType: 'GRD' });
    const p3 = createCanonicalSarProduct({ productId: 'P3', acquisitionStart: '2026-03-15T00:00:00Z', productType: 'RAW' });

    const selection = provider.selectBestProduct([p1, p2, p3]);
    expect(selection.selectedProduct.productId).toBe('P2');
  });

  it('6. Route corridor search calculates bounding box and queries AOI', async () => {
    const route = [{ x: 10, y: 10 }, { x: 50, y: 50 }];
    const res = await provider.searchRouteCorridor(route, 20);

    expect(res.corridorBbox).toEqual({ minX: -10, minY: -10, maxX: 70, maxY: 70 });
    expect(res.bufferKm).toBe(20);
    expect(res.products).toBeDefined();
  });

  it('7. Create SAR observation strictly maintains NOT_PROCESSED classification status', () => {
    const product = createCanonicalSarProduct({ productId: 'S1A_TEST' });
    const contacts = [{ id: 'CT-1' }];
    const obs = createSarObservation(product, contacts);

    expect(obs.observationId).toBe('SAR-OBS-S1A_TEST');
    expect(obs.processingStatus).toBe('NOT_PROCESSED');
    expect(obs.contactsCount).toBe(1);
  });

  it('8. Authentication failure mode returns AUTH_REQUIRED on demand download without credentials', async () => {
    const authProvider = new Sentinel1ProductProvider({ mode: 'ON_DEMAND_DOWNLOAD' });
    const res = await authProvider.searchProducts();

    expect(authProvider.healthTracker.getStatus().state).toBe(PROVIDER_HEALTH_STATE.AUTH_REQUIRED);
    expect(res.source).toBe('REPLAY_FIXTURE');
  });

  it('9. RealDataProvider incorporates Sentinel-1 product discovery and observation into environment snapshot', async () => {
    const realProvider = new RealDataProvider();
    await realProvider.refresh();

    const snapshot = realProvider.activeSnapshot;
    expect(snapshot).toBeDefined();
    expect(snapshot.sarProducts).toBeDefined();
    expect(snapshot.sarProducts.length).toBeGreaterThan(0);
    expect(snapshot.selectedSarProduct).toBeDefined();
    expect(snapshot.sarObservation).toBeDefined();
    expect(snapshot.providerHealth.SENTINEL1_SAR).toBeDefined();
  }, 15000);

  it('10. Provider health tracking updates correctly on successful discovery', async () => {
    await provider.searchProducts();
    const status = provider.healthTracker.getStatus();

    expect(status.providerId).toBe('SENTINEL1_SAR');
    expect(status.state).toBe(PROVIDER_HEALTH_STATE.HEALTHY);
    expect(status.lastSuccess).toBeGreaterThan(0);
  });
});
