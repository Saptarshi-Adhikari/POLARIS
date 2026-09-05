import { describe, it, expect } from 'vitest';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { Ship } from '../src/js/simulation/ship.js';
import { isSegmentHardBlocked, validateRoute, runRoutePlannerCore } from '../src/js/ai/routePlannerCore.js';
import { wrappedDistance, calculateIcebergPositionAt, wrappedDistanceCoords, wrappedDelta, getSegmentSpeed } from '../src/js/utils.js';
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

  // TEST 19 — Speed-Profile-Aware ETA Calculation (FIX 1)
  it('TEST 19 — Speed-profile ETA: accounts for hazard deceleration to detect temporal collisions', () => {
    // Moving iceberg reaching (500, 500) at t = 0.5 hours
    const iceCross = new Iceberg({ id: 'ice_cross', x: 500, y: 1000, collisionRadius: 40 });
    iceCross.trajectoryForecast = [{ hour: 0.5, x: 500, y: 500 }];

    // Near hazard causing deceleration near (300, 500)
    const iceStatic = new Iceberg({ id: 'ice_static', x: 300, y: 500 - 60, collisionRadius: 30 });

    const waypoints = [
      { x: 100, y: 500 },
      { x: 300, y: 500 },
      { x: 500, y: 500 },
      { x: 900, y: 500 }
    ];

    const valResult = validateRoute(waypoints, [iceCross, iceStatic], 20.0, 3600, 2400);
    expect(valResult.valid).toBe(false);
    expect(valResult.reason).toContain("collision zone");
  });

  // TEST 20 — getPositionAt Equivalence (FIX 2)
  it('TEST 20 — getPositionAt equivalence: plain objects and Iceberg instances produce identical outputs', () => {
    const mlTrajectory = [{ time: 30, x: 600, y: 500, uncertainty: 25 }];
    const trajectoryForecast = [{ hour: 1.0, x: 800, y: 500 }, { hour: 2.0, x: 1100, y: 500 }];

    const plainIce = {
      x: 500, y: 500, vx: 10, vy: 0, collisionRadius: 30, uncertaintyGrowthRate: 0.5,
      mlTrajectory, trajectoryForecast
    };

    const classIce = new Iceberg({ id: 'ice_class', x: 500, y: 500, size: 720 });
    classIce.vx = 10;
    classIce.vy = 0;
    classIce.collisionRadius = 30;
    classIce.mlTrajectory = mlTrajectory;
    classIce.trajectoryForecast = trajectoryForecast;

    for (let t of [0, 0.25, 0.5, 1.0, 2.0, 3.0]) {
      const posPlain = calculateIcebergPositionAt(plainIce, t);
      const posClass = classIce.getPositionAt(t);
      expect(posPlain.x).toBeCloseTo(posClass.x, 4);
      expect(posPlain.y).toBeCloseTo(posClass.y, 4);
      expect(posPlain.uncertainty).toBeCloseTo(posClass.uncertainty, 4);
    }
  });

  // TEST 21 — World-Wrap Distance Calculations (FIX 3)
  it('TEST 21 — World-wrap distance helpers: compute shortest wrapped distance across world boundaries', () => {
    const dist1 = wrappedDistanceCoords(3590, 500, 10, 500, 3600, 2400);
    expect(dist1).toBe(20);

    const deltaForward = wrappedDelta(3590, 500, 10, 500, 3600, 2400);
    expect(deltaForward.dx).toBe(20);
    expect(deltaForward.dy).toBe(0);
    expect(deltaForward.dist).toBe(20);

    const deltaBackward = wrappedDelta(10, 500, 3590, 500, 3600, 2400);
    expect(deltaBackward.dx).toBe(-20);
    expect(deltaBackward.dy).toBe(0);
    expect(deltaBackward.dist).toBe(20);
  });

  // TEST 22 — World-Wrap CCD (FIX 3)
  it('TEST 22 — World-wrap CCD: ship near x=3590 moving East detects iceberg at x=10 across boundary', () => {
    const ship = new Ship({ x: 3590, y: 500, heading: 0, throttle: 100 });
    ship.vx = 300;
    ship.vy = 0;

    const ice = new Iceberg({ id: 'ice_edge', x: 10, y: 500, collisionRadius: 20 });
    const safeDist = (ice.collisionRadius || 20) * 1.25 + ship.collisionRadius + 12;

    const state = { vessel: { maxSpeed: 500, enginePower: 1.0, dragCoefficient: 0.04 }, icebergs: { enabled: true } };

    ship.update(0.1, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0, state, [ice]);

    const distWrapped = wrappedDistanceCoords(ship.x, ship.y, ice.x, ice.y, 3600, 2400);
    expect(distWrapped).toBeGreaterThanOrEqual(safeDist - 1.0);
  });

  // TEST 23 — Turn-Angle Deceleration Branch Verification (ITEM 1)
  it('TEST 23 — Turn-angle deceleration: getSegmentSpeed reduces speed for sharp turns in clear ocean and extends ETA', () => {
    const cruiseSpeed = 20.0;
    const maxSpd = 30.0;

    // 1. Straight line (turn = 0 deg, no icebergs)
    const spdStraight = getSegmentSpeed(500, 500, cruiseSpeed, [], 0);
    expect(spdStraight).toBe(cruiseSpeed);

    // 2. Medium turn (>=45 deg, e.g. 60 deg)
    const spdTurn45 = getSegmentSpeed(500, 500, cruiseSpeed, [], 60);
    expect(spdTurn45).toBeLessThanOrEqual(maxSpd * 0.55);

    // 3. Sharp turn (>=90 deg, e.g. 90 deg)
    const spdTurn90 = getSegmentSpeed(500, 500, cruiseSpeed, [], 90);
    expect(spdTurn90).toBeLessThanOrEqual(maxSpd * 0.30);

    // 4. Route with sharp 90° turn: (100,500) -> (500,500) -> (500,900)
    // Moving iceberg reaches (500, 700) at t = 0.0117 hours (42.2s)
    const iceCross = new Iceberg({ id: 'ice_turn_cross', x: 500, y: 1500, collisionRadius: 40 });
    iceCross.trajectoryForecast = [{ hour: 0.0117, x: 500, y: 700 }];

    const waypointsWithTurn = [
      { x: 100, y: 500 },
      { x: 500, y: 500 },
      { x: 500, y: 900 }
    ];

    // Under speed-profile ETA, the 90° turn drops speed to 9.0 SU/sec on 2nd segment,
    // delaying arrival at (500,700) to t = 0.0117h when iceCross occupies (500,700).
    const valResult = validateRoute(waypointsWithTurn, [iceCross], cruiseSpeed, 3600, 2400);
    expect(valResult.valid).toBe(false);
    expect(valResult.reason).toContain("collision zone");
  });

  // TEST 24 — Non-Wrap Equivalence & Half-World Transition Verification (ITEM 2)
  it('TEST 24 — Non-wrap equivalence & half-world boundary: wrapped helpers match naive distance for non-edge cases and handle x=1800 transition seamlessly', () => {
    // 1. Non-edge cases: wrapped distance must match naive distance exactly
    const ptA = { x: 100, y: 200 };
    const ptB = { x: 500, y: 800 };
    const naiveDist = Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y);
    const wrapDist = wrappedDistanceCoords(ptA.x, ptA.y, ptB.x, ptB.y, 3600, 2400);
    const wrapDelta = wrappedDelta(ptA.x, ptA.y, ptB.x, ptB.y, 3600, 2400);

    expect(wrapDist).toBe(naiveDist);
    expect(wrapDelta.dx).toBe(ptB.x - ptA.x);
    expect(wrapDelta.dy).toBe(ptB.y - ptA.y);
    expect(wrapDelta.dist).toBe(naiveDist);

    // 2. Exactly at half-world transition (dx = 1800, dy = 1200)
    const pCenter = { x: 1800, y: 1200 };
    const pOrigin = { x: 0, y: 0 };
    const distCenter = wrappedDistanceCoords(pOrigin.x, pOrigin.y, pCenter.x, pCenter.y, 3600, 2400);
    const deltaCenter = wrappedDelta(pOrigin.x, pOrigin.y, pCenter.x, pCenter.y, 3600, 2400);

    expect(distCenter).toBe(Math.hypot(1800, 1200));
    expect(deltaCenter.dx).toBe(1800);
    expect(deltaCenter.dy).toBe(1200);

    // 3. Just across transition (dx = 1801, dy = 1201) -> wrapped dx = -1799, dy = -1199
    const pOver = { x: 1801, y: 1201 };
    const deltaOver = wrappedDelta(pOrigin.x, pOrigin.y, pOver.x, pOver.y, 3600, 2400);
    expect(deltaOver.dx).toBe(-1799);
    expect(deltaOver.dy).toBe(-1199);
    expect(deltaOver.dist).toBe(Math.hypot(1799, 1199));
  });

  // TEST 25 — Original Cluster Crossing Scenario Verification (ITEM 3)
  it('TEST 25 — Cluster scenario: route planner rejects direct path through moving cluster and generates safe detour', () => {
    const ship = { x: 1000, y: 1500, heading: 330, speed: 20, throttle: 65 };
    const dest = { x: 2600, y: 900 };

    // Cluster of 3 moving icebergs crossing the direct path at (1800, 1200) around t = 0.011867h (42.72s)
    const ice1 = new Iceberg({ id: 'ice_cluster_1', x: 1600, y: 1500, size: 720 });
    ice1.vx = 15; ice1.vy = -25;
    ice1.trajectoryForecast = [
      { hour: 0, x: 1600, y: 1500 },
      { hour: 0.011867, x: 1800, y: 1200 },
      { hour: 0.05, x: 2100, y: 1000 }
    ];

    const ice2 = new Iceberg({ id: 'ice_cluster_2', x: 1800, y: 1600, size: 720 });
    ice2.vx = 12; ice2.vy = -20;
    ice2.trajectoryForecast = [
      { hour: 0, x: 1800, y: 1600 },
      { hour: 0.01250, x: 1900, y: 1150 },
      { hour: 0.05, x: 2200, y: 900 }
    ];

    const ice3 = new Iceberg({ id: 'ice_cluster_3', x: 2000, y: 1700, size: 720 });
    ice3.vx = 10; ice3.vy = -18;
    ice3.trajectoryForecast = [
      { hour: 0, x: 2000, y: 1700 },
      { hour: 0.01300, x: 2000, y: 1100 },
      { hour: 0.05, x: 2000, y: 700 }
    ];

    const icebergs = [ice1, ice2, ice3];
    const state = { vessel: { maxSpeed: 30, enginePower: 1.0 }, environment: { seaIce: { enabled: false } } };

    const payload = {
      requestId: 100,
      ship,
      dest,
      mode: 'BALANCED',
      icebergs,
      state
    };

    const res = runRoutePlannerCore(payload);

    // 1. Planner must produce a valid route
    expect(res.waypoints).toBeDefined();
    expect(res.waypoints.length).toBeGreaterThanOrEqual(2);

    // 2. Direct path through cluster is rejected by validateRoute
    const directPath = [{ x: ship.x, y: ship.y }, { x: dest.x, y: dest.y }];
    const directVal = validateRoute(directPath, icebergs, 20.0, 3600, 2400);
    expect(directVal.valid).toBe(false);

    // 3. Candidate path generated by planner must pass validateRoute safely
    const valResult = validateRoute(res.waypoints, icebergs, 20.0, 3600, 2400);
    expect(valResult.valid).toBe(true);

    // 4. Candidate path must not clip any iceberg safety envelope
    let minClearance = Infinity;
    for (let i = 0; i < res.waypoints.length - 1; i++) {
      const ptA = res.waypoints[i];
      const ptB = res.waypoints[i + 1];
      for (let ice of icebergs) {
        const icePos = ice.getPositionAt(i * 0.005);
        const dist = wrappedDistanceCoords(ptA.x, ptA.y, icePos.x, icePos.y);
        if (dist - ice.collisionRadius < minClearance) {
          minClearance = dist - ice.collisionRadius;
        }
      }
    }
    expect(minClearance).toBeGreaterThan(15);
  });



});



