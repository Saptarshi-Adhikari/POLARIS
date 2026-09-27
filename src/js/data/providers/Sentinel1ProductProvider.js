/**
 * POLARIS Nav-OS — Sentinel-1 SAR Product Discovery & Observation Pipeline (Phase 4A)
 * 
 * Programmatic interface to Copernicus Data Space Ecosystem (CDSE) catalogue APIs
 * supporting both OData and STAC search interfaces for Sentinel-1 GRD / SLC products.
 */

import { DEFAULT_ANTARCTIC_BBOX } from '../../providers/geoTransform.js';
import { ProviderHealthTracker, ENVIRONMENTAL_SOURCE_TYPE } from '../ProviderHealthModel.js';

export const SAR_PRODUCT_TYPE = Object.freeze({
  GRD: 'GRD',
  SLC: 'SLC',
  RAW: 'RAW',
  UNKNOWN: 'UNKNOWN'
});

export const SAR_POLARIZATION = Object.freeze({
  HH: 'HH',
  HV: 'HV',
  VV: 'VV',
  VH: 'VH',
  HH_HV: 'HH+HV',
  VV_VH: 'VV+VH',
  UNKNOWN: 'UNKNOWN'
});

export const SAR_ORBIT_DIRECTION = Object.freeze({
  ASCENDING: 'ASCENDING',
  DESCENDING: 'DESCENDING',
  UNKNOWN: 'UNKNOWN'
});

export const SAR_RETRIEVAL_STATUS = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  METADATA_ONLY: 'METADATA_ONLY',
  DOWNLOADING: 'DOWNLOADING',
  CACHED: 'CACHED',
  AVAILABLE: 'AVAILABLE',
  FAILED: 'FAILED'
});

/**
 * Creates a canonical Sentinel-1 SAR Product Schema Object
 */
export function createCanonicalSarProduct(raw = {}) {
  const now = Date.now();
  const acqStart = raw.acquisitionStart || raw.sensingStartDate || raw.properties?.datetime || raw.properties?.start_datetime || null;
  const acqEnd = raw.acquisitionEnd || raw.sensingStopDate || raw.properties?.end_datetime || acqStart;

  return {
    productId: raw.productId || raw.id || raw.Name || `S1-PROD-${Math.floor(100000 + Math.random() * 900000)}`,
    mission: raw.mission || 'SENTINEL-1',
    platform: raw.platform || (raw.productId?.startsWith('S1B') ? 'SENTINEL-1B' : 'SENTINEL-1A'),
    collection: raw.collection || 'SENTINEL-1',
    productType: raw.productType || (raw.productId?.includes('GRD') ? SAR_PRODUCT_TYPE.GRD : SAR_PRODUCT_TYPE.UNKNOWN),
    acquisitionStart: acqStart ? (typeof acqStart === 'number' ? acqStart : Date.parse(acqStart)) : null,
    acquisitionEnd: acqEnd ? (typeof acqEnd === 'number' ? acqEnd : Date.parse(acqEnd)) : null,
    publicationDate: raw.publicationDate ? Date.parse(raw.publicationDate) : null,
    geometry: raw.geometry || raw.footprint || null,
    bbox: raw.bbox || raw.properties?.proj_bbox || DEFAULT_ANTARCTIC_BBOX,
    orbitDirection: raw.orbitDirection || raw.properties?.['sat:orbit_state']?.toUpperCase() || SAR_ORBIT_DIRECTION.UNKNOWN,
    relativeOrbit: raw.relativeOrbit || raw.properties?.['sat:relative_orbit'] || null,
    polarization: raw.polarization || raw.properties?.['sar:polarizations']?.[0] || SAR_POLARIZATION.HH,
    processingLevel: raw.processingLevel || 'LEVEL1',
    resolution: raw.resolution || 'MEDIUM_10M',
    source: raw.source || 'Copernicus Data Space Ecosystem',
    sourceType: raw.sourceType || ENVIRONMENTAL_SOURCE_TYPE.LIVE,
    retrievalStatus: raw.retrievalStatus || SAR_RETRIEVAL_STATUS.DISCOVERED,
    online: Boolean(raw.online ?? true),
    assetReferences: raw.assetReferences || raw.assets || {},
    checksum: raw.checksum || raw.Checksum || null,
    sizeBytes: raw.sizeBytes || raw.ContentLength || 0,
    dataTimestamp: raw.dataTimestamp || (acqStart ? Date.parse(acqStart) : now),
    discoveredAt: raw.discoveredAt || now
  };
}

/**
 * Creates a canonical SAR Observation Schema Object
 */
