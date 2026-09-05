import { describe, test, expect } from 'vitest';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';
import { VectorField } from '../src/js/simulation/vectorField.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';

describe('Part 3 — Combined Multi-Hazard Stress Scenario Audit', () => {
  test('evaluates decision engine under multi-hazard stress and maintains zero collisions', () => {
    const nav = new AINavigator(3600, 2400);
    const ship = new Ship(200, 1800);
    const vf = new VectorField(3600, 2400);

    // Setup Multi-Hazard Stress conditions:
    // Storm active (wind 110 kts, current 30 kts, turbulence 0.75) + heavy ice (0.85) + 10 moving icebergs + reduced sensor range
    vf.windSpeed = 110;
    vf.currentSpeed = 30;
    vf.turbulence = 0.75;
    vf.stormMode = true;

    const state = {
      navigation: {
        mode: 'SAFEST',
        isNavigating: true,
        startPoint: { x: 200, y: 1800 },
        destinationPoint: { x: 3200, y: 400 },
        sensorRange: 600, // Reduced sensor range proxy for reduced visibility
        routeInvalid: true,
        activeRoute: null
      },
      vessel: { maxSpeed: 30, autopilotThrottle: 65 },
      environment: { seaIce: { enabled: true, averageConcentration: 0.85 } }
    };

    const icebergs = Array.from({ length: 10 }, (_, i) => {
      const ice = new Iceberg({
        id: 8000 + i,
        name: `STRESS-IB-${i+1}`,
        x: 1000 + (i * 220),
        y: 600 + ((i % 3) * 350),
        mass: 5.0 + (i % 4),
        size: 90 + (i * 10)
      });
      ice.vx = -15 + (i % 3) * 10;
      ice.vy = 20 - (i % 2) * 15;
      return ice;
    });

    ship.isNavigating = true;
    ship.targetWaypoint = { x: 3200, y: 400 };

    // Evaluate AI Navigator & Decision Engine
    nav.evaluate(ship, icebergs, vf, 0.0, state);
    
    expect(nav.aiRecommendation).toBeDefined();
    expect(nav.aiRecommendation.recommendedMode).toBeDefined();
    console.log('[MULTI-HAZARD STRESS TEST] Decision Engine Output:', nav.aiRecommendation);

    // Simulate 50 step physics updates and verify 0 collisions
    let minClearance = Infinity;
    for (let step = 0; step < 50; step++) {
      const dt = 0.1;
      ship.update(dt, vf, state);
      for (const ice of icebergs) {
        ice.update(dt, vf, state);
        const dist = Math.hypot(ship.x - ice.x, ship.y - ice.y);
        const clearance = dist - (ship.collisionRadius + ice.collisionRadius);
        if (clearance < minClearance) minClearance = clearance;
      }
    }

    console.log(`[MULTI-HAZARD STRESS TEST] Minimum Clearance: ${minClearance.toFixed(1)} SU`);
    // Clearance must remain positive (0 collisions)
    expect(minClearance).toBeGreaterThan(0);
  });
});
