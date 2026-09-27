/**
 * POLARIS Nav-OS — Open Polar Navigation Benchmark Schema (Phase 1C)
 *
 * Defines machine-readable schemas, metadata types, KPI data structures,
 * pass/fail safety gates, and data split definitions for reproducible benchmarking.
 */

export const BENCHMARK_VERSION = "1.0.0-POLAR-CORE";

export const SOURCE_TYPES = Object.freeze({
  SYNTHETIC: "SYNTHETIC",
  REPLAY: "REPLAY",
  REAL_DATA: "REAL_DATA",
  FIELD_TRIAL: "FIELD_TRIAL"
});

export const DATASET_SPLITS = Object.freeze({
  TRAIN: "TRAIN",
  VALIDATION: "VALIDATION",
  TEST: "TEST",
  STRESS: "STRESS"
});

export const PLANNER_PROFILES = Object.freeze({
  CURRENT_FAST_FIRST_SAFE: "CURRENT_FAST_FIRST_SAFE",
  STANDARD_ASTAR_BASELINE: "STANDARD_ASTAR_BASELINE",
  SIMPLE_GREEDY_BASELINE: "SIMPLE_GREEDY_BASELINE"
});

export const DEFAULT_SAFETY_GATES = Object.freeze({
  maxCollisions: 0,
  maxGroundings: 0,
  minUnderKeelClearanceM: 2.0,
  requireDestinationReached: true,
  maxRouteChurn: 15,
  maxPlannerLatencyP95Ms: 100.0
});

/**
 * Derives explicit partition split for a given seed and scenario index.
 * TRAIN (50%), VALIDATION (20%), TEST (20%), STRESS (10%).
 */
export function getDatasetSplitForSeed(seed) {
  const normSeed = Math.abs(Math.floor(seed)) % 100;
  if (normSeed < 50) return DATASET_SPLITS.TRAIN;
  if (normSeed < 70) return DATASET_SPLITS.VALIDATION;
  if (normSeed < 90) return DATASET_SPLITS.TEST;
  return DATASET_SPLITS.STRESS;
}

/**
 * Validates a benchmark scenario descriptor object.
 */
export function validateBenchmarkScenario(scenario) {
  const errors = [];
  if (!scenario) return { valid: false, errors: ["Scenario object is null/undefined"] };
  if (!scenario.scenarioId) errors.push("Missing scenarioId");
  if (!scenario.seed && scenario.seed !== 0) errors.push("Missing seed");
  if (!scenario.sourceType || !Object.values(SOURCE_TYPES).includes(scenario.sourceType)) {
    errors.push(`Invalid sourceType: ${scenario.sourceType}`);
  }
  return { valid: errors.length === 0, errors };
}
