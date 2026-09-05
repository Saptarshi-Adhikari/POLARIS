import { describe, it, expect, beforeEach } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { VectorField } from '../src/js/simulation/vectorField.js';

describe('Current-Aware Minimum Throttle Floor & Steerage Way', () => {
  let ship;
  let vectorField;
  let mockState;

  beforeEach(() => {
    ship = new Ship({ x: 1000, y: 1000, heading: 0 }); // Heading 0 deg = facing East (+X)
    vectorField = new VectorField(3600, 2400);

    mockState = {
      vessel: {
        maxSpeed: 30.0,
        dragCoefficient: 0.04,
        mass: 1.0,
        throttle: 65,
        rudder: 0,
        heading: 0,
        autopilot: true,
        autopilotThrottle: 65,
        enginePower: 1.0
      },
      navigation: {
        activeRoute: null
      },
      environment: {
        ocean: {
          currentSpeed: 2.5,
          currentDirection: 180,
          turbulence: 0
        },
        seaIce: { enabled: false },
        wind: { enabled: false }
      }
    };
  });

  it('1. Prevents negative ground-track progress (backward motion) under strong opposing current during HIGH hazard speed reduction', () => {
    // Strong current opposing ship's heading (heading = 0 deg / East, current = -2.5 u to West)
    vectorField.setParams({ currentSpeed: 2.5, currentDirection: 180, stormMode: false }); // 180 deg = West (opposing +X)

    // Position ship near an iceberg to trigger HIGH hazard level (danger score 3)
    const ice = new Iceberg({ id: 1, x: 1120, y: 1000, mass: 10, size: 400 });
    ice.collisionRadius = 50;

    ship.setRouteWaypoints([{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }]);

    const startX = ship.x;
    // Step simulation over 60 frames (1 second at dt = 1/60s)
    const dt = 1 / 60;
    for (let i = 0; i < 60; i++) {
      ship.update(dt, vectorField, 14.0, mockState, [ice]);
    }

    // High hazard is active
    const maxScore = Math.max(...ship.hazards.map(h => h.score));
    expect(maxScore).toBeGreaterThanOrEqual(3);

    // Throttle floor was applied above hazard cap (15%) to counteract current
    expect(ship.desiredThrottle).toBeGreaterThan(15);
    expect(ship.desiredThrottle).toBeLessThanOrEqual(85);

    // Ship made positive forward progress along heading (+X direction), not backward
    expect(ship.x).toBeGreaterThan(startX);
    expect(ship.vx).toBeGreaterThan(0);
  });

  it('2. Preserves CRITICAL hazard emergency stop hard cap (0 throttle) even under strong opposing current', () => {
    // Strong opposing current
    vectorField.setParams({ currentSpeed: 2.5, currentDirection: 180, stormMode: false });

    // Position iceberg directly in path at critical collision proximity (< collision radius + 20)
    const ice = new Iceberg({ id: 2, x: 1030, y: 1000, mass: 10, size: 500 });
    ice.collisionRadius = 60;

    ship.setRouteWaypoints([{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }]);

    ship.update(1 / 60, vectorField, 14.0, mockState, [ice]);

    // Check critical danger score 4
    const maxScore = Math.max(...ship.hazards.map(h => h.score));
    expect(maxScore).toBe(4);

    // CRITICAL level enforces hard cap of 0 throttle (emergency stop override)
    expect(ship.desiredThrottle).toBe(0);
  });

  it('3. Applies steerage-way minimum throttle without exceeding safe maneuvering speed', () => {
    // Zero current
    vectorField.setParams({ currentSpeed: 0, currentDirection: 0, stormMode: false });

    // Medium hazard level (score 2)
    const ice = new Iceberg({ id: 3, x: 1200, y: 1000, mass: 10, size: 300 });
    ice.collisionRadius = 40;

    ship.setRouteWaypoints([{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }]);

    ship.update(1 / 60, vectorField, 14.0, mockState, [ice]);

    // Steerage way minimum floor is 18%
    expect(ship.desiredThrottle).toBeGreaterThanOrEqual(18);
    // Controlled maneuvering speed, well below full cruise throttle (65%)
    expect(ship.desiredThrottle).toBeLessThanOrEqual(45);
  });
});
