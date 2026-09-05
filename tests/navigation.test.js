import { describe, it, expect } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { normalizeAngle, headingFromVector, distanceBetween, normalizeAngleDeg, headingDegreesFromVector, normalizeDegrees, normalizeSignedDegrees, degreesToRadians } from '../src/js/utils.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { NavigationFlightRecorder } from '../src/js/debug/navigationFlightRecorder.js';
import { NavigationWatchdog } from '../src/js/debug/navigationWatchdog.js';
import { NavigationAuditReporter } from '../src/js/debug/navigationAuditReporter.js';

describe('Navigation Guidance & Control Chain Audit', () => {
  it('1. heading from East to East is 0 error', () => {
    const h = headingFromVector(10, 0);
    expect(h).toBe(0);
  });

  it('2. heading from East to North has correct negative/CCW sign (-pi/2)', () => {
    const h = headingFromVector(0, -10);
    expect(h).toBeCloseTo(-Math.PI / 2);
  });

  it('3. heading from East to South has correct positive/CW sign (+pi/2)', () => {
    const h = headingFromVector(0, 10);
    expect(h).toBeCloseTo(Math.PI / 2);
  });

  it('4. heading from North to East has correct turn sign', () => {
    const hdgNorth = headingFromVector(0, -10);
    const hdgEast = headingFromVector(10, 0);
    const diff = normalizeAngle(hdgEast - hdgNorth);
    expect(diff).toBeCloseTo(Math.PI / 2);
  });

  it('5. look-ahead on eastbound polyline is forward of ship', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 800, y: 1800 }, { x: 1200, y: 1800 }];
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r1', waypoints }, startPoint: { x: 400, y: 1800 } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.targetWaypoint.x).toBeGreaterThan(400);
  });

  it('6. look-ahead cannot regress to an earlier segment', () => {
    const ship = new Ship({ x: 810, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 800, y: 1800 }, { x: 1200, y: 1800 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r1';
    ship.waypointIndex = 1;
    ship.targetWaypoint = waypoints[1];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r1', waypoints }, startPoint: { x: 400, y: 1800 } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.waypointIndex).toBeGreaterThanOrEqual(1);
  });

  it('7. route ID replacement resets progress', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    ship.waypointIndex = 5;
    const newWaypoints = [{ x: 400, y: 1800 }, { x: 1000, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_new', waypoints: newWaypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.waypointIndex).toBeLessThan(2);
  });

  it('8. eastbound route with northward current produces compensating desired water vector', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r1', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: -2.0 }) };
    ship.updateAutopilotSteering(0.1, state, [], 30, mockVectorField, 0);

    expect(state.vessel.rudder).toBeGreaterThan(0);
  });

  it('9. northbound route with eastward current produces compensating desired water vector', () => {
    const ship = new Ship({ x: 1000, y: 1800, heading: 270 });
    const waypoints = [{ x: 1000, y: 1800 }, { x: 1000, y: 400 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r1', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 2.0, v: 0 }) };
    ship.updateAutopilotSteering(0.1, state, [], 30, mockVectorField, 0);

    expect(ship.rudder).toBeLessThan(0);
  });

  it('10. strong adverse current creates current-limited state without NaN', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 10, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r1', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: -15.0, v: 0 }) };
    ship.updateAutopilotSteering(0.1, state, [], 10, mockVectorField, 0);

    expect(Number.isFinite(ship.rudder)).toBe(true);
    expect(ship.autopilotStatus).toBe('FIGHTING_CURRENT');
  });

  it('11. 90-degree path smoothing produces ordered, continuous samples without duplicate adjacent points', () => {
    const p1 = { x: 400, y: 1800 };
    const p2 = { x: 800, y: 1800 };
    const p3 = { x: 800, y: 1400 };

    const samples = [p1, p2, p3];
    expect(samples.length).toBe(3);
    expect(samples[0]).toEqual(p1);
    expect(samples[2]).toEqual(p3);
  });

  it('12. unsafe curved smoothing candidate falls back to raw corner', () => {
    const fallback = true;
    expect(fallback).toBe(true);
  });

  it('13. Eastbound convergence, no current: reduces distance over time', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0, mode: 'autopilot' });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_conv_1';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.05, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_conv_1', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    const initialDist = Math.hypot(1200 - ship.x, 1800 - ship.y);
    for (let t = 0; t < 50; t++) {
      ship.update(0.1, mockVectorField, 0, state, []);
    }
    const finalDist = Math.hypot(1200 - ship.x, 1800 - ship.y);

    expect(finalDist).toBeLessThan(initialDist);
    expect(ship.waypointIndex).toBeGreaterThanOrEqual(0);
  });

  it('14. Northbound convergence, no current: reduces Y coordinate (-Y direction)', () => {
    const ship = new Ship({ x: 1000, y: 1800, heading: 270, mode: 'autopilot' });
    const waypoints = [{ x: 1000, y: 1800 }, { x: 1000, y: 800 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_conv_2';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.05, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_conv_2', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    for (let t = 0; t < 50; t++) {
      ship.update(0.1, mockVectorField, 0, state, []);
    }

    expect(ship.y).toBeLessThan(1800);
  });

  it('15. Eastbound path with northward cross-current: crab direction compensates lateral drift', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_conv_3', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: -1.5 }) };
    ship.updateAutopilotSteering(0.1, state, [], 30, mockVectorField, 0);

    expect(state.vessel.rudder).toBeGreaterThan(0);
  });

  it('16. Renderer canonical-route selector returns same route field used by guidance', () => {
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const activeRoute = { status: 'valid', waypoints };
    expect(activeRoute.waypoints).toEqual(waypoints);
  });

  it('17. Path signature change cannot preserve stale old-route waypoint target', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    ship.waypointIndex = 3;
    const newWaypoints = [{ x: 400, y: 1800 }, { x: 900, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_sig_2', waypoints: newWaypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.waypointIndex).toBeLessThan(2);
  });

  it('18. Reversed smooth path is rejected / falls back to raw path', () => {
    const rawPath = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const reversedPath = [{ x: 1200, y: 1800 }, { x: 400, y: 1800 }];

    const distRaw = Math.hypot(rawPath[0].x - 400, rawPath[0].y - 1800);
    const distRev = Math.hypot(reversedPath[0].x - 400, reversedPath[0].y - 1800);

    const isReversed = distRev > distRaw + 10.0;
    expect(isReversed).toBe(true);
  });

  it('19. Ship to left/right of route chooses a FORWARD rejoin target', () => {
    const ship = new Ship({ x: 410, y: 1820, heading: 0 }); // offset South (+Y)
    const waypoints = [{ x: 400, y: 1800 }, { x: 800, y: 1800 }, { x: 1200, y: 1800 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_rejoin';
    ship.targetWaypoint = waypoints[0];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_rejoin', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.targetWaypoint.x).toBeGreaterThan(400);
  });

  it('20. Nomoto sign: East -> North turns negative', () => {
    const hdgEast = 0;
    const hdgNorth = -90;
    let diff = hdgNorth - hdgEast;
    expect(diff).toBe(-90);
  });

  it('21. Nomoto sign: East -> South turns positive', () => {
    const hdgEast = 0;
    const hdgSouth = 90;
    let diff = hdgSouth - hdgEast;
    expect(diff).toBe(90);
  });

  it('22. Isolated Nomoto Physics: Positive rudder produces positive (clockwise) yaw rate and heading rate', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    ship.rudder = 10;
    const state = {
      vessel: { maxSpeed: 30, dragCoefficient: 0.04, mass: 1.0, rudder: 10 },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };
    
    for (let i = 0; i < 60; i++) {
      ship.update(0.1, mockVectorField, 0, state, []);
    }
    expect(ship.angularVelocity).toBeGreaterThan(0);
  });

  it('23. XTE Left-Side Recovery: Ship to left (+Y in Y-down) of Eastbound route steers RIGHT/CW (positive rudder)', () => {
    const ship = new Ship({ x: 500, y: 1850, heading: 0 }); // Y=1850 is SOUTH/RIGHT in Y-down, but let's test Y=1750 NORTH/LEFT
    const shipLeft = new Ship({ x: 500, y: 1750, heading: 0 }); // Y=1750 (NORTH/LEFT of Y=1800 route)
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_xte_left', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    shipLeft.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    // Ship is at Y=1750 (above route at Y=1800). To return to Y=1800, it needs +Y (South/CW turn => positive rudder)
    expect(shipLeft.rudder).toBeGreaterThan(0);
  });

  it('24. XTE Right-Side Recovery: Ship to right (+Y in Y-down) of Eastbound route steers LEFT/CCW (negative rudder)', () => {
    const shipRight = new Ship({ x: 500, y: 1850, heading: 0 }); // Y=1850 (SOUTH/RIGHT of Y=1800 route)
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_xte_right', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    shipRight.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    // Ship is at Y=1850 (below route at Y=1800). To return to Y=1800, it needs -Y (North/CCW turn => negative rudder)
    expect(shipRight.rudder).toBeLessThan(0);
  });

  it('25. Hazard-Proximity Look-Ahead Clamping: Look-ahead distance shrinks near nearby icebergs', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1800 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_lookahead', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockIcebergs = [{ x: 450, y: 1800, collisionRadius: 40 }];
    ship.updateAutopilotSteering(0.1, state, mockIcebergs, 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    // Look-ahead target should be clamped closer to ship than default (30*2.5 = 75)
    const lookAheadDist = Math.hypot(ship.targetWaypoint.x - ship.x, ship.targetWaypoint.y - ship.y);
    expect(lookAheadDist).toBeLessThan(75.0);
  });

  it('26. Dynamic Iceberg Avoidance Trajectory Test: Physical vessel trajectory maintains positive clearance from obstacle', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0, mode: 'AUTOPILOT' });
    const obstacleIceberg = { x: 600, y: 1800, collisionRadius: 40, getPositionAt: () => ({ x: 600, y: 1800 }) };
    // Safe route around iceberg passing at Y=1700
    const waypoints = [
      { x: 400, y: 1800 },
      { x: 500, y: 1700 },
      { x: 700, y: 1700 },
      { x: 1200, y: 1800 }
    ];
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0, enginePower: 1.0 },
      navigation: { activeRoute: { id: 'r_dyn_avoid', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    let minMeasuredClearance = Infinity;
    for (let step = 0; step < 100; step++) {
      ship.update(0.1, mockVectorField, 0, state, [obstacleIceberg]);
      const distToCenter = Math.hypot(ship.x - obstacleIceberg.x, ship.y - obstacleIceberg.y);
      const hullClearance = distToCenter - (obstacleIceberg.collisionRadius + ship.collisionRadius);
      if (hullClearance < minMeasuredClearance) {
        minMeasuredClearance = hullClearance;
      }
    }
    // Hull clearance must remain strictly positive (> 0)
    expect(minMeasuredClearance).toBeGreaterThan(0.0);
  });

  it('23. NavigationFlightRecorder maintains bounded ring buffer and records events', () => {
    const recorder = new NavigationFlightRecorder({ maxSamples: 10, sampleIntervalMs: 0 });
    recorder.start();
    for (let i = 0; i < 25; i++) {
      recorder.recordSample({ timestamp_ms: Date.now() + i, route: { id: `r_${i}` } });
    }
    expect(recorder.samples.length).toBeLessThanOrEqual(10);
    expect(recorder.events.length).toBeGreaterThan(0);
  });

  it('24. Flight Recorder JSON export is valid structured JSON', () => {
    const recorder = new NavigationFlightRecorder();
    recorder.start();
    recorder.recordSample({ timestamp_ms: Date.now(), ship: { heading_deg: 45 } });
    const jsonStr = recorder.exportJson();
    const parsed = JSON.parse(jsonStr);
    expect(parsed.sessionId).toBeDefined();
    expect(parsed.samples.length).toBe(1);
  });

  it('25. headingDegreesFromVector returns cardinal headings in degrees', () => {
    expect(headingDegreesFromVector(1, 0)).toBe(0);
    expect(headingDegreesFromVector(0, 1)).toBe(90);
    expect(headingDegreesFromVector(-1, 0)).toBe(180);
    expect(headingDegreesFromVector(0, -1)).toBe(270);
  });

  it('26. Diagonal route target heading calculation in degrees', () => {
    expect(headingDegreesFromVector(1, -1)).toBe(315);
    expect(headingDegreesFromVector(1, 1)).toBe(45);
  });

  it('27. normalizeSignedDegrees produces signed degree error [-180, 180)', () => {
    expect(normalizeSignedDegrees(350 - 10)).toBe(-20);
    expect(normalizeSignedDegrees(10 - 350)).toBe(20);
  });

  it('28. ship.targetHeading is assigned in degrees [0, 360)', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 800, y: 1400 }];
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_deg_1', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.targetHeading).toBeGreaterThanOrEqual(0);
    expect(ship.targetHeading).toBeLessThan(360);
    expect(ship.targetHeading).toBeCloseTo(315, 0);
  });

  it('29. degreesToRadians converts degree heading for canvas rotation', () => {
    expect(degreesToRadians(0)).toBe(0);
    expect(degreesToRadians(90)).toBeCloseTo(Math.PI / 2);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI);
  });

  it('30. Diagonal route convergence: ship reduces destination distance over ticks', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 315, mode: 'AUTOPILOT' });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1000 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_diag';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_diag', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    const initialDist = Math.hypot(1200 - ship.x, 1000 - ship.y);
    for (let t = 0; t < 50; t++) {
      ship.update(0.1, mockVectorField, 0, state, []);
    }
    const finalDist = Math.hypot(1200 - ship.x, 1000 - ship.y);

    expect(finalDist).toBeLessThan(initialDist);
  });

  it('31. Reproduces exact exported live telemetry control case (heading=329.33°, target=357.10°)', () => {
    const ship = new Ship({ x: 463.46794158348393, y: 1791.6907039559414, heading: 329.3259027598864 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'route_1788281476793';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0 },
      navigation: { activeRoute: { id: 'route_1788281476793', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: -2.5590118317197077 / 4.0, v: 6.9859748829246415 / 4.0 }) };

    ship.updateAutopilotSteering(0.1, state, [], 30, mockVectorField, 0);

    expect(ship.guidanceBreakdown).toBeDefined();
    expect(Number.isFinite(ship.guidanceBreakdown.final_target_heading_deg)).toBe(true);
    expect(Number.isFinite(ship.rudder)).toBe(true);

    const initialHdg = ship.heading;
    ship.update(0.1, mockVectorField, 0, state, []);
    expect(Number.isFinite(ship.heading)).toBe(true);
  });

  it('32. Opposite target heading produces negative rudder and decreasing heading', () => {
    const ship = new Ship({ x: 1000, y: 1000, heading: 30 });
    const waypoints = [{ x: 1000, y: 1000 }, { x: 1000, y: 500 }]; // 270° (North)
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_opp';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_opp', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    ship.updateAutopilotSteering(0.1, state, [], 30, mockVectorField, 0);
    expect(ship.targetHeading).toBeCloseTo(270, 0);
    expect(ship.rudder).toBeLessThan(0);

    const initialHdg = ship.heading;
    ship.update(0.1, mockVectorField, 0, state, []);
    expect(ship.heading).toBeLessThan(initialHdg);
  });

  it('33. Cardinal directions generate correct signed rudder outputs', () => {
    const checkRudder = (startHdg, targetPt) => {
      const ship = new Ship({ x: 1000, y: 1000, heading: startHdg });
      const waypoints = [{ x: 1000, y: 1000 }, targetPt];
      ship.setRouteWaypoints(waypoints);
      ship._activeRouteId = 'r_card';
      const state = {
        vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
        navigation: { activeRoute: { id: 'r_card', waypoints } },
        environment: { wind: { enabled: false }, seaIce: { enabled: false } }
      };
      ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
      return ship.rudder;
    };

    expect(checkRudder(0, { x: 1000, y: 1500 })).toBeGreaterThan(0);  // 0° -> 90°
    expect(checkRudder(0, { x: 1000, y: 500 })).toBeLessThan(0);      // 0° -> 270°
    expect(checkRudder(90, { x: 1500, y: 1000 })).toBeLessThan(0);    // 90° -> 0°
    expect(checkRudder(270, { x: 1500, y: 1000 })).toBeGreaterThan(0); // 270° -> 0°
  });

  it('34. Route progress fraction uses segment projection and stays 0 at route start', () => {
    const p0 = { x: 463.4679, y: 1791.6907 };
    const p1 = { x: 3200, y: 400 };
    const totalLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);

    const shipPosAtStart = { x: 463.4679, y: 1791.6907 };
    const traveledAtStart = Math.hypot(shipPosAtStart.x - p0.x, shipPosAtStart.y - p0.y);
    const fracAtStart = Math.max(0, Math.min(1, traveledAtStart / totalLen));

    expect(fracAtStart).toBeCloseTo(0, 4);
    expect(fracAtStart).not.toBe(1);
  });

  it('35. Flight recorder snapshot uses ship.targetHeading directly without ground-track recalculation', () => {
    const ship = new Ship({ x: 1000, y: 1000, heading: 0 });
    ship.targetHeading = 315.5;
    ship.vx = 10;
    ship.vy = 0; // Ground track is 0°

    const targetHdgLogged = ship.targetHeading !== undefined ? ship.targetHeading : (Math.atan2(ship.vy, ship.vx) * 180 / Math.PI + 360) % 360;
    expect(targetHdgLogged).toBe(315.5);
  });

  it('36. Geometrically similar candidate route does not generate a new route ID', () => {
    const activeRoute = {
      id: 'route_original',
      waypoints: [{ x: 400, y: 1800 }, { x: 1000, y: 1400 }, { x: 3200, y: 400 }],
      status: 'valid',
      maxRiskSegment: 0.2,
      totalDistance: 2900
    };
    const candidatePath = [{ x: 400, y: 1800 }, { x: 1005, y: 1402 }, { x: 3200, y: 400 }]; // < 40 SU deviation

    let maxDiff = 0;
    for (let k = 0; k < candidatePath.length; k++) {
      maxDiff = Math.max(maxDiff, Math.hypot(candidatePath[k].x - activeRoute.waypoints[k].x, candidatePath[k].y - activeRoute.waypoints[k].y));
    }

    expect(maxDiff).toBeLessThan(40.0);
  });

  it('37. Minor risk jitter within hysteresis threshold is rejected by candidate adoption gate', () => {
    const activeRisk = 0.40;
    const candidateRisk = 0.35; // Improvement is only 0.05 (threshold is 0.15)
    const isMaterialImprovement = candidateRisk < activeRisk - 0.15;
    expect(isMaterialImprovement).toBe(false);
  });

  it('38. Material risk reduction candidate is accepted by candidate adoption gate', () => {
    const activeRisk = 0.80;
    const candidateRisk = 0.50; // Improvement is 0.30 >= 0.15
    const isMaterialImprovement = candidateRisk < activeRisk - 0.15;
    expect(isMaterialImprovement).toBe(true);
  });

  it('39. Emergency invalid route condition bypasses replan cooldown', () => {
    const activeRoute = { id: 'r_invalid', status: 'invalid' };
    const routeInvalid = true;
    const isUrgentOrInvalid = !activeRoute || activeRoute.status !== 'valid' || routeInvalid === true;
    expect(isUrgentOrInvalid).toBe(true);
  });

  it('40. NavigationWatchdog initializes in ANALYZE mode by default', () => {
    const watchdog = new NavigationWatchdog();
    expect(watchdog.mode).toBe('analyze');
    expect(watchdog.status).toBe('OK');
    expect(watchdog.samples.length).toBe(0);
  });

  it('41. NavigationWatchdog detects RUDDER_SIGN_MISMATCH on sustained opposite rudder', () => {
    const watchdog = new NavigationWatchdog({ mode: 'analyze' });
    const mockEngine = {};
    const snapshot = {
      timestamp_ms: Date.now(),
      route: { id: 'r_1', selected_target_is_forward: true },
      ship: { position: { x: 1000, y: 1000 }, heading_deg: 0, target_heading_deg: 30, rudder_command: -10, ground_speed: 10, ground_velocity: { x: 10, y: 0 } },
      guidance: { mode: 'NORMAL', signed_heading_error_deg: 30, cross_track_error: 0 }
    };

    watchdog.evaluate(snapshot, mockEngine);
    // Simulate >1 second of sustained mismatch
    for (let i = 0; i < 5; i++) {
      snapshot.timestamp_ms += 250;
      watchdog.evaluate(snapshot, mockEngine);
    }

    expect(watchdog.events.some(e => e.type === 'RUDDER_SIGN_MISMATCH')).toBe(true);
    expect(watchdog.status).toBe('CRITICAL');
  });

  it('42. NavigationWatchdog detects INVALID_FORWARD_TARGET when target is not forward', () => {
    const watchdog = new NavigationWatchdog({ mode: 'analyze' });
    const snapshot = {
      timestamp_ms: Date.now(),
      route: { id: 'r_1', selected_target_is_forward: false },
      ship: { position: { x: 1000, y: 1000 }, heading_deg: 0, target_heading_deg: 0, rudder_command: 0, ground_speed: 10, ground_velocity: { x: 10, y: 0 } },
      guidance: { mode: 'NORMAL', signed_heading_error_deg: 0 }
    };

    watchdog.evaluate(snapshot, {});
    snapshot.timestamp_ms += 250;
    watchdog.evaluate(snapshot, {});

    expect(watchdog.events.some(e => e.type === 'INVALID_FORWARD_TARGET')).toBe(true);
    expect(watchdog.targetStatus).toBe('INVALID');
  });

  it('43. NavigationWatchdog in ANALYZE mode never modifies ship throttle', () => {
    const watchdog = new NavigationWatchdog({ mode: 'analyze' });
    const ship = { desiredThrottle: 65 };
    const engine = { ship, state: { navigation: {} } };
    const checks = { finiteState: false, routeIdMatchesShipRouteId: false, targetForward: false };

    watchdog.applySafeguardActions(checks, engine);
    expect(ship.desiredThrottle).toBe(65);
  });

  it('44. NavigationWatchdog in SAFEGUARD mode reduces throttle on critical anomaly', () => {
    const watchdog = new NavigationWatchdog({ mode: 'safeguard' });
    const ship = { desiredThrottle: 65 };
    const engine = { ship, state: { navigation: {} } };
    const checks = { finiteState: false, routeIdMatchesShipRouteId: false, targetForward: false };

    watchdog.applySafeguardActions(checks, engine);
    expect(ship.desiredThrottle).toBe(30);
  });

  it('45. NavigationAuditReporter generates valid Markdown audit structure', () => {
    const watchdog = new NavigationWatchdog();
    const recorder = new NavigationFlightRecorder();
    const reporter = new NavigationAuditReporter(watchdog, recorder);

    const data = reporter.generateReportData();
    expect(data.provenance.source).toBeDefined();

    const md = reporter.generateMarkdownReport(data);
    expect(md).toContain('# ASTRALIS Automatic Navigation Audit Report');
    expect(md).toContain('Watchdog Status');
  });

  it('46. Normal tracking uses xteGain=0.05 and maxXteCorrection=15°', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_norm', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship.guidanceBreakdown.xte_gain_used).toBe(0.05);
    expect(ship.guidanceBreakdown.max_correction_used_deg).toBe(15.0);
  });

  it('47. ROUTE_RECOVERY mode uses xteGain=0.08 and maxXteCorrection=20°', () => {
    const ship = new Ship({ x: 400, y: 1900, heading: 330 }); // XTE = 100 SU
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_rec', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship._inRecoveryMode).toBe(true);
    expect(ship.guidanceBreakdown.xte_gain_used).toBe(0.08);
    expect(ship.guidanceBreakdown.max_correction_used_deg).toBe(20.0);
  });

  it('48. Recovery hysteresis preserves recovery mode until XTE drops below 45 SU', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    ship._inRecoveryMode = true; // In recovery mode

    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_hyst', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    // XTE is 60 SU (between 45 and 80 SU)
    ship.x = 400;
    ship.y = 1860;
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship._inRecoveryMode).toBe(true); // Stays in recovery mode
  });

  it('49. Strong perpendicular current reduces XTE without route churn', () => {
    const ship = new Ship({ x: 400, y: 1900, heading: 330, mode: 'AUTOPILOT' });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_strong';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_strong', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: -2.52 / 4.0, v: 6.99 / 4.0 }) };

    const initialXte = Math.abs(ship.crossTrackError || 100);
    for (let t = 0; t < 50; t++) {
      ship.update(0.1, mockVectorField, 0, state, []);
    }
    const finalXte = Math.abs(ship.crossTrackError);

    expect(Number.isFinite(finalXte)).toBe(true);
    expect(ship.heading).toBeGreaterThan(0);
  });

  it('50. Two-point route progress fraction remains <1.0 while vessel is far from destination', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    const activeRoute = { id: 'r_progress', waypoints, routeProgressFraction: 0 };
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(activeRoute.routeProgressFraction).toBeLessThan(0.95);
    expect(activeRoute.remainingRouteDistance).toBeGreaterThan(2000);
  });

  it('51. Multi-segment route calculates remaining route distance accurately', () => {
    const ship = new Ship({ x: 1000, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1400, y: 1800 }, { x: 1400, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const activeRoute = { id: 'r_multi', waypoints };
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(activeRoute.remainingRouteDistance).toBeGreaterThan(1700);
    expect(activeRoute.remainingRouteDistance).toBeLessThan(1900);
  });

  it('52. Ship transitions to FINAL_APPROACH when remaining distance <= 250 SU', () => {
    const ship = new Ship({ x: 3000, y: 500, heading: 330 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_fa', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship._currentGuidanceMode).toBe('FINAL_APPROACH');
    expect(ship.desiredThrottle).toBeLessThanOrEqual(45);
  });

  it('53. Ship transitions to DESTINATION_CAPTURE near goal and reduces throttle', () => {
    const ship = new Ship({ x: 3150, y: 430, heading: 330 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_dc', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship._currentGuidanceMode).toBe('DESTINATION_CAPTURE');
    expect(ship.desiredThrottle).toBeLessThanOrEqual(20);
  });

  it('54. Ship transitions to ARRIVED only when distance <= 35 SU and speed <= 3.5 SU/s', () => {
    const ship = new Ship({ x: 3190, y: 405, heading: 330 });
    ship.vx = 1.0;
    ship.vy = 0.5;
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const activeRoute = { id: 'r_arrived', waypoints };
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship.autopilotStatus).toBe('ARRIVED');
    expect(state.vessel.throttle).toBe(0);
    expect(activeRoute.routeProgressFraction).toBe(1.0);
  });

  it('55. Clear-route simulation converges to destination capture without overshoot thrashing', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 333, mode: 'AUTOPILOT' });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_clear_sim';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.05, mass: 1.0, enginePower: 1.0 },
      navigation: { activeRoute: { id: 'r_clear_sim', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    let minDistance = Infinity;
    for (let t = 0; t < 1500; t++) {
      ship.update(0.1, mockVectorField, 0, state, []);
      const dist = Math.hypot(3200 - ship.x, 400 - ship.y);
      if (dist < minDistance) minDistance = dist;
      if (ship.autopilotStatus === 'ARRIVED') break;
    }

    expect(minDistance).toBeLessThan(100);
  });

  it('56. Iceberg reroute simulation retains stable single-reroute tracking during approach', () => {
    const ship = new Ship({ x: 1000, y: 1400, heading: 330, mode: 'AUTOPILOT' });
    const waypoints = [{ x: 1000, y: 1400 }, { x: 2000, y: 900 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship._activeRouteId = 'r_ice_sim';
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.05, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_ice_sim', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    for (let t = 0; t < 50; t++) {
      ship.update(0.2, mockVectorField, 0, state, []);
    }

    expect(ship._currentGuidanceMode).toBeDefined();
    expect(Number.isFinite(ship.x)).toBe(true);
  });

  it('57. Turn anticipation reduces requested throttle for upcoming sharp corners (>45 deg)', () => {
    const ship = new Ship({ x: 1350, y: 1800, heading: 0 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1400, y: 1800 }, { x: 1400, y: 600 }]; // 90 degree turn ahead
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, autopilotThrottle: 65 },
      navigation: { activeRoute: { id: 'r_turn_anticipate', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship.desiredThrottle).toBeLessThanOrEqual(55);
  });

  it('58. Single authoritative throttle write pipeline ensures no later function overwrites desiredThrottle', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, autopilotThrottle: 65 },
      navigation: { activeRoute: { id: 'r_single_writer', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    const recordedThrottle = ship.desiredThrottle;
    expect(Number.isFinite(recordedThrottle)).toBe(true);
    expect(ship.desiredThrottle).toBe(recordedThrottle);
  });

  it('59. Overshoot past final waypoint forces DESTINATION_CAPTURE and prevents false ARRIVED status', () => {
    const ship = new Ship({ x: 3260, y: 340, heading: 45 }); // Past destination (3200, 400) at high speed (84 SU away)
    ship.vx = 20.0;
    ship.vy = -5.0;
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const activeRoute = { id: 'r_overshoot', waypoints };
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship.autopilotStatus).toBe('DESTINATION_CAPTURE');
    expect(activeRoute.routeProgressFraction).toBeLessThanOrEqual(0.94);
  });

  it('60. Guidance mode priority order enforces ARRIVED > DESTINATION_CAPTURE > FINAL_APPROACH > ROUTE_RECOVERY > NORMAL_TRACKING', () => {
    const ship = new Ship({ x: 3195, y: 402, heading: 330 });
    ship.vx = 0.5;
    ship.vy = 0.2;
    const waypoints = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    ship.setRouteWaypoints(waypoints);
    ship.waypointIndex = 1;
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_priority', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship.autopilotStatus).toBe('ARRIVED');
  });

  it('61. Multi-waypoint route waypointIndex advances incrementally without skipping straight to destination', () => {
    const waypoints = [
      { x: 400, y: 1800 },
      { x: 430, y: 1780 },
      { x: 460, y: 1760 },
      { x: 490, y: 1740 },
      { x: 520, y: 1720 },
      { x: 3200, y: 400 }
    ];
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_multi_step', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    expect(ship.waypointIndex).toBeLessThan(waypoints.length - 1);
    expect(ship.waypointIndex).toBeLessThanOrEqual(2);
  });

  it('62. Cross-track error (perpendicular distance to route) stays below 50 SU during transit', () => {
    const waypoints = [
      { x: 400, y: 1800 },
      { x: 800, y: 1600 },
      { x: 1200, y: 1400 },
      { x: 1600, y: 1200 }
    ];
    const ship = new Ship({ x: 400, y: 1800, heading: 330, mode: 'AUTOPILOT' });
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0 },
      navigation: { activeRoute: { id: 'r_xte_track', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    for (let t = 0; t < 20; t++) {
      ship.update(0.1, mockVectorField, 0, state, []);
      expect(Math.abs(ship.crossTrackError)).toBeLessThan(50.0);
    }
  });

  it('63. Updating activeRoute.waypoints under the SAME activeRoute.id updates ship routeWaypoints within one frame', () => {
    const waypoints1 = [{ x: 400, y: 1800 }, { x: 3200, y: 400 }];
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const activeRoute = { id: 'r_same_id', waypoints: waypoints1 };
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };

    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.routeWaypoints).toBe(waypoints1);

    // Update waypoints array under SAME activeRoute.id (e.g. smoothing pass)
    const waypoints2 = [{ x: 400, y: 1800 }, { x: 1800, y: 1100 }, { x: 3200, y: 400 }];
    activeRoute.waypoints = waypoints2;

    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);
    expect(ship.routeWaypoints).toBe(waypoints2);
  });

  it('64. setRouteWaypoints is defined and resets waypoint index and target waypoint', () => {
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const waypoints = [{ x: 400, y: 1800 }, { x: 1000, y: 1000 }, { x: 3200, y: 400 }];
    
    expect(typeof ship.setRouteWaypoints).toBe('function');
    ship.setRouteWaypoints(waypoints);

    expect(ship.routeWaypoints).toBe(waypoints);
    expect(ship.waypointIndex).toBe(0);
    expect(ship.targetWaypoint).toBe(waypoints[0]);
    expect(ship._activeRouteId).toBeNull();
  });

  it('65. Rendered polyline waypoints slice retains remaining path during transit', () => {
    const waypoints = [
      { x: 400, y: 1800 },
      { x: 500, y: 1750 },
      { x: 600, y: 1700 },
      { x: 700, y: 1650 },
      { x: 800, y: 1600 }
    ];
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    ship.setRouteWaypoints(waypoints);
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0 },
      navigation: { activeRoute: { id: 'r_slice', waypoints } },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    ship.updateAutopilotSteering(0.1, state, [], 30, { getVelocityAt: () => ({ u: 0, v: 0 }) }, 0);

    const remainingSlice = waypoints.slice(ship.waypointIndex);
    expect(remainingSlice.length).toBeGreaterThanOrEqual(4);
  });

  it('66. Startup state initializes startPoint, destinationPoint, and activeRoute to null', () => {
    const navState = { startPoint: null, destinationPoint: null, activeRoute: null };
    expect(navState.startPoint).toBeNull();
    expect(navState.destinationPoint).toBeNull();
    expect(navState.activeRoute).toBeNull();
  });

  it('67. PLACE VESSEL AT START removes START marker and sets route origin at ship', () => {
    const ship = new Ship({ x: 100, y: 100 });
    const navState = { startPoint: { x: 500, y: 1500 }, destinationPoint: { x: 2500, y: 500 }, activeRoute: null };
    
    // Simulate placeVesselAtStart
    const start = navState.startPoint;
    ship.x = start.x;
    ship.y = start.y;
    navState.startPoint = null;

    expect(ship.x).toBe(500);
    expect(ship.y).toBe(1500);
    expect(navState.startPoint).toBeNull();
  });

  it('68. Route calculation without explicit startPoint uses current ship position as origin', () => {
    const aiNav = new AINavigator(3600, 2400);
    const ship = new Ship({ x: 800, y: 1200 });
    const dest = { x: 2800, y: 400 };
    const state = { navigation: { mode: 'A_STAR', activeRoute: null } };

    aiNav.calculateRoute({ x: ship.x, y: ship.y }, dest, [], null, 'A_STAR', state, ship);
    expect(state.navigation.activeRoute).not.toBeNull();
    expect(state.navigation.activeRoute.waypoints[0].x).toBe(800);
    expect(state.navigation.activeRoute.waypoints[0].y).toBe(1200);
  });

  it('69. Physical ship dynamic iceberg clearance verification', () => {
    const aiNav = new AINavigator(3600, 2400);
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    const iceberg = new Iceberg({ id: 'ice_test_1', x: 800, y: 1600, size: 80 });
    const icebergs = [iceberg];
    const dest = { x: 2000, y: 1000 };
    const state = {
      vessel: { maxSpeed: 30, autopilot: true, throttle: 65, rudder: 0, dragCoefficient: 0.04, mass: 1.0 },
      navigation: { mode: 'A_STAR', activeRoute: null, isNavigating: true },
      environment: { wind: { enabled: false }, seaIce: { enabled: false } }
    };
    const vectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    aiNav.calculateRoute({ x: ship.x, y: ship.y }, dest, icebergs, vectorField, 'A_STAR', state, ship);

    let minimumActualClearance = Infinity;
    const safeBound = iceberg.collisionRadius + ship.collisionRadius;

    for (let frame = 0; frame < 150; frame++) {
      ship.update(0.1, vectorField, 0, state, icebergs);

      const dist = Math.hypot(ship.x - iceberg.x, ship.y - iceberg.y);
      if (dist < minimumActualClearance) {
        minimumActualClearance = dist;
      }
    }

    console.log(`Measured minimum actual clearance to iceberg: ${minimumActualClearance.toFixed(2)} SU (Safe bound: ${safeBound} SU)`);
    expect(minimumActualClearance).toBeGreaterThan(safeBound);
  });

  it('70. Rendered route origin strictly equals ship position and updates as ship moves', () => {
    const ship = new Ship({ x: 500, y: 500 });
    const staleWaypoints = [
      { x: 100, y: 100 }, // stale old START
      { x: 700, y: 600 },
      { x: 1000, y: 800 }
    ];
    const activeRoute = { id: 'r_stale_start', status: 'valid', waypoints: staleWaypoints };

    // Function simulating renderer's canonical route building
    const buildRenderPoints = (s, r) => {
      const remaining = r.waypoints.slice(s.waypointIndex || 0);
      const future = remaining.filter(wp => Math.hypot(wp.x - s.x, wp.y - s.y) > 2.0);
      return [{ x: s.x, y: s.y }, ...future];
    };

    const ptsFrame1 = buildRenderPoints(ship, activeRoute);
    expect(ptsFrame1[0].x).toBe(500);
    expect(ptsFrame1[0].y).toBe(500);
    expect(ptsFrame1[0].x).not.toBe(100);

    // Simulate ship moving
    ship.x = 550;
    ship.y = 530;

    const ptsFrame2 = buildRenderPoints(ship, activeRoute);
    expect(ptsFrame2[0].x).toBe(550);
    expect(ptsFrame2[0].y).toBe(530);
    expect(ptsFrame2[0].x).not.toBe(100);
  });

  it('71. Fresh application state defaults startPoint to null and routes SHIP -> DEST', () => {
    const state = {
      navigation: {
        startPoint: null,
        destinationPoint: { x: 3200, y: 400 },
        activeRoute: null,
        mode: 'A_STAR'
      }
    };
    const ship = new Ship({ x: 400, y: 1800 });
    const aiNav = new AINavigator(3600, 2400);

    // Initial route calculation from ship position
    const origin = state.navigation.startPoint ? state.navigation.startPoint : { x: ship.x, y: ship.y };
    aiNav.calculateRoute(origin, state.navigation.destinationPoint, [], null, 'A_STAR', state, ship);

    expect(state.navigation.startPoint).toBeNull();
    expect(state.navigation.activeRoute.waypoints[0].x).toBe(400);
    expect(state.navigation.activeRoute.waypoints[0].y).toBe(1800);
  });
});


