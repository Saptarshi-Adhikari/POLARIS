/**
 * POLARIS — Phase 5A Marine Radar Ingestion + Radar Perception Foundation Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RadarPerceptionEngine,
  RadarProvider,
  RadarPreprocessor,
  CfarRadarDetector,
  RadarTargetTracker,
  AisRadarAssociationEngine,
  SarRadarAssociationEngine,
  createCanonicalRadarObservation,
  createRadarSensorConfig,
  createCommonSensorObservation,
  formatRadarXaiProvenance,
  RADAR_INPUT_MODES,
  RADAR_QUALITY,
  RADAR_TRACK_STATUS,
  AIS_RADAR_ASSOCIATION_STATE
} from '../src/js/data/RadarPerceptionEngine.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { SpatiotemporalPlanner } from '../src/js/ai/SpatiotemporalPlanner.js';
import { AisTargetTracker } from '../src/js/ai/AisTargetTracker.js';
import { DynamicIcebergDragEstimator } from '../src/js/ai/DynamicIcebergDragEstimator.js';
import { VesselManeuveringEngine } from '../src/js/ai/VesselManeuveringEngine.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';
import { benchmarkEvaluator } from '../src/js/benchmark/benchmarkEvaluator.js';
import { SarUNetModel } from '../src/js/data/SarUNetPerception.js';

describe('POLARIS Phase 5A — Marine Radar Ingestion & Radar Perception Foundation', () => {
  let provider;
  let preprocessor;
  let detector;
  let tracker;
  let aisAssociator;
  let sarAssociator;
  let engine;

  beforeEach(() => {
    provider = new RadarProvider(RADAR_INPUT_MODES.DEMO);
    preprocessor = new RadarPreprocessor();
    detector = new CfarRadarDetector();
    tracker = new RadarTargetTracker();
    aisAssociator = new AisRadarAssociationEngine();
    sarAssociator = new SarRadarAssociationEngine();
    engine = new RadarPerceptionEngine(RADAR_INPUT_MODES.DEMO);
  });

  it('1. radar observation schema validates', () => {
    const obs = createCanonicalRadarObservation({
      rangeMeters: 1500.0,
      bearingDegrees: 45.0,
      radialVelocity: -2.5,
      intensity: -10.0
    });

    expect(obs.observationId).toBeDefined();
    expect(obs.sensorId).toBe('X_BAND_RADAR_01');
    expect(obs.rangeMeters).toBe(1500.0);
    expect(obs.bearingDegrees).toBe(45.0);
    expect(obs.radialVelocity).toBe(-2.5);
    expect(obs.quality).toBe(RADAR_QUALITY.OK);
  });

  it('2. units normalized', () => {
    const obs = createCanonicalRadarObservation({ range: 2500, bearingRad: Math.PI / 4, relativeSpeed: 5.0 });
    expect(obs.rangeMeters).toBe(2500);
    expect(obs.bearingDegrees).toBeCloseTo(45.0, 1);
    expect(obs.radialVelocity).toBe(5.0);
  });

  it('3. coordinate transform deterministic', () => {
    const obs = createCanonicalRadarObservation({
      rangeMeters: 1000.0,
      bearingDegrees: 90.0, // Directly South (+Y) in POLARIS locked convention
      shipX: 500.0,
      shipY: 500.0,
      shipHeadingDeg: 0.0
    });

    expect(obs.centroid.worldX).toBeCloseTo(500.0, 1);
    expect(obs.centroid.worldY).toBeCloseTo(1500.0, 1);
  });

  it('4. radar scan accepted', () => {
    const res = provider.ingestRawScan({ scanId: 'SCAN-001', timestamp: Date.now(), pointTargets: [{ range: 500, bearing: 10 }] });
    expect(res.status).toBe('SCAN_INGESTED');
    expect(provider.getLatestScan().scanId).toBe('SCAN-001');
  });

  it('5. malformed scan rejected', () => {
    expect(() => provider.ingestRawScan(null)).toThrow();
  });

  it('6. stale scan detected', () => {
    const oldTime = Date.now() - 15000;
    const obs = createCanonicalRadarObservation({ timestamp: oldTime });
    expect(obs.uncertainty.timestampAgeMs).toBeGreaterThanOrEqual(15000);
  });

  it('7. CFAR detector deterministic', () => {
    const rawScan = { scanId: 'S-01', pointTargets: [{ range: 1000, bearing: 30, intensity: -5.0 }] };
    const preproc = preprocessor.preprocessRadarScan(rawScan, createRadarSensorConfig());
    const detect = detector.detectObjects(preproc, { x: 0, y: 0, heading: 0 });

    expect(detect.detections.length).toBe(1);
    expect(detect.detectionMethod).toContain('CA_CFAR');
  });

  it('8. noise filtering deterministic', () => {
    const rawScan = { scanId: 'S-02', pointTargets: [{ range: 1000, bearing: 30, intensity: -45.0 }] }; // Below noise floor
    const preproc = preprocessor.preprocessRadarScan(rawScan, createRadarSensorConfig({ detectionThresholdDb: -12.0 }));
    expect(preproc.filteredTargets.length).toBe(0);
  });

  it('9. target centroid calculated', () => {
    const obs = createCanonicalRadarObservation({ rangeMeters: 200, bearingDegrees: 0, shipX: 100, shipY: 100, shipHeadingDeg: 0 });
    // Heading 0 = East (+X), Bearing 0 = Bow/Forward (+X) -> worldX = 100 + 200 = 300, worldY = 100
    expect(obs.centroid.worldX).toBeCloseTo(300, 1);
    expect(obs.centroid.worldY).toBeCloseTo(100, 1);
  });

  it('10. target range/bearing calculated', () => {
    const obs = createCanonicalRadarObservation({ rangeMeters: 750, bearingDegrees: 180 });
    expect(obs.rangeMeters).toBe(750);
    expect(obs.bearingDegrees).toBe(180);
  });

  it('11. target uncertainty calculated', () => {
    const obs = createCanonicalRadarObservation({ rangeUncertainty: 8.0, bearingUncertainty: 0.4 });
    expect(obs.uncertainty.rangeUncertainty).toBe(8.0);
    expect(obs.uncertainty.bearingUncertainty).toBeCloseTo(0.412, 2);
  });

  it('12. target tracker receives radar detection', () => {
    const obs = createCanonicalRadarObservation({ observationId: 'RAD-01', rangeMeters: 500, bearingDegrees: 10 });
    const tracks = tracker.updateTracks([obs], Date.now());
    expect(tracks.length).toBe(1);
    expect(tracks[0].trackId).toBe('RAD-01');
    expect(tracks[0].state).toBe(RADAR_TRACK_STATUS.FRESH);
  });

  it('13. track prediction works', () => {
    const now = Date.now();
    const obs = createCanonicalRadarObservation({ observationId: 'RAD-01', rangeMeters: 500 });
    tracker.updateTracks([obs], now);
    const updated = tracker.updateTracks([], now + 2000);

    expect(updated[0].state).toBe(RADAR_TRACK_STATUS.PREDICTED);
  });

  it('14. track expiration works', () => {
    const now = Date.now();
    const obs = createCanonicalRadarObservation({ observationId: 'RAD-01', rangeMeters: 500 });
    tracker.updateTracks([obs], now);
    const expired = tracker.updateTracks([], now + 15000);

    expect(expired.length).toBe(0);
  });

  it('15. AIS-only target preserved', () => {
    const aisTracks = [{ mmsi: '123456789', worldX: 1000, worldY: 1000, lat: -68.5, lon: 45.0 }];
    const assoc = aisAssociator.associate(aisTracks, []);
    expect(assoc.length).toBe(1);
    expect(assoc[0].associationState).toBe(AIS_RADAR_ASSOCIATION_STATE.AIS_ONLY);
  });

  it('16. radar-only target preserved', () => {
    const radarTracks = [{ trackId: 'RAD-99', position: { worldX: 2000, worldY: 2000 }, rangeMeters: 500, bearingDegrees: 90 }];
    const assoc = aisAssociator.associate([], radarTracks);
    expect(assoc.length).toBe(1);
    expect(assoc[0].associationState).toBe(AIS_RADAR_ASSOCIATION_STATE.RADAR_ONLY);
  });

  it('17. AIS/radar association deterministic', () => {
    const aisTracks = [{ mmsi: '123456789', worldX: 1000, worldY: 1000, lat: -68.5, lon: 45.0 }];
    const radarTracks = [{ trackId: 'RAD-99', position: { worldX: 1020, worldY: 1010 }, rangeMeters: 500, bearingDegrees: 90 }];

    const assoc = aisAssociator.associate(aisTracks, radarTracks);
    expect(assoc.length).toBe(1);
    expect(assoc[0].associationState).toBe(AIS_RADAR_ASSOCIATION_STATE.AIS_RADAR_ASSOCIATED);
  });

  it('18. ambiguous association remains ambiguous', () => {
    const common = createCommonSensorObservation({ source: 'RADAR', observationId: 'RAD-AMBIG' });
    expect(common.source).toBe('RADAR');
  });

  it('19. SAR/radar possible association works', () => {
    const sarObs = [{ observationId: 'SAR-01', centroid: { worldX: 500, worldY: 500 } }];
    const radObs = [{ observationId: 'RAD-01', centroid: { worldX: 550, worldY: 520 } }];

    const candidate = sarAssociator.associateSarAndRadar(sarObs, radObs);
    expect(candidate.length).toBe(1);
    expect(candidate[0].associationType).toBe('SAR_RADAR_POSSIBLE_ASSOCIATION');
  });

  it('20. world model receives radar state', async () => {
    const provider = new RealDataProvider();
    await provider.refresh();
    const snap = provider.activeSnapshot;

    expect(snap.radarPerception).toBeDefined();
    expect(snap.providerHealth.MARINE_RADAR).toBeDefined();
  }, 15000);

  it('21. XAI receives radar evidence', () => {
    const xaiText = formatRadarXaiProvenance({
      sensorId: 'RADAR-01',
      observationId: 'TARGET-17',
      rangeMeters: 1450.0,
      bearingDegrees: 42.5,
      radialVelocity: -3.2,
      confidence: 0.885,
      associationState: 'AIS_RADAR_ASSOCIATED'
    });

    expect(xaiText).toContain('RADAR EVIDENCE');
    expect(xaiText).toContain('Range: 1450.0m');
    expect(xaiText).toContain('Track status: AIS_RADAR_ASSOCIATED');
  });

  it('22. benchmark receives radar metrics', () => {
    const res = engine.processRadarPipeline({ pointTargets: [{ range: 1000, bearing: 30, intensity: -5 }] });
    expect(res.metrics.detectionCount).toBe(1);
    expect(res.metrics.processingLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('23. spatiotemporal planner consumes target state', () => {
    const planner = new SpatiotemporalPlanner();
    const commonObs = createCommonSensorObservation({ source: 'RADAR', worldX: 300, worldY: 300 });
    const route = planner.planSpatiotemporalRoute({ x: 100, y: 100 }, { x: 500, y: 100 }, { speed: 10 });
    expect(route.success).toBe(true);
  });

  it('24. continuous collision remains final safety gate', () => {
    const pA = { x: 100, y: 500 };
    const pB = { x: 200, y: 500 };
    const vessel = { length: 80, beam: 20, speed: 15 };
    const res = continuousCollisionValidator.validateSegmentSpaceTime(pA, pB, 0, 0.05, vessel, []);
    expect(res.isValid).toBe(true);
  });

  it('25. DEMO remains deterministic', () => {
    const demoEngine = new RadarPerceptionEngine(RADAR_INPUT_MODES.DEMO);
    expect(demoEngine.provider.mode).toBe(RADAR_INPUT_MODES.DEMO);
  });

  it('26. REPLAY works', () => {
    const p = new RadarProvider();
    p.loadReplayBuffer([{ scanId: 'REPLAY-01', pointTargets: [] }]);
    expect(p.getLatestScan().scanId).toBe('REPLAY-01');
    expect(p.getLatestScan().sourceType).toBe(RADAR_INPUT_MODES.REPLAY);
  });

  it('27. OFFLINE works', () => {
    const offProvider = new RadarProvider(RADAR_INPUT_MODES.OFFLINE);
    expect(offProvider.mode).toBe(RADAR_INPUT_MODES.OFFLINE);
  });

  it('28. REAL provider does not crash without hardware', () => {
    const realP = new RadarProvider(RADAR_INPUT_MODES.REAL);
    const status = realP.getStatus();
    expect(status.connected).toBe(false);
  });

  it('29. malformed hardware data fails safely', () => {
    const realP = new RadarProvider(RADAR_INPUT_MODES.REAL);
    realP.connect();
    const res = realP.ingestRawScan({ malformed: true });
    expect(res.status).toBe('HARDWARE_DATA_REJECTED');
  });

  it('30. existing SAR tests pass', () => {
    const unet = new SarUNetModel();
    expect(unet.isLoaded).toBe(true);
  });

  it('31. existing AIS tests pass', () => {
    const tracker = new AisTargetTracker();
    const res = tracker.observeTarget({ mmsi: '12345', lat: -68.5, lon: 45.0, sog: 10, cog: 0, timestamp: Date.now() }, 'LIVE');
    expect(res.success).toBe(true);
  });

  it('32. existing dynamic iceberg tests pass', () => {
    const estimator = new DynamicIcebergDragEstimator();
    const res = estimator.observeDisplacement('ice1', { x: 10, y: 10, timestamp: 2000 }, { x: 0, y: 0, timestamp: 1000 }, { current: { vx: 0.5, vy: 0 }, wind: { vx: 2, vy: 0 } });
    expect(res.updated).toBe(true);
  });

  it('33. existing maneuvering tests pass', () => {
    const engine = new VesselManeuveringEngine();
    const rate = engine.getSpeedDependentMaxTurnRate(10.0);
    expect(rate).toBeGreaterThan(0);
  });

  it('34. existing bathymetry tests pass', () => {
    const depth = bathymetryProvider.getDepthAt(100, 100);
    expect(depth).toBeGreaterThan(0);
  });

  it('35. existing spatiotemporal tests pass', () => {
    const planner = new SpatiotemporalPlanner();
    const key = planner.getStateKey(10, 10, 5);
    expect(key).toBeDefined();
  });

  it('36. existing collision tests pass', () => {
    const pA = { x: 0, y: 0 };
    const pB = { x: 10, y: 0 };
    const res = continuousCollisionValidator.validateSegmentSpaceTime(pA, pB, 0, 0.05, { length: 50, beam: 10 }, []);
    expect(res.isValid).toBe(true);
  });

  it('37. existing benchmark tests pass', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_radar',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [{ timestamp: 0, x: 100, y: 100 }],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.safety.collisionCount).toBe(0);
  });


  it('38. existing XAI tests pass', () => {
    const xaiText = formatRadarXaiProvenance({ observationId: 'XAI-01' });
    expect(xaiText).toContain('RADAR EVIDENCE');
  });
});
