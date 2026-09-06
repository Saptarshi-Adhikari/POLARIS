import { describe, it, expect } from 'vitest';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import { SCENARIO_CLASSES, ROUTE_MODES, ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';
import { SimulationEngine } from '../src/js/main.js';
import { runRoutePlannerCore } from '../src/js/ai/routePlannerCore.js';

describe('NavTestBot — Scenario & Route Mode Coverage Audit', () => {
  it('1. Round-Robin Coverage Grid (Target = 48): exact 4 episodes per class, 1 per mode per class', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    bot.setTargetEpisodeCount(48);
    bot.toggle(engine);

    const exportedBatches = [];
    bot.datasetExporter = {
      getManifest: () => ({ episode_count: bot.sessionEpisodeCount }),
      exportEpisodeJSONL: () => ({ content: '{}' }),
      exportFileWithDirectoryHandle: async () => ({ success: true })
    };
    bot.triggerDownload = (contentStr, filename) => {
      try {
        const batch = JSON.parse(contentStr);
        if (Array.isArray(batch)) {
          exportedBatches.push(batch);
        }
      } catch (e) {}
    };

    // Run through 48 episodes
    for (let k = 1; k <= 48; k++) {
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_${k}`,
        distanceAtCollision: 0,
        relativeVelocity: 12.0
      };
      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });
    }

    expect(bot.enabled).toBe(false);
    expect(bot.sessionEpisodeCount).toBe(48);

    const allEpisodes = exportedBatches.flat();
    expect(allEpisodes.length).toBe(48);

    // Build 12 x 4 Grid Matrix
    const grid = {};
    SCENARIO_CLASSES.forEach(sc => {
      grid[sc] = {
        FASTEST: 0,
        BALANCED: 0,
        SAFEST: 0,
        FUEL_EFFICIENT: 0,
        total: 0
      };
    });

    allEpisodes.forEach(ep => {
      const sc = ep.scenarioClass || ep.scenario_class;
      const rm = ep.routeMode || ep.route_mode;
      expect(SCENARIO_CLASSES).toContain(sc);
      expect(ROUTE_MODES).toContain(rm);
      grid[sc][rm] += 1;
      grid[sc].total += 1;
    });

    // Assert exact counts: 4 episodes per class, 1 per mode per class
    SCENARIO_CLASSES.forEach(sc => {
      expect(grid[sc].total).toBe(4);
      ROUTE_MODES.forEach(rm => {
        expect(grid[sc][rm]).toBe(1);
      });
    });

    // Console log the breakdown table
    console.log('\n=== 12 CLASS x 4 ROUTE MODE COVERAGE BREAKDOWN (Target = 48) ===');
    console.table(grid);
  });

  it('2. Indefinite Run (Target = null): round-robin scenario class and mode progression', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    bot.setTargetEpisodeCount(null);
    bot.toggle(engine);

    const recordedEpisodes = [];

    for (let k = 0; k < 24; k++) {
      const activeEpisode = bot.currentEpisode;
      recordedEpisodes.push({
        class: activeEpisode.scenarioClass,
        mode: activeEpisode.routeMode
      });

      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_${k}`,
        distanceAtCollision: 0,
        relativeVelocity: 12.0
      };
      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });
    }

    expect(bot.enabled).toBe(true);
    expect(bot.sessionEpisodeCount).toBe(24);

    // Verify first 12 episodes covered all 12 classes in order
    for (let i = 0; i < 12; i++) {
      expect(recordedEpisodes[i].class).toBe(SCENARIO_CLASSES[i]);
    }
    // Verify second 12 episodes covered all 12 classes in order again
    for (let i = 0; i < 12; i++) {
      expect(recordedEpisodes[i + 12].class).toBe(SCENARIO_CLASSES[i]);
    }

    // Verify modes cycled across the two passes
    for (let i = 0; i < 12; i++) {
      expect(recordedEpisodes[i].mode).not.toBe(recordedEpisodes[i + 12].mode);
    }

    bot.toggle(engine);
    expect(bot.enabled).toBe(false);
  });

  it('3. Route Mode Behavioral Differentiation: confirms 4 modes yield distinct route outputs for identical layout', () => {
    const generator = new ScenarioGenerator();
    const scenario = generator.generateScenario(12345, 'CLASS_B_STATIC_OBSTACLE');

    const results = {};

    ROUTE_MODES.forEach(mode => {
      const res = runRoutePlannerCore({
        requestId: 1,
        ship: scenario.start,
        icebergs: scenario.icebergs,
        dest: scenario.destination,
        mode: mode,
        state: { vessel: { maxSpeed: 30 } }
      });
      results[mode] = res;
    });

    console.log('\n=== ROUTE MODE BEHAVIOR COMPARISON (CLASS_B_STATIC_OBSTACLE, Seed = 12345) ===');
    const tableData = {};
    ROUTE_MODES.forEach(mode => {
      const res = results[mode];
      tableData[mode] = {
        waypointsCount: res.waypoints.length,
        shipSpeed: res.shipSpeed,
        etaHours: res.estimatedDuration || res.eta,
        estimatedFuel: res.estimatedFuelConsumption,
        maxRisk: res.maxRisk
      };
    });
    console.table(tableData);

    // Assert that different modes produce distinct speeds, fuel consumption, and transit times
    expect(results.FASTEST.shipSpeed).toBeGreaterThan(results.BALANCED.shipSpeed);
    expect(results.BALANCED.shipSpeed).toBeGreaterThan(results.SAFEST.shipSpeed);
    expect(results.SAFEST.shipSpeed).toBeGreaterThan(results.FUEL_EFFICIENT.shipSpeed);

    expect(results.FASTEST.estimatedFuelConsumption).toBeGreaterThan(results.BALANCED.estimatedFuelConsumption);
    expect(results.BALANCED.estimatedFuelConsumption).toBeGreaterThan(results.SAFEST.estimatedFuelConsumption);
    expect(results.SAFEST.estimatedFuelConsumption).toBeGreaterThan(results.FUEL_EFFICIENT.estimatedFuelConsumption);
  });
});
