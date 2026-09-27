/**
 * POLARIS Nav-OS — Normalized Benchmark Scenario Taxonomy (Phase 1C)
 *
 * Categorizes benchmark scenarios across 9 core operational domains:
 * BASELINE, STATIC_HAZARDS, MOVING_HAZARDS, MULTI_HAZARD, MARITIME_TRAFFIC,
 * BATHYMETRY, UNCERTAINTY, DEGRADATION, EMERGENCY.
 */

import { ScenarioGenerator, SCENARIO_CLASSES } from '../debug/navTestScenarios.js';
import { BENCHMARK_VERSION, SOURCE_TYPES, getDatasetSplitForSeed } from './benchmarkSchema.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';

export const BENCHMARK_TAXONOMY_CATEGORIES = Object.freeze({
  BASELINE: 'BASELINE',
  STATIC_HAZARDS: 'STATIC_HAZARDS',
  MOVING_HAZARDS: 'MOVING_HAZARDS',
  MULTI_HAZARD: 'MULTI_HAZARD',
  MARITIME_TRAFFIC: 'MARITIME_TRAFFIC',
  BATHYMETRY: 'BATHYMETRY',
  UNCERTAINTY: 'UNCERTAINTY',
  DEGRADATION: 'DEGRADATION',
  EMERGENCY: 'EMERGENCY',
  RADAR_PERCEPTION: 'RADAR_PERCEPTION',
  RADAR_ASSOCIATION: 'RADAR_ASSOCIATION',
  MULTISENSOR_FUSION: 'MULTISENSOR_FUSION',
  DECISION_SINGLE_TARGET: 'DECISION_SINGLE_TARGET',
  DECISION_HEAD_ON: 'DECISION_HEAD_ON',
  DECISION_CROSSING: 'DECISION_CROSSING',
  DECISION_OVERTAKING: 'DECISION_OVERTAKING',
  DECISION_STAND_ON: 'DECISION_STAND_ON',
  DECISION_GIVE_WAY: 'DECISION_GIVE_WAY',
  DECISION_RESTRICTED_VISIBILITY: 'DECISION_RESTRICTED_VISIBILITY',
  DECISION_MULTI_HAZARD: 'DECISION_MULTI_HAZARD',
  DECISION_SENSOR_CONFLICT: 'DECISION_SENSOR_CONFLICT',
  DECISION_SENSOR_DROPOUT: 'DECISION_SENSOR_DROPOUT',
  DECISION_EMERGENCY: 'DECISION_EMERGENCY',
  DECISION_GROUNDING_CONFLICT: 'DECISION_GROUNDING_CONFLICT',
  DECISION_MANEUVERABILITY_CONFLICT: 'DECISION_MANEUVERABILITY_CONFLICT',
  DECISION_RULE_AMBIGUITY: 'DECISION_RULE_AMBIGUITY',
  DECISION_ACTION_HYSTERESIS: 'DECISION_ACTION_HYSTERESIS',
  COUNTERFACTUAL_SINGLE_ACTION: 'COUNTERFACTUAL_SINGLE_ACTION',
  COUNTERFACTUAL_MULTI_ACTION: 'COUNTERFACTUAL_MULTI_ACTION',
  DECISION_SENSITIVITY: 'DECISION_SENSITIVITY',
  DECISION_MARGIN: 'DECISION_MARGIN',
  DECISION_STABILITY: 'DECISION_STABILITY',
  DECISION_CHURN: 'DECISION_CHURN',
  SENSOR_PERTURBATION: 'SENSOR_PERTURBATION',
  RULE_SENSITIVITY: 'RULE_SENSITIVITY',
  MANEUVERABILITY_SENSITIVITY: 'MANEUVERABILITY_SENSITIVITY',
  EPISODE_SAFETY: 'EPISODE_SAFETY',
  ADVERSARIAL_DECISION: 'ADVERSARIAL_DECISION',
  DEGRADED_DECISION_EPISODE: 'DEGRADED_DECISION_EPISODE',
  ADAPTIVE_EXECUTION: 'ADAPTIVE_EXECUTION',
  DYNAMIC_REPLAN: 'DYNAMIC_REPLAN',
  ROUTE_INVALIDATION: 'ROUTE_INVALIDATION',
  ACTION_INVALIDATION: 'ACTION_INVALIDATION',
  STALE_PLAN_REJECTION: 'STALE_PLAN_REJECTION',
  CLOSED_LOOP_EXECUTION: 'CLOSED_LOOP_EXECUTION',
  MISSION_RECOVERY: 'MISSION_RECOVERY',
  MISSION_COMPLETION: 'MISSION_COMPLETION',
  MULTI_HAZARD_EXECUTION: 'MULTI_HAZARD_EXECUTION',
  EXECUTION_STABILITY: 'EXECUTION_STABILITY',
  END_TO_END_SAFETY: 'END_TO_END_SAFETY',
  END_TO_END_PERFORMANCE: 'END_TO_END_PERFORMANCE'
});

