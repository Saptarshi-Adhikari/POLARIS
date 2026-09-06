/**
 * POLARIS Nav-OS — Phase 3.5 Soak Run & Raw Data Verification Script
 *
 * Runs simulation engine & NavTestBot through real game loops across 36+ scenario episodes,
 * mid-episode timeWarp changes, and simulated rAF throttling / lag spikes.
 * Exports raw JSON files to scratch/exports/ and performs deep structural verification.
 *
 * SCRATCH SCRIPT ONLY — Not imported by any src/ file.
 */

import fs from 'fs';
import path from 'path';

// Setup DOM mocks for Node environment before importing POLARIS modules
if (typeof global.window === 'undefined') {
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { href: 'http://localhost' },
    document: {}
  };
}
if (typeof global.document === 'undefined') {
  global.document = {
    createElement: () => ({
      style: {},
      appendChild: () => {},
      classList: { toggle: () => {} }
    }),
    body: { appendChild: () => {} },
    getElementById: () => null
  };
}
if (typeof global.performance === 'undefined') {
  global.performance = { now: () => Date.now() };
}

import { NavTestBot, MAX_EPISODE_BUFFER } from '../src/js/debug/navTestBot.js';
import { ScenarioGenerator, SCENARIO_CLASSES } from '../src/js/debug/navTestScenarios.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { calculateIcebergPositionAt, wrappedDistanceCoords, computeIcebergCPA } from '../src/js/utils.js';

const EXPORT_DIR = path.resolve(process.cwd(), 'scratch', 'exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

// Mock engine structure mirroring main.js SimulationEngine
function createMockEngine() {
  const ship = new Ship({ x: 400, y: 1800, heading: 330 });
  const state = {
    vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1, autopilot: true, throttle: 65, rudder: 0 },
    navigation: { startPoint: { x: 400, y: 1800 }, destinationPoint: { x: 3000, y: 600 }, activeRoute: null },
    simulation: { isPaused: false, timeWarp: 1.0, simTimeHours: 0 },
    environment: { wind: { speed: 10, direction: 270, enabled: true }, seaIce: { enabled: false }, mode: 'SYNTHETIC' }
  };
  const vectorField = {
    updateGrid: () => {},
    updateParticles: () => {},
    getVelocityAt: () => ({ u: 0.2, v: -0.1 }),
    getSeaIceConcentration: () => 0
  };

  const engine = {
    ship,
    icebergs: [],
    state,
    vectorField,
    flightRecorder: { enabled: false, recordSample: () => {} },
    navigationWatchdog: { evaluate: () => {} },
    debugOverlay: { update: () => {} },
    calculateRoute: () => {
      state.navigation.activeRoute = {
        id: `route_${Date.now()}`,
        waypoints: [{ x: ship.x, y: ship.y }, { x: state.navigation.destinationPoint.x, y: state.navigation.destinationPoint.y }],
        status: 'valid',
        destination: state.navigation.destinationPoint,
        expiresAt: performance.now() + 60000
      };
    }
  };

  const navTestBot = new NavTestBot(ship, engine.icebergs, null, state, engine.flightRecorder);
  navTestBot.engine = engine;
  engine.navTestBot = navTestBot;

  // Intercept triggerDownload to save directly to scratch/exports/
  navTestBot.triggerDownload = (contentStr, filename) => {
    const filePath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filePath, contentStr, 'utf8');
    console.log(`[SoakExport] Saved ${filename} (${(contentStr.length / 1024).toFixed(1)} KB)`);
  };

  return engine;
}

