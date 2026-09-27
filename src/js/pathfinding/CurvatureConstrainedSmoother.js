/**
 * POLARIS DIGITAL TWIN — Curvature-Constrained Route Smoother
 *
 * Post-processes A* + Line-of-Sight (LOS) waypoints by fitting Dubins-style
 * tangent arc smooth curves at turn vertices, constrained by the vessel's
 * physical minimum turning radius: R_min = max(15, speed / max_yaw_rate).
 *
 * MANDATORY SAFETY VALIDATION:
 * After generating the smooth path, every sample point along the curve is
 * validated against hazard exclusion zones and uncertainty corridors.
 * If any section becomes unsafe, the smoother automatically falls back to
 * local un-smoothed LOS waypoints.
 */

import { distance } from '../utils.js';
import { continuousCollisionValidator } from '../ai/continuousCollisionValidator.js';

export class CurvatureConstrainedSmoother {
  constructor(options = {}) {
    this.sampleIntervalSU = options.sampleIntervalSU || 2.0;
    this.minRadiusSU = options.minRadiusSU || 25.0;
  }

  /**
   * Derive minimum practical turning radius from vessel dynamics parameters.
   */
  calculateMinTurningRadius(vessel) {
    if (!vessel) return this.minRadiusSU;
    const speed = vessel.speedKnots || vessel.speed || 12.0;
    const maxYawRate = vessel.maxYawRate || 0.15; // rad/sec
    const derivedR = speed / Math.max(0.01, maxYawRate);
    return Math.max(15.0, Math.min(100.0, derivedR));
  }

  /**
   * Smooth a sequence of waypoints using curvature-constrained arc fitting
   * and validate the resulting continuous path against hazards.
   */
  smoothRoute(waypoints, vessel, hazards = [], gridCostMatrix = null) {
    if (!waypoints || waypoints.length < 3) {
      return {
        smoothedWaypoints: waypoints ? [...waypoints] : [],
        isSmoothed: false,
        minRadius: this.calculateMinTurningRadius(vessel),
        validationPassed: true,
        fallbackReason: waypoints && waypoints.length < 3 ? 'TOO_FEW_WAYPOINTS' : 'EMPTY'
      };
    }

    const minRadius = this.calculateMinTurningRadius(vessel);
    const rawSmoothed = [];
    rawSmoothed.push(waypoints[0]);

    for (let i = 1; i < waypoints.length - 1; i++) {
      const prev = waypoints[i - 1];
      const curr = waypoints[i];
      const next = waypoints[i + 1];

      // Calculate corner turn angle
      const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
      const v2 = { x: next.x - curr.x, y: next.y - curr.y };
      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);

      if (len1 < 1e-3 || len2 < 1e-3) {
        rawSmoothed.push(curr);
        continue;
      }

      const unit1 = { x: v1.x / len1, y: v1.y / len1 };
      const unit2 = { x: v2.x / len2, y: v2.y / len2 };
      const dot = unit1.x * unit2.x + unit1.y * unit2.y;
      const angle = Math.acos(Math.max(-1.0, Math.min(1.0, dot)));

      // If nearly straight or turn is extremely sharp (>160 deg), keep vertex
      if (angle > 2.8 || angle < 0.2) {
        rawSmoothed.push(curr);
        continue;
      }

      // Calculate tangent offset distance
      const halfAngle = angle / 2.0;
      const tangentDist = minRadius / Math.tan(halfAngle);
      const maxTangent = Math.min(len1 * 0.4, len2 * 0.4);
      const actualTangent = Math.min(tangentDist, maxTangent);

      // Arc start & end tangent points
      const pStart = {
        x: curr.x + unit1.x * actualTangent,
        y: curr.y + unit1.y * actualTangent
      };
      const pEnd = {
        x: curr.x + unit2.x * actualTangent,
        y: curr.y + unit2.y * actualTangent
      };

      // Sample arc points using quadratic Bezier curve control
      const arcSamples = 5;
      for (let t = 0; t <= 1.0; t += 1.0 / arcSamples) {
        const bx = (1 - t) * (1 - t) * pStart.x + 2 * (1 - t) * t * curr.x + t * t * pEnd.x;
        const by = (1 - t) * (1 - t) * pStart.y + 2 * (1 - t) * t * curr.y + t * t * pEnd.y;
        rawSmoothed.push({ x: bx, y: by });
      }
    }

    rawSmoothed.push(waypoints[waypoints.length - 1]);

    // Mandatory Safety Validation via ContinuousCollisionValidator
    const validationRes = continuousCollisionValidator.validateFullRoute(rawSmoothed, vessel, hazards);

    if (validationRes.isValid) {
      return {
        smoothedWaypoints: rawSmoothed,
        isSmoothed: true,
        minRadius,
        validationPassed: true,
        fallbackReason: null
      };
    } else {
      // Fallback to original LOS waypoints if smoothing creates collision risk
      return {
        smoothedWaypoints: [...waypoints],
        isSmoothed: false,
        minRadius,
        validationPassed: false,
        fallbackReason: 'SAFETY_VALIDATION_FAILED'
      };
    }
  }

  validateSmoothedPath(smoothedWaypoints, hazards, vessel = null) {
    const res = continuousCollisionValidator.validateFullRoute(smoothedWaypoints, vessel, hazards);
    return res.isValid;
  }
}

export const curvatureSmoother = new CurvatureConstrainedSmoother();
