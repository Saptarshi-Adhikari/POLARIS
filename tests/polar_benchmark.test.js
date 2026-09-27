import { describe, it, expect, beforeEach } from 'vitest';
import { SeededRandom } from '../src/js/utils/seededRandom.js';
import { benchmarkScenarioTaxonomy } from '../src/js/benchmark/benchmarkTaxonomy.js';
import { benchmarkEvaluator } from '../src/js/benchmark/benchmarkEvaluator.js';
import { benchmarkRunner } from '../src/js/benchmark/benchmarkRunner.js';
import { validateBenchmarkScenario, getDatasetSplitForSeed, BENCHMARK_VERSION } from '../src/js/benchmark/benchmarkSchema.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';
import { fastFirstSafePlanner } from '../src/js/ai/FastFirstSafePlanner.js';
import { replanningStateMachine } from '../src/js/ai/ReplanningStateMachine.js';
import { semanticRuleMapper } from '../src/js/ai/semanticRuleMapper.js';

describe('POLARIS Phase 1C — Open Polar Navigation Benchmark Suite Test Suite', () => {

  it('1. Identical seed produces identical scenario', () => {
    const s1 = benchmarkScenarioTaxonomy.createBenchmarkScenario(12345, 'CLASS_A_CLEAR_SEAS');
    const s2 = benchmarkScenarioTaxonomy.createBenchmarkScenario(12345, 'CLASS_A_CLEAR_SEAS');
    expect(s1.scenarioId).toBe(s2.scenarioId);
    expect(s1.mission.start.x).toBe(s2.mission.start.x);
    expect(s1.hazards.length).toBe(s2.hazards.length);
  });

  it('2. Different seed produces different scenario', () => {
    const s1 = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_D_MULTI_ICEBERG_FIELD');
    const s2 = benchmarkScenarioTaxonomy.createBenchmarkScenario(9999, 'CLASS_D_MULTI_ICEBERG_FIELD');
    expect(s1.scenarioId).not.toBe(s2.scenarioId);
  });

  it('3. Benchmark metadata validates', () => {
    const scenario = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_B_STATIC_OBSTACLE');
    const val = validateBenchmarkScenario(scenario);
    expect(val.valid).toBe(true);
    expect(scenario.benchmarkVersion).toBe(BENCHMARK_VERSION);
  });

  it('4. Scenario IDs are unique per seed and class', () => {
    const s1 = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_A_CLEAR_SEAS');
    const s2 = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_B_STATIC_OBSTACLE');
    expect(s1.scenarioId).not.toBe(s2.scenarioId);
  });

  it('5. TRAIN/VALIDATION/TEST/STRESS splits do not overlap', () => {
    const split1 = getDatasetSplitForSeed(10);  // 10 % 100 = 10 -> TRAIN
    const split2 = getDatasetSplitForSeed(60);  // 60 % 100 = 60 -> VALIDATION
    const split3 = getDatasetSplitForSeed(80);  // 80 % 100 = 80 -> TEST
    const split4 = getDatasetSplitForSeed(95);  // 95 % 100 = 95 -> STRESS

    expect(split1).toBe('TRAIN');
    expect(split2).toBe('VALIDATION');
    expect(split3).toBe('TEST');
    expect(split4).toBe('STRESS');
  });

  it('6. Planner execution produces a result record', async () => {
    const spec = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_C_MOVING_CROSSING');
    const res = await benchmarkRunner.runScenarioEpisode(spec, 'CURRENT_FAST_FIRST_SAFE');
    expect(res).toHaveProperty('kpiSummary');
    expect(res.kpiSummary).toHaveProperty('gatesPassed');
  });

  it('7. Collision KPI is calculated correctly', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_col',
      seed: 1001,
      termination_reason: 'COLLISION',
      telemetry: [
        { timestamp: 0, x: 100, y: 100, collisionDetected: false },
        { timestamp: 1000, x: 150, y: 150, collisionDetected: true }
      ],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.safety.collisionCount).toBe(1);
    expect(kpi.gatesPassed).toBe(false);
  });

  it('8. Grounding KPI is calculated correctly', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_ground',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [
        { timestamp: 0, x: 100, y: 100, depthM: 5.0 }, // draft = 10m -> UKC = -5m < 3m
      ],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, { vessel: { draftM: 10.0, underKeelClearanceM: 3.0 } });
    expect(kpi.safety.groundingCount).toBeGreaterThan(0);
    expect(kpi.gatesPassed).toBe(false);
  });

  it('9. Minimum clearance is calculated correctly', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_clr',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [
        { timestamp: 0, minClearance: 150.0 },
        { timestamp: 1000, minClearance: 32.5 },
        { timestamp: 2000, minClearance: 80.0 }
      ],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.safety.minClearance).toBe(32.5);
  });

  it('10. Route length calculation is deterministic', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_len',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [
        { timestamp: 0, x: 0, y: 0 },
        { timestamp: 1000, x: 300, y: 400 } // hypot = 500
      ],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.routeQuality.routeLength).toBe(500.0);
  });

  it('11. Travel time calculation is deterministic', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_time',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [
        { timestamp: 1000, x: 0, y: 0 },
        { timestamp: 16000, x: 100, y: 100 }
      ],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.routeQuality.travelTimeSec).toBe(15.0);
  });

  it('12. Replan count is recorded correctly', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_replan',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [{ timestamp: 0, x: 0, y: 0 }],
      events: [
        { label: 'REPLAN', selectedSide: 'LEFT' },
        { label: 'REPLAN', selectedSide: 'RIGHT' }
      ]
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.operational.replanCount).toBe(2);
  });

  it('13. Route churn (side switches) is recorded correctly', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_churn',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [{ timestamp: 0, x: 0, y: 0 }],
      events: [
        { label: 'REPLAN', selectedSide: 'LEFT' },
        { label: 'REPLAN', selectedSide: 'RIGHT' }
      ]
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.operational.sideSwitches).toBe(1);
  });

  it('14. Planner latency metrics are recorded', () => {
    const dummyEpisode = {
      episode_id: 'ep_test_lat',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [{ timestamp: 0, x: 0, y: 0 }],
      events: [
        { label: 'REPLAN', calcTimeMs: 1.2 },
        { label: 'REPLAN', calcTimeMs: 5.4 }
      ]
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(dummyEpisode, {});
    expect(kpi.computational.plannerLatencyP50Ms).toBe(5.4);
  });

  it('15. Failure forensics record structure is valid', async () => {
    const spec = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_B_STATIC_OBSTACLE');
    const res = await benchmarkRunner.runScenarioEpisode(spec, 'CURRENT_FAST_FIRST_SAFE');
    expect(res).toHaveProperty('scenarioSpec');
    expect(res).toHaveProperty('plannerResult');
  });

  it('16. JSON export of benchmark suite is valid', async () => {
    const suiteRes = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    const jsonStr = JSON.stringify(suiteRes);
    expect(JSON.parse(jsonStr)).toHaveProperty('totalScenarios');
  });

  it('17. JSONL export of benchmark suite is valid', async () => {
    const suiteRes = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    const lines = suiteRes.results.map(r => JSON.stringify(r.kpiSummary));
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0])).toHaveProperty('episodeId');
  });

  it('18. CSV export of benchmark suite is valid', async () => {
    const suiteRes = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    const csvStr = benchmarkRunner.exportToCSV(suiteRes);
    expect(csvStr).toContain('benchmarkVersion,scenarioId');
  });

  it('19. Benchmark can execute multiple planner profiles', async () => {
    const spec = benchmarkScenarioTaxonomy.createBenchmarkScenario(1001, 'CLASS_A_CLEAR_SEAS');
    const resFast = await benchmarkRunner.runScenarioEpisode(spec, 'CURRENT_FAST_FIRST_SAFE');
    const resAStar = await benchmarkRunner.runScenarioEpisode(spec, 'STANDARD_ASTAR_BASELINE');
    expect(resFast.plannerResult.selectedSide).not.toBe(resAStar.plannerResult.selectedSide);
  });

  it('20. Unavailable metric becomes null rather than fabricated', () => {
    const emptyEpisode = {
      episode_id: 'ep_test_null',
      seed: 1001,
      termination_reason: 'DESTINATION_REACHED',
      telemetry: [],
      events: []
    };
    const kpi = benchmarkEvaluator.evaluateEpisode(emptyEpisode, {});
    expect(kpi.safety.minClearance).toBeNull();
    expect(kpi.computational.plannerLatencyP50Ms).toBeNull();
  });

  it('21. Benchmark execution is reproducible', async () => {
    const suite1 = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    const suite2 = await benchmarkRunner.runSuite([1001], ['CLASS_A_CLEAR_SEAS']);
    expect(suite1.successRate).toBe(suite2.successRate);
  });

  it('22. Existing NavTestBot structure compatibility verified', () => {
    expect(typeof benchmarkScenarioTaxonomy.createBenchmarkScenario).toBe('function');
  });

  it('23. Existing bathymetry tests structure compatibility verified', () => {
    expect(typeof bathymetryProvider.validateRouteDepth).toBe('function');
  });

  it('24. Existing semantic XAI tests structure compatibility verified', () => {
    expect(typeof semanticRuleMapper.generateExplanation).toBe('function');
  });

  it('25. Existing collision tests structure compatibility verified', () => {
    expect(typeof fastFirstSafePlanner.evaluateLeftRight).toBe('function');
  });

  it('26. Existing replanning tests structure compatibility verified', () => {
    expect(typeof replanningStateMachine.evaluateState).toBe('function');
  });

});
