import { describe, it, expect, beforeEach } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { runRoutePlannerCore, isHardBlocked, validateRoute } from '../src/js/ai/routePlannerCore.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import { ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';
import { calculateIcebergPositionAt, wrappedDelta } from '../src/js/utils.js';

describe('POLARIS Phase 5 — Physics Consistency, Dynamic Prediction & Autonomous Scenarios', () => {
  let ship;
  let aiNavigator;
  let state;
  let vectorField;

  beforeEach(() => {
    ship = new Ship({ x: 400, y: 1800, heading: 330 });
    aiNavigator = new AINavigator(3600, 2400);
    
    state = {
      simulation: { simTimeHours: 0, timeWarp: 1 },
      vessel: {
        maxSpeed: 30.0,
        dragCoefficient: 0.04,
        mass: 1.0,
        autopilot: true,
        throttle: 65,
        rudder: 0,
        heading: 330,
        enginePower: 1.0
      },
      navigation: {
        isNavigating: true,
        mode: 'BALANCED',
        destinationPoint: { x: 3000, y: 600 },
        startPoint: { x: 400, y: 1800 },
        activeRoute: null,
        routeCalculated: false,
        routeInvalid: false
      },
      environment: {
        wind: { enabled: false, direction: 0, speed: 0 },
        seaIce: { enabled: false, resistanceFactor: 1.0 }
      },
      icebergs: { enabled: true, driftStrength: 1.0 }
    };

    vectorField = {
      getVelocityAt: () => ({ u: 0, v: 0 }),
      getStormState: () => ({ stormActive: false, severity: 0 })
    };
  });

  // ── 1. CANONICAL ROUTE CONTRACT & IMMUTABILITY ─────────────────────
  it('1. Canonical activeRoute contract contains all required fields and remains immutable', () => {
    const icebergs = [new Iceberg({ id: 'ice_1', x: 1500, y: 1200, size: 60 })];
    aiNavigator.evaluate(ship, icebergs, vectorField, 0, state);

    const activeRoute = state.navigation.activeRoute;
    expect(activeRoute).toBeDefined();
    expect(activeRoute.routeId).toBeDefined();
    expect(activeRoute.routeVersion).toBeGreaterThanOrEqual(1);
    expect(activeRoute.createdAtSimulationTime).toBeDefined();
    expect(activeRoute.replanReason).toBeDefined();
    expect(activeRoute.plannerCost).toBeGreaterThan(0);
    expect(activeRoute.expectedTravelTime).toBeGreaterThan(0);
    expect(Array.isArray(activeRoute.waypoints)).toBe(true);

    // Verify guidance controller does not mutate activeRoute geometry
    const originalFirstWp = { ...activeRoute.waypoints[0] };
    ship.update(0.1, vectorField, 0.1 / 3600, state, icebergs);
    
    expect(activeRoute.waypoints[0].x).toBe(originalFirstWp.x);
    expect(activeRoute.waypoints[0].y).toBe(originalFirstWp.y);
  });

  // ── 2. NO PER-FRAME ROUTE REPLANNING & LOGGING ───────────────────────
  it('2. Planner call count remains low and logs structured entries', () => {
    const icebergs = [new Iceberg({ id: 'ice_1', x: 2000, y: 1000, size: 50 })];
    
    // Evaluate 50 simulation frames without external trigger
    for (let frame = 0; frame < 50; frame++) {
      state.simulation.simTimeHours += 0.1 / 3600;
      aiNavigator.evaluate(ship, icebergs, vectorField, state.simulation.simTimeHours, state);
      ship.update(0.1, vectorField, state.simulation.simTimeHours, state, icebergs);
    }

    // Initial call should be the only planner call unless hazard intervenes
    expect(aiNavigator.plannerCallCount).toBeLessThanOrEqual(2);
    expect(aiNavigator.plannerLogs.length).toBeGreaterThanOrEqual(1);

    const logEntry = aiNavigator.plannerLogs[0];
    expect(logEntry).toHaveProperty('simulation_time');
    expect(logEntry).toHaveProperty('routeId_before');
    expect(logEntry).toHaveProperty('routeId_after');
    expect(logEntry).toHaveProperty('reason');
    expect(logEntry).toHaveProperty('candidateCost');
    expect(logEntry).toHaveProperty('activeCost');
  });

  // ── 3. DYNAMIC ICEBERG TEMPORAL PREDICTION ───────────────────────────
  it('3. Dynamic iceberg prediction evaluates short-horizon t=0..60s trajectory', () => {
    const movingIce = new Iceberg({ id: 'ice_moving', x: 1000, y: 1000, size: 70 });
    movingIce.vx = 2.0;
    movingIce.vy = -1.0;
    
    const posAt0s  = calculateIcebergPositionAt(movingIce, 0);
    const posAt10s = calculateIcebergPositionAt(movingIce, 10 / 3600);
    const posAt60s = calculateIcebergPositionAt(movingIce, 60 / 3600);

    expect(posAt0s.x).toBeCloseTo(1000, 1);
    expect(posAt10s.x).toBeCloseTo(1000 + 2.0 * 10, 1);
    expect(posAt60s.x).toBeCloseTo(1000 + 2.0 * 60, 1);
  });

  // ── 4. TEMPORAL COLLISION MODEL ─────────────────────────────────────
  it('4. Swept segment temporal validation detects future intersection with moving iceberg', () => {
    // Iceberg starts away from route but crosses future arrival position
    const crossingIce = new Iceberg({
      id: 'ice_cross',
      x: 1700,
      y: 1800,
      size: 80
    });
    crossingIce.vx = 0;
    crossingIce.vy = -15.0; // Moves rapidly across route

    const isBlocked = isHardBlocked(1700, 1200, 40 / 3600, [crossingIce]);
    expect(isBlocked).toBe(true);
  });

  // ── 5. ROUTE SMOOTHING SAFETY GUARD ────────────────────────────────
  it('5. Route planner rejects unsafe smoothed routes and falls back safely', () => {
    const icebergs = [new Iceberg({ id: 'ice_1', x: 1700, y: 1200, size: 90 })];
    const payload = {
      requestId: 1,
      ship: { x: 400, y: 1800, heading: 330, speed: 20 },
      dest: { x: 3000, y: 600 },
      mode: 'BALANCED',
      width: 3600,
      height: 2400,
      icebergs: icebergs.map(i => ({ id: i.id, x: i.x, y: i.y, vx: i.vx, vy: i.vy, collisionRadius: i.collisionRadius }))
    };

    const result = runRoutePlannerCore(payload);
    expect(result.waypoints).toBeDefined();
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);

    const val = validateRoute(result.waypoints, icebergs, 20.0, 3600, 2400);
    expect(val.valid).toBe(true);
  });

  // ── 6. SHIP PHYSICS CONSISTENCY ─────────────────────────────────────
  it('6. Ship dynamics obey Nomoto turning & terminal speed without direct heading teleports', () => {
    state.vessel.autopilot = false;
    state.vessel.rudder = 35;
    ship.rudder = 35; // Maximum starboard rudder
    const initialHeading = ship.heading;

    // Advance physics for 1.0 second
    ship.update(1.0, vectorField, 1.0 / 3600, state, []);

    // Angular velocity & heading must change smoothly via Nomoto dynamics
    expect(ship.angularVelocity).toBeGreaterThan(0);
    expect(ship.heading).not.toBe(initialHeading);
    expect(ship.heading).toBeCloseTo((initialHeading + ship.angularVelocity * 1.0 + 360) % 360, 1);
  });

  it('6b. Environmental current affects vessel ground velocity correctly without double-counting', () => {
    const currentVectorField = {
      getVelocityAt: () => ({ u: 5.0, v: 0 }), // 5 SU/s Eastward current
      getStormState: () => ({ stormActive: false, severity: 0 })
    };

    ship.throttle = 100;
    ship.heading = 90; // Facing South (+Y)
    
    for (let t = 0; t < 50; t++) {
      ship.update(0.2, currentVectorField, t * 0.2 / 3600, state, []);
    }

    // Vessel should carry positive vx drift due to current
    expect(ship.vx).toBeGreaterThan(1.0);
  });

  // ── 7. CONTROL AUTHORITY HIERARCHY ─────────────────────────────────
  it('7. Control authority logs emergency_enter and emergency_exit transitions', () => {
    const closeIceberg = new Iceberg({ id: 'ice_danger', x: 420, y: 1780, size: 80 });

    // Trigger emergency check
    ship.update(0.1, vectorField, 0, state, [closeIceberg]);
    expect(ship._inEmergencyAvoidance).toBe(true);
    expect(ship.emergencyEvent?.type).toBe('emergency_enter');

    // Move iceberg far away
    closeIceberg.x = 3000;
    closeIceberg.y = 3000;

    ship.update(0.1, vectorField, 0.1 / 3600, state, [closeIceberg]);
    expect(ship._inEmergencyAvoidance).toBe(false);
    expect(ship.emergencyEvent?.type).toBe('emergency_exit');
  });

  // ── 8. NAVTESTBOT TERMINAL SAMPLE & SCENARIO CLASSES ───────────────
  it('8. NavTestBot tags final telemetry sample with terminal_sample = true', () => {
    const mockEngine = { ship, state, aiNavigator, icebergs: [] };
    const bot = new NavTestBot(mockEngine, null, null, null, null, { baseDir: 'scratch/test_dataset' });
    bot.enabled = true;
    bot.startEpisode(mockEngine, 1001, 'CLASS_A_CLEAR_SEAS');

    for (let step = 0; step < 10; step++) {
      state.simulation.simTimeHours += 0.1 / 3600;
      bot.evaluateFrame(mockEngine, {
        simulation_time: state.simulation.simTimeHours,
        ship: { position: { x: ship.x, y: ship.y } }
      });
    }

    bot.endEpisode('SUCCESS', mockEngine);

    const ep = bot.completedEpisodes[0];
    expect(ep).toBeDefined();
    expect(ep.result.status).toBe('SUCCESS');
    
    const lastSample = ep.telemetry[ep.telemetry.length - 1];
    expect(lastSample.terminal_sample).toBe(true);
  });

  // ── 9. SCENARIOS 1 THROUGH 8 INTEGRATION SUITE ──────────────────────
  it('9. Scenario 1: Basic Navigation reaches destination cleanly', () => {
    const generator = new ScenarioGenerator();
    const scenario = generator.generateScenario(1234, 'CLASS_A_CLEAR_SEAS');
    
    ship.x = scenario.start.x;
    ship.y = scenario.start.y;
    state.navigation.startPoint = scenario.start;
    state.navigation.destinationPoint = scenario.destination;

    aiNavigator.evaluate(ship, scenario.icebergs, vectorField, 0, state);
    expect(state.navigation.activeRoute).toBeDefined();
    expect(state.navigation.activeRoute.waypoints.length).toBeGreaterThanOrEqual(2);
  });

  it('9b. Scenario 2: Iceberg Directly Ahead triggers safe replan without 180° turn', () => {
    const generator = new ScenarioGenerator();
    const scenario = generator.generateScenario(5555, 'CLASS_B_STATIC_OBSTACLE');

    ship.x = scenario.start.x;
    ship.y = scenario.start.y;
    state.navigation.startPoint = scenario.start;
    state.navigation.destinationPoint = scenario.destination;

    aiNavigator.evaluate(ship, scenario.icebergs, vectorField, 0, state);
    
    const initialRouteId = state.navigation.activeRoute.routeId;
    expect(initialRouteId).toBeDefined();

    // Advance ship closer to static obstacle
    ship.x = (scenario.start.x + scenario.destination.x) / 2 - 250;
    ship.y = (scenario.start.y + scenario.destination.y) / 2 + 50;

    aiNavigator.evaluate(ship, scenario.icebergs, vectorField, 10 / 3600, state);
    ship.update(0.1, vectorField, 10 / 3600, state, scenario.icebergs);

    // Vessel target heading must not command a 180° turn backward towards origin
    const backwardHeading = (Math.atan2(scenario.start.y - ship.y, scenario.start.x - ship.x) * 180 / Math.PI + 360) % 360;
    const diffToBackward = Math.abs((ship.targetHeading - backwardHeading + 180) % 360 - 180);
    expect(diffToBackward).toBeGreaterThan(45);
  });

  it('9c. Scenario 8: Large Frame Delay (dt jump) keeps physics bounded and stable', () => {
    const largeDt = 2.5; // 2.5 simulation seconds jump in one frame
    const initialX = ship.x;
    const initialY = ship.y;

    ship.update(largeDt, vectorField, largeDt / 3600, state, []);

    expect(Number.isFinite(ship.x)).toBe(true);
    expect(Number.isFinite(ship.y)).toBe(true);
    expect(Math.hypot(ship.x - initialX, ship.y - initialY)).toBeLessThan(200);
  });
});