export function createSarObservation(product, contacts = []) {
  return {
    observationId: `SAR-OBS-${product.productId}`,
    productId: product.productId,
    acquisitionTime: product.acquisitionStart,
    geometry: product.geometry,
    bbox: product.bbox,
    sourceType: product.sourceType,
    processingStatus: 'NOT_PROCESSED', // Strictly preserved until UNet/MaskRCNN phase
    dataQuality: 'HIGH',
    classificationStatus: 'METADATA_ONLY',
    contactsCount: contacts.length,
    contacts: contacts
  };
}

export class Sentinel1ProductProvider {
  constructor(options = {}) {
    this.name = 'Sentinel-1 CDSE Product Discovery Provider';
    this.baseUrl = options.baseUrl || 'https://catalogue.dataspace.copernicus.eu/odata/v1';
    this.stacUrl = options.stacUrl || 'https://catalogue.dataspace.copernicus.eu/stac';
    this.healthTracker = new ProviderHealthTracker('SENTINEL1_SAR', ENVIRONMENTAL_SOURCE_TYPE.LIVE);

    // Auth credentials (strictly read from env)
    this.clientId = typeof process !== 'undefined' && process.env ? process.env.CDSE_CLIENT_ID : null;
    this.clientSecret = typeof process !== 'undefined' && process.env ? process.env.CDSE_CLIENT_SECRET : null;

    this.cache = new Map();
    this.discoveredProducts = [];
    this.activeObservations = [];
    this.selectedProduct = null;
    this.selectionReason = [];

    // Configuration
    this.maxDownloadSizeBytes = options.maxDownloadSizeBytes || 500 * 1024 * 1024; // 500MB cap
    this.mode = options.mode || 'DISCOVERY_ONLY'; // DISCOVERY_ONLY | METADATA_ONLY | ON_DEMAND_DOWNLOAD
  }

  /**
   * Search CDSE OData / STAC catalogue for Sentinel-1 products
   */
  async searchProducts(params = {}) {
    const fetchStart = performance.now();
    const bbox = params.bbox || DEFAULT_ANTARCTIC_BBOX;
    const days = params.days || 7;
    const limit = params.limit || 10;
    const productType = params.productType || SAR_PRODUCT_TYPE.GRD;

    // Check credentials if live download requested
    if (this.mode === 'ON_DEMAND_DOWNLOAD' && (!this.clientId || !this.clientSecret)) {
      this.healthTracker.recordFailure('AUTH_REQUIRED', 'CDSE Client ID and Secret required for product payload download', ENVIRONMENTAL_SOURCE_TYPE.CACHED);
      return { products: this.getReplayProducts(), selectedProduct: this.getReplayProducts()[0], selectionReasons: ['Auth required for live download'], source: 'REPLAY_FIXTURE' };
    }

    try {
      const startDate = new Date(Date.now() - days * 86400000).toISOString();
      const filterStr = `Collection/Name eq 'SENTINEL-1' and Attributes/OData.CSC.StringAttribute/any(att:att/Name eq 'productType' and att/Value eq '${productType}') and ContentDate/Start gte ${startDate}`;
      const odataUrl = `${this.baseUrl}/Products?$filter=${encodeURIComponent(filterStr)}&$top=${limit}&$orderby=ContentDate/Start desc`;

      let rawProducts = [];
      let sourceType = ENVIRONMENTAL_SOURCE_TYPE.LIVE;

      if (typeof fetch !== 'undefined') {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), params.timeoutMs || 5000);

        try {
          const res = await fetch(odataUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            rawProducts = data.value || [];
          } else {
            throw new Error(`CDSE OData API HTTP ${res.status}`);
          }
        } catch (fetchErr) {
          sourceType = ENVIRONMENTAL_SOURCE_TYPE.REPLAY;
          rawProducts = this.getRawReplayFixtures();
        }
      } else {
        sourceType = ENVIRONMENTAL_SOURCE_TYPE.REPLAY;
        rawProducts = this.getRawReplayFixtures();
      }

      // Normalize & Deduplicate
      const normalizedMap = new Map();
      for (const raw of rawProducts) {
        const norm = createCanonicalSarProduct({ ...raw, sourceType });
        if (!normalizedMap.has(norm.productId)) {
          normalizedMap.set(norm.productId, norm);
          this.cache.set(norm.productId, norm);
        }
      }

      const products = Array.from(normalizedMap.values());
      const filteredProducts = products.filter(p => this.intersectsBbox(p.bbox, bbox));

      this.discoveredProducts = filteredProducts;

      const selection = this.selectBestProduct(filteredProducts, params);
      this.selectedProduct = selection.selectedProduct;
      this.selectionReason = selection.reasons;

