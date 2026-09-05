import { describe, it, expect } from 'vitest';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Hard Scenario A* Iteration Cap Audit', () => {
  it('tests search behavior when destination is completely blocked by an wall of icebergs', () => {
    const ship = new Ship({ x: 400, y: 1200, heading: 0, speed: 20 });
    const dest = { x: 3200, y: 1200 };

    // Create an impassable wall of 30 icebergs from top to bottom (y=0..2400) at x=1800
    const icebergs = [];
    for (let i = 0; i < 30; i++) {
      icebergs.push(new Iceberg({
        id: `wall_ice_${i}`,
        name: `Wall Iceberg ${i}`,
        x: 1800,
        y: i * 80,
        size: 2000
      }));
    }

    const mockVectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };
    const nav = new AINavigator(3600, 2400);

    const state = {
      vessel: { maxSpeed: 30, autopilotThrottle: 65 },
      navigation: { activeRoute: null, routeInvalid: true, isNavigating: true, destination: dest },
      environment: { seaIce: { enabled: false } }
    };

    const t0 = performance.now();
    nav.generateOptimalRouteAStar(ship, icebergs, mockVectorField, dest, 'BALANCED', state, ship);
    const elapsedMs = performance.now() - t0;

    const route = nav.optimalRoute;

    console.log(`\n=== IMPASSABLE WALL BENCHMARK RESULTS ===`);
    console.log(`Search Time: ${elapsedMs.toFixed(2)} ms`);
    console.log(`Waypoints Count: ${route.length}`);
    console.log(`Is direct fallback route (2 waypoints)? ${route.length === 2}`);
    console.log(`===========================================\n`);

    expect(route.length).toBe(2);
    expect(route[0].x).toBe(400);
    expect(route[0].y).toBe(1200);
    expect(route[1].x).toBe(3200);
    expect(route[1].y).toBe(1200);
  });
});
