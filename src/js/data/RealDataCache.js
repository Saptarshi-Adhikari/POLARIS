/**
 * POLARIS Real Data Cache & Local Storage Management
 * Handles cache-first startup, atomic snapshot replacement, and offline persistence.
 */

const SNAPSHOT_CACHE_KEY = 'POLARIS_REAL_DATA_SNAPSHOT_V1';

export class RealDataCache {
  constructor() {
    this.memoryCache = null;
  }

  /**
   * Save canonical environment snapshot to memory and localStorage
   */
  saveSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    this.memoryCache = snapshot;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SNAPSHOT_CACHE_KEY, JSON.stringify(snapshot));
      }
      return true;
    } catch (err) {
      console.warn('[RealDataCache] LocalStorage save error:', err);
      return false;
    }
  }

  /**
   * Load last known good REAL snapshot
   */
  loadSnapshot() {
    if (this.memoryCache) return this.memoryCache;

    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(SNAPSHOT_CACHE_KEY);
        if (stored) {
          this.memoryCache = JSON.parse(stored);
          return this.memoryCache;
        }
      }
    } catch (err) {
      console.warn('[RealDataCache] LocalStorage read error:', err);
    }

    return null;
  }

  clearCache() {
    this.memoryCache = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SNAPSHOT_CACHE_KEY);
      }
    } catch (e) {}
  }
}
