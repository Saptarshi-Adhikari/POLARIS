import { describe, it, expect } from 'vitest';
import { runRoutePlannerCore } from '../src/js/ai/routePlannerCore.js';

describe('Iceberg Safety Envelope Geometry & Collision-Check Audit', () => {
  it('1. Reconstructs failing cluster scenario: zero safety envelope violations', () => {
    const icebergs = [
      { id: 1, x: 700, y: 1680, collisionRadius: 40, size: 500, vx: 0, vy: 0 },
      { id: 2, x: 800, y: 1500, collisionRadius: 40, size: 500, vx: 0, vy: 0 },
      { id: 3, x: 750, y: 1400, collisionRadius: 40, size: 500, vx: 0, vy: 0 }
    ];

    const ship = { x: 400, y: 1800, vx: 0, vy: 0, speed: 20, throttle: 65 };
    const dest = { x: 1200, y: 1200 };

    const payload = {
      requestId: 1,
      ship,
      dest,
      mode: 'BALANCED',
      width: 3600,
      height: 2400,
      state: { vessel: { maxSpeed: 30 }, environment: { seaIce: { enabled: false } } },
      icebergs
    };

    const result = runRoutePlannerCore(payload);
    expect(result.waypoints).toBeDefined();
    expect(result.waypoints.length).toBeGreaterThanOrEqual(2);

    let maxPenetration = 0;
    let totalViolations = 0;
    let minHullClearance = Infinity;

    for (let i = 0; i < result.waypoints.length - 1; i++) {
      const pA = result.waypoints[i];
      const pB = result.waypoints[i+1];
      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const segLen = Math.hypot(dx, dy);

      const numSamples = Math.max(20, Math.ceil(segLen / 2));
      for (let k = 0; k <= numSamples; k++) {
        const t = k / numSamples;
        const sx = pA.x + t * dx;
        const sy = pA.y + t * dy;

        for (let ice of icebergs) {
          const safetyRadius = ice.collisionRadius + 15 + 30; // 45 + collisionRadius
          const dist = Math.hypot(sx - ice.x, sy - ice.y);
          const clearance = dist - safetyRadius;
          if (clearance < minHullClearance) minHullClearance = clearance;

          if (dist < safetyRadius - 1e-3) {
            totalViolations++;
            maxPenetration = Math.max(maxPenetration, safetyRadius - dist);
          }
        }
      }
    }

    console.log(`[TEST 1 PASS] Violations: ${totalViolations}, Min safety clearance: ${minHullClearance.toFixed(2)} SU`);
    expect(totalViolations).toBe(0);
    expect(minHullClearance).toBeGreaterThanOrEqual(0);
  });

  it('2. Directness check: avoids excessive detour (ratio < 1.30)', () => {
    const icebergs = [
      { id: 1, x: 700, y: 1680, collisionRadius: 40, size: 500, vx: 0, vy: 0 },
      { id: 2, x: 800, y: 1500, collisionRadius: 40, size: 500, vx: 0, vy: 0 },
      { id: 3, x: 750, y: 1400, collisionRadius: 40, size: 500, vx: 0, vy: 0 }
    ];

    const ship = { x: 400, y: 1800, vx: 0, vy: 0, speed: 20, throttle: 65 };
    const dest = { x: 1200, y: 1200 };

    const payload = {
      requestId: 2,
      ship,
      dest,
      mode: 'BALANCED',
      width: 3600,
      height: 2400,
      state: { vessel: { maxSpeed: 30 }, environment: { seaIce: { enabled: false } } },
      icebergs
    };

    const result = runRoutePlannerCore(payload);
    const straightDist = Math.hypot(dest.x - ship.x, dest.y - ship.y);
    const detourRatio = result.totalDistance / straightDist;

    console.log(`[TEST 2 PASS] Straight: ${straightDist.toFixed(1)}, Route: ${result.totalDistance.toFixed(1)}, Ratio: ${detourRatio.toFixed(3)}`);
    expect(detourRatio).toBeLessThan(1.30);
  });

  it('3. Generalization: 5-iceberg dense staggered cluster scenario', () => {
    const icebergs = [
      { id: 10, x: 600, y: 1650, collisionRadius: 45, size: 500, vx: 0, vy: 0 },
      { id: 11, x: 680, y: 1580, collisionRadius: 40, size: 450, vx: 0, vy: 0 },
      { id: 12, x: 760, y: 1500, collisionRadius: 50, size: 550, vx: 0, vy: 0 },
      { id: 13, x: 840, y: 1420, collisionRadius: 35, size: 400, vx: 0, vy: 0 },
      { id: 14, x: 920, y: 1350, collisionRadius: 40, size: 450, vx: 0, vy: 0 }
    ];

    const ship = { x: 400, y: 1800, vx: 0, vy: 0, speed: 20, throttle: 65 };
    const dest = { x: 1200, y: 1200 };

    const modes = ['BALANCED', 'SAFEST', 'FASTEST', 'FUEL_EFFICIENT'];

    for (const mode of modes) {
      const payload = {
        requestId: 100,
        ship,
        dest,
        mode,
        width: 3600,
        height: 2400,
        state: { vessel: { maxSpeed: 30 }, environment: { seaIce: { enabled: false } } },
        icebergs
      };

      const result = runRoutePlannerCore(payload);
      expect(result.waypoints).toBeDefined();

      let violations = 0;
      for (let i = 0; i < result.waypoints.length - 1; i++) {
        const pA = result.waypoints[i];
        const pB = result.waypoints[i+1];
        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const segLen = Math.hypot(dx, dy);

        const numSamples = Math.max(20, Math.ceil(segLen / 2));
        for (let k = 0; k <= numSamples; k++) {
          const t = k / numSamples;
          const sx = pA.x + t * dx;
          const sy = pA.y + t * dy;

          for (let ice of icebergs) {
            const safetyRadius = ice.collisionRadius + 15 + 30; // 45 + collisionRadius
            const dist = Math.hypot(sx - ice.x, sy - ice.y);
            if (dist < safetyRadius - 1e-3) {
              violations++;
            }
          }
        }
      }

      console.log(`[GENERALIZATION PASS - ${mode}] Violations: ${violations}, Distance: ${result.totalDistance.toFixed(1)}`);
      expect(violations).toBe(0);
    }
  });
});
