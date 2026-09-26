/**
 * POLARIS Real Data Provider Master Orchestrator
 * Unites USNIC, BYU, Open-Meteo, and Copernicus providers under a unified RealEnvironmentSnapshot schema.
 */

import { DataProvider } from '../providers/dataProvider.js';
import { RealDataNormalizer } from './RealDataNormalizer.js';
import { RealDataCache } from './RealDataCache.js';
import { RealDataStatus, FRESHNESS_STATES } from './RealDataStatus.js';
import { UsnicIcebergProvider } from './providers/UsnicIcebergProvider.js';
import { ByuIcebergProvider } from './providers/ByuIcebergProvider.js';
import { OpenMeteoWindProvider } from './providers/OpenMeteoWindProvider.js';
import { CopernicusCurrentProvider } from './providers/CopernicusCurrentProvider.js';
import { SarContactProvider } from './SarContactProvider.js';
import { ContactCorrelationEngine } from './ContactCorrelationEngine.js';

export class RealDataProvider extends DataProvider {
  constructor() {
    super('REAL');
    this.normalizer = new RealDataNormalizer();
    this.cache = new RealDataCache();

    this.usnicProvider = new UsnicIcebergProvider();
    this.byuProvider = new ByuIcebergProvider();
    this.windProvider = new OpenMeteoWindProvider();
    this.currentProvider = new CopernicusCurrentProvider();
    this.sarProvider = new SarContactProvider();
    this.correlationEngine = new ContactCorrelationEngine();

    this.activeSnapshot = null;
    this.status = 'INITIALIZING';
    this.lastRefreshedAt = null;

    // Latency metrics
    this.metrics = {
      networkDurationMs: 0,
      normalizeDurationMs: 0,
      publishDurationMs: 0
    };

    // Cache-first startup
    this.loadCachedSnapshot();
  }

  loadCachedSnapshot() {
    const cached = this.cache.loadSnapshot();
    if (cached) {
      this.activeSnapshot = cached;
      this.status = 'READY_CACHED';
      console.info('[RealDataProvider] Loaded cached REAL snapshot with', cached.icebergs ? cached.icebergs.length : 0, 'icebergs');
    }
  }

