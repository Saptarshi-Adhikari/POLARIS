/**
 * POLARIS DIGITAL TWIN — Continuous Space/Time Collision Validator
 *
 * Single authoritative collision safety engine for POLARIS / ASTRALIS.
 * Replaces fragmented/approximate point-circle checks with full space/time validation:
 *  - Rotated Vessel OBB Footprint (length, beam, heading)
 *  - Dynamic Iceberg Footprint + ML Prediction Uncertainty Envelope
 *  - Continuous Space/Time Segment Interpolation
 *  - Predictive CPA / TCPA Collision Warning
 *  - Safety Classification (SAFE, CAUTION, CRITICAL)
 */
import { getSegmentSpeed, calculateIcebergPositionAt } from '../utils.js';

export class ContinuousCollisionValidator {
  constructor(options = {}) {
    this.defaultVesselLength = options.vesselLength || 80.0;
    this.defaultVesselBeam = options.vesselBeam || 20.0;
    this.safetyBufferSU = options.safetyBufferSU || 20.0;
    this.maneuverBufferSU = options.maneuverBufferSU || 15.0;
    
    // Thresholds (SU)
    this.cautionThresholdSU = 50.0;
    this.criticalThresholdSU = 20.0;
  }

  /**
   * Derive vessel geometry dimensions (length, beam).
   */
  getVesselDimensions(vessel) {
    const length = vessel?.length || vessel?.hullLength || this.defaultVesselLength;
    const beam = vessel?.beam || vessel?.hullBeam || this.defaultVesselBeam;
    return { length, beam };
  }

  /**
   * Calculate distance from a rotated vessel OBB (center, heading, length, beam)
   * to a point (cx, cy).
   */
  distancePointToVesselOBB(px, py, vesselX, vesselY, headingRad, length, beam) {
    const dx = px - vesselX;
    const dy = py - vesselY;

    const cosH = Math.cos(headingRad);
    const sinH = Math.sin(headingRad);

    // Transform point to vessel local frame (u along length axis, v along beam axis)
    const u = dx * cosH + dy * sinH;
    const v = -dx * sinH + dy * cosH;

    const halfL = length / 2.0;
    const halfB = beam / 2.0;

    // Clamp to OBB bounds
    const clampedU = Math.max(-halfL, Math.min(halfL, u));
    const clampedV = Math.max(-halfB, Math.min(halfB, v));

    const distU = u - clampedU;
    const distV = v - clampedV;

    return Math.hypot(distU, distV);
  }

  /**
   * Calculate exact minimum clearance between rotated vessel OBB and a dilated iceberg circle.
   */
  calculateVesselToIcebergClearance(vesselState, icebergState, futureTimeHours = 0) {
    const vX = vesselState.x !== undefined ? vesselState.x : 0;
    const vY = vesselState.y !== undefined ? vesselState.y : 0;
    const heading = vesselState.heading !== undefined ? vesselState.heading : 0;
    const headingRad = typeof heading === 'number' && Math.abs(heading) > 6.28 
      ? (heading * Math.PI / 180) 
      : heading;

    const { length, beam } = this.getVesselDimensions(vesselState);

    // Iceberg position & uncertainty at future time
    const iceX = icebergState.x !== undefined ? icebergState.x : 0;
    const iceY = icebergState.y !== undefined ? icebergState.y : 0;
    const iceRadius = icebergState.collisionRadius || icebergState.radius || 25.0;
    const uncertainty = icebergState.uncertaintyRadius || icebergState.uncertainty || 0.0;

    const totalIcebergExclusionRadius = iceRadius + uncertainty + this.safetyBufferSU + this.maneuverBufferSU;

    const distToOBB = this.distancePointToVesselOBB(iceX, iceY, vX, vY, headingRad, length, beam);

    return {
      distToOBB,
      clearance: distToOBB - totalIcebergExclusionRadius,
      physicalClearance: distToOBB - iceRadius,
      totalExclusionRadius: totalIcebergExclusionRadius
    };
  }

