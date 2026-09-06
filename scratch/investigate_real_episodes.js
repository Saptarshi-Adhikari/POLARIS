import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { SCENARIO_CLASSES, ROUTE_MODES } from '../src/js/debug/navTestScenarios.js';

const runner = new EpisodeRunner();

console.log('=== RUNNING REAL 48-EPISODE BENCHMARK (STEP-BY-STEP SIMULATION) ===\n');

const statsByClass = {};
SCENARIO_CLASSES.forEach(sc => {
  statsByClass[sc] = { total: 0, success: 0, collision: 0, timeout: 0, durations: [], minClearances: [] };
});

for (let k = 0; k < 48; k++) {
  const classIndex = k % SCENARIO_CLASSES.length;
  const passIndex = Math.floor(k / SCENARIO_CLASSES.length);
  const modeIndex = (classIndex + passIndex) % ROUTE_MODES.length;

  const scClass = SCENARIO_CLASSES[classIndex];
  const rMode = ROUTE_MODES[modeIndex];
  const seed = 2000 + k;

  const result = runner.runEpisode(seed, scClass, { routeMode: rMode, maxSteps: 1500 });
  
  const scStats = statsByClass[scClass];
  scStats.total += 1;
  if (result.termination_reason === 'DESTINATION_REACHED') scStats.success += 1;
  else if (result.termination_reason === 'COLLISION') scStats.collision += 1;
  else scStats.timeout += 1;

  scStats.durations.push(result.simulation_duration_seconds);
  scStats.minClearances.push(result.metrics.minPhysicalClearance);
}

console.table(
  Object.keys(statsByClass).map(sc => {
    const s = statsByClass[sc];
    const avgDur = s.durations.reduce((a, b) => a + b, 0) / s.durations.length;
    const avgClear = s.minClearances.reduce((a, b) => a + b, 0) / s.minClearances.length;
    return {
      scenarioClass: sc,
      total: s.total,
      success: s.success,
      collision: s.collision,
      timeout: s.timeout,
      collisionRate: `${((s.collision / s.total) * 100).toFixed(1)}%`,
      avgDurationSec: avgDur.toFixed(1),
      avgMinClearanceSU: avgClear.toFixed(1)
    };
  })
);
