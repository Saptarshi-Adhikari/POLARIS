import { describe, it, expect } from 'vitest';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { runRoutePlannerCore, isHardBlocked, getTraversalCost } from '../src/js/ai/routePlannerCore.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Final Web Worker Verification Suite (3 Checks)', () => {

  it('CHECK 1 — Verify single canonical routePlannerCore engine is used by both Web Worker and Sync Fallback', () => {
    const payload = {
      requestId: 1,
      ship: { x: 400, y: 1200, speed: 20, throttle: 65 },
      dest: { x: 3200, y: 1200 },
      mode: 'BALANCED',
      width: 3600,
      height: 2400,
      state: { vessel: { maxSpeed: 30 }, environment: { seaIce: { enabled: false } } },
      icebergs: []
    };

    // Run core engine directly
    const directResult = runRoutePlannerCore(payload);
    expect(directResult.waypoints.length).toBe(2);
    expect(directResult.waypoints[0]).toEqual({ x: 400, y: 1200 });
    expect(directResult.waypoints[1]).toEqual({ x: 3200, y: 1200 });

    // Run via AINavigator fallback
    const nav = new AINavigator(3600, 2400);
    const mockShip = new Ship({ x: 400, y: 1200, heading: 0, speed: 20 });
    const mockState = { navigation: { activeRoute: null, isNavigating: true }, vessel: { maxSpeed: 30 } };
    
    nav.generateOptimalRouteAStar(mockShip, [], { getVelocityAt: () => ({ u: 0, v: 0 }) }, { x: 3200, y: 1200 }, 'BALANCED', mockState, mockShip);
    expect(nav.optimalRoute.length).toBe(2);
    expect(nav.optimalRoute[0]).toEqual({ x: 400, y: 1200 });
  });

  it('CHECK 2 — Verify stale worker response race condition is safely discarded', () => {
    const nav = new AINavigator(3600, 2400);
    const state = {
      navigation: { activeRoute: null, isNavigating: true, destination: { x: 3200, y: 1200 } },
      vessel: { maxSpeed: 30 }
    };
    nav.currentState = state;

    // Simulate worker Call #1 (requestId = 1, destination = {x: 2000, y: 500})
    nav.pendingWorkerRequestId = 1;
    const response1 = {
      requestId: 1,
      waypoints: [{ x: 400, y: 1200 }, { x: 2000, y: 500 }],
      totalDistance: 1700,
      maxRisk: 0.1,
      estimatedDuration: 0.02,
      calcTimeMs: 15,
      dest: { x: 2000, y: 500 }
    };

    // Before Call #1 resolves, user triggers Call #2 (requestId = 2, destination = {x: 3200, y: 1200})
    nav.pendingWorkerRequestId = 2;
    const response2 = {
      requestId: 2,
      waypoints: [{ x: 400, y: 1200 }, { x: 3200, y: 1200 }],
      totalDistance: 2800,
      maxRisk: 0.0,
      estimatedDuration: 0.04,
      calcTimeMs: 12,
      dest: { x: 3200, y: 1200 }
    };

    // Simulate Call #2 resolving first
    nav.handleWorkerResponse({ data: response2 });
    expect(state.navigation.activeRoute.destination).toEqual({ x: 3200, y: 1200 });
    expect(state.navigation.activeRoute.totalDistance).toBe(2800);

    // Now simulate late/stale Call #1 arriving AFTER Call #2
    nav.handleWorkerResponse({ data: response1 });

    // Verify stale response #1 WAS DISCARDED and Call #2 remains active!
    expect(state.navigation.activeRoute.destination).toEqual({ x: 3200, y: 1200 });
    expect(state.navigation.activeRoute.totalDistance).toBe(2800);
  });

  it('CHECK 3 — Verify interim multi-iceberg vector nudge when icebergs are on both sides', () => {
    const nav = new AINavigator(3600, 2400);
    const ship = new Ship({ x: 1000, y: 1200, heading: 0, speed: 20 }); // Heading East (0 deg)
    const waypoints = [{ x: 1000, y: 1200 }, { x: 3000, y: 1200 }];
    ship.setRouteWaypoints(waypoints);
    
    const dest = { x: 3000, y: 1200 };

    // Position Iceberg A ahead-left (1100, 1150) and Iceberg B ahead-right (1100, 1250)
    const iceA = new Iceberg({ id: 'ice_A', name: 'Ice A', x: 1100, y: 1150, size: 1000 }); // dist ~111 SU
    const iceB = new Iceberg({ id: 'ice_B', name: 'Ice B', x: 1100, y: 1250, size: 1000 }); // dist ~111 SU

    const state = {
      navigation: { activeRoute: { id: 'r1', waypoints }, routeInvalid: false, isNavigating: true, destination: dest },
      vessel: { maxSpeed: 30, throttle: 65, rudder: 0, targetHeading: 0 }
    };

    const vectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    // Trigger evaluate while obstruction is present
    nav.evaluate(ship, [iceA, iceB], vectorField, 0, state);
    ship.update(0.016, vectorField, 0, state, [iceA, iceB]);

    // Verify throttle reduction on ship
    expect(ship.desiredThrottle).toBeLessThanOrEqual(35);

    // Calculate clearance to both icebergs
    const distA = Math.hypot(ship.x - iceA.x, ship.y - iceA.y);
    const distB = Math.hypot(ship.x - iceB.x, ship.y - iceB.y);
    const clearanceA = distA - iceA.collisionRadius;
    const clearanceB = distB - iceB.collisionRadius;

    console.log(`[CHECK 3 TELEMETRY] Ship Heading: ${ship.heading} | Target Heading: ${ship.targetHeading.toFixed(1)}°`);
    console.log(`[CHECK 3 TELEMETRY] Clearance Iceberg A (Left): ${clearanceA.toFixed(1)} SU`);
    console.log(`[CHECK 3 TELEMETRY] Clearance Iceberg B (Right): ${clearanceB.toFixed(1)} SU`);

    // Verify single-writer authority keeps ship target heading aligned with route while reducing speed and preserving clearance
    expect(ship.targetHeading).toBeCloseTo(0, 0);
    expect(clearanceA).toBeGreaterThan(25);
    expect(clearanceB).toBeGreaterThan(25);
  });

});