  async refresh() {
    const fetchStart = performance.now();
    this.status = 'REFRESHING';

    try {
      // 1. Fetch raw datasets in parallel
      const [icebergRes, windRes, currentRes] = await Promise.allSettled([
        this.usnicProvider.fetchIcebergs(),
        this.windProvider.fetchWind(),
        this.currentProvider.fetchOceanCurrents()
      ]);

      const netEnd = performance.now();
      this.metrics.networkDurationMs = Math.round(netEnd - fetchStart);

      // 2. Validate & Normalize
      const normStart = performance.now();

      let rawIcebergs = [];
      let icebergSource = 'USNIC ERDDAP / Bundled';
      if (icebergRes.status === 'fulfilled' && icebergRes.value && icebergRes.value.records) {
        rawIcebergs = icebergRes.value.records;
        icebergSource = icebergRes.value.source;
      } else {
        // Try BYU fallback if USNIC failed completely
        const byuRes = await this.byuProvider.fetchIcebergs();
        if (byuRes && byuRes.records) {
          rawIcebergs = byuRes.records;
          icebergSource = byuRes.source;
        }
      }

      let normalizedIcebergs = this.normalizer.normalizeIcebergs(rawIcebergs, Date.now());

      // If live ingestion produced 0 icebergs (e.g. network failure / mocked rejection), fallback to cached snapshot icebergs
      if ((!normalizedIcebergs || normalizedIcebergs.length === 0) && this.activeSnapshot && this.activeSnapshot.icebergs) {
        normalizedIcebergs = this.activeSnapshot.icebergs;
        icebergSource = `${icebergSource} (Cached Fallback)`;
      }

      let normalizedWind = { speed: 38.5, direction: 240, source: 'Open-Meteo Fallback' };
      if (windRes.status === 'fulfilled' && windRes.value) {
        normalizedWind = this.normalizer.normalizeWind(windRes.value, Date.now());
      }

      let normalizedCurrent = { speed: 2.1, direction: 135, vx: 0.25, vy: 0.15, source: 'Copernicus Fallback' };
      if (currentRes.status === 'fulfilled' && currentRes.value) {
        normalizedCurrent = this.normalizer.normalizeOceanCurrents({ current: currentRes.value }, Date.now());
      }

      // Ingest SAR Contacts and correlate with USNIC icebergs
      const rawSar = this.sarProvider.loadSampleSarScene();
      const correlatedSar = this.correlationEngine.correlate(rawSar, normalizedIcebergs, []);

      const normEnd = performance.now();
      this.metrics.normalizeDurationMs = Math.round(normEnd - normStart);

      // 3. Construct Canonical Snapshot
      const sourceTime = Date.now();
      const snapshot = {
        mode: 'REAL',
        fetchedAt: Date.now(),
        sourceTimestamp: sourceTime,
        sourceStatus: 'ONLINE',

        icebergs: normalizedIcebergs,
        sarContacts: correlatedSar,
        currents: normalizedCurrent,
        wind: normalizedWind,
        seaIce: { concentration: 0.25, source: 'Synthetic / Satellite Grid' },

        provenance: {
          providers: [icebergSource, 'Sentinel-1 SAR', normalizedWind.source, normalizedCurrent.source],
          sourceUrls: [
            'https://polarwatch.noaa.gov/erddap/tabledap/usnic_weekly_iceberg',
            'https://scihub.copernicus.eu/dhus',
            'https://api.open-meteo.com/v1/forecast',
            'https://marine.copernicus.eu'
          ],
          timestamps: [new Date().toISOString()],
          warnings: []
        },

        freshness: {
          iceberg: RealDataStatus.evaluateFreshness(sourceTime),
          ocean: RealDataStatus.evaluateFreshness(sourceTime),
          wind: RealDataStatus.evaluateFreshness(sourceTime)
        },

        metrics: { ...this.metrics }
      };

      // 4. Atomic Snapshot Replacement & Cache Update
      this.activeSnapshot = snapshot;
      this.cache.saveSnapshot(snapshot);
      this.lastRefreshedAt = Date.now();
      this.status = 'READY';

      this.metrics.publishDurationMs = Math.round(performance.now() - normEnd);
      return snapshot;
    } catch (err) {
      console.error('[RealDataProvider] Refresh error, attempting cached snapshot fallback:', err);
      this.status = 'ERROR';
      this.errorMessage = err.message;

      // Fallback to cache
      if (!this.activeSnapshot) {
        this.loadCachedSnapshot();
      }

      if (this.activeSnapshot) {
        this.activeSnapshot.provenance.warnings.push(`Network refresh failed: ${err.message}. Using cached snapshot.`);
        return this.activeSnapshot;
      }
      return null;
    }
  }

  getSnapshot() {
    if (!this.activeSnapshot) {
      this.loadCachedSnapshot();
    }
    return this.activeSnapshot;
  }

  getHazards() {
    const snap = this.getSnapshot();
    return snap && snap.icebergs ? snap.icebergs : [];
  }

  getEnvironment() {
    const snap = this.getSnapshot();
    if (!snap) return null;
    return {
      timestamp: snap.sourceTimestamp,
      current: snap.currents,
      wind: snap.wind,
      seaIce: snap.seaIce,
      source: snap.provenance ? snap.provenance.providers.join(' + ') : 'REAL DATA'
    };
  }

  getStatus() {
    return {
      status: this.status,
      lastRefreshedAt: this.lastRefreshedAt,
      recordCount: this.activeSnapshot && this.activeSnapshot.icebergs ? this.activeSnapshot.icebergs.length : 0,
      metrics: this.metrics,
      errorMessage: this.errorMessage
    };
  }

  getProvenance() {
    const snap = this.getSnapshot();
    return snap ? snap.provenance : null;
  }
}