// Single frame step imitating main.js game loop
function stepEngineFrame(engine, rawDt = 0.016) {
  const dt = rawDt * engine.state.simulation.timeWarp;
  engine.state.simulation.simTimeHours += (dt / 3600);

  // Update icebergs
  for (let ice of engine.icebergs) {
    ice.update(dt, engine.vectorField, engine.state.simulation.simTimeHours, engine.state);
  }
  // Update ship physics & steering
  engine.ship.update(dt, engine.vectorField, engine.state.simulation.simTimeHours, engine.state, engine.icebergs);

  // Build telemetry snapshot (exact main.js lines 905-1024 logic)
  const isDebugSamplingActive = (engine.flightRecorder && engine.flightRecorder.enabled) || (engine.navTestBot && engine.navTestBot.enabled);
  if (isDebugSamplingActive) {
    const activeRoute = engine.state.navigation.activeRoute || {};
    const oc = engine.vectorField.getVelocityAt(engine.ship.x, engine.ship.y, engine.state.simulation.simTimeHours, engine.state);
    const radHdg = (engine.ship.heading * Math.PI) / 180;
    const bowX = Math.cos(radHdg);
    const bowY = Math.sin(radHdg);
    const spdG = Math.hypot(engine.ship.vx, engine.ship.vy);
    const gDirX = spdG > 0.1 ? engine.ship.vx / spdG : bowX;
    const gDirY = spdG > 0.1 ? engine.ship.vy / spdG : bowY;
    const alignment = bowX * gDirX + bowY * gDirY;

    const icebergTelemetry = (engine.icebergs || []).map(ice => {
      const dist = wrappedDistanceCoords(engine.ship.x, engine.ship.y, ice.x, ice.y);
      const { cpa, tcpa } = computeIcebergCPA(engine.ship, ice);
      const hazardInfo = engine.ship ? engine.ship.calculateHazardDanger(ice) : { level: 'SAFE' };

      const trajectoryForecast = [];
      for (let step = 1; step <= 24; step++) {
        trajectoryForecast.push(calculateIcebergPositionAt(ice, step * 300));
      }
      const predictedPositionAt2h = calculateIcebergPositionAt(ice, 7200);

      return {
        id: ice.id, x: ice.x, y: ice.y, vx: ice.vx || 0, vy: ice.vy || 0, size: ice.size,
        collisionRadius: ice.collisionRadius || 20, distanceFromShip: dist, cpa, tcpa,
        riskLevel: hazardInfo.level, predictedPositionAt2h, trajectoryForecast
      };
    });

    const environmentTelemetry = {
      currentVector: { u: oc.u, v: oc.v },
      windVector: { speed: engine.state?.environment?.wind?.speed || 0, direction: engine.state?.environment?.wind?.direction || 0, enabled: !!engine.state?.environment?.wind?.enabled },
      simTimeHours: engine.state.simulation.simTimeHours,
      worldWidth: 3600, worldHeight: 2400
    };

    const collisionTelemetry = engine.ship?.lastCollisionEvent || { collisionDetected: false };

    const snapshot = {
      timestamp_ms: Date.now(),
      simulation_time: engine.state.simulation.simTimeHours,
      route: {
        id: activeRoute.id || 'none',
        path_length: activeRoute.waypoints ? activeRoute.waypoints.length : 0,
        status: activeRoute.status || 'invalid',
        destination: activeRoute.destination || { x: 0, y: 0 },
        selected_waypoint_index: engine.ship.waypointIndex || 0,
        selected_target: engine.ship.targetWaypoint || { x: 0, y: 0 },
        selected_target_is_forward: true,
        route_progress_fraction: 0
      },
      ship: {
        position: { x: engine.ship.x, y: engine.ship.y },
        heading_rad: radHdg, heading_deg: engine.ship.heading,
        target_heading_deg: engine.ship.targetHeading !== undefined ? engine.ship.targetHeading : 0,
        rudder_command: engine.ship.rudder, throttle: engine.ship.throttle,
        ground_velocity: { x: engine.ship.vx, y: engine.ship.vy },
        ground_speed: spdG, water_speed: spdG, sprite_rotation_deg: engine.ship.heading,
        distance_to_destination: Math.hypot(engine.ship.x - (activeRoute.destination?.x || 0), engine.ship.y - (activeRoute.destination?.y || 0))
      },
      guidance: {
        mode: engine.ship.autopilotStatus || 'NORMAL',
        cross_track_error: engine.ship.crossTrackError || 0,
        current_velocity: { x: oc.u * 4.0, y: oc.v * 4.0 },
        is_current_limited: engine.ship.autopilotStatus === 'FIGHTING_CURRENT'
      },
      integrity: { route_id_matches_ship_route_id: true, finite_position: true, heading_velocity_alignment: alignment },
      icebergs: icebergTelemetry,
      environment: environmentTelemetry,
      collision: collisionTelemetry
    };

    if (engine.navTestBot) {
      engine.navTestBot.evaluateFrame(engine, snapshot);
    }
  }
}