  /**
   * Predictive CPA / TCPA calculation between vessel and iceberg.
   */
  calculateCPATCPA(vesselState, icebergState) {
    const vx = vesselState.vx !== undefined ? vesselState.vx : (vesselState.speed ? vesselState.speed * Math.cos(vesselState.heading || 0) : 0);
    const vy = vesselState.vy !== undefined ? vesselState.vy : (vesselState.speed ? vesselState.speed * Math.sin(vesselState.heading || 0) : 0);

    const ix = icebergState.vx !== undefined ? icebergState.vx : 0;
    const iy = icebergState.vy !== undefined ? icebergState.vy : 0;

    const rx = (icebergState.x || 0) - (vesselState.x || 0);
    const ry = (icebergState.y || 0) - (vesselState.y || 0);

    const rvx = ix - vx;
    const rvy = iy - vy;
    const rvSq = rvx * rvx + rvy * rvy;

    let tcpa = 0;
    if (rvSq > 1e-4) {
      tcpa = -(rx * rvx + ry * rvy) / rvSq;
    }
    if (tcpa < 0) tcpa = 0;

    const futureRx = rx + rvx * tcpa;
    const futureRy = ry + rvy * tcpa;
    const cpa = Math.hypot(futureRx, futureRy);

    return { cpa, tcpa };
  }

  /**
   * Continuous Space/Time Segment Validation.
   * Interpolates vessel position, heading, and moving iceberg positions along segment travel time.
   */
  validateSegmentSpaceTime(pA, pB, etaStartHours, etaEndHours, vessel, icebergs = []) {
    const dx = pB.x - pA.x;
    const dy = pB.y - pA.y;
    const segLen = Math.hypot(dx, dy);

    if (segLen < 1e-3) {
      return this.validatePointSpaceTime(pA, etaStartHours, vessel, icebergs);
    }

    const headingRad = Math.atan2(dy, dx);
    const speed = vessel?.speed || vessel?.speedKnots || 15.0;

    // Adaptive sampling density: finer near hazards or long segments
    const numSamples = Math.max(10, Math.ceil(segLen / 5.0));
    let minPredictedClearance = Infinity;
    let minPhysicalClearance = Infinity;
    let nearestHazardId = null;
    let violationType = 'NONE';
    let collisionTimeHours = null;

    for (let k = 0; k <= numSamples; k++) {
      const ratio = k / numSamples;
      const tHours = etaStartHours + ratio * (etaEndHours - etaStartHours);
      const vState = {
        x: pA.x + ratio * dx,
        y: pA.y + ratio * dy,
        heading: headingRad,
        length: vessel?.length || this.defaultVesselLength,
        beam: vessel?.beam || this.defaultVesselBeam
      };

      for (const ice of icebergs) {
        const icePos = (ice.getPositionAt && typeof ice.getPositionAt === 'function') 
          ? ice.getPositionAt(tHours) 
          : calculateIcebergPositionAt(ice, tHours);

        const iceX = icePos.x;
        const iceY = icePos.y;
        const uncertainty = (icePos.uncertainty || ice.uncertaintyRadius || 0) + (tHours * 2.0); // uncertainty grows over time

        const iceState = {
          ...ice,
          x: iceX,
          y: iceY,
          uncertaintyRadius: uncertainty
        };

        const res = this.calculateVesselToIcebergClearance(vState, iceState, tHours);

        if (res.clearance < minPredictedClearance) {
          minPredictedClearance = res.clearance;
          nearestHazardId = ice.id;
        }
        if (res.physicalClearance < minPhysicalClearance) {
          minPhysicalClearance = res.physicalClearance;
        }

        if (res.clearance <= 0) {
          violationType = res.physicalClearance <= 0 ? 'HARD_EXCLUSION' : 'UNCERTAINTY_BREACH';
          if (collisionTimeHours === null) collisionTimeHours = tHours;
          return {
            isValid: false,
            violationType,
            minPredictedClearance,
            minPhysicalClearance,
            nearestHazardId,
            collisionTimeHours
          };
        }
      }
    }

    return {
      isValid: minPredictedClearance > 0,
      violationType,
      minPredictedClearance,
      minPhysicalClearance,
      nearestHazardId,
      collisionTimeHours
    };
  }

