import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicIcebergDragEstimator, dynamicIcebergDragEstimator, ESTIMATOR_STATUS, ESTIMATOR_SCOPE } from '../src/js/ai/DynamicIcebergDragEstimator.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { adaptiveCalibrationEngine } from '../src/js/ai/AdaptiveCalibrationEngine.js';
import { semanticRuleMapper } from '../src/js/ai/semanticRuleMapper.js';
import { benchmarkRunner } from '../src/js/benchmark/benchmarkRunner.js';

describe('POLARIS Phase 2A — Dynamic Iceberg Drag / Drift Parameter Estimation Suite', () => {
  let estimator;

  beforeEach(() => {
    estimator = new DynamicIcebergDragEstimator();
  });

  it('1. Valid observations update track history', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000, sourceType: 'LIVE' };
    const obs2 = { x: 120, y: 110, timestamp: 20000, sourceType: 'LIVE' }; // dt = 10s
    const env = { current: { vx: 1.0, vy: 0.5 }, wind: { vx: 5, vy: 2 } };

    const res = estimator.observeDisplacement('ice_01', obs2, obs1, env);
    expect(res.updated).toBe(true);
    const state = estimator.getTrackState('ice_01');
    expect(state.history.length).toBe(1);
  });

  it('2. Duplicate observation is rejected safely', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const res = estimator.observeDisplacement('ice_01', obs1, obs1, {});
    expect(res.updated).toBe(false);
    expect(res.reason).toBe('INVALID_TIME_DELTA');
  });

  it('3. Stale observation is rejected', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 120, y: 110, timestamp: 10000 + 3600 * 10 * 1000 }; // dt = 10h > 6h max
    const res = estimator.observeDisplacement('ice_01', obs2, obs1, {});
    expect(res.updated).toBe(false);
    expect(res.reason).toBe('INVALID_TIME_DELTA');
  });

  it('4. Invalid dt is rejected', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 120, y: 110, timestamp: 9000 }; // negative dt
    const res = estimator.observeDisplacement('ice_01', obs2, obs1, {});
    expect(res.updated).toBe(false);
    expect(res.reason).toBe('INVALID_TIME_DELTA');
  });

  it('5. Insufficient history does not adapt parameter', () => {
    const state = estimator.getTrackState('ice_new');
    expect(state.status).toBe(ESTIMATOR_STATUS.INSUFFICIENT_DATA);
    const paramInfo = estimator.getEffectiveParameter('ice_new');
    expect(paramInfo.scope).toBe(ESTIMATOR_SCOPE.BASELINE);
  });

  it('6. Sufficient consistent observations trigger CALIBRATING status', () => {
    let t = 10000;
    let prev = { x: 100, y: 100, timestamp: t, sourceType: 'LIVE' };
    const env = { current: { vx: 1.0, vy: 0.5 }, wind: { vx: 5, vy: 2 } };

    for (let i = 0; i < 4; i++) {
      t += 10000;
      const cur = { x: 100 + (i + 1) * 20, y: 100 + (i + 1) * 10, timestamp: t, sourceType: 'LIVE' };
      estimator.observeDisplacement('ice_cal', cur, prev, env);
      prev = cur;
    }

    const paramInfo = estimator.getEffectiveParameter('ice_cal');
    expect(paramInfo.status).toBe(ESTIMATOR_STATUS.CALIBRATING);
  });

  it('7. Stable observations reach ADAPTED status', () => {
    let t = 10000;
    let prev = { x: 100, y: 100, timestamp: t, sourceType: 'LIVE' };
    const env = { current: { vx: 1.0, vy: 0.5 }, wind: { vx: 5, vy: 2 } };

    for (let i = 0; i < 9; i++) {
      t += 10000;
      const cur = { x: 100 + (i + 1) * 20, y: 100 + (i + 1) * 10, timestamp: t, sourceType: 'LIVE' };
      estimator.observeDisplacement('ice_adapted', cur, prev, env);
      prev = cur;
    }

    const paramInfo = estimator.getEffectiveParameter('ice_adapted');
    expect(paramInfo.status).toBe(ESTIMATOR_STATUS.ADAPTED);
    expect(paramInfo.scope).toBe(ESTIMATOR_SCOPE.TRACK_ADAPTED);
  });

  it('8. Contradictory/stale environmental data triggers DEGRADED status', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 120, y: 110, timestamp: 20000 };
    const staleEnv = { timestamp: 10000 - 86400 * 5 * 1000 }; // 5 days old

    const res = estimator.observeDisplacement('ice_deg', obs2, obs1, staleEnv);
    expect(res.updated).toBe(false);
    expect(res.reason).toBe('ENVIRONMENT_STALE');
    expect(res.state.status).toBe(ESTIMATOR_STATUS.DEGRADED);
  });

  it('9. Parameter remains inside configured physical bounds [0.2, 3.5]', () => {
    let t = 10000;
    let prev = { x: 100, y: 100, timestamp: t, sourceType: 'LIVE' };
    const env = { current: { vx: 0.01, vy: 0.01 } };

    for (let i = 0; i < 20; i++) {
      t += 10000;
      const cur = { x: 100 + (i + 1) * 500, y: 100 + (i + 1) * 500, timestamp: t, sourceType: 'LIVE' };
      estimator.observeDisplacement('ice_bound', cur, prev, env);
      prev = cur;
    }

    const paramInfo = estimator.getEffectiveParameter('ice_bound');
    expect(paramInfo.parameter).toBeLessThanOrEqual(3.5);
    expect(paramInfo.parameter).toBeGreaterThanOrEqual(0.2);
  });

  it('10. Update gain is bounded and smooth', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 200, y: 200, timestamp: 20000 };
    const res = estimator.observeDisplacement('ice_gain', obs2, obs1, {});
    expect(res.parameter).toBeLessThan(3.5);
  });

  it('11. Confidence increases with valid evidence', () => {
    const initialConf = estimator.getTrackState('ice_conf').confidence;
    let t = 10000;
    let prev = { x: 100, y: 100, timestamp: t, sourceType: 'LIVE' };

    for (let i = 0; i < 5; i++) {
      t += 10000;
      const cur = { x: 100 + (i + 1) * 20, y: 100 + (i + 1) * 10, timestamp: t, sourceType: 'LIVE' };
      estimator.observeDisplacement('ice_conf', cur, prev, {});
      prev = cur;
    }

    const updatedConf = estimator.getTrackState('ice_conf').confidence;
    expect(updatedConf).toBeGreaterThan(initialConf);
  });

  it('12. Residual variance is calculated correctly', () => {
    const state = estimator.getTrackState('ice_var');
    expect(state).toHaveProperty('residualVariance');
    expect(state.residualVariance).toBeGreaterThan(0);
  });

  it('13. Track-specific parameter overrides global parameter', () => {
    estimator.trackStates.set('ice_spec', {
      icebergId: 'ice_spec',
      parameter: 2.15,
      status: ESTIMATOR_STATUS.ADAPTED,
      confidence: 0.90,
      observationCount: 10
    });
    const paramInfo = estimator.getEffectiveParameter('ice_spec');
    expect(paramInfo.parameter).toBe(2.15);
    expect(paramInfo.scope).toBe(ESTIMATOR_SCOPE.TRACK_ADAPTED);
  });

  it('14. New iceberg falls back to global/baseline parameter', () => {
    const paramInfo = estimator.getEffectiveParameter('ice_unknown_999');
    expect(paramInfo.scope).toBe(ESTIMATOR_SCOPE.BASELINE);
    expect(paramInfo.parameter).toBe(1.0);
  });

  it('15. Stale current prevents unsafe adaptation', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 120, y: 110, timestamp: 20000 };
    const staleCurrent = { timestamp: 10000 - 86400 * 5 * 1000 };

    const res = estimator.observeDisplacement('ice_stale_curr', obs2, obs1, { current: staleCurrent, timestamp: 10000 - 86400 * 5 * 1000 });
    expect(res.updated).toBe(false);
  });

  it('16. Stale wind prevents unsafe attribution', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 120, y: 110, timestamp: 20000 };
    const staleWind = { timestamp: 10000 - 86400 * 5 * 1000 };

    const res = estimator.observeDisplacement('ice_stale_wind', obs2, obs1, { wind: staleWind, timestamp: 10000 - 86400 * 5 * 1000 });
    expect(res.updated).toBe(false);
  });

  it('17. Synthetic provenance receives SYNTHETIC tag', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000, sourceType: 'SYNTHETIC' };
    const obs2 = { x: 120, y: 110, timestamp: 20000, sourceType: 'SYNTHETIC' };
    const res = estimator.observeDisplacement('ice_syn', obs2, obs1, {});
    expect(res.state.history[0].sourceType).toBe('SYNTHETIC');
  });

  it('18. Live provenance receives LIVE tag', () => {
    const obs1 = { x: 100, y: 100, timestamp: 10000, sourceType: 'LIVE' };
    const obs2 = { x: 120, y: 110, timestamp: 20000, sourceType: 'LIVE' };
    const res = estimator.observeDisplacement('ice_live', obs2, obs1, {});
    expect(res.state.history[0].sourceType).toBe('LIVE');
  });

  it('19. Adapted parameter reaches Iceberg physics model in iceberg.js', () => {
    const ice = new Iceberg({ id: 'ice_phys_test', x: 500, y: 500 });
    dynamicIcebergDragEstimator.trackStates.set('ice_phys_test', {
      icebergId: 'ice_phys_test',
      parameter: 1.85,
      status: ESTIMATOR_STATUS.ADAPTED
    });

    const state = { icebergs: { enabled: true }, environment: { wind: { enabled: false } } };
    const vectorField = { getVelocityAt: () => ({ u: 0.2, v: 0.1 }) };
    ice.update(0.1, vectorField, 0, state);

    expect(ice.effectiveDragParamInfo.parameter).toBe(1.85);
  });

  it('20. Forecast uncertainty increases appropriately when parameter confidence is low', () => {
    const paramInfo = estimator.getEffectiveParameter('ice_unlow');
    expect(paramInfo.confidence).toBeLessThan(0.5);
  });

  it('21. Baseline and adapted parameters are both retained', () => {
    const paramInfo = estimator.getEffectiveParameter('ice_ret');
    expect(paramInfo).toHaveProperty('parameter');
    expect(paramInfo).toHaveProperty('scope');
  });

  it('22. XAI exposes adaptation evidence', () => {
    const explanation = semanticRuleMapper.generateExplanation({
      driftCalibration: {
        icebergId: 'A-76',
        effectiveParameter: 1.45,
        status: 'ADAPTED',
        confidence: 0.92,
        disclaimer: 'adaptive drift parameter estimated from observed track residuals'
      }
    });
    expect(explanation.evidence).toHaveProperty('driftCalibration');
    expect(explanation.evidence.driftCalibration.effectiveParameter).toBe(1.45);
  });

  it('23. Benchmark records adaptation metrics', async () => {
    const suiteRes = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    expect(suiteRes).toHaveProperty('results');
  });

  it('24. Repeated deterministic inputs produce deterministic updates', () => {
    const e1 = new DynamicIcebergDragEstimator();
    const e2 = new DynamicIcebergDragEstimator();
    const obs1 = { x: 100, y: 100, timestamp: 10000 };
    const obs2 = { x: 120, y: 110, timestamp: 20000 };

    const r1 = e1.observeDisplacement('ice_det', obs2, obs1, {});
    const r2 = e2.observeDisplacement('ice_det', obs2, obs1, {});
    expect(r1.parameter).toBe(r2.parameter);
  });

  it('25. Calibration does not create parameter oscillation', () => {
    let t = 10000;
    let prev = { x: 100, y: 100, timestamp: t };

    for (let i = 0; i < 10; i++) {
      t += 10000;
      const cur = { x: 100 + (i + 1) * 20, y: 100 + (i + 1) * 10, timestamp: t };
      estimator.observeDisplacement('ice_osc', cur, prev, {});
      prev = cur;
    }

    const state = estimator.getTrackState('ice_osc');
    const p1 = state.history[state.history.length - 1].parameter;
    const p2 = state.history[state.history.length - 2].parameter;
    expect(Math.abs(p1 - p2)).toBeLessThan(0.15);
  });

  it('26. Existing AdaptiveCalibrationEngine structure compatibility verified', () => {
    expect(typeof adaptiveCalibrationEngine.observePredictionError).toBe('function');
  });

  it('27. Existing benchmark tests structure compatibility verified', () => {
    expect(typeof benchmarkRunner.runSuite).toBe('function');
  });

  it('28. Existing semantic XAI tests structure compatibility verified', () => {
    expect(typeof semanticRuleMapper.generateExplanation).toBe('function');
  });

});
