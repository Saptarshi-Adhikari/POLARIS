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
import { sentinel1ProductProvider, createSarObservation } from './providers/Sentinel1ProductProvider.js';
import { sarPerceptionEngine } from './SarPerceptionEngine.js';
import { ContactCorrelationEngine } from './ContactCorrelationEngine.js';
import { ProviderHealthTracker, ENVIRONMENTAL_SOURCE_TYPE, PROVIDER_HEALTH_STATE } from './ProviderHealthModel.js';
import { aisVesselProvider } from './AisVesselProvider.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';
import { radarPerceptionEngine, RadarPerceptionEngine } from './RadarPerceptionEngine.js';

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
    this.sentinel1Provider = sentinel1ProductProvider;
    this.aisProvider = aisVesselProvider;
    this.radarEngine = radarPerceptionEngine;
    this.correlationEngine = new ContactCorrelationEngine();

    // Provider Health Trackers
    this.usnicHealth = new ProviderHealthTracker('USNIC_ICEBERG', ENVIRONMENTAL_SOURCE_TYPE.LIVE);
    this.windHealth = new ProviderHealthTracker('OPEN_METEO_WIND', ENVIRONMENTAL_SOURCE_TYPE.LIVE);
    this.currentHealth = new ProviderHealthTracker('COPERNICUS_CURRENT', ENVIRONMENTAL_SOURCE_TYPE.REPLAY);
    this.aisHealth = new ProviderHealthTracker('AIS_VESSELS', ENVIRONMENTAL_SOURCE_TYPE.REPLAY);
    this.sarHealth = sentinel1ProductProvider.healthTracker;
    this.bathymetryHealth = new ProviderHealthTracker('GEBCO_BATHYMETRY', ENVIRONMENTAL_SOURCE_TYPE.SYNTHETIC);
    this.radarHealth = new ProviderHealthTracker('MARINE_RADAR', ENVIRONMENTAL_SOURCE_TYPE.SYNTHETIC);

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
        this.usnicHealth.recordSuccess(Date.now(), icebergRes.value.latencyMs || 0, icebergRes.value.isCached ? ENVIRONMENTAL_SOURCE_TYPE.CACHED : ENVIRONMENTAL_SOURCE_TYPE.LIVE, icebergSource);
      } else {
        // Try BYU fallback if USNIC failed completely
        const byuRes = await this.byuProvider.fetchIcebergs();
        if (byuRes && byuRes.records) {
          rawIcebergs = byuRes.records;
          icebergSource = byuRes.source;
          this.usnicHealth.recordSuccess(Date.now(), byuRes.latencyMs || 0, ENVIRONMENTAL_SOURCE_TYPE.CACHED, icebergSource);
        } else {
          this.usnicHealth.recordFailure('FETCH_FAILED', 'USNIC and BYU providers unavailable', ENVIRONMENTAL_SOURCE_TYPE.CACHED);
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
        this.windHealth.recordSuccess(Date.now(), windRes.value.latencyMs || 0, windRes.value.source.includes('Live') ? ENVIRONMENTAL_SOURCE_TYPE.LIVE : ENVIRONMENTAL_SOURCE_TYPE.REPLAY, normalizedWind.source);
      } else {
        this.windHealth.recordFailure('WIND_FETCH_FAILED', 'Open-Meteo fallback active', ENVIRONMENTAL_SOURCE_TYPE.REPLAY);
      }

      let normalizedCurrent = { speed: 2.1, direction: 135, vx: 0.25, vy: 0.15, source: 'Copernicus Fallback' };
      if (currentRes.status === 'fulfilled' && currentRes.value) {
        normalizedCurrent = this.normalizer.normalizeOceanCurrents({ current: currentRes.value }, Date.now());
        this.currentHealth.recordSuccess(Date.now(), currentRes.value.latencyMs || 0, ENVIRONMENTAL_SOURCE_TYPE.REPLAY, normalizedCurrent.source);
      } else {
        this.currentHealth.recordFailure('CURRENT_FETCH_FAILED', 'Copernicus fallback active', ENVIRONMENTAL_SOURCE_TYPE.REPLAY);
      }

      // Ingest SAR Contacts and correlate with USNIC icebergs
      const rawSar = this.sarProvider.loadSampleSarScene();
      const correlatedSar = this.correlationEngine.correlate(rawSar, normalizedIcebergs, []);
      
      // Perform Sentinel-1 Product Discovery & Preprocessing Perception Engine
      const sarDiscovery = await this.sentinel1Provider.searchProducts({ limit: 5 });
      const sarPerceptionResult = sarDiscovery.selectedProduct ? sarPerceptionEngine.processProduct(sarDiscovery.selectedProduct) : null;
      const activeSarObservation = sarDiscovery.selectedProduct ? createSarObservation(sarDiscovery.selectedProduct, correlatedSar) : null;

      // Ingest AIS Target Stream & Extrapolate
      const aisTargets = this.aisProvider.getExtrapolatedTargets(Date.now());
      this.aisHealth.recordSuccess(Date.now(), 0, ENVIRONMENTAL_SOURCE_TYPE.REPLAY, `${aisTargets.length} AIS targets active`);

      // Bathymetry Provenance
      const bathymetryMeta = bathymetryProvider.getMetadata();
      this.bathymetryHealth.recordSuccess(Date.now(), 0, ENVIRONMENTAL_SOURCE_TYPE.SYNTHETIC, bathymetryMeta.source);

      // Ingest Marine Radar Target Stream & Perform CFAR / Tracker / Association
      const radarResult = this.radarEngine.processRadarPipeline(
        { pointTargets: [{ range: 1200, bearing: 45, intensity: -10, relativeSpeed: 2.5 }] },
        { x: 0, y: 0, heading: 0 },
        aisTargets,
        sarPerceptionResult ? sarPerceptionResult.unetDetections : []
      );
      this.radarHealth.recordSuccess(Date.now(), radarResult.metrics.processingLatencyMs, ENVIRONMENTAL_SOURCE_TYPE.SYNTHETIC, `${radarResult.detections.length} radar contacts active`);

      const normEnd = performance.now();
      this.metrics.normalizeDurationMs = Math.round(normEnd - normStart);

      // 3. Construct Canonical Environment World Model Snapshot
      const sourceTime = Date.now();
      const providerHealth = {
        USNIC_ICEBERG: this.usnicHealth.getStatus(),
        OPEN_METEO_WIND: this.windHealth.getStatus(),
        COPERNICUS_CURRENT: this.currentHealth.getStatus(),
        AIS_VESSELS: this.aisHealth.getStatus(),
        SENTINEL1_SAR: this.sarHealth.getStatus(),
        GEBCO_BATHYMETRY: this.bathymetryHealth.getStatus(),
        MARINE_RADAR: this.radarHealth.getStatus()
      };

      const snapshot = {
        mode: 'REAL',
        fetchedAt: Date.now(),
        sourceTimestamp: sourceTime,
        sourceStatus: 'ONLINE',

        icebergs: normalizedIcebergs,
        sarContacts: correlatedSar,
        sarProducts: sarDiscovery.products || [],
        selectedSarProduct: sarDiscovery.selectedProduct || null,
        sarObservation: activeSarObservation,
        sarPerception: sarPerceptionResult,
        radarPerception: radarResult,
        vessels: aisTargets,
        currents: normalizedCurrent,
        wind: normalizedWind,
        seaIce: { concentration: 0.25, source: 'Synthetic / Satellite Grid' },
        bathymetry: bathymetryMeta,
        providerHealth,

        provenance: {
          providers: [icebergSource, 'Sentinel-1 SAR', normalizedWind.source, normalizedCurrent.source, 'AIS Stream', bathymetryMeta.source, 'X-Band Radar'],
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
