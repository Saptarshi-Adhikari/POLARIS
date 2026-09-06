import { describe, it, expect } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';

function createMockEngine() {
  const ship = new Ship({ x: 400, y: 1800, heading: 330 });
  const aiNavigator = new AINavigator(3600, 2400);
  const state = {
    vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1, autopilot: true, throttle: 65, rudder: 0, heading: 330 },
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

  const navTestBot = new NavTestBot(ship, engine.icebergs, aiNavigator, state, null);
  engine.navTestBot = navTestBot;
  navTestBot.engine = engine;

  return engine;
}

function stepFrame(engine, dt = 0.016) {
  engine.state.simulation.simTimeHours += (dt / 3600);
  for (let ice of engine.icebergs) {
    ice.update(dt, engine.vectorField, engine.state.simulation.simTimeHours, engine.state);
  }
  engine.ship.update(dt, engine.vectorField, engine.state.simulation.simTimeHours, engine.state, engine.icebergs);
  engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, engine.state.simulation.simTimeHours, engine.state);

  if (engine.navTestBot && engine.navTestBot.enabled) {
    const activeRoute = engine.state.navigation.activeRoute || {};
    const radHdg = (engine.ship.heading * Math.PI) / 180;
    const spdG = Math.hypot(engine.ship.vx, engine.ship.vy);
    const snapshot = {
      timestamp_ms: Date.now(),
      simulation_time: engine.state.simulation.simTimeHours,
      route: { id: activeRoute.id || 'none', status: activeRoute.status || 'invalid' },
      ship: { position: { x: engine.ship.x, y: engine.ship.y }, heading_deg: engine.ship.heading, ground_speed: spdG },
      guidance: { mode: engine.ship.autopilotStatus || 'NORMAL', cross_track_error: engine.ship.crossTrackError || 0 },
      icebergs: [],
      environment: { simTimeHours: engine.state.simulation.simTimeHours },
      collision: engine.ship.lastCollisionEvent || { collisionDetected: false }
    };
    engine.navTestBot.evaluateFrame(engine, snapshot);
  }
}

describe('Phase 4 — Navigation Dataset & Stability Comprehensive Tests', () => {

  it('1. Initial Route Generation & Route ID creation', () => {
    const engine = createMockEngine();
    engine.calculateRoute();
    expect(engine.state.navigation.activeRoute).toBeDefined();
    expect(engine.state.navigation.activeRoute.id).toMatch(/^route_\d+/);
    expect(engine.state.navigation.activeRoute.status).toBe('valid');
  });

  it('2. Minor iceberg movement does NOT trigger replanning during commitment window', () => {
    const engine = createMockEngine();
    engine.calculateRoute();
    const originalRouteId = engine.state.navigation.activeRoute.id;

    // Add a distant, non-conflicting iceberg moving slightly
    const distantIce = new Iceberg({ id: 'ice_far', name: 'FAR', x: 2000, y: 2000, size: 40, vx: 0.1, vy: 0.1 });
    engine.icebergs.push(distantIce);

    // Step 50 frames (within 5.0s commitment window)
    for (let f = 0; f < 50; f++) stepFrame(engine, 0.016);

    expect(engine.state.navigation.activeRoute.id).toBe(originalRouteId);
  });

  it('3. Emergency collision overrides commitment window', () => {
    const engine = createMockEngine();
    engine.calculateRoute();
    const originalRouteId = engine.state.navigation.activeRoute.id;

    // Spawn an iceberg dangerously close (CPA < 30s, dCPA < safeMargin)
    const dangerIce = new Iceberg({ id: 'ice_danger', name: 'DANGER', x: engine.ship.x + 50, y: engine.ship.y - 20, size: 70, vx: -2, vy: 1 });
    engine.icebergs.push(dangerIce);

    stepFrame(engine, 0.016);
    expect(engine.ship._inEmergencyAvoidance || engine.state.navigation.activeRoute?.id !== originalRouteId).toBe(true);
  });

  it('4. Forward Waypoint Selection: setRouteWaypoints selects forward target ahead of ship', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    ship.vx = 5;
    ship.vy = -3;
    const waypoints = [
      { x: 380, y: 1810 }, // behind ship
      { x: 400, y: 1800 }, // at ship
      { x: 500, y: 1700 }, // ahead
      { x: 700, y: 1500 }
    ];
    ship.setRouteWaypoints(waypoints);
    // Waypoint index should NOT be 0 (which is behind)
    expect(ship.waypointIndex).toBeGreaterThanOrEqual(1);
    expect(ship.targetWaypoint.x).toBeGreaterThan(400);
  });

  it('5. NavTestBot resetEpisode fully resets episode state', () => {
    const engine = createMockEngine();
    const bot = engine.navTestBot;
    bot.startEpisode(engine, 12345, 'CLASS_A_CLEAR_SEAS');
    for (let f = 0; f < 20; f++) stepFrame(engine, 0.016);

    expect(bot.currentEpisode).not.toBeNull();
    bot.resetEpisode(engine);
    expect(bot.currentEpisode).toBeNull();
    expect(bot.stateMode).toBe('IDLE');
    expect(engine.ship.vx).toBe(0);
    expect(engine.ship.vy).toBe(0);
  });

  it('6. Route Flapping Score & Dataset Data Quality validation', () => {
    const engine = createMockEngine();
    const bot = engine.navTestBot;
    bot.enabled = true;
    bot.startEpisode(engine, 9999, 'CLASS_B_STATIC_OBSTACLE');

    for (let f = 0; f < 50; f++) stepFrame(engine, 0.016);
    bot.endEpisode('SUCCESS', engine);

    const lastEp = bot.completedEpisodes[bot.completedEpisodes.length - 1];
    expect(lastEp.metrics).toBeDefined();
    expect(lastEp.metrics.routeFlappingScore).toBeGreaterThanOrEqual(0);
    expect(lastEp.data_quality.valid).toBe(true);
    expect(lastEp.dataset_schema_version).toBe('1.0');
  });

  it('7. Single Control Authority: emergency avoidance handles rudder without autopilot overwrite', () => {
    const engine = createMockEngine();
    const { ship, state } = engine;
    engine.calculateRoute();

    ship._inEmergencyAvoidance = true;
    ship.rudder = 30.0; // Emergency turn command

    ship.updateAutopilotSteering(0.016, state, [], 10, engine.vectorField, 0);

    // Autopilot steering must NOT overwrite rudder when _inEmergencyAvoidance is true
    expect(ship.rudder).toBe(30.0);
  });
});
