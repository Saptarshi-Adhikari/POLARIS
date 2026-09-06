/**
 * POLARIS — Issue 1 Distance-Over-Time Telemetry Test
 */

import { describe, it } from 'vitest';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';

describe('Issue 1 Telemetry Inspection', () => {
  it('inspects distance-to-destination over time for 3000-step runs', () => {
    const runner = new EpisodeRunner();

    console.log('\n=== DISTANCE-TO-DESTINATION OVER TIME TRACE ===\n');

    for (const scClass of ['CLASS_A_CLEAR_SEAS', 'CLASS_B_STATIC_OBSTACLE', 'CLASS_D_MULTI_ICEBERG_FIELD']) {
      const ep = runner.runEpisode(4000, scClass, { routeMode: 'FASTEST', maxSteps: 3000 });

      const startDist = Math.hypot(ep.start_state.x - ep.destination.x, ep.start_state.y - ep.destination.y);
      console.log(`\nScenario: ${scClass}`);
      console.log(`Start Pos: (${ep.start_state.x}, ${ep.start_state.y}) -> Dest: (${ep.destination.x}, ${ep.destination.y})`);
      console.log(`Straight-Line Initial Distance: ${startDist.toFixed(1)} SU`);
      console.log(`Termination Reason: ${ep.termination_reason}`);
      console.log(`Duration: ${ep.simulation_duration_seconds}s (${ep.telemetry.length} steps)`);

      console.log('Sample Distance-to-Destination Profile:');
      const stepInterval = Math.floor(ep.telemetry.length / 10);
      for (let i = 0; i < ep.telemetry.length; i += stepInterval) {
        const s = ep.telemetry[i];
        const dist = Math.hypot(s.ship.x - ep.destination.x, s.ship.y - ep.destination.y);
        console.log(`  t=${s.simulation_time.toFixed(1)}s: ship=(${s.ship.x.toFixed(1)}, ${s.ship.y.toFixed(1)}) speed=${s.ship.speed.toFixed(1)} SU/s -> distToDest=${dist.toFixed(1)} SU`);
      }
    }
  }, 30000);
});
