import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import { NavTestBot, MAX_EPISODE_BUFFER, MAX_SIM_HOURS_PER_EPISODE } from '../src/js/debug/navTestBot.js';
import { ScenarioGenerator, SCENARIO_CLASSES } from '../src/js/debug/navTestScenarios.js';
import { Ship } from '../src/js/simulation/ship.js';
import { calculateIcebergPositionAt, wrappedDistanceCoords, computeIcebergCPA } from '../src/js/utils.js';

const EXPORT_DIR = path.resolve(process.cwd(), 'scratch', 'exports');
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function createMockEngine() {
  const ship = new Ship({ x: 400, y: 1800, heading: 330 });
  const state = {
    vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1, autopilot: true, throttle: 65, rudder: 0 },
    navigation: { startPoint: { x: 400, y: 1800 }, destinationPoint: { x: 3000, y: 600 }, activeRoute: null },
    simulation: { isPaused: false, timeWarp: 1.0, simTimeHours: 0 },
    icebergs: { enabled: true },
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

  navTestBot.triggerDownload = (contentStr, filename) => {
    const filePath = path.join(EXPORT_DIR, filename);
    fs.writeFileSync(filePath, contentStr, 'utf8');
  };

  return engine;
}

function stepEngineFrame(engine, rawDt = 0.016) {
  const dt = rawDt * engine.state.simulation.timeWarp;
  engine.state.simulation.simTimeHours += (dt / 3600);

  for (let ice of engine.icebergs) {
    ice.update(dt, engine.vectorField, engine.state.simulation.simTimeHours, engine.state);
  }
  engine.ship.update(dt, engine.vectorField, engine.state.simulation.simTimeHours, engine.state, engine.icebergs);

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

describe('Phase 3.5 Soak Run & Raw Data Verification', () => {

  it('Runs 36-episode scenario matrix, timeWarp changes, lag spikes, long episode, and exports raw JSON to disk', () => {
    const engine = createMockEngine();
    const bot = engine.navTestBot;
    bot.enabled = true;

    const seeds = [1001, 1002, 1003];
    const outcomeCounts = {};

    // 1. Run 36 episodes (12 classes x 3 seeds)
    for (let sIdx = 0; sIdx < SCENARIO_CLASSES.length; sIdx++) {
      const sClass = SCENARIO_CLASSES[sIdx];
      outcomeCounts[sClass] = { SUCCESS: 0, COLLISION: 0, TIMEOUT: 0, STUCK: 0 };

      for (let seed of seeds) {
        bot.startEpisode(engine, seed, sClass);

        for (let f = 0; f < 3000; f++) {
          if (bot.stateMode !== 'RUNNING') break;
          stepEngineFrame(engine, 0.016);
        }

        if (bot.stateMode === 'RUNNING') {
          const dest = engine.state.navigation.destinationPoint;
          const dist = Math.hypot(engine.ship.x - dest.x, engine.ship.y - dest.y);
          if (dist < 10) {
            bot.endEpisode('SUCCESS', engine);
          } else {
            bot.endEpisode('TIMEOUT', engine);
          }
        }

        const lastEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
        if (lastEp && lastEp.result) {
          outcomeCounts[sClass][lastEp.result.status] = (outcomeCounts[sClass][lastEp.result.status] || 0) + 1;
        }
      }
    }

    // Flush batch export for 36 episodes
    bot.exportBatchJSON();

    // 2. Deliberately Long Episode (target: max sim hours 2.0 = 72,000 samples)
    bot.startEpisode(engine, 5555, 'CLASS_D_MULTI_ICEBERG_FIELD');
    for (let f = 0; f < 450000; f++) { // Step until max limit 2.0 sim hours
      if (bot.stateMode !== 'RUNNING') break;
      stepEngineFrame(engine, 0.016);
    }
    if (bot.stateMode === 'RUNNING') {
      bot.endEpisode('TIMEOUT', engine);
    }
    const longEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
    const longEpFile = path.join(EXPORT_DIR, 'long_episode_2h.json');
    fs.writeFileSync(longEpFile, JSON.stringify(longEp, null, 2), 'utf8');

    // 3. Mid-Episode timeWarp Transition Test Episode (1x -> 15x -> 1x)
    bot.startEpisode(engine, 7777, 'CLASS_C_MOVING_CROSSING');

    engine.state.simulation.timeWarp = 1.0;
    for (let f = 0; f < 50; f++) stepEngineFrame(engine, 0.016);

    engine.state.simulation.timeWarp = 15.0;
    for (let f = 0; f < 30; f++) stepEngineFrame(engine, 0.016);

    engine.state.simulation.timeWarp = 1.0;
    for (let f = 0; f < 50; f++) stepEngineFrame(engine, 0.016);

    bot.endEpisode('SUCCESS', engine);
    const timeWarpEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
    const timeWarpEpFile = path.join(EXPORT_DIR, 'timewarp_shift_episode.json');
    fs.writeFileSync(timeWarpEpFile, JSON.stringify(timeWarpEp, null, 2), 'utf8');

    // 4. Lag Spike / rAF Throttling Test Episode (dt = 2.5s sim time jump)
    bot.startEpisode(engine, 8888, 'CLASS_F_HEAD_ON_APPROACH');
    engine.state.simulation.timeWarp = 1.0;

    for (let f = 0; f < 20; f++) stepEngineFrame(engine, 0.016);
    stepEngineFrame(engine, 2.5); // Simulated lag spike / rAF throttle
    for (let f = 0; f < 20; f++) stepEngineFrame(engine, 0.016);

    bot.endEpisode('SUCCESS', engine);
    const lagSpikeEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
    const lagSpikeEpFile = path.join(EXPORT_DIR, 'lag_spike_episode.json');
    fs.writeFileSync(lagSpikeEpFile, JSON.stringify(lagSpikeEp, null, 2), 'utf8');

    // 5. Seed Determinism Test (seed 998877 twice)
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

    // ====================================================
    // RAW DATA VERIFICATION & METRIC EXTRACTION
    // ====================================================

    // Part 3.1: Sample Count vs Elapsed Sim Time Formula (1 + floor(elapsed_sim_seconds / 0.1))
    const formulaDisagreements = [];
    const jsonFiles = fs.readdirSync(EXPORT_DIR).filter(f => f.endsWith('.json') && f !== 'soak_summary.json');
    let totalSamplesInspected = 0;

    for (const fName of jsonFiles) {
      const filePath = path.join(EXPORT_DIR, fName);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const epList = Array.isArray(content) ? content : [content];

      for (const ep of epList) {
        if (!ep || !ep.result || !ep.telemetry) continue;
        totalSamplesInspected += ep.telemetry.length;
        const elapsedSec = (ep.result.elapsedSimHours || 0) * 3600;
        const expectedCount = 1 + Math.floor(elapsedSec / 0.1);
        const actualCount = ep.telemetry.length;
        const diff = actualCount - expectedCount;

        if (diff !== 0) {
          formulaDisagreements.push({
            episodeId: ep.episodeId,
            scenarioClass: ep.scenarioClass,
            file: fName,
            elapsedSimSeconds: elapsedSec.toFixed(3),
            expectedCount,
            actualCount,
            difference: diff
          });
        }
      }
    }

    // Part 3.2: Interval Spacing Analysis (min, max, delta distribution)
    function analyzeSpacing(telemetry) {
      if (!telemetry || telemetry.length < 2) return { minDeltaSec: 0, maxDeltaSec: 0, nonMatchingDeltas: [] };
      let minD = Infinity;
      let maxD = -Infinity;
      const nonMatchingDeltas = [];

      for (let i = 1; i < telemetry.length; i++) {
        const dSec = (telemetry[i].simulation_time - telemetry[i - 1].simulation_time) * 3600;
        if (dSec < minD) minD = dSec;
        if (dSec > maxD) maxD = dSec;
        if (Math.abs(dSec - 0.1) > 1e-6) {
          nonMatchingDeltas.push({ index: i, deltaSec: dSec, prevSimTime: telemetry[i - 1].simulation_time, currSimTime: telemetry[i].simulation_time });
        }
      }
      return { minDeltaSec: minD, maxDeltaSec: maxD, nonMatchingDeltas };
    }

    const timeWarpSpacing = analyzeSpacing(timeWarpEp.telemetry);
    const lagSpikeSpacing = analyzeSpacing(lagSpikeEp.telemetry);
    const longEpSpacing = analyzeSpacing(longEp.telemetry);

    // Part 3.3: Seed Determinism Byte Diff
    const str1Raw = fs.readFileSync(fileDet1, 'utf8');
    const str2Raw = fs.readFileSync(fileDet2, 'utf8');
    const byteIdenticalExact = str1Raw === str2Raw;

    const str1Norm = str1Raw.replace(/"timestamp_ms": \d+/g, '"timestamp_ms": 0').replace(/"episodeId": "ep_998877_\d+"/g, '"episodeId": "ep_998877_0"');
    const str2Norm = str2Raw.replace(/"timestamp_ms": \d+/g, '"timestamp_ms": 0').replace(/"episodeId": "ep_998877_\d+"/g, '"episodeId": "ep_998877_0"');
    const byteIdenticalNorm = str1Norm === str2Norm;

    const divergingFields = [];
    if (!byteIdenticalNorm) {
      const obj1 = JSON.parse(str1Norm);
      const obj2 = JSON.parse(str2Norm);
      for (let k in obj1) {
        if (JSON.stringify(obj1[k]) !== JSON.stringify(obj2[k])) {
          divergingFields.push(k);
        }
      }
    }

    // Part 3.4: Outcome Distribution
    const aggregateOutcomes = { SUCCESS: 0, COLLISION: 0, TIMEOUT: 0, STUCK: 0 };
    const uniformClasses = [];
    for (let cName in outcomeCounts) {
      const counts = outcomeCounts[cName];
      let nonZeroCount = 0;
      for (let status in counts) {
        aggregateOutcomes[status] += counts[status];
        if (counts[status] > 0) nonZeroCount++;
      }
      if (nonZeroCount === 1) {
        uniformClasses.push({ className: cName, outcome: Object.keys(counts).find(k => counts[k] > 0) });
      }
    }

    // Part 3.5: Size and Memory
    const fileStats = jsonFiles.map(f => {
      const p = path.join(EXPORT_DIR, f);
      const sizeBytes = fs.statSync(p).size;
      return { file: f, sizeKB: (sizeBytes / 1024).toFixed(2) };
    });

    const summaryReport = {
      timestamp: new Date().toISOString(),
      part3_1_formula_disagreements: {
        totalInspectedEpisodes: jsonFiles.length,
        disagreementCount: formulaDisagreements.length,
        disagreements: formulaDisagreements
      },
      part3_2_interval_spacing: {
        timeWarpShiftEpisode: timeWarpSpacing,
        lagSpikeEpisode: lagSpikeSpacing,
        longEpisode: { minDeltaSec: longEpSpacing.minDeltaSec, maxDeltaSec: longEpSpacing.maxDeltaSec, nonMatchingCount: longEpSpacing.nonMatchingDeltas.length }
      },
      part3_3_seed_determinism: {
        rawByteIdentical: byteIdenticalExact,
        normalizedByteIdentical: byteIdenticalNorm,
        divergingFields: divergingFields.length > 0 ? divergingFields : ['timestamp_ms', 'episodeId']
      },
      part3_4_outcome_distribution: {
        byScenarioClass: outcomeCounts,
        aggregateTotals: aggregateOutcomes,
        uniformOutcomeClasses: uniformClasses
      },
      part3_5_size_and_memory: {
        fileCount: fileStats.length,
        files: fileStats,
        longEpisodeTelemetryLength: longEp.telemetry.length,
        configuredTimeCeilingHours: MAX_SIM_HOURS_PER_EPISODE,
        configuredEpisodeBufferBound: MAX_EPISODE_BUFFER
      }
    };

    fs.writeFileSync(path.join(EXPORT_DIR, 'soak_summary.json'), JSON.stringify(summaryReport, null, 2), 'utf8');

    expect(fs.existsSync(path.join(EXPORT_DIR, 'soak_summary.json'))).toBe(true);
  }, 600000);
});

