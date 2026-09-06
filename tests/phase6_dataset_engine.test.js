import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';
import { TerminationReason, EventLabel, validateEpisodeData, SCHEMA_VERSION } from '../src/js/dataset/datasetSchema.js';
import fs from 'fs';
import path from 'path';

describe('Phase 6 Autonomous Episode Generation & Dataset Engine', () => {

  it('1. Deterministic Reset Test — verifies state is restored to canonical initial state', () => {
    const runner = new EpisodeRunner();
    const generator = new ScenarioGenerator();
    const scenario = generator.generateScenario(9999, 'CLASS_B_STATIC_OBSTACLE');

    const engine = new SimulationEngine();
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    // Mutate state to dirty values
    engine.ship.x = 1500;
    engine.ship.y = 900;
    engine.ship.heading = 45;
    engine.ship.speed = 18;
    engine.ship.rudder = -25;
    engine.ship.throttle = 100;
    engine.ship._inEmergencyAvoidance = true;
    engine.aiNavigator.plannerCalls = 42;
    engine.aiNavigator.routeVersion = 7;
    engine.aiNavigator.temporalRiskState = 'BLOCKED';

    // Perform clean reset
    runner.resetState(engine, scenario, 9999);

    // Verify canonical initial state
    expect(engine.ship.x).toBe(scenario.start.x);
    expect(engine.ship.y).toBe(scenario.start.y);
    expect(engine.ship.heading).toBe(scenario.start.heading);
    expect(engine.ship.vx).toBe(0);
    expect(engine.ship.vy).toBe(0);
    expect(engine.ship.rudder).toBe(0);
    expect(engine.ship.throttle).toBe(65);
    expect(engine.ship._inEmergencyAvoidance).toBe(false);
    expect(engine.ship.lastCollisionEvent.collisionDetected).toBe(false);

    expect(engine.aiNavigator.plannerCalls).toBe(0);
    expect(engine.aiNavigator.routeVersion).toBe(0);
    expect(engine.aiNavigator.temporalRiskState).toBe('CLEAR');
    expect(engine.state.simulation.simTimeHours).toBe(0);
  });

  it('2. Collision Termination & Automatic Reset Test — verifies collision halts episode and preserves state', () => {
    const runner = new EpisodeRunner();

    // Forced collision scenario: ship starts directly facing an iceberg 25 units away
    const forcedCollisionScenario = {
      start: { x: 500, y: 500, heading: 0 },
      destination: { x: 500, y: 1500 },
      icebergs: [new Iceberg({ id: 'ice_block', x: 500, y: 525, size: 70 })]
    };

    // Run full episode through EpisodeRunner to confirm collision termination
    const ep1 = runner.runEpisode(1002, 'CLASS_B_STATIC_OBSTACLE', { 
      maxSteps: 300, 
      customScenario: forcedCollisionScenario 
    });

    expect(ep1.termination_reason).toBe(TerminationReason.COLLISION);
    expect(ep1.event_label).toBe(EventLabel.COLLISION);
    expect(ep1.pre_collision_window.length).toBeGreaterThan(0);

    // Verify auto-reset for second episode with new seed
    const ep2 = runner.runEpisode(1003, 'CLASS_A_CLEAR_SEAS', { maxSteps: 300 });
    expect(ep2.episode_id).not.toBe(ep1.episode_id);
    expect(ep2.seed).toBe(1003);
    expect(ep2.start_state.x).toBe(400); // Standard start x for CLASS_A
  });

  it('3. Destination Termination Test — verifies clean arrival and SUCCESS label', () => {
    const runner = new EpisodeRunner();
    const episode = runner.runEpisode(2001, 'CLASS_A_CLEAR_SEAS', { maxSteps: 2500 });

    expect(episode.termination_reason).toBe(TerminationReason.DESTINATION_REACHED);
    expect(episode.event_label).toBe(EventLabel.SUCCESS);
    expect(episode.metrics.destinationReached).toBe(true);
    expect(episode.telemetry[episode.telemetry.length - 1].terminal_sample).toBe(true);
  });

  it('4. Deterministic Replay Test — running same seed twice produces bit-exact telemetry', () => {
    const runner = new EpisodeRunner();
    const ep1 = runner.runEpisode(3001, 'CLASS_C_MOVING_CROSSING', { maxSteps: 1000 });
    const ep2 = runner.runEpisode(3001, 'CLASS_C_MOVING_CROSSING', { maxSteps: 1000 });

    expect(ep1.telemetry.length).toBe(ep2.telemetry.length);
    expect(ep1.termination_reason).toBe(ep2.termination_reason);

    for (let i = 0; i < Math.min(100, ep1.telemetry.length); i++) {
      expect(ep1.telemetry[i].ship.x).toBe(ep2.telemetry[i].ship.x);
      expect(ep1.telemetry[i].ship.y).toBe(ep2.telemetry[i].ship.y);
      expect(ep1.telemetry[i].ship.heading).toBe(ep2.telemetry[i].ship.heading);
      expect(ep1.telemetry[i].ship.speed).toBe(ep2.telemetry[i].ship.speed);
    }
  });

  it('5. Schema v2 & Data Quality Validation Test — rejects corrupt or non-monotonic data', () => {
    const validEp = {
      schema_version: SCHEMA_VERSION,
      episode_id: "ep_test_123",
      seed: 12345,
      termination_reason: TerminationReason.DESTINATION_REACHED,
      event_label: EventLabel.SUCCESS,
      telemetry: [
        { simulation_time: 0.0, ship: { x: 400, y: 1800, heading: 330, speed: 12 } },
        { simulation_time: 0.1, ship: { x: 401, y: 1799, heading: 330, speed: 12 }, terminal_sample: true }
      ]
    };
    expect(validateEpisodeData(validEp).valid).toBe(true);

    // Corrupt episode with non-monotonic timestamp
    const corruptEp = {
      ...validEp,
      telemetry: [
        { simulation_time: 0.5, ship: { x: 400, y: 1800, heading: 330, speed: 12 } },
        { simulation_time: 0.1, ship: { x: 401, y: 1799, heading: 330, speed: 12 } }
      ]
    };
    const check = validateEpisodeData(corruptEp);
    expect(check.valid).toBe(false);
    expect(check.errors.some(e => e.includes('Non-monotonic'))).toBe(true);
  });

  it('6. JSONL Exporter & Manifest Engine Test — verifies episode storage and manifest stats', () => {
    const testDir = path.join(process.cwd(), 'scratch', 'test_datasets_v2');
    const exporter = new DatasetExporter(testDir);
    const runner = new EpisodeRunner();

    const episode = runner.runEpisode(4001, 'CLASS_A_CLEAR_SEAS', { maxSteps: 500 });
    const result = exporter.exportEpisodeJSONL(episode);

    expect(result.success).toBe(true);
    expect(fs.existsSync(result.filePath)).toBe(true);

    const fileContent = fs.readFileSync(result.filePath, 'utf8');
    const lines = fileContent.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);

    const header = JSON.parse(lines[0]);
    expect(header.record_type).toBe("METADATA_HEADER");
    expect(header.schema_version).toBe(SCHEMA_VERSION);

    const sample1 = JSON.parse(lines[1]);
    expect(sample1.record_type).toBe("TELEMETRY_SAMPLE");

    const manifest = exporter.getManifest();
    expect(manifest.schema_version).toBe(SCHEMA_VERSION);
    expect(manifest.episode_count).toBeGreaterThanOrEqual(1);
    expect(manifest.seeds).includes(4001);
  });

  it('7. Collision Geometry Clarity Test — verifies explicit clearance metrics', () => {
    const runner = new EpisodeRunner();
    const episode = runner.runEpisode(5001, 'CLASS_B_STATIC_OBSTACLE', { maxSteps: 500 });

    for (const sample of episode.telemetry) {
      if (sample.nearest_iceberg) {
        const ice = sample.nearest_iceberg;
        expect(ice.center_distance).toBeDefined();
        expect(ice.physical_clearance).toBeDefined();
        expect(ice.safety_margin).toBeDefined();

        // Safety margin verification: physical_clearance - 15 (buffer)
        const expectedSafetyMargin = parseFloat((ice.physical_clearance - 15).toFixed(2));
        expect(Math.abs(ice.safety_margin - expectedSafetyMargin)).toBeLessThan(0.05);
      }
    }
  });

  it('8. 100-Episode Headless Batch Execution & Artifact Exporter Test', () => {
    console.log("\n=================================================");
    console.log("  PHASE 6: 100-EPISODE AUTONOMOUS DATASET BATCH  ");
    console.log("=================================================\n");

    const batchDir = path.join(process.cwd(), 'scratch', 'phase6_batch_dataset');
    if (fs.existsSync(batchDir)) {
      fs.rmSync(batchDir, { recursive: true, force: true });
    }

    const runner = new EpisodeRunner();
    const exporter = new DatasetExporter(batchDir);
    const scenarioClasses = [
      'CLASS_A_CLEAR_SEAS',
      'CLASS_B_STATIC_OBSTACLE',
      'CLASS_C_MOVING_CROSSING',
      'CLASS_D_MULTI_ICEBERG_FIELD',
      'CLASS_E_SIDE_APPROACH',
      'CLASS_F_HEAD_ON_APPROACH',
      'CLASS_G_ESCAPE_CORRIDORS',
      'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE'
    ];

    const batchResults = [];
    let successCount = 0;
    let collisionCount = 0;
    let nearMissCount = 0;
    let timeoutCount = 0;
    let totalSamples = 0;
    let totalSimHours = 0;

    const startSeed = 10001;
    const totalEpisodes = 100;

    for (let i = 0; i < totalEpisodes; i++) {
      const seed = startSeed + i;
      const scenarioClass = scenarioClasses[i % scenarioClasses.length];

      const episode = runner.runEpisode(seed, scenarioClass, { maxSteps: 1200 });
      exporter.exportEpisodeJSONL(episode);

      if (episode.termination_reason === TerminationReason.DESTINATION_REACHED) successCount++;
      if (episode.termination_reason === TerminationReason.COLLISION) collisionCount++;
      if (episode.event_label === EventLabel.NEAR_MISS) nearMissCount++;
      if (episode.termination_reason === TerminationReason.TIMEOUT) timeoutCount++;

      totalSamples += episode.telemetry.length;
      totalSimHours += episode.simulation_duration_hours;

      batchResults.push({
        episode_id: episode.episode_id,
        seed: episode.seed,
        scenario_class: episode.scenario_class,
        termination_reason: episode.termination_reason,
        event_label: episode.event_label,
        simulation_duration_hours: episode.simulation_duration_hours,
        telemetry_samples: episode.telemetry.length,
        min_physical_clearance: episode.metrics.minPhysicalClearance,
        planner_calls: episode.metrics.plannerCalls,
        route_changes: episode.metrics.routeChanges
      });
    }

    const manifest = exporter.getManifest();

    const verificationArtifact = {
      timestamp: new Date().toISOString(),
      verifier: "POLARIS Phase 6 Autonomous Dataset Verification Engine",
      summary: {
        total_episodes: totalEpisodes,
        success_count: successCount,
        collision_count: collisionCount,
        near_miss_count: nearMissCount,
        timeout_count: timeoutCount,
        success_rate: `${((successCount / totalEpisodes) * 100).toFixed(1)}%`,
        collision_rate: `${((collisionCount / totalEpisodes) * 100).toFixed(1)}%`,
        total_telemetry_samples: totalSamples,
        total_simulated_hours: parseFloat(totalSimHours.toFixed(4)),
        manifest_path: "scratch/phase6_batch_dataset/manifest.json"
      },
      manifest,
      sample_episodes: batchResults.slice(0, 10)
    };

    const scratchPath = path.join(process.cwd(), 'scratch', 'phase6_dataset_verification.json');
    fs.writeFileSync(scratchPath, JSON.stringify(verificationArtifact, null, 2), 'utf8');

    console.log(`[Phase 6 Verification] Batch Complete: ${successCount} Successes, ${collisionCount} Collisions, ${nearMissCount} Near Misses, ${timeoutCount} Timeouts.`);
    console.log(`[Phase 6 Verification] Artifact exported to ${scratchPath}`);

    expect(totalEpisodes).toBe(100);
    expect(manifest.episode_count).toBe(100);
    expect(fs.existsSync(scratchPath)).toBe(true);
  }, 240000);

});
