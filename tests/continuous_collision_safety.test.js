import { describe, it, expect, beforeEach } from 'vitest';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';
import { CurvatureConstrainedSmoother } from '../src/js/pathfinding/CurvatureConstrainedSmoother.js';
import { DecisionEngine } from '../src/js/ai/decisionEngine.js';
import { isSegmentHardBlocked, validateRoute } from '../src/js/ai/routePlannerCore.js';

describe('POLARIS — Critical Collision-Safety Architecture Verification Suite', () => {

  it('Phase 19: Endpoint-safe / Segment-collision caught by Space/Time Validator', () => {
    // Waypoint A and B are far apart (100, 500) -> (900, 500)
    // An iceberg is placed directly at (500, 500), intersecting segment A->B, but not at endpoints!
    const pA = { x: 100, y: 500 };
    const pB = { x: 900, y: 500 };
    const vessel = { length: 80, beam: 20, speed: 15 };
    const icebergs = [{ id: 'ice_middle', x: 500, y: 500, collisionRadius: 40, vx: 0, vy: 0 }];

    const result = continuousCollisionValidator.validateSegmentSpaceTime(pA, pB, 0, 0.05, vessel, icebergs);
    expect(result.isValid).toBe(false);
    expect(['HARD_EXCLUSION', 'UNCERTAINTY_BREACH']).toContain(result.violationType);

    const blocked = isSegmentHardBlocked(pA, pB, 0, 0.05, icebergs, vessel);
    expect(blocked).toBe(true);
  });

  it('Phase 20: Moving Iceberg Dynamic Crossing caught before physical reach', () => {
    // Ship travelling East from (100, 500) -> (1000, 500)
    // Iceberg moving South from (500, 200) -> (500, 800) crossing future ship path at t=20s
    const pA = { x: 100, y: 500 };
    const pB = { x: 1000, y: 500 };
    const vessel = { length: 80, beam: 20, speed: 20 }; // 20 SU/s -> reaches x=500 at t=20s
    const icebergs = [{
      id: 'ice_crosser',
      x: 500, y: 100, // Starts at y=100
      vx: 0, vy: 20.0, // Moving south at 20 SU/s -> reaches y=500 at t=20s
      collisionRadius: 30
    }];

    const val = continuousCollisionValidator.validateSegmentSpaceTime(pA, pB, 0, 45 / 3600, vessel, icebergs);
    expect(val.isValid).toBe(false);
    expect(val.nearestHazardId).toBe('ice_crosser');
  });

  it('Phase 3: Rotated Vessel OBB Footprint prevents hull clipping', () => {
    // Ship at (400, 500) heading North (90 deg = South, -90 deg = North)
    // Length = 100 SU. Bow extends to (400, 450), Stern to (400, 550).
    // An iceberg at (400, 440) radius 20 SU does NOT hit center (400,500) but DOES hit Bow (400,450)!
    const vessel = { x: 400, y: 500, heading: -Math.PI / 2, length: 100, beam: 20 };
    const icebergNearBow = { id: 'ice_bow', x: 400, y: 440, collisionRadius: 20 };

    const clearance = continuousCollisionValidator.calculateVesselToIcebergClearance(vessel, icebergNearBow, 0);
    // Point-to-center distance = 60, but Bow is at 450 -> Bow-to-center distance = 10 <= Total exclusion
    expect(clearance.distToOBB).toBeLessThan(60); // OBB accounts for length!
    expect(clearance.clearance).toBeLessThan(0); // Collision flagged!
  });

  it('Phase 5: Prediction Uncertainty Envelope expands exclusion zone', () => {
    const vessel = { x: 100, y: 100, heading: 0, length: 80, beam: 20 };
    const iceberg = { id: 'ice_unc', x: 100, y: 220, collisionRadius: 20, uncertaintyRadius: 70 }; // High uncertainty!

    const res = continuousCollisionValidator.calculateVesselToIcebergClearance(vessel, iceberg, 0);
    expect(res.clearance).toBeLessThan(0); // Uncertainty envelope breach flagged!
  });

  it('Phase 14 & 21: Curvature Smoother rejects unsafe smooth arcs and falls back to LOS', () => {
    const smoother = new CurvatureConstrainedSmoother();
    const waypoints = [
      { x: 100, y: 100 },
      { x: 500, y: 100 }, // Corner at (500, 100)
      { x: 500, y: 600 }
    ];
    const vessel = { speedKnots: 15.0, maxYawRate: 0.15, length: 80, beam: 20 };
    // Hazard placed directly along the smooth tangent arc at (450, 150)
    const hazards = [{ id: 'ice_arc', x: 450, y: 150, collisionRadius: 45 }];

    const result = smoother.smoothRoute(waypoints, vessel, hazards);
    expect(result.isSmoothed).toBe(false);
    expect(result.validationPassed).toBe(false);
    expect(result.fallbackReason).toBe('SAFETY_VALIDATION_FAILED');
    expect(result.smoothedWaypoints).toEqual(waypoints); // Fallback to LOS!
  });

  it('Phase 13: DecisionEngine Safety Gate rejects candidate routes that fail space/time validation', () => {
    const decisionEngine = new DecisionEngine();
    const unsafeWaypoints = [{ x: 100, y: 500 }, { x: 900, y: 500 }];
    const icebergs = [{ id: 'blocker', x: 500, y: 500, collisionRadius: 40 }];

    const candidateRoutes = {
      FASTEST: { waypoints: unsafeWaypoints, shipSpeed: 25.0, maxRisk: 0.1, estimatedFuelConsumption: 5.0, eta: 0.03 },
      SAFEST: { waypoints: [{ x: 100, y: 500 }, { x: 500, y: 100 }, { x: 900, y: 500 }], shipSpeed: 15.0, maxRisk: 0.05, estimatedFuelConsumption: 4.0, eta: 0.04 }
    };

    const evalResult = decisionEngine.evaluate(candidateRoutes, { icebergTrajectories: icebergs });
    expect(evalResult.details.FASTEST.rejected).toBe(true);
    expect(evalResult.details.FASTEST.reason).toContain('Space/Time Collision Validation Failed');
  });

  it('Phase 10: Predictive CPA/TCPA generates early collision warning', () => {
    const vessel = { x: 100, y: 500, vx: 20, vy: 0, heading: 0, length: 80, beam: 20 };
    const iceberg = { id: 'ice_headon', x: 400, y: 500, vx: -10, vy: 0, collisionRadius: 30 }; // Head-on closing speed = 30 SU/s

    const { cpa, tcpa } = continuousCollisionValidator.calculateCPATCPA(vessel, iceberg);
    expect(tcpa).toBeCloseTo(10.0, 1); // Collision in 10 seconds
    expect(cpa).toBeCloseTo(0, 1); // Direct hit

    const clearance = continuousCollisionValidator.calculateVesselToIcebergClearance(vessel, iceberg, 0);
    expect(tcpa <= 15.0 && cpa < clearance.totalExclusionRadius).toBe(true);
  });
});
