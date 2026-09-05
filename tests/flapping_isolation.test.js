import { describe, test, expect } from 'vitest';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';
import { VectorField } from '../src/js/simulation/vectorField.js';

describe('Route Adoption Flapping Isolation Audit', () => {
  test('verifies zero route oscillating/flapping across 100 consecutive frames', () => {
    const nav = new AINavigator(3600, 2400);
    const ship = new Ship(100, 100);
    const vf = new VectorField(3600, 2400);
    const icebergs = [
      { id: 1, x: 500, y: 500, vx: 0, vy: 0, collisionRadius: 40, size: 500 }
    ];

    const state = {
      navigation: {
        mode: 'BALANCED',
        isNavigating: true,
        startPoint: { x: 100, y: 100 },
        destinationPoint: { x: 1000, y: 1000 },
        routeInvalid: true,
        activeRoute: null
      },
      vessel: { maxSpeed: 30, autopilotThrottle: 65 },
      environment: { seaIce: { enabled: false } }
    };

    ship.isNavigating = true;
    ship.targetWaypoint = { x: 1000, y: 1000 };

    let routeChangeCount = 0;
    let previousRouteId = null;

    // Run 100 evaluation ticks (simulating 100 animation frames)
    for (let frame = 1; frame <= 100; frame++) {
      nav.evaluate(ship, icebergs, vf, frame * 0.016, state);
      
      const currentRoute = state.navigation.activeRoute;
      if (currentRoute) {
        if (previousRouteId && currentRoute.id !== previousRouteId) {
          routeChangeCount++;
        }
        previousRouteId = currentRoute.id;
      }
    }

    console.log(`[FLAPPING ISOLATION TEST] Total Frames Evaluated: 100`);
    console.log(`[FLAPPING ISOLATION TEST] Route Change Count: ${routeChangeCount}`);

    // Expect exact 0 route changes after initial adoption (no flapping)
    expect(routeChangeCount).toBe(0);
  });
});
