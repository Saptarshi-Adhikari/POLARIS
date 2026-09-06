import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';

const runner = new EpisodeRunner();

const collisionSeeds = {
  'CLASS_D_MULTI_ICEBERG_FIELD': [1003, 1015, 1111],
  'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE': [1007, 1019, 1031]
};

console.log("============================================================");
console.log("RECONSTRUCTING COLLISION EPISODES (PHASE 6.7 STEP 4)");
console.log("============================================================\n");

for (const [scenarioClass, seeds] of Object.entries(collisionSeeds)) {
  for (const seed of seeds) {
    console.log(`--- EPISODE: ${scenarioClass} (Seed ${seed}) ---`);
    const ep = runner.runEpisode(seed, scenarioClass, { maxSteps: 2500, dt: 0.1 });
    
    console.log(`Termination Reason: ${ep.termination_reason}`);
    console.log(`Duration: ${ep.simulation_duration_seconds}s (${ep.telemetry.length} steps)`);
    console.log(`Collision Events: ${JSON.stringify(ep.collision_events)}`);

    const totalSteps = ep.telemetry.length;
    const startStep = Math.max(0, totalSteps - 600);
    
    console.log(`\nFinal ${((totalSteps - startStep) * 0.1).toFixed(1)}s Telemetry Trace (sampling every 1.0s):`);
    console.log(`Time(s) | Ship Pos (x,y) | Hdg(°) | Spd(SU/s) | Rud(°) | Thr(%) | Iceberg ID | Ice Pos (x,y) | CenterDist | PhysClear | SafeMargin | ActiveRoute | Emergency`);
    console.log(`-----------------------------------------------------------------------------------------------------------------------------------------`);

    for (let i = startStep; i < totalSteps; i++) {
      const t = ep.telemetry[i];
      if (i % 10 === 0 || i === totalSteps - 1) {
        const ice = t.nearest_iceberg || {};
        console.log(
          `${t.simulation_time.toFixed(1).padStart(7)} | ` +
          `(${t.ship.x.toFixed(1).padStart(6)}, ${t.ship.y.toFixed(1).padStart(6)}) | ` +
          `${t.ship.heading.toFixed(1).padStart(6)} | ` +
          `${t.ship.speed.toFixed(1).padStart(9)} | ` +
          `${t.ship.rudder.toFixed(1).padStart(6)} | ` +
          `${t.ship.throttle.toFixed(1).padStart(6)} | ` +
          `${(ice.id || 'N/A').padEnd(10)} | ` +
          `(${ice.x?.toFixed(1) || '0'}, ${ice.y?.toFixed(1) || '0'}) | ` +
          `${ice.center_distance?.toFixed(1).padStart(10) || 'N/A'} | ` +
          `${ice.physical_clearance?.toFixed(1).padStart(9) || 'N/A'} | ` +
          `${ice.safety_margin?.toFixed(1).padStart(10) || 'N/A'} | ` +
          `${(t.navigation.active_route_id || 'none').padEnd(11)} | ` +
          `${t.navigation.emergency_state}`
        );
      }
    }
    console.log("\n");
  }
}