  /**
   * Validate single point in space/time.
   */
  validatePointSpaceTime(point, etaHours, vessel, icebergs = []) {
    let minPredictedClearance = Infinity;
    let minPhysicalClearance = Infinity;
    let nearestHazardId = null;

    const vState = {
      x: point.x,
      y: point.y,
      heading: point.heading || 0,
      length: vessel?.length || this.defaultVesselLength,
      beam: vessel?.beam || this.defaultVesselBeam
    };

    for (const ice of icebergs) {
      const iceX = ice.x + (ice.vx || 0) * (etaHours * 3600);
      const iceY = ice.y + (ice.vy || 0) * (etaHours * 3600);
      const res = this.calculateVesselToIcebergClearance(vState, { ...ice, x: iceX, y: iceY }, etaHours);

      if (res.clearance < minPredictedClearance) {
        minPredictedClearance = res.clearance;
        nearestHazardId = ice.id;
      }
      if (res.physicalClearance < minPhysicalClearance) {
        minPhysicalClearance = res.physicalClearance;
      }
    }

    return {
      isValid: minPredictedClearance > 0,
      violationType: minPredictedClearance <= 0 ? 'HARD_EXCLUSION' : 'NONE',
      minPredictedClearance,
      minPhysicalClearance,
      nearestHazardId,
      collisionTimeHours: minPredictedClearance <= 0 ? etaHours : null
    };
  }

  /**
   * Full Route Safety Gate Validation.
   * Checks every waypoint and segment along a complete route.
   */
  validateFullRoute(waypoints, vessel, icebergs = [], cruiseSpeedSU = 15.0, state = null) {
    if (!waypoints || waypoints.length < 2) {
      return { isValid: false, reason: 'INVALID_WAYPOINTS', status: 'CRITICAL', minPredictedClearance: 0 };
    }

    let cumTimeHours = 0;
    let overallMinClearance = Infinity;
    let overallMinPhysical = Infinity;
    let primaryNearestHazard = null;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const pA = waypoints[i];
      const pB = waypoints[i + 1];
      const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);

      let turnAngle = 0;
      if (i > 0) {
        const pPrev = waypoints[i - 1];
        const h1 = Math.atan2(pA.y - pPrev.y, pA.x - pPrev.x) * 180 / Math.PI;
        const h2 = Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180 / Math.PI;
        turnAngle = Math.abs((h2 - h1 + 180) % 360 - 180);
      }

      const midX = (pA.x + pB.x) / 2;
      const midY = (pA.y + pB.y) / 2;
      const effectiveSpeed = getSegmentSpeed(midX, midY, cruiseSpeedSU, icebergs, turnAngle, state);
      const segTimeHours = dist / Math.max(0.5, effectiveSpeed) / 3600.0;
      const etaStart = cumTimeHours;
      const etaEnd = cumTimeHours + segTimeHours;
      cumTimeHours = etaEnd;

      const segResult = this.validateSegmentSpaceTime(pA, pB, etaStart, etaEnd, vessel, icebergs);

      if (segResult.minPredictedClearance < overallMinClearance) {
        overallMinClearance = segResult.minPredictedClearance;
        primaryNearestHazard = segResult.nearestHazardId;
      }
      if (segResult.minPhysicalClearance < overallMinPhysical) {
        overallMinPhysical = segResult.minPhysicalClearance;
      }

      if (!segResult.isValid) {
        return {
          isValid: false,
          reason: `Segment ${i} crosses iceberg collision zone (SPACE_TIME_COLLISION_SEGMENT_${i})`,
          status: 'CRITICAL',
          violationType: segResult.violationType,
          minPredictedClearance: segResult.minPredictedClearance,
          minPhysicalClearance: segResult.minPhysicalClearance,
          nearestHazardId: segResult.nearestHazardId,
          failedSegmentIndex: i
        };
      }
    }

    let status = 'SAFE';
    if (overallMinClearance < this.criticalThresholdSU) {
      status = 'CRITICAL';
    } else if (overallMinClearance < this.cautionThresholdSU) {
      status = 'CAUTION';
    }

    return {
      isValid: true,
      reason: 'ALL_SEGMENTS_VALIDATED',
      status,
      minPredictedClearance: overallMinClearance,
      minPhysicalClearance: overallMinPhysical,
      nearestHazardId: primaryNearestHazard
    };
  }
}

export const continuousCollisionValidator = new ContinuousCollisionValidator();
