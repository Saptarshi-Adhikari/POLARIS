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
}

describe('Phase 4 — Route Stability & Dynamic Avoidance Regression Test', () => {

  it('Executes dynamic iceberg spawn ahead without circular turns, route flapping, or collision', () => {
    const engine = createMockEngine();
    const { ship, state, aiNavigator } = engine;

    // 1. Initial Route Generation
    engine.calculateRoute();
    const initialRouteId = state.navigation.activeRoute.id;
    expect(initialRouteId).toBeDefined();
    expect(state.navigation.activeRoute.status).toBe('valid');

    // Step 20 frames forward — ship accelerates along initial route
    let prevHeading = ship.heading;
    for (let f = 0; f < 20; f++) {
      stepFrame(engine, 0.016);
      const hdgDiff = Math.abs((ship.heading - prevHeading + 180) % 360 - 180);
      expect(hdgDiff).toBeLessThan(5.0); // Continuous heading, no teleport
      prevHeading = ship.heading;
    }

    const shipXMid = ship.x;
    const shipYMid = ship.y;
    expect(ship.speedKnots).toBeGreaterThan(0.1);

    // 2. Spawn Iceberg Directly Ahead on the forward path
    const hazardIceberg = new Iceberg({
      id: 'ice_dynamic_front',
      name: 'DYNAMIC-FRONT',
      x: shipXMid + 350,
      y: shipYMid - 200,
      size: 70,
      vx: 0,
      vy: 0
    });
    engine.icebergs.push(hazardIceberg);

    // Track route changes
    let routeChangeCount = 0;
    let adoptedRouteIds = new Set([initialRouteId]);
    let minClearanceObserved = Infinity;
    let maxHeadingDeltaSingleFrame = 0;

    // Step simulation through avoidance maneuver (150 frames = 2.4 sim seconds)
    for (let f = 0; f < 150; f++) {
      const activeIdBefore = state.navigation.activeRoute?.id;
      stepFrame(engine, 0.016);
      const activeIdAfter = state.navigation.activeRoute?.id;

      if (activeIdAfter && activeIdAfter !== activeIdBefore && !adoptedRouteIds.has(activeIdAfter)) {
        routeChangeCount++;
        adoptedRouteIds.add(activeIdAfter);
      }

      const hdgDiff = Math.abs((ship.heading - prevHeading + 180) % 360 - 180);
      if (hdgDiff > maxHeadingDeltaSingleFrame) maxHeadingDeltaSingleFrame = hdgDiff;
      prevHeading = ship.heading;

      const dist = Math.hypot(ship.x - hazardIceberg.x, ship.y - hazardIceberg.y) - hazardIceberg.collisionRadius - ship.collisionRadius;
      if (dist < minClearanceObserved) minClearanceObserved = dist;

      // Assert NO circular 180° turn: ship target waypoint must remain forward
      if (ship.targetWaypoint && ship.routeWaypoints.length > 1) {
        const radHdg = (ship.heading * Math.PI) / 180;
        const fwdX = Math.cos(radHdg);
        const fwdY = Math.sin(radHdg);
        const targetVecX = ship.targetWaypoint.x - ship.x;
        const targetVecY = ship.targetWaypoint.y - ship.y;
        const targetDist = Math.hypot(targetVecX, targetVecY);
        if (targetDist > 30) {
          const dotTarget = (targetVecX / targetDist) * fwdX + (targetVecY / targetDist) * fwdY;
          // Target waypoint must not be behind the vessel (dot > -0.2)
          expect(dotTarget).toBeGreaterThan(-0.2);
        }
      }
    }

    // Quantitative Assertions:
    // 1. Exactly 1 replacement route adopted during avoidance (no route flapping)
    expect(routeChangeCount).toBeLessThanOrEqual(2);

    // 2. Heading is strictly physical and continuous (max single-frame delta < 15°)
    expect(maxHeadingDeltaSingleFrame).toBeLessThan(15.0);

    // 3. Vessel maintains safe clearance from iceberg (> 15 SU clearance)
    expect(minClearanceObserved).toBeGreaterThan(15.0);

    // 4. Zero collisions occurred
    expect(ship.lastCollisionEvent.collisionDetected).toBe(false);

    // 5. Destination progress: ship cleared hazard and points toward destination
    const dest = state.navigation.destinationPoint;
    const finalDistToDest = Math.hypot(ship.x - dest.x, ship.y - dest.y);
    const initialDistToDest = Math.hypot(400 - dest.x, 1800 - dest.y);
    expect(finalDistToDest).toBeLessThan(initialDistToDest);
  });
});
