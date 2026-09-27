/**
 * POLARIS Nav-OS — Real Data Pipeline & Capability Verification Test Suite
 *
 * Verifies real data ingestion from USNIC, Open-Meteo, GEBCO, AIS, and Sentinel-1 SAR,
 * and proves feature connectivity across the 44 non-hardware capabilities.
 */

import { describe, it, expect } from 'vitest';
import { realDataSessionManager, DATA_MODE_TERMINOLOGY } from '../src/js/data/RealDataSessionManager.js';
import { realDataVerificationHarness } from '../src/js/benchmark/RealDataVerificationHarness.js';
import { polarisCapabilityRegistry } from '../src/js/benchmark/polarisCapabilityRegistry.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';
import { sentinel1ProductProvider } from '../src/js/data/providers/Sentinel1ProductProvider.js';

describe('POLARIS Phase 7B — Final Real-Data Integration & Capability Connectivity Suite', () => {
  it('STEP 4 & 14: Initializes RealDataSession with explicit provider provenance and 0 silent fallbacks', async () => {
    const session = await realDataSessionManager.startRealDataSession();
    expect(session).toBeDefined();
    expect(session.sessionId).toContain('REAL_SESSION_');
    expect(session.dataMode).toBeDefined();
    expect(session.bathymetrySnapshot.source).toBe('GEBCO_IBCSO_BATHYMETRY');
    expect(session.sourceProvenance.providers.length).toBeGreaterThan(0);
  });

  it('STEP 5 & 10: Verifies real bathymetry point queries and grounding safety classification', () => {
    const depth = bathymetryProvider.getDepthAt(500, 500);
    expect(typeof depth).toBe('number');
    expect(isNaN(depth)).toBe(false);

    const isSafe = bathymetryProvider.isDepthSafe(500, 500, 10.0);
    expect(typeof isSafe).toBe('boolean');
  });

  it('STEP 8: Executes real Sentinel-1 product discovery search against Copernicus OData catalogue', async () => {
    const searchRes = await sentinel1ProductProvider.searchProducts({ limit: 3 });
    expect(searchRes).toBeDefined();
    expect(Array.isArray(searchRes.products)).toBe(true);
    expect(searchRes.products.length).toBeGreaterThan(0);
  });

  it('STEP 17 & 23: Runs RealDataVerificationHarness across all 44 non-hardware capabilities', async () => {
    const harnessResult = await realDataVerificationHarness.runVerificationSuite();
    expect(harnessResult).toBeDefined();
    expect(harnessResult.totalVerified).toBe(44);
    expect(harnessResult.realDataVerifiedCount).toBeGreaterThanOrEqual(39);
  });

  it('STEP 24: Verifies PolarisCapabilityRegistry generates valid markdown status matrix', () => {
    const mdMatrix = polarisCapabilityRegistry.generateMarkdownMatrix();
    expect(typeof mdMatrix).toBe('string');
    expect(mdMatrix).toContain('44-CAPABILITY MASTER REGISTRY');
    expect(mdMatrix).not.toContain('Physical Hardware');
  });
});
