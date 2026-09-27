/**
 * POLARIS Nav-OS — Offline & Edge Deployment Manager (Phase 1E)
 *
 * Manages persistent local offline caching, offline mode detection,
 * provider failover handling, and edge deployment configuration.
 */

import { RealDataCache } from './RealDataCache.js';
import { RealDataStatus, FRESHNESS_STATES } from './RealDataStatus.js';

export class OfflineEdgeDeploymentManager {
  constructor() {
    this.cache = new RealDataCache();
    this.mode = 'OFFLINE'; // 'OFFLINE' | 'DEMO' | 'REAL'
    this.isNetworkAvailable = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.offlineIndicatorElement = null;
  }

  getEdgeConfiguration() {
    return {
      mode: this.mode,
      isNetworkAvailable: this.isNetworkAvailable,
      apiBaseUrl: typeof process !== 'undefined' && process.env && process.env.POLARIS_API_BASE_URL ? process.env.POLARIS_API_BASE_URL : 'http://localhost:8001',
      cacheDir: 'data/cache',
      dataDir: 'data',
      logLevel: 'INFO'
    };
  }

  isOfflineCapable() {
    return true; // Complete navigation loop operates offline
  }

  loadCachedSnapshot() {
    return this.cache.loadSnapshot();
  }

  saveCachedSnapshot(snapshot) {
    if (!snapshot) return;
    return this.cache.saveSnapshot(snapshot);
  }

  evaluateFailover(liveSuccess, cachedSnapshot) {
    if (liveSuccess) {
      return { status: 'LIVE', snapshot: liveSuccess, provenance: 'LIVE_API' };
    }
    if (cachedSnapshot) {
      return { status: 'DEGRADED_CACHED', snapshot: cachedSnapshot, provenance: 'LOCAL_EDGE_CACHE' };
    }
    return { status: 'OFFLINE_SYNTHETIC', snapshot: null, provenance: 'BUNDLED_OFFLINE_FIXTURE' };
  }
}

export const offlineEdgeDeploymentManager = new OfflineEdgeDeploymentManager();
