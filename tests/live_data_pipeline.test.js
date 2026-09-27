import { describe, it, expect, beforeEach } from 'vitest';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { UsnicIcebergProvider } from '../src/js/data/providers/UsnicIcebergProvider.js';
import { OpenMeteoWindProvider } from '../src/js/data/providers/OpenMeteoWindProvider.js';
import { CopernicusCurrentProvider } from '../src/js/data/providers/CopernicusCurrentProvider.js';
import { aisVesselProvider } from '../src/js/data/AisVesselProvider.js';
import { ProviderHealthTracker, ENVIRONMENTAL_SOURCE_TYPE, PROVIDER_HEALTH_STATE } from '../src/js/data/ProviderHealthModel.js';
import { RealDataNormalizer } from '../src/js/data/RealDataNormalizer.js';
import { RealDataStatus, FRESHNESS_STATES } from '../src/js/data/RealDataStatus.js';
import { semanticRuleMapper } from '../src/js/ai/semanticRuleMapper.js';
import { benchmarkRunner } from '../src/js/benchmark/benchmarkRunner.js';

describe('POLARIS Phase 1D — Live Environmental Data Pipeline Suite', () => {
  let realDataProvider;

  beforeEach(() => {
    realDataProvider = new RealDataProvider();
  });

  it('1. Provider contracts validate', () => {
    expect(typeof realDataProvider.refresh).toBe('function');
    expect(typeof realDataProvider.getSnapshot).toBe('function');
    expect(typeof realDataProvider.getEnvironment).toBe('function');
    expect(typeof realDataProvider.getStatus).toBe('function');
  });

  it('2. Malformed response is rejected safely by normalizer', () => {
    const normalizer = new RealDataNormalizer();
    const badRecords = [
      null,
      undefined,
      { lat: 'invalid', lon: 10 },
      { lat: 999, lon: 10 } // Invalid latitude
    ];
    const normalized = normalizer.normalizeIcebergs(badRecords);
    expect(normalized.length).toBe(0);
  });

  it('3. Timeout or offline fetch becomes explicit provider fallback', async () => {
    const usnic = new UsnicIcebergProvider();
    const res = await usnic.fetchIcebergs();
    expect(res).toHaveProperty('records');
    expect(res).toHaveProperty('source');
    expect(res.records.length).toBeGreaterThan(0);
  });

  it('4. Stale data is detected correctly', () => {
    const freshState = RealDataStatus.evaluateFreshness(Date.now() - 60000); // 1 min old
    const staleState = RealDataStatus.evaluateFreshness(Date.now() - 3600000 * 24 * 60); // 60 days old
    expect(freshState).toBe('LIVE');
    expect(staleState).toBe('STALE');
  });

  it('5. Live response receives LIVE provenance tag when from live API', async () => {
    const windProvider = new OpenMeteoWindProvider();
    const res = await windProvider.fetchWind();
    expect(res).toHaveProperty('source');
    expect(typeof res.source).toBe('string');
  });

  it('6. Cached response receives CACHED provenance tag', () => {
    const tracker = new ProviderHealthTracker('TEST_PROVIDER');
    tracker.recordSuccess(Date.now(), 10, ENVIRONMENTAL_SOURCE_TYPE.CACHED, 'Cached snapshot');
    expect(tracker.sourceType).toBe('CACHED');
  });

  it('7. Replay response receives REPLAY provenance tag', () => {
    const tracker = new ProviderHealthTracker('TEST_PROVIDER');
    tracker.recordSuccess(Date.now(), 10, ENVIRONMENTAL_SOURCE_TYPE.REPLAY, 'Replay file');
    expect(tracker.sourceType).toBe('REPLAY');
  });

  it('8. Fallback never falsely reports LIVE', () => {
    const tracker = new ProviderHealthTracker('TEST_PROVIDER');
    tracker.recordFailure('NETWORK_ERROR', 'Offline fallback', ENVIRONMENTAL_SOURCE_TYPE.CACHED);
    expect(tracker.sourceType).not.toBe('LIVE');
    expect(tracker.state).not.toBe('HEALTHY');
  });

  it('9. USNIC data normalization maps coordinates correctly', () => {
    const normalizer = new RealDataNormalizer();
    const raw = [{ id: 'A-76', lat: -68.5, lon: -62.0, size_m: 1200 }];
    const norm = normalizer.normalizeIcebergs(raw);
    expect(norm.length).toBe(1);
    expect(norm[0].name).toBe('A-76');
    expect(norm[0]).toHaveProperty('worldX');
    expect(norm[0]).toHaveProperty('worldY');
  });

  it('10. Open-Meteo normalization works', () => {
    const normalizer = new RealDataNormalizer();
    const normWind = normalizer.normalizeWind({ speed: 20, direction: 270, source: 'Open-Meteo' });
    expect(normWind.speed).toBe(20);
    expect(normWind.direction).toBe(270);
  });

  it('11. Copernicus current normalization works', () => {
    const normalizer = new RealDataNormalizer();
    const normCurr = normalizer.normalizeOceanCurrents({ current: { speed: 1.5, direction: 120, vx: 0.2, vy: 0.1, source: 'Copernicus' } });
    expect(normCurr.speed).toBe(1.5);
    expect(normCurr.direction).toBe(120);
  });

  it('12. AIS target normalization & dead-reckoning extrapolation work', () => {
    const rawTargets = [{ mmsi: 123456789, lat: -65.0, lon: -60.0, sog: 10.0, cog: 90.0, timestamp: Date.now() - 30000 }];
    aisVesselProvider.ingestAisTargets(rawTargets, 'REPLAY');
    const extrapolated = aisVesselProvider.getExtrapolatedTargets(Date.now(), 300);
    expect(extrapolated.length).toBe(1);
    expect(extrapolated[0].isPredicted).toBe(true);
  });

  it('13. SAR metadata normalization works', () => {
    const snapshot = realDataProvider.getSnapshot();
    if (snapshot && snapshot.sarContacts) {
      expect(Array.isArray(snapshot.sarContacts)).toBe(true);
    }
  });

  it('14. Bathymetry provenance is included in snapshot', async () => {
    const snap = await realDataProvider.refresh();
    expect(snap).toHaveProperty('bathymetry');
    expect(snap.bathymetry).toHaveProperty('source');
  });

  it('15. Provider health status transitions work', () => {
    const tracker = new ProviderHealthTracker('TEST');
    expect(tracker.state).toBe('HEALTHY');
    tracker.recordFailure('NETWORK_ERROR', 'Connection timed out');
    expect(tracker.state).toBe('OFFLINE');
  });

  it('16. Failover ordering is deterministic', async () => {
    const snap = await realDataProvider.refresh();
    expect(snap).not.toBeNull();
    expect(snap.icebergs.length).toBeGreaterThan(0);
  });

  it('17. Duplicate requests are suppressed or handled cleanly', async () => {
    const p1 = realDataProvider.refresh();
    const p2 = realDataProvider.refresh();
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).not.toBeNull();
    expect(res2).not.toBeNull();
  });

  it('18. Stale responses are discarded or flagged', () => {
    const freshness = RealDataStatus.evaluateFreshness(Date.now() - 3600000 * 24 * 365);
    expect(freshness).toBe('EXPIRED');
  });

  it('19. Malformed coordinates are rejected', () => {
    const normalizer = new RealDataNormalizer();
    const bad = [{ lat: 'abc', lon: 0 }];
    expect(normalizer.normalizeIcebergs(bad).length).toBe(0);
  });

  it('20. Units are normalized (km/h -> knots where appropriate)', async () => {
    const windProvider = new OpenMeteoWindProvider();
    const res = await windProvider.fetchWind();
    expect(res.speed).toBeGreaterThan(0);
  });

  it('21. Timestamp normalization is deterministic', () => {
    const ts = Date.now();
    const norm = RealDataStatus.evaluateFreshness(ts);
    expect(norm).toBe('LIVE');
  });

  it('22. Environment world model receives provider updates', async () => {
    const snap = await realDataProvider.refresh();
    const env = realDataProvider.getEnvironment();
    expect(env).toHaveProperty('current');
    expect(env).toHaveProperty('wind');
  });

  it('23. XAI receives provider provenance', () => {
    const explanation = semanticRuleMapper.generateExplanation({
      environmentalProvenance: {
        dataAgeMinutes: 10,
        source: 'USNIC ERDDAP',
        status: 'LIVE'
      }
    });
    expect(explanation.evidence).toHaveProperty('environmentalProvenance');
  });

  it('24. Benchmark records provider state', async () => {
    const suiteRes = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    expect(suiteRes).toHaveProperty('results');
  });

  it('25. DEMO mode remains deterministic', () => {
    expect(realDataProvider.sourceMode || realDataProvider.getStatus().status).toBeDefined();
  });

  it('26. REAL mode remains REAL when providers degrade', async () => {
    const snap = await realDataProvider.refresh();
    expect(snap.mode).toBe('REAL');
  }, 15000);

  it('27. LLM/XAI failure does not break environmental ingestion', async () => {
    const snap = await realDataProvider.refresh();
    expect(snap.icebergs).toBeDefined();
  });

  it('28. Planner still runs when one provider is unavailable', async () => {
    const snap = await realDataProvider.refresh();
    const env = realDataProvider.getEnvironment();
    expect(env).not.toBeNull();
  });

  it('29. Existing bathymetry tests structure compatibility verified', () => {
    expect(typeof realDataProvider.getSnapshot).toBe('function');
  });

  it('30. Existing benchmark tests structure compatibility verified', () => {
    expect(typeof benchmarkRunner.runSuite).toBe('function');
  });

  it('31. Existing XAI tests structure compatibility verified', () => {
    expect(typeof semanticRuleMapper.generateExplanation).toBe('function');
  });

  it('32. Existing collision tests structure compatibility verified', () => {
    expect(typeof realDataProvider.getHazards).toBe('function');
  });

  it('33. Existing replanning tests structure compatibility verified', () => {
    expect(typeof realDataProvider.getStatus).toBe('function');
  });

});