      const latencyMs = Math.round(performance.now() - fetchStart);
      this.healthTracker.recordSuccess(Date.now(), latencyMs, sourceType, `Discovered ${filteredProducts.length} Sentinel-1 products`);

      return {
        products: filteredProducts,
        selectedProduct: this.selectedProduct,
        selectionReasons: this.selectionReason,
        source: sourceType
      };

    } catch (err) {
      this.healthTracker.recordFailure('SEARCH_ERROR', err.message, ENVIRONMENTAL_SOURCE_TYPE.REPLAY);
      const fallbackProducts = this.getReplayProducts();
      return {
        products: fallbackProducts,
        selectedProduct: fallbackProducts[0] || null,
        selectionReasons: ['Fallback replay fixture due to query error'],
        source: ENVIRONMENTAL_SOURCE_TYPE.REPLAY
      };
    }
  }

  /**
   * Search SAR products covering an active vessel route corridor
   */
  async searchRouteCorridor(routePoints = [], bufferKm = 50) {
    if (!Array.isArray(routePoints) || routePoints.length === 0) {
      return this.searchProducts();
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of routePoints) {
      const x = p.x ?? p.worldX ?? 0;
      const y = p.y ?? p.worldY ?? 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const corridorBbox = {
      minX: minX - bufferKm,
      minY: minY - bufferKm,
      maxX: maxX + bufferKm,
      maxY: maxY + bufferKm
    };

    const res = await this.searchProducts({ bbox: corridorBbox });
    res.corridorBbox = corridorBbox;
    res.bufferKm = bufferKm;
    return res;
  }

  /**
   * Deterministic Product Selection Criteria
   */
  selectBestProduct(products, params = {}) {
    if (!products || products.length === 0) {
      return { selectedProduct: null, reasons: ['No products matching search criteria'] };
    }

    const candidates = [...products].sort((a, b) => {
      const tA = a.acquisitionStart || 0;
      const tB = b.acquisitionStart || 0;
      if (tA !== tB) return tB - tA;

      const pA = a.productType === SAR_PRODUCT_TYPE.GRD ? 2 : 1;
      const pB = b.productType === SAR_PRODUCT_TYPE.GRD ? 2 : 1;
      if (pA !== pB) return pB - pA;

      return (b.online ? 1 : 0) - (a.online ? 1 : 0);
    });

    const selected = candidates[0];
    const reasons = [
      `Latest acquisition: ${new Date(selected.acquisitionStart).toISOString()}`,
      `Product type: ${selected.productType}`,
      `Platform: ${selected.platform}`
    ];

    if (params.bbox) reasons.push('Covers requested AOI corridor');

    return { selectedProduct: selected, alternativeCandidates: candidates.slice(1), reasons };
  }

  intersectsBbox(b1, b2) {
    if (!b1 || !b2) return true;
    return !(b1.maxX < b2.minX || b1.minX > b2.maxX || b1.maxY < b2.minY || b1.minY > b2.maxY);
  }

  getReplayProducts() {
    return this.getRawReplayFixtures().map(r => createCanonicalSarProduct({ ...r, sourceType: ENVIRONMENTAL_SOURCE_TYPE.REPLAY }));
  }

  getRawReplayFixtures() {
    return [
      {
        productId: 'S1A_IW_GRDH_1SDV_20260315T184200_20260315T184225_042800_051A2B_D4E2',
        mission: 'SENTINEL-1',
        platform: 'SENTINEL-1A',
        productType: 'GRD',
        acquisitionStart: '2026-03-15T18:42:00Z',
        acquisitionEnd: '2026-03-15T18:42:25Z',
        publicationDate: '2026-03-15T21:10:00Z',
        orbitDirection: 'DESCENDING',
        polarization: 'HH+HV',
        sizeBytes: 842100500,
        checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        online: true,
        bbox: DEFAULT_ANTARCTIC_BBOX
      },
      {
        productId: 'S1B_IW_GRDH_1SDV_20260314T061500_20260314T061525_028400_036B1C_A1F9',
        mission: 'SENTINEL-1',
        platform: 'SENTINEL-1B',
        productType: 'GRD',
        acquisitionStart: '2026-03-14T06:15:00Z',
        acquisitionEnd: '2026-03-14T06:15:25Z',
        publicationDate: '2026-03-14T08:50:00Z',
        orbitDirection: 'ASCENDING',
        polarization: 'HH',
        sizeBytes: 795400200,
        checksum: '7d793037a0760186574b0282f2f435e7',
        online: true,
        bbox: DEFAULT_ANTARCTIC_BBOX
      }
    ];
  }
}

export const sentinel1ProductProvider = new Sentinel1ProductProvider();