export class BenchmarkScenarioTaxonomy {
  constructor() {
    this.scenarioGenerator = new ScenarioGenerator();
  }

  /**
   * Generates a fully canonical benchmark scenario object by seed & taxonomy category/class.
   */
  createBenchmarkScenario(seed = 1001, scenarioClass = 'CLASS_A_CLEAR_SEAS', options = {}) {
    const rawScenario = this.scenarioGenerator.generateScenario(seed, scenarioClass, options);

    // Map legacy 12-class scenario to Benchmark Category
    let taxonomyCategory = BENCHMARK_TAXONOMY_CATEGORIES.BASELINE;
    if (['CLASS_B_STATIC_OBSTACLE', 'CLASS_G_ESCAPE_CORRIDORS', 'CLASS_L_SAFE_VS_RISKY_CHOICE'].includes(scenarioClass)) {
      taxonomyCategory = BENCHMARK_TAXONOMY_CATEGORIES.STATIC_HAZARDS;
    } else if (['CLASS_C_MOVING_CROSSING', 'CLASS_D_MULTI_ICEBERG_FIELD', 'CLASS_K_WORLD_WRAP_CROSSING'].includes(scenarioClass)) {
      taxonomyCategory = BENCHMARK_TAXONOMY_CATEGORIES.MOVING_HAZARDS;
    } else if (['CLASS_E_SIDE_APPROACH', 'CLASS_F_HEAD_ON_APPROACH'].includes(scenarioClass)) {
      taxonomyCategory = BENCHMARK_TAXONOMY_CATEGORIES.MARITIME_TRAFFIC;
    } else if (['CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE', 'CLASS_I_SLOW_DOWN_BETTER', 'CLASS_J_TURN_BETTER'].includes(scenarioClass)) {
      taxonomyCategory = BENCHMARK_TAXONOMY_CATEGORIES.EMERGENCY;
    }

    if (options.taxonomyCategory) {
      taxonomyCategory = options.taxonomyCategory;
    }

    const sourceType = options.sourceType || SOURCE_TYPES.SYNTHETIC;
    const split = options.split || getDatasetSplitForSeed(seed);
    const scenarioId = `POLAR_BENCH_${scenarioClass}_s${seed}`;

    // Bathymetry validation context
    const bathymetryMeta = bathymetryProvider.getMetadata();

    return {
      benchmarkVersion: BENCHMARK_VERSION,
      scenarioId,
      scenarioClass,
      taxonomyCategory,
      seed,
      split,
      sourceType,
      environment: {
        wind: options.wind || { speedKnots: 25.0, directionDeg: 240 },
        ocean: options.ocean || { currentSpeedKnots: 1.5, currentDirectionDeg: 120 },
        visibilityNm: options.visibilityNm || 10.0,
        seaIceConcentration: options.seaIceConcentration || 0.15
      },
      vessel: {
        draftM: options.draftM || 10.0,
        lengthM: options.lengthM || 120.0,
        beamM: options.beamM || 20.0,
        maxSpeedKnots: options.maxSpeedKnots || 20.0,
        underKeelClearanceM: options.underKeelClearanceM || 3.0,
        safetyMarginM: options.safetyMarginM || 2.0
      },
      mission: {
        start: rawScenario.start,
        destination: rawScenario.destination,
        maxDurationHours: options.maxDurationHours || 2.0
      },
      hazards: rawScenario.icebergs.map(ice => ({
        id: String(ice.id),
        x: ice.x,
        y: ice.y,
        vx: ice.vx || 0,
        vy: ice.vy || 0,
        size: ice.size || 50,
        collisionRadius: ice.collisionRadius || 25,
        uncertaintyRadius: ice.uncertaintyRadius || 20
      })),
      bathymetry: bathymetryMeta,
      plannerConfiguration: options.plannerConfiguration || { profile: 'CURRENT_FAST_FIRST_SAFE', mode: 'BALANCED' },
      expectedConstraints: options.expectedConstraints || { minClearanceSU: 35.0, maxRiskCeiling: 0.65 },
      evaluationConfiguration: options.evaluationConfiguration || { samplingHz: 10, maxDurationSec: 7200 }
    };
  }
}

export const benchmarkScenarioTaxonomy = new BenchmarkScenarioTaxonomy();
