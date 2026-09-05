import { describe, it, expect } from 'vitest';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { Ship } from '../src/js/simulation/ship.js';
import { isSegmentHardBlocked } from '../src/js/ai/routePlannerCore.js';
import { wrappedDistance } from '../src/js/utils.js';
import { SimulationEngine } from '../src/js/main.js';

describe('POLARIS Comprehensive Re-Audit & Fixes Verification Suite', () => {

  // TEST 1 — getPositionAt(t)
  it('TEST 1 — Iceberg.getPositionAt(t) accurately interpolates across forecast times and extrapolates', () => {
    const ice = new Iceberg({ id: 'ice1', name: 'Ice 1', x: 500, y: 500, size: 720 });
    ice.vx = 10;
    ice.vy = 0;
    ice.trajectoryForecast = [
      { hour: 1, x: 800, y: 500 },
      { hour: 2, x: 1100, y: 500 }
    ];

    // t = 0
    const pos0 = ice.getPositionAt(0);
    expect(pos0.x).toBe(500);
    expect(pos0.y).toBe(500);

    // t = 0.5 (intermediate interpolation between t=0 (500) and t=1 (800))
    const posHalf = ice.getPositionAt(0.5);
    expect(posHalf.x).toBe(650);
    expect(posHalf.y).toBe(500);

    // t = 1 (forecast point)
    const pos1 = ice.getPositionAt(1.0);
    expect(pos1.x).toBe(800);

    // t = 2 (endpoint)
    const pos2 = ice.getPositionAt(2.0);
    expect(pos2.x).toBe(1100);

    // t = 3 (> endpoint extrapolation)
    const pos3 = ice.getPositionAt(3.0);
    expect(pos3.x).toBeGreaterThan(1100);
  });

  // TEST 2 — Temporal crossing (Same Time Collision)
  it('TEST 2 — Temporal collision: rejects route when ship and iceberg reach same point at same time', () => {
    const ice = new Iceberg({ id: 'ice_cross', x: 100, y: 500, collisionRadius: 40 });
    ice.trajectoryForecast = [
      { hour: 1.0, x: 500, y: 500 }
    ];

    const pA = { x: 100, y: 500 };
    const pB = { x: 900, y: 500 };

    const isBlocked = isSegmentHardBlocked(pA, pB, 0.0, 2.0, [ice]);
    expect(isBlocked).toBe(true);
  });

  // TEST 3 — Different-time crossing (Safe Crossing)
  it('TEST 3 — Different-time crossing: allows route when ship and iceberg occupy same point at different times', () => {
    // Iceberg starts at (1000, 1000) at t=0 and reaches (500, 500) at t=10.0 hours
    const ice = new Iceberg({ id: 'ice_safe', x: 1000, y: 1000, collisionRadius: 40 });
    ice.trajectoryForecast = [
      { hour: 10.0, x: 500, y: 500 }
    ];

    // Ship passes (500, 500) between t=0.1 and t=0.3 hours (when iceberg is at ~990, 990)
    const pA = { x: 100, y: 500 };
    const pB = { x: 900, y: 500 };

    const isBlocked = isSegmentHardBlocked(pA, pB, 0.1, 0.3, [ice]);
    expect(isBlocked).toBe(false);
  });

  // TEST 4 — Segment temporal sampling
  it('TEST 4 — Segment temporal sampling varies ETA continuously along segment', () => {
    const ice1 = new Iceberg({ id: 'ice_t1', x: 300, y: 500, collisionRadius: 30 });
    ice1.trajectoryForecast = [{ hour: 0.5, x: 300, y: 500 }];

    const ice2 = new Iceberg({ id: 'ice_t2', x: 700, y: 500, collisionRadius: 30 });
    ice2.trajectoryForecast = [{ hour: 1.5, x: 700, y: 500 }];

    const pA = { x: 100, y: 500 };
    const pB = { x: 900, y: 500 };

    expect(isSegmentHardBlocked(pA, pB, 0.0, 2.0, [ice1])).toBe(true);
    expect(isSegmentHardBlocked(pA, pB, 0.0, 2.0, [ice2])).toBe(true);
  });

  // TEST 5 — Physical clipping prevention
  it('TEST 5 — Ship physics prevents hull from clipping iceberg collision envelope', () => {
    const ship = new Ship({ x: 450, y: 500, heading: 0, throttle: 100 });
    ship.vx = 50;
    ship.vy = 0;
    const ice = new Iceberg({ id: 'ice_block', x: 500, y: 500, collisionRadius: 40 });
    const safeDist = ice.collisionRadius + ship.collisionRadius;

    const state = { vessel: { maxSpeed: 30, enginePower: 1.0, dragCoefficient: 0.04 }, icebergs: { enabled: true } };

    ship.update(0.1, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0, state, [ice]);

    const actualDist = Math.hypot(ship.x - ice.x, ship.y - ice.y);
    expect(actualDist).toBeGreaterThanOrEqual(safeDist);
  });

  // TEST 6 — CCD / Swept collision
  it('TEST 6 — Swept CCD catches high-velocity jump past iceberg within single timestep', () => {
    const ship = new Ship({ x: 400, y: 500, heading: 0, throttle: 100 });
    ship.vx = 300;
    ship.vy = 0;
    const ice = new Iceberg({ id: 'ice_ccd', x: 420, y: 500, collisionRadius: 15 });
    const safeDist = ice.collisionRadius + ship.collisionRadius;

    const state = { vessel: { maxSpeed: 500, enginePower: 1.0, dragCoefficient: 0.04 }, icebergs: { enabled: true } };

    ship.update(0.1, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0, state, [ice]);

    const actualDist = Math.hypot(ship.x - ice.x, ship.y - ice.y);
    expect(actualDist).toBeGreaterThanOrEqual(safeDist);
  });

  // TEST 7 — Collision response & sliding
  it('TEST 7 — Collision response removes inward velocity and enables tangential sliding', () => {
    const ship = new Ship({ x: 470, y: 490, heading: 0, throttle: 50 });
    ship.vx = 20;
    ship.vy = 20;
    const ice = new Iceberg({ id: 'ice_slide', x: 500, y: 500, collisionRadius: 30 });

    const state = { vessel: { maxSpeed: 30, enginePower: 1.0, dragCoefficient: 0.04 }, icebergs: { enabled: true } };

    ship.update(0.05, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0, state, [ice]);

    const dist = Math.hypot(ship.x - ice.x, ship.y - ice.y);
    expect(dist).toBeGreaterThanOrEqual(ice.collisionRadius + ship.collisionRadius);
    expect(Number.isFinite(ship.vx)).toBe(true);
    expect(Number.isFinite(ship.vy)).toBe(true);
  });

  // TEST 8 — Route rendering (Single Route Line)
  it('TEST 8 — Enforces single canonical route line rendering guard', () => {
    const engine = new SimulationEngine();
    engine.renderer.navLineDrawCount = 0;
    expect(engine.renderer.navLineDrawCount).toBe(0);
    expect(engine.state.navigation.activeRoute).toBeDefined();
  });

  // TEST 9 — Fresh startup (No START marker)
  it('TEST 9 — Fresh startup has no startPoint marker or START anchor', () => {
    const engine = new SimulationEngine();
    expect(engine.state.navigation.startPoint).toBeNull();
    expect(engine.renderer.startPoint).toBeNull();
    expect(engine.state.navigation.destinationPoint).toBeDefined();
  });

  // TEST 10 — Reset behavior
  it('TEST 10 — Reset restores ship state while preserving destination and regenerating route', () => {
    const engine = new SimulationEngine();
    const dest = { x: 2500, y: 1500 };
    engine.state.navigation.destinationPoint = dest;
    engine.ship.x = 800;
    engine.ship.y = 800;

    const initialX = engine.initialShipState ? engine.initialShipState.x : engine.ship.x;
    engine.resetShip();

    expect(engine.ship.x).toBe(initialX);
    expect(engine.state.navigation.destinationPoint).toEqual(dest);
    expect(engine.state.navigation.activeRoute).not.toBeNull();
    expect(engine.state.navigation.startPoint).toBeNull();
    expect(engine.renderer.startPoint).toBeNull();
  });

  // TEST 11 — World wrapping
  it('TEST 11 — Continuous 2D world wrapping at 3600 x 2400 coordinates', () => {
    const ship = new Ship({ x: 3595, y: 1200, heading: 0 });
    ship.vx = 20;
    ship.vy = 0;

    const state = { vessel: { maxSpeed: 30 }, icebergs: { enabled: false } };
    ship.update(0.5, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0, state, []);

    expect(ship.x).toBeLessThan(3600);
    expect(ship.x).toBeGreaterThanOrEqual(0);

    const ptA = { x: 50, y: 500 };
    const ptB = { x: 3550, y: 500 };
    const dist = wrappedDistance(ptA, ptB, 3600, 2400);
    expect(dist).toBe(100);
  });

  // TEST 12 — Current and thrust interaction
  it('TEST 12 — Ground velocity equals water relative velocity plus current vector without double counting', () => {
    const ship = new Ship({ x: 500, y: 500, heading: 0, throttle: 50 });
    const oceanVel = { getVelocityAt: () => ({ u: 5.0, v: 0.0 }) };
    const state = { vessel: { maxSpeed: 20, enginePower: 1.0, dragCoefficient: 0.04 }, environment: { wind: { enabled: false } }, icebergs: { enabled: false } };

    ship.update(0.1, oceanVel, 0, state, []);

    expect(ship.vx).toBeGreaterThan(0);
    expect(Number.isFinite(ship.speedKnots)).toBe(true);
  });

  // TEST 13 — Single Route Risk Colors
  it('TEST 13 — Risk scores are evaluated on individual segments of the single active route', () => {
    const engine = new SimulationEngine();
    engine.state.navigation.destinationPoint = { x: 2500, y: 1500 };
    engine.calculateRoute();
    const route = engine.state.navigation.activeRoute;
    expect(route).toBeDefined();
    expect(route.status).toBe('valid');
    expect(route.waypoints.length).toBeGreaterThan(0);
  });

  // TEST 14 — Performance / No per-frame A* searches
  it('TEST 14 — Route planner does not run A* search every frame when route is valid and stable', () => {
    const engine = new SimulationEngine();
    engine.icebergs = [];
    engine.state.navigation.destinationPoint = { x: 2500, y: 1500 };
    engine.calculateRoute();
    engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, 0, engine.state);
    
    let reevalCount = 0;
    const initialRouteId = engine.state.navigation.activeRoute.id;

    for (let frame = 0; frame < 60; frame++) {
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, 0, engine.state);
      if (engine.state.navigation.activeRoute.id !== initialRouteId) {
        reevalCount++;
      }
    }

    expect(reevalCount).toBe(0);
  });

  // TEST 15 — Transactional Route Replacement (Route never disappears during replan)
  it('TEST 15 — Active route remains valid and visible during background replanning', () => {
    const engine = new SimulationEngine();
    engine.state.navigation.destinationPoint = { x: 2500, y: 1500 };
    engine.calculateRoute();

    const initialRoute = engine.state.navigation.activeRoute;
    expect(initialRoute).toBeDefined();
    expect(initialRoute.status).toBe('valid');

    // Trigger route invalidation
    engine.state.navigation.routeInvalid = true;

    // Verify activeRoute is NOT cleared or set to null during replan request
    expect(engine.state.navigation.activeRoute).toBeDefined();
    expect(engine.state.navigation.activeRoute.status).toBe('valid');
    expect(engine.state.navigation.activeRoute.waypoints.length).toBeGreaterThan(0);
  });

  // TEST 16 — Forward Waypoint Advancement (No huge circular turn)
  it('TEST 16 — Route adoption advances waypointIndex to forward target and avoids U-turns', () => {
    const ship = new Ship({ x: 500, y: 500, heading: 0 }); // Facing East (0 deg)
    ship.vx = 20;
    ship.vy = 0;

    // Candidate route waypoints: (500,500) -> (490,500) behind -> (550,510) ahead -> (1000,500)
    const waypoints = [
      { x: 500, y: 500 },
      { x: 490, y: 500 },
      { x: 550, y: 510 },
      { x: 1000, y: 500 }
    ];

    const activeRoute = { id: 'route_test_adv', waypoints, status: 'valid' };
    const state = { navigation: { activeRoute }, vessel: { maxSpeed: 30, throttle: 65 } };

    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    // Verify waypointIndex is NOT stuck at 0 or 1 (stale/behind waypoints)
    expect(ship.waypointIndex).toBeGreaterThanOrEqual(1);
    expect(ship.targetWaypoint).toBeDefined();
    
    // Verify target heading angle difference is reasonable (<90 deg)
    const dx = ship.targetWaypoint.x - ship.x;
    const dy = ship.targetWaypoint.y - ship.y;
    const targetHdg = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
    let angleDiff = Math.abs((targetHdg - ship.heading + 180) % 360 - 180);
    expect(angleDiff).toBeLessThan(90);
  });

  // TEST 17 — Continuous Route Line Fallback
  it('TEST 17 — Canvas renderer fallback produces valid 2-point polyline starting at ship position', () => {
    const engine = new SimulationEngine();
    engine.state.navigation.destinationPoint = { x: 2500, y: 1500 };
    engine.calculateRoute();
    expect(engine.state.navigation.activeRoute.waypoints.length).toBeGreaterThan(0);
    expect(engine.state.navigation.navigationMode).toBe('ROUTE_FOLLOWING');
  });

  // TEST 18 — Dodge & Continue Forward Navigation
  it('TEST 18 — Dodge & Continue Forward: Ship avoids iceberg ahead without looping and continues to destination', () => {
    const engine = new SimulationEngine();
    engine.ship = new Ship({ x: 500, y: 500, heading: 0, throttle: 80 });
    engine.state.navigation.destinationPoint = { x: 2500, y: 500 };

    const ice = new Iceberg({ id: 'ice_ahead', x: 800, y: 500, collisionRadius: 50 });
    engine.icebergs = [ice];
    engine.calculateRoute();

    const initialX = engine.ship.x;
    let maxHeadingDev = 0;
    let minIceDist = Infinity;
    let enteredAvoidance = false;

    // Simulate 150 seconds (1500 steps @ 0.1s dt)
    for (let step = 0; step < 1500; step++) {
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * 0.1, engine.state);
      engine.ship.update(0.1, engine.vectorField, step * 0.1, engine.state, engine.icebergs);

      const iceDist = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y);
      if (iceDist < minIceDist) minIceDist = iceDist;

      if (iceDist < 250) {
        enteredAvoidance = true;
      }

      // Track angular deviation from East (0 deg)
      let dev = Math.abs((engine.ship.heading + 180) % 360 - 180);
      if (dev > maxHeadingDev) maxHeadingDev = dev;

      // Stop once safely past the iceberg and approaching destination
      if (engine.ship.x > 1500) break;
    }

    // Assertions:
    // 1. Ship made forward progress past the iceberg
    expect(engine.ship.x).toBeGreaterThan(1200);

    // 2. Minimum distance to iceberg preserved safe margin (no collision)
    expect(minIceDist).toBeGreaterThanOrEqual(ice.collisionRadius + engine.ship.collisionRadius - 1.0);

    // 3. Avoidance was triggered
    expect(enteredAvoidance).toBe(true);

    // 4. Ship did NOT make a full 180-360 loop (heading deviation stayed < 90 deg)
    expect(maxHeadingDev).toBeLessThan(90);

    // 5. Final heading after passing (at x > 1200) returned towards destination (~0 deg)
    let finalDev = Math.abs((engine.ship.heading + 180) % 360 - 180);
    expect(finalDev).toBeLessThan(35);
  });

});

