import { describe, it, expect } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import fs from 'fs';
import path from 'path';

describe('Headless Runtime Verification', () => {
  it('Executes headless runtime scenario and exports JSON dataset', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const aiNavigator = new AINavigator(3600, 2400);
    const state = {
      vessel: { maxSpeed: 12, dragCoefficient: 0.05, mass: 1, autopilot: true, throttle: 65, rudder: 0, heading: 330 },
      navigation: { startPoint: { x: 400, y: 1800 }, destinationPoint: { x: 3000, y: 600 }, activeRoute: null, isNavigating: true, mode: 'BALANCED' },
      simulation: { isPaused: false, timeWarp: 1.0, simTimeHours: 0 },
      icebergs: { enabled: true },
      environment: { wind: { speed: 10, direction: 270, enabled: true }, seaIce: { enabled: false }, mode: 'SYNTHETIC' }
    };
    const vectorField = {
      updateGrid: () => {},
      updateParticles: () => {},
      getVelocityAt: () => ({ u: 0, v: 0 }),
      getSeaIceConcentration: () => 0
    };

    const engine = {
      ship,
      icebergs: [],
      state,
      vectorField,
      aiNavigator,
      calculateRoute: () => {
        aiNavigator.calculateRoute(
          state.navigation.startPoint,
          state.navigation.destinationPoint,
          engine.icebergs,
          vectorField,
          state.navigation.mode,
          state,
          ship
        );
      }
    };

    const bot = new NavTestBot(ship, engine.icebergs, aiNavigator, state, null);
    engine.navTestBot = bot;
    bot.engine = engine;
    bot.enabled = true;

    bot.startEpisode(engine, 40004, 'CLASS_B_STATIC_OBSTACLE');
    engine.calculateRoute();

    const initialRouteId = state.navigation.activeRoute.id;

    // Step 30 frames
    for (let f = 0; f < 30; f++) {
      state.simulation.simTimeHours += (0.016 / 3600);
      ship.update(0.016, vectorField, state.simulation.simTimeHours, state, engine.icebergs);
      aiNavigator.evaluate(ship, engine.icebergs, vectorField, state.simulation.simTimeHours, state);
    }

    // Spawn dynamic iceberg ahead
    const obstacle = new Iceberg({
      id: 'ice_dynamic_headon',
      name: 'HEADON-ICE',
      x: ship.x + 350,
      y: ship.y - 200,
      size: 75,
      vx: 0,
      vy: 0
    });
    engine.icebergs.push(obstacle);

    let routeChanges = 0;
    let prevActiveId = initialRouteId;

    // Step 300 frames
    for (let f = 0; f < 300; f++) {
      state.simulation.simTimeHours += (0.016 / 3600);
      for (let ice of engine.icebergs) ice.update(0.016, vectorField, state.simulation.simTimeHours, state);
      ship.update(0.016, vectorField, state.simulation.simTimeHours, state, engine.icebergs);
      aiNavigator.evaluate(ship, engine.icebergs, vectorField, state.simulation.simTimeHours, state);

      const radHdg = (ship.heading * Math.PI) / 180;
      const spdG = Math.hypot(ship.vx, ship.vy);
      const activeRoute = state.navigation.activeRoute || {};
      const snapshot = {
        timestamp_ms: Date.now(),
        simulation_time: state.simulation.simTimeHours,
        route: { id: activeRoute.id || 'none', status: activeRoute.status || 'invalid' },
        ship: { position: { x: ship.x, y: ship.y }, heading_deg: ship.heading, ground_speed: spdG },
        guidance: { mode: ship.autopilotStatus || 'NORMAL', cross_track_error: ship.crossTrackError || 0 },
        icebergs: engine.icebergs.map(ice => ({ id: ice.id, x: ice.x, y: ice.y, distanceFromShip: Math.hypot(ship.x - ice.x, ship.y - ice.y) })),
        environment: { simTimeHours: state.simulation.simTimeHours },
        collision: ship.lastCollisionEvent || { collisionDetected: false }
      };
      bot.evaluateFrame(engine, snapshot);

      if (activeRoute.id && activeRoute.id !== prevActiveId) {
        routeChanges++;
        prevActiveId = activeRoute.id;
      }
    }

    bot.endEpisode('SUCCESS', engine);
    const episodeObj = bot.completedEpisodes[0];

    const exportPath = path.resolve(process.cwd(), 'scratch', 'phase4_headless_verification.json');
    fs.writeFileSync(exportPath, JSON.stringify(episodeObj, null, 2), 'utf8');

    expect(fs.existsSync(exportPath)).toBe(true);
    expect(episodeObj.data_quality.valid).toBe(true);
    expect(routeChanges).toBeLessThanOrEqual(2);
    expect(ship.lastCollisionEvent.collisionDetected).toBe(false);
  });
});