// MAIN SOAK EXECUTION
async function runSoak() {
  console.log("=== POLARIS Phase 3.5 Soak Run & Verification ===");
  const engine = createMockEngine();
  const bot = engine.navTestBot;
  bot.enabled = true;

  const seeds = [1001, 1002, 1003];
  const outcomes = {};

  // 1. Run 36 episodes (12 classes x 3 seeds)
  console.log("\n1. Running 36-episode scenario matrix (12 classes x 3 seeds)...");
  for (let sIdx = 0; sIdx < SCENARIO_CLASSES.length; sIdx++) {
    const sClass = SCENARIO_CLASSES[sIdx];
    outcomes[sClass] = { SUCCESS: 0, COLLISION: 0, TIMEOUT: 0, STUCK: 0 };

    for (let seed of seeds) {
      bot.startEpisode(engine, seed, sClass);

      // Simulate up to 500 frames per episode
      for (let f = 0; f < 500; f++) {
        if (bot.stateMode !== 'RUNNING') break;
        stepEngineFrame(engine, 0.016);
      }

      // If still running, force termination check
      if (bot.stateMode === 'RUNNING') {
        const dest = engine.state.navigation.destinationPoint;
        const dist = Math.hypot(engine.ship.x - dest.x, engine.ship.y - dest.y);
        if (dist < 100) {
          bot.endEpisode('SUCCESS', engine);
        } else {
          bot.endEpisode('TIMEOUT', engine);
        }
      }

      const lastEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
      if (lastEp && lastEp.result) {
        outcomes[sClass][lastEp.result.status] = (outcomes[sClass][lastEp.result.status] || 0) + 1;
      }
    }
  }

  // Export batch of 36 episodes
  bot.exportBatchJSON();

  // 2. Run Mid-Episode timeWarp Transition Test Episode
  console.log("\n2. Running mid-episode timeWarp transition test episode...");
  bot.startEpisode(engine, 7777, 'CLASS_C_MOVING_CROSSING');

  // Frame steps with dynamic timeWarp transitions:
  // Phase A: 50 frames at timeWarp = 1.0
  engine.state.simulation.timeWarp = 1.0;
  for (let f = 0; f < 50; f++) stepEngineFrame(engine, 0.016);

  // Phase B: 30 frames at timeWarp = 15.0 (high speed jump)
  engine.state.simulation.timeWarp = 15.0;
  for (let f = 0; f < 30; f++) stepEngineFrame(engine, 0.016);

  // Phase C: 50 frames at timeWarp = 1.0
  engine.state.simulation.timeWarp = 1.0;
  for (let f = 0; f < 50; f++) stepEngineFrame(engine, 0.016);

  bot.endEpisode('SUCCESS', engine);
  const timeWarpEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
  bot.exportSingleEpisodeJSON(timeWarpEp);

  // 3. Run Lag Spike / rAF Throttling Test Episode (simulated tab focus loss)
  console.log("\n3. Running simulated rAF throttling / lag spike episode...");
  bot.startEpisode(engine, 8888, 'CLASS_F_HEAD_ON_APPROACH');
  engine.state.simulation.timeWarp = 1.0;

  // Normal frames
  for (let f = 0; f < 20; f++) stepEngineFrame(engine, 0.016);

  // Simulated lag spike / tab background delay (2.5s real time jump in one frame)
  stepEngineFrame(engine, 2.5);

  // Normal frames resume
  for (let f = 0; f < 20; f++) stepEngineFrame(engine, 0.016);

  bot.endEpisode('SUCCESS', engine);
  const lagSpikeEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
  bot.exportSingleEpisodeJSON(lagSpikeEp);

  // 4. Seed Determinism Test (Run seed 998877 twice)
  console.log("\n4. Running Seed Determinism Test (seed 998877 twice)...");
  bot.startEpisode(engine, 998877, 'CLASS_D_MULTI_ICEBERG_FIELD');
  for (let f = 0; f < 100; f++) stepEngineFrame(engine, 0.016);
  bot.endEpisode('SUCCESS', engine);
  const detRun1 = bot.completedEpisodes[bot.completedEpisodes.length - 1];
  const fileDet1 = path.join(EXPORT_DIR, 'seed_998877_run1.json');
  fs.writeFileSync(fileDet1, JSON.stringify(detRun1, null, 2), 'utf8');

  bot.startEpisode(engine, 998877, 'CLASS_D_MULTI_ICEBERG_FIELD');
  for (let f = 0; f < 100; f++) stepEngineFrame(engine, 0.016);
  bot.endEpisode('SUCCESS', engine);
  const detRun2 = bot.completedEpisodes[bot.completedEpisodes.length - 1];
  const fileDet2 = path.join(EXPORT_DIR, 'seed_998877_run2.json');
  fs.writeFileSync(fileDet2, JSON.stringify(detRun2, null, 2), 'utf8');

  // Perform Analysis on Exports
  console.log("\n=== RAW EXPORT DATA ANALYSIS & VERIFICATION ===");

  // Check 1: Sample count vs elapsed sim time
  console.log("\nCheck 1: Sample Count vs Elapsed Sim Time:");
  let disAgreements = 0;
  for (const ep of [timeWarpEp, lagSpikeEp, detRun1]) {
    const totalSimSeconds = (ep.result.elapsedSimHours) * 3600;
    const expectedCount = 1 + Math.floor(totalSimSeconds / 0.1);
    const actualCount = ep.telemetry.length;
    const match = expectedCount === actualCount;
    if (!match) disAgreements++;
    console.log(`  Episode ${ep.episodeId}: simSeconds=${totalSimSeconds.toFixed(3)}s | Expected=${expectedCount} | Actual=${actualCount} | Match=${match}`);
  }

  // Check 2: Interval Spacing across timeWarp & lag spikes
  console.log("\nCheck 2: Interval Spacing (simulation_time deltas):");
  function checkIntervals(ep, name) {
    const tList = ep.telemetry.map(s => s.simulation_time);
    let minDelta = Infinity;
    let maxDelta = -Infinity;
    let nonExactCount = 0;
    const expectedDelta = 1 / 36000;

    for (let i = 1; i < tList.length; i++) {
      const delta = tList[i] - tList[i - 1];
      if (delta < minDelta) minDelta = delta;
      if (delta > maxDelta) maxDelta = delta;
      if (Math.abs(delta - expectedDelta) > 1e-9) nonExactCount++;
    }

    console.log(`  [${name}] Telemetry Samples=${tList.length}:`);
    console.log(`    Min Delta: ${(minDelta * 3600).toFixed(4)}s (${minDelta.toFixed(9)}h)`);
    console.log(`    Max Delta: ${(maxDelta * 3600).toFixed(4)}s (${maxDelta.toFixed(9)}h)`);
    console.log(`    Non-exact 0.1s deltas: ${nonExactCount}`);
  }

  checkIntervals(timeWarpEp, "Mid-Episode timeWarp (1x -> 15x -> 1x)");
  checkIntervals(lagSpikeEp, "Lag Spike / rAF Throttle (2.5s dt jump)");

  // Check 3: Seed Determinism Byte Diff
  console.log("\nCheck 3: Seed Determinism Byte Diff (seed 998877):");
  const str1 = fs.readFileSync(fileDet1, 'utf8');
  const str2 = fs.readFileSync(fileDet2, 'utf8');

  // Strip timestamp_ms which is real clock
  const clean1 = str1.replace(/"timestamp_ms": \d+/g, '"timestamp_ms": 0');
  const clean2 = str2.replace(/"timestamp_ms": \d+/g, '"timestamp_ms": 0');

  const isByteIdentical = clean1 === clean2;
  console.log(`  Deterministic Match (excluding real-clock timestamp_ms): ${isByteIdentical ? 'IDENTICAL (100% MATCH)' : 'DIVERGED'}`);

  // Check 4: Outcome Distribution
  console.log("\nCheck 4: Outcome Distribution across 12 Scenario Classes (36 episodes):");
  console.table(outcomes);

  // Check 5: Size on Disk & Memory Ceiling
  console.log("\nCheck 5: File Size on Disk & Memory Ceiling:");
  const files = fs.readdirSync(EXPORT_DIR);
  for (let f of files) {
    const stats = fs.statSync(path.join(EXPORT_DIR, f));
    console.log(`  ${f}: ${(stats.size / 1024).toFixed(1)} KB`);
  }
}

runSoak().catch(console.error);
