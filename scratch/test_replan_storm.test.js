/**
 * POLARIS — Issue 2 Full Episode Replan Count Benchmark
 */

import { describe, it } from 'vitest';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';

describe('Issue 2 Replan Count Benchmark (Full 300s Run)', () => {
  it('benchmarks planner calls across all 12 scenario classes over 3000 steps', () => {
    const runner = new EpisodeRunner();

    console.log('\n=== PLANNER CALL COUNT BENCHMARK ACROSS 12 CLASSES (3000 steps / 300s) ===\n');

    const results = [];

    for (const scClass of [
      'CLASS_A_CLEAR_SEAS',
      'CLASS_B_STATIC_OBSTACLE',
      'CLASS_C_MOVING_CROSSING',
      'CLASS_D_MULTI_ICEBERG_FIELD',
      'CLASS_E_SIDE_APPROACH',
      'CLASS_F_HEAD_ON_APPROACH',
      'CLASS_G_ESCAPE_CORRIDORS',
      'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE',
      'CLASS_I_SLOW_DOWN_BETTER',
      'CLASS_J_TURN_BETTER',
      'CLASS_K_WORLD_WRAP_CROSSING',
      'CLASS_L_SAFE_VS_RISKY_CHOICE'
    ]) {
      const ep = runner.runEpisode(6000, scClass, { routeMode: 'BALANCED', maxSteps: 3000 });
      results.push({
        scenarioClass: scClass,
        terminationReason: ep.termination_reason,
        durationSeconds: ep.simulation_duration_seconds,
        plannerCalls: ep.metrics.plannerCalls,
        routeChanges: ep.metrics.routeChanges,
        minClearance: ep.metrics.minPhysicalClearance
      });
    }

    console.table(results);
  }, 60000);
});
