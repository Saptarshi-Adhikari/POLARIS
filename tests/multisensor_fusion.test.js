/**
 * POLARIS — Phase 5C Multi-Sensor Uncertainty Fusion & Spatiotemporal Risk Occupancy Test Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SensorTimeSynchronizer,
  createCommonSensorEvidence,
  calculateSensorUncertainty,
  propagateObservationToTime,
  TrackLevelFusionEngine,
  SpatiotemporalRiskOccupancy,
  formatMultiSensorFusionXaiProvenance,
  TEMPORAL_QUALITY,
  FUSION_METHOD,
  CONFLICT_STATE,
  RISK_OCCUPANCY_STATE,
  SENSOR_RELIABILITY_LEVEL
} from '../src/js/data/SpatiotemporalRiskOccupancy.js';
import { SpatiotemporalPlanner } from '../src/js/ai/SpatiotemporalPlanner.js';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';

describe('POLARIS Phase 5C — Multi-Sensor Uncertainty Fusion & Spatiotemporal Risk Occupancy (Scenarios A through T)', () => {
  let sync;
  let fusionEngine;
  let riskOccupancy;

  beforeEach(() => {
    sync = new SensorTimeSynchronizer();
    fusionEngine = new TrackLevelFusionEngine();
    riskOccupancy = new SpatiotemporalRiskOccupancy();
  });

  it('Scenario A — Radar Only', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 1000, worldY: 1000, rangeUncertainty: 10, bearingUncertainty: 0.5 });
    const fused = fusionEngine.fuseAssociationGroup({ groupId: 'G-RAD', members: [rad] });

    expect(fused.fusionMethod).toBe(FUSION_METHOD.SINGLE_SOURCE);
    expect(fused.associationState).toBe('RADAR_ONLY');
    expect(fused.fusedPosition.worldX).toBe(1000);
  });

  it('Scenario B — AIS Only', () => {
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 2000, worldY: 2000, mmsi: 316001234 });
    const fused = fusionEngine.fuseAssociationGroup({ groupId: 'G-AIS', members: [ais] });

    expect(fused.fusionMethod).toBe(FUSION_METHOD.SINGLE_SOURCE);
    expect(fused.associationState).toBe('AIS_ONLY');
  });

  it('Scenario C — SAR Only', () => {
    const sar = createCommonSensorEvidence({ source: 'SAR', worldX: 3000, worldY: 3000, resolution: 10.0 });
    const fused = fusionEngine.fuseAssociationGroup({ groupId: 'G-SAR', members: [sar] });

    expect(fused.associationState).toBe('SAR_ONLY');
  });

  it('Scenario D — Radar + AIS Consistent', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 1000, worldY: 1000, positionUncertaintyMeters: 10.0 });
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 1010, worldY: 1005, positionUncertaintyMeters: 8.0 });

    const groups = fusionEngine.formAssociationGroups([rad, ais]);
    expect(groups.length).toBe(1);

    const fused = fusionEngine.fuseAssociationGroup(groups[0]);
    expect(fused.conflictState).toBe(CONFLICT_STATE.CONSISTENT);
    expect(fused.associationState).toContain('ASSOCIATED');
  });

  it('Scenario E — Radar + AIS Contradictory (Unresolved Conflict)', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 1000, worldY: 1000 });
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 1500, worldY: 1500 }); // 707m away > 200m conflict threshold

    const conflictState = fusionEngine.evaluateConflictState([rad, ais]);
    expect(conflictState).toBe(CONFLICT_STATE.UNRESOLVED_CONFLICT);
  });

  it('Scenario F — Radar + SAR Candidate Association', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 2500, worldY: 2500 });
    const sar = createCommonSensorEvidence({ source: 'SAR', worldX: 2520, worldY: 2510 });

    const groups = fusionEngine.formAssociationGroups([rad, sar]);
    expect(groups.length).toBe(1);
    expect(groups[0].members.length).toBe(2);
  });

  it('Scenario G — AIS + SAR Association', () => {
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 3000, worldY: 3000 });
    const sar = createCommonSensorEvidence({ source: 'SAR', worldX: 3030, worldY: 3020 });

    const groups = fusionEngine.formAssociationGroups([ais, sar]);
    expect(groups.length).toBe(1);
  });

  it('Scenario H — All Sensors Consistent', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 1000, worldY: 1000 });
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 1005, worldY: 1002 });
    const sar = createCommonSensorEvidence({ source: 'SAR', worldX: 1010, worldY: 1008 });

    const groups = fusionEngine.formAssociationGroups([rad, ais, sar]);
    expect(groups.length).toBe(1);
    const fused = fusionEngine.fuseAssociationGroup(groups[0]);
    expect(fused.conflictState).toBe(CONFLICT_STATE.CONSISTENT);
    expect(fused.sourceContributions.length).toBe(3);
  });

  it('Scenario I — Partially Stale Observations', () => {
    const oldTime = Date.now() - 15000;
    const obs = createCommonSensorEvidence({ source: 'RADAR', timestamp: oldTime });

    expect(obs.temporalSync.temporalQuality).toBe(TEMPORAL_QUALITY.STALE);
  });

  it('Scenario J — Complete Sensor Dropout', () => {
    const query = riskOccupancy.querySpatiotemporalRisk(100, 100, Date.now(), {});
    expect(query.occupancyState).toBe(RISK_OCCUPANCY_STATE.CLEAR_WATER);
    expect(query.maximumRisk).toBe(0.0);
  });

  it('Scenario K — Duplicate Evidence Protection', () => {
    const rad1 = createCommonSensorEvidence({ source: 'RADAR', observationId: 'RAD-01', worldX: 1000, worldY: 1000 });
    const rad2 = createCommonSensorEvidence({ source: 'RADAR', observationId: 'RAD-02', worldX: 1002, worldY: 1001 });

    const group = { groupId: 'G-DUP', members: [rad1, rad2], sources: new Set(['RADAR']) };
    const fused = fusionEngine.fuseAssociationGroup(group);

    // Secondary Radar observation weight is capped (25%) to prevent artificial double counting
    const weight1 = fused.sourceContributions.find(c => c.observationId === 'RAD-01').weight;
    const weight2 = fused.sourceContributions.find(c => c.observationId === 'RAD-02').weight;
    expect(weight1).toBeGreaterThan(weight2);
  });

  it('Scenario L — Correlated Radar/AIS Target Avoids Artificial Double-Counting', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 1000, worldY: 1000, detectionScore: 0.8 });
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 1005, worldY: 1005, detectionScore: 0.8 });

    const group = { groupId: 'G-CORR', members: [rad, ais], sources: new Set(['RADAR', 'AIS']) };
    const fused = fusionEngine.fuseAssociationGroup(group);

    expect(fused.fusedEvidenceScore).toBe(0.8); // Score capped at max evidence, not summed (0.8 + 0.8 != 1.6)
  });

  it('Scenario M — Dynamic Target Prediction Ahead in Time', () => {
    const obs = createCommonSensorEvidence({ source: 'AIS', worldX: 1000, worldY: 1000, vx: 10.0, vy: 0.0, timestamp: Date.now() });
    const futureTime = Date.now() + 10000; // 10s ahead

    const pred = propagateObservationToTime(obs, futureTime);
    expect(pred.position.worldX).toBeCloseTo(1100.0, 1);
    expect(pred.uncertainty.positionUncertaintyMeters).toBeGreaterThan(obs.uncertainty.positionUncertaintyMeters);
  });

  it('Scenario N — Stationary SAR Object Motion Model', () => {
    const obs = createCommonSensorEvidence({ source: 'SAR', worldX: 2000, worldY: 2000, vx: 0, vy: 0 });
    const futureTime = Date.now() + 20000;

    const pred = propagateObservationToTime(obs, futureTime);
    expect(pred.position.worldX).toBe(2000);
    expect(pred.predictionModel).toBe('STATIC_DRIFT_MODEL');
  });

  it('Scenario O — Bathymetry + Moving Target Interaction', () => {
    const snap = {
      vessels: [{ worldX: 500, worldY: 500, vx: 0, vy: 0, positionUncertaintyMeters: 10 }]
    };

    // Coordinate (3000, 200) in bathymetry is shallow shoal (~4m depth < draft 10m) -> GROUNDING_RISK
    const shallowQuery = riskOccupancy.querySpatiotemporalRisk(3000, 200, Date.now(), snap, { draftM: 10, underKeelClearanceM: 3 });
    expect(shallowQuery.occupancyState).toBe(RISK_OCCUPANCY_STATE.GROUNDING_RISK);
    expect(shallowQuery.isHardBlocked).toBe(true);
  });

  it('Scenario P — Uncertainty Expansion Over Time', () => {
    const obs = createCommonSensorEvidence({ source: 'RADAR', positionUncertaintyMeters: 10.0 });
    const pred0 = propagateObservationToTime(obs, Date.now());
    const pred60 = propagateObservationToTime(obs, Date.now() + 60000);

    expect(pred60.uncertainty.positionUncertaintyMeters).toBeGreaterThan(pred0.uncertainty.positionUncertaintyMeters);
  });

  it('Scenario Q — Conflicting Target Positions Risk Classification', () => {
    const rad = createCommonSensorEvidence({ source: 'RADAR', worldX: 1000, worldY: 1000, positionUncertaintyMeters: 10 });
    const ais = createCommonSensorEvidence({ source: 'AIS', worldX: 1400, worldY: 1400, positionUncertaintyMeters: 10 });

    const group = { groupId: 'G-CONF', members: [rad, ais], sources: new Set(['RADAR', 'AIS']) };
    const fused = fusionEngine.fuseAssociationGroup(group);

    expect(fused.conflictState).toBe(CONFLICT_STATE.UNRESOLVED_CONFLICT);
  });

  it('Scenario R — Stale Observation Expiration', () => {
    const expiredTime = Date.now() - 100000; // 100s old > 60s maxStale
    const syncRes = sync.synchronizeObservation({ timestamp: expiredTime }, Date.now());

    expect(syncRes.temporalQuality).toBe(TEMPORAL_QUALITY.EXPIRED);
  });

  it('Scenario S — Spatiotemporal Planner Integration', () => {
    const planner = new SpatiotemporalPlanner();
    const route = planner.planSpatiotemporalRoute({ x: 100, y: 100 }, { x: 300, y: 100 }, { speed: 10 });

    expect(route.success).toBe(true);
  });

  it('Scenario T — Final Collision-Validator Safety Gate Invariant', () => {
    const pA = { x: 100, y: 500 };
    const pB = { x: 200, y: 500 };
    const vessel = { length: 80, beam: 20, speed: 15 };
    const res = continuousCollisionValidator.validateSegmentSpaceTime(pA, pB, 0, 0.05, vessel, []);

    expect(res.isValid).toBe(true);
  });

  it('XAI Provenance Formatter outputs valid multi-sensor evidence breakdown', () => {
    const group = {
      groupId: 'GROUP-99',
      associationState: 'AIS_RADAR_ASSOCIATED',
      conflictState: CONFLICT_STATE.CONSISTENT,
      fusionMethod: FUSION_METHOD.COVARIANCE_INTERSECTION,
      fusedPosition: { worldX: 1200.5, worldY: 1400.2 },
      fusedUncertainty: { positionUncertaintyMeters: 12.5 },
      fusedEvidenceScore: 0.88,
      sourceContributions: [{ source: 'RADAR', weight: 0.6 }, { source: 'AIS', weight: 0.4 }]
    };

    const text = formatMultiSensorFusionXaiProvenance(group);
    expect(text).toContain('FUSED ENVIRONMENT EVIDENCE');
    expect(text).toContain('Target: GROUP-99');
    expect(text).toContain('RADAR:60%');
  });
});
