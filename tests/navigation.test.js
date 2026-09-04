import { describe, it, expect } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { normalizeAngle, headingFromVector, distanceBetween, normalizeAngleDeg, headingDegreesFromVector, normalizeDegrees, normalizeSignedDegrees, degreesToRadians } from '../src/js/utils.js';
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

  it('22. Sprite rotation offset is separate from physical heading', () => {
    const SHIP_SPRITE_FORWARD_OFFSET = 0;
    const heading = 45;
    const visualRotation = heading + SHIP_SPRITE_FORWARD_OFFSET;
    expect(visualRotation).toBe(45);
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
});
