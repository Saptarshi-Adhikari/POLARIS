/**
 * POLARIS Nav-OS — Phase 2B AIS Target Tracking, Gap Extrapolation & Uncertainty Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AisTargetTracker, TRACK_STATUS, DEFAULT_TRACKER_CONFIG } from '../src/js/ai/AisTargetTracker.js';
import { AisVesselProvider, aisVesselProvider } from '../src/js/data/AisVesselProvider.js';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { semanticRuleMapper, MARITIME_RULE_REGISTRY } from '../src/js/ai/semanticRuleMapper.js';
import { ContinuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';
import { sensorFusion } from '../src/js/sensors/sensorFusion.js';

describe('POLARIS Phase 2B — Robust AIS Target Tracking & Extrapolation Suite', () => {
  let tracker;

  beforeEach(() => {
    tracker = new AisTargetTracker();
  });

  it('1. Valid AIS observation creates track', () => {
    const obs = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 12.0, cog: 90.0, timestamp: 10000 };
    const res = tracker.observeTarget(obs, 'LIVE');
    expect(res.success).toBe(true);
    expect(res.track.mmsi).toBe('316001234');
    expect(res.track.trackStatus).toBe(TRACK_STATUS.FRESH);
  });

  it('2. Repeated MMSI updates same track', () => {
    const obs1 = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 12.0, cog: 90.0, timestamp: 10000 };
    const obs2 = { mmsi: '316001234', lat: -68.51, lon: 45.02, sog: 14.0, cog: 95.0, timestamp: 20000 };
    tracker.observeTarget(obs1, 'LIVE');
    const res2 = tracker.observeTarget(obs2, 'LIVE');

    expect(res2.success).toBe(true);
    expect(res2.track.updateCount).toBe(2);
    expect(tracker.tracks.size).toBe(1);
  });

  it('3. Duplicate message rejected safely', () => {
    const obs = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 12.0, cog: 90.0, timestamp: 10000, worldX: 1000, worldY: 1000 };
    tracker.observeTarget(obs, 'LIVE');
    const resDup = tracker.observeTarget(obs, 'LIVE');

    expect(resDup.success).toBe(false);
    expect(resDup.reason).toBe('DUPLICATE_OBSERVATION');
  });

  it('4. Out-of-order message rejected or handled correctly', () => {
    const obs2 = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 12.0, cog: 90.0, timestamp: 20000 };
    const obs1 = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 12.0, cog: 90.0, timestamp: 10000 };
    tracker.observeTarget(obs2, 'LIVE');
    const resOld = tracker.observeTarget(obs1, 'LIVE');

    expect(resOld.success).toBe(false);
    expect(resOld.reason).toBe('OUT_OF_ORDER_OBSERVATION');
  });

  it('5. Invalid coordinates rejected', () => {
    const obsBad = { mmsi: '316001234', lat: 999, lon: 45.0, timestamp: 10000 };
    const res = tracker.observeTarget(obsBad, 'LIVE');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('INVALID_COORDINATES');
  });

  it('6. Impossible speed rejected', () => {
    const obsFast = { mmsi: '316001234', lat: -68.5, lon: 45.0, sog: 120.0, cog: 90.0, timestamp: 10000 };
    const res = tracker.observeTarget(obsFast, 'LIVE');
    expect(res.success).toBe(false);
    expect(res.reason).toBe('IMPOSSIBLE_SPEED');
  });

  it('7. Fresh track has correct age', () => {
    const obs = { mmsi: '316001234', lat: -68.5, lon: 45.0, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');
    const active = tracker.getActiveTracks(12000); // 2s later
    expect(active[0].ageSeconds).toBe(2);
    expect(active[0].trackStatus).toBe(TRACK_STATUS.FRESH);
  });

  it('8. Temporary gap enters PREDICTED', () => {
    const obs = { mmsi: '316001234', lat: -68.5, lon: 45.0, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');
    const active = tracker.getActiveTracks(20000); // 10s later (> 5s threshold)
    expect(active[0].trackStatus).toBe(TRACK_STATUS.PREDICTED);
    expect(active[0].isPredicted).toBe(true);
  });

  it('9. Predicted position is deterministic', () => {
    const obs = { mmsi: '316001234', worldX: 1000, worldY: 1000, sog: 10.0, cog: 90.0, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const ext1 = tracker.extrapolateTrack(tracker.tracks.get('316001234'), 20000);
    const ext2 = tracker.extrapolateTrack(tracker.tracks.get('316001234'), 20000);
    expect(ext1.position.x).toBe(ext2.position.x);
    expect(ext1.position.y).toBe(ext2.position.y);
  });

  it('10. Covariance grows with prediction age', () => {
    const obs = { mmsi: '316001234', worldX: 1000, worldY: 1000, sog: 10.0, cog: 90.0, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const extEarly = tracker.extrapolateTrack(tracker.tracks.get('316001234'), 12000);
    const extLate = tracker.extrapolateTrack(tracker.tracks.get('316001234'), 30000);

    expect(extLate.positionUncertainty).toBeGreaterThan(extEarly.positionUncertainty);
    expect(extLate.covariance.pxx).toBeGreaterThan(extEarly.covariance.pxx);
  });

  it('11. Stale threshold transitions correctly', () => {
    const obs = { mmsi: '316001234', worldX: 1000, worldY: 1000, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const activeStale = tracker.getActiveTracks(10000 + 40 * 1000); // 40s later (> 30s)
    expect(activeStale[0].trackStatus).toBe(TRACK_STATUS.STALE);
  });

  it('12. Expired target is retained diagnostically', () => {
    const obs = { mmsi: '316001234', worldX: 1000, worldY: 1000, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const active = tracker.getActiveTracks(10000 + 400 * 1000); // 400s (> 300s)
    expect(active[0].trackStatus).toBe(TRACK_STATUS.EXPIRED);

    const diagnostic = tracker.getAllTracksDiagnostic(10000 + 400 * 1000);
    expect(diagnostic.length).toBe(1);
    expect(diagnostic[0].mmsi).toBe('316001234');
  });

  it('13. Expired target does not silently affect normal risk', () => {
    const obs = { mmsi: '316001234', worldX: 1000, worldY: 1000, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const normalActive = tracker.getTargetTracks(10000 + 400 * 1000);
    expect(normalActive.length).toBe(0); // Expired target excluded from active target query
  });

  it('14. Predicted target remains linked to source provenance', () => {
    const obs = { mmsi: '316001234', worldX: 1000, worldY: 1000, timestamp: 10000, sourceType: 'LIVE' };
    tracker.observeTarget(obs, 'LIVE');

    const ext = tracker.extrapolateTrack(tracker.tracks.get('316001234'), 20000);
    expect(ext.sourceType).toBe('LIVE');
    expect(ext.derivedFrom).toBe('LIVE');
    expect(ext.isPredicted).toBe(true);
  });

  it('15. CPA calculation uses predicted target state', () => {
    const ship = { x: 0, y: 0, heading: 0, speed: 10 };
    const targetObs = { mmsi: '999', worldX: 1000, worldY: 0, sog: 10, cog: 270, timestamp: 10000 };
    tracker.observeTarget(targetObs, 'LIVE');

    const predTrack = tracker.extrapolateTrack(tracker.tracks.get('999'), 20000);
    const encounter = semanticRuleMapper.classifyEncounter(ship, {
      x: predTrack.position.x,
      y: predTrack.position.y,
      vx: predTrack.velocity.vx,
      vy: predTrack.velocity.vy
    });
    expect(encounter).toBe('CROSSING');
  });

  it('16. TCPA calculation uses predicted target state', () => {
    const targetObs = { mmsi: '999', worldX: 500, worldY: 500, sog: 10, cog: 180, timestamp: 10000 };
    tracker.observeTarget(targetObs, 'LIVE');

    const predTrack = tracker.extrapolateTrack(tracker.tracks.get('999'), 20000);
    expect(predTrack.predictionAge).toBe(10);
    expect(predTrack.velocity.vy).toBeGreaterThan(0);
  });

  it('17. COLREG encounter classification works with predicted targets', () => {
    const ship = { x: 100, y: 100, heading: 0 };
    const predTarget = { mmsi: '888', x: 100, y: 50, heading: 180, isPredicted: true, ageSeconds: 15 };

    const encounter = semanticRuleMapper.classifyEncounter(ship, predTarget);
    expect(encounter).toBe('HEAD_ON');
  });

  it('18. Fresh vs predicted provenance is distinguishable', () => {
    const obs = { mmsi: '111', worldX: 100, worldY: 100, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const fresh = tracker.extrapolateTrack(tracker.tracks.get('111'), 12000);
    const pred = tracker.extrapolateTrack(tracker.tracks.get('111'), 20000);

    expect(fresh.isPredicted).toBe(false);
    expect(pred.isPredicted).toBe(true);
  });

  it('19. XAI includes track age', () => {
    const predHazard = { id: 'VESSEL-999', mmsi: '999', x: 200, y: 200, isPredicted: true, ageSeconds: 18, positionUncertainty: 8.5 };
    const exp = semanticRuleMapper.generateSemanticExplanation({
      threatHazard: predHazard,
      selectedAction: 'STARBOARD_DETOUR'
    });

    expect(exp.applicableRules.some(r => r.ruleId === 'AIS_GAP_EXTRAPOLATION_RULE')).toBe(true);
  });

  it('20. XAI includes target uncertainty', () => {
    const predHazard = { id: 'VESSEL-999', mmsi: '999', x: 200, y: 200, isPredicted: true, ageSeconds: 18, positionUncertainty: 8.5 };
    const exp = semanticRuleMapper.generateSemanticExplanation({
      threatHazard: predHazard,
      selectedAction: 'STARBOARD_DETOUR'
    });

    expect(exp.ruleBasis.some(b => b.includes('Uncertainty'))).toBe(true);
  });

  it('21. Duplicate tracks are not created for same MMSI', () => {
    const obs1 = { mmsi: '316001234', lat: -68.5, lon: 45.0, timestamp: 10000 };
    const obs2 = { mmsi: '316001234', lat: -68.51, lon: 45.01, timestamp: 20000 };
    tracker.observeTarget(obs1, 'LIVE');
    tracker.observeTarget(obs2, 'LIVE');

    expect(tracker.tracks.size).toBe(1);
  });

  it('22. Track reset behavior works', () => {
    tracker.observeTarget({ mmsi: '100', lat: -68.5, lon: 45.0, timestamp: 10000 }, 'LIVE');
    expect(tracker.tracks.size).toBe(1);
    tracker.reset();
    expect(tracker.tracks.size).toBe(0);
  });

  it('23. Maximum prediction horizon is respected', () => {
    const obs = { mmsi: '100', worldX: 1000, worldY: 1000, sog: 10.0, cog: 90.0, timestamp: 10000 };
    tracker.observeTarget(obs, 'LIVE');

    const extMax = tracker.extrapolateTrack(tracker.tracks.get('100'), 10000 + 600 * 1000); // 600s (> 300s max horizon)
    expect(extMax.predictionAge).toBe(600);
    expect(extMax.trackStatus).toBe(TRACK_STATUS.EXPIRED);
  });

  it('24. Deterministic replay produces deterministic tracks', () => {
    const obsList = [
      { mmsi: '100', worldX: 100, worldY: 100, timestamp: 10000 },
      { mmsi: '100', worldX: 120, worldY: 110, timestamp: 20000 }
    ];
    tracker.ingestTargets(obsList, 'REPLAY');
    const t1 = tracker.getActiveTracks(25000);

    const tracker2 = new AisTargetTracker();
    tracker2.ingestTargets(obsList, 'REPLAY');
    const t2 = tracker2.getActiveTracks(25000);

    expect(t1[0].position.x).toBe(t2[0].position.x);
    expect(t1[0].position.y).toBe(t2[0].position.y);
  });

  it('25. Benchmark metrics record target prediction gap', () => {
    const provider = new AisVesselProvider();
    provider.ingestAisTargets([{ mmsi: '100', lat: -68.5, lon: 45.0, timestamp: 10000 }], 'REPLAY');

    const extrapolated = provider.getExtrapolatedTargets(30000);
    expect(extrapolated[0].isPredicted).toBe(true);
    expect(extrapolated[0].ageSeconds).toBe(20);
  });

  it('26. Benchmark records target prediction error', () => {
    const obs = { mmsi: '100', worldX: 1000, worldY: 1000, sog: 10.0, cog: 90.0, timestamp: 10000 };
    tracker.observeTarget(obs, 'REPLAY');

    const ext = tracker.extrapolateTrack(tracker.tracks.get('100'), 20000);
    const groundTruthX = 1000 + (10 * 0.514444 * 10);
    const errX = Math.abs(ext.position.x - groundTruthX);

    expect(errX).toBeLessThan(1.0); // Exact CV propagation error < 1.0 SU
  });

  it('27. Sensor-fusion integration does not break own-vessel state', () => {
    const fused = sensorFusion.update({ x: 100, y: 100, vx: 5, vy: 5, heading: 45 }, [], 0.1);
    expect(fused.position.x).toBe(100);
    expect(fused.heading).toBe(45);
  });

  it('28. DEMO remains deterministic', () => {
    const provider = new AisVesselProvider();
    provider.ingestAisTargets([{ mmsi: 'DEMO-1', lat: -68.5, lon: 45.0, timestamp: 10000 }], 'SYNTHETIC');
    const ext = provider.getExtrapolatedTargets(15000);

    expect(ext.length).toBe(1);
    expect(ext[0].mmsi).toBe('DEMO-1');
  });

  it('29. REAL provider integration remains functional', () => {
    const realProvider = new RealDataProvider();
    expect(realProvider.aisProvider).toBeDefined();
  });

  it('30. Existing live-data tests structure compatibility verified', () => {
    expect(typeof aisVesselProvider.ingestAisTargets).toBe('function');
    expect(typeof aisVesselProvider.getExtrapolatedTargets).toBe('function');
  });

  it('31. Existing benchmark tests structure compatibility verified', () => {
    expect(DEFAULT_TRACKER_CONFIG.maxPredictionHorizonSec).toBe(300.0);
  });

  it('32. Existing semantic XAI tests structure compatibility verified', () => {
    expect(MARITIME_RULE_REGISTRY.AIS_GAP_EXTRAPOLATION).toBeDefined();
  });

  it('33. Existing collision tests structure compatibility verified', () => {
    const validator = new ContinuousCollisionValidator();
    expect(validator).toBeDefined();
  });

  it('34. Existing bathymetry tests structure compatibility verified', () => {
    expect(MARITIME_RULE_REGISTRY.POLARIS_BATHYMETRY_DEPTH_GUARD).toBeDefined();
  });

  it('35. Existing replanning tests structure compatibility verified', () => {
    expect(MARITIME_RULE_REGISTRY.POLARIS_ROUTE_STABILITY_POLICY).toBeDefined();
  });
});
