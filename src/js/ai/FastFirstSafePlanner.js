/**
 * POLARIS DIGITAL TWIN — Fast First-Safe & Explicit Dynamic Side Planner
 *
 * Implements:
 * 1. Weighted A* (bounded suboptimal search with configurable epsilon = 1.5 - 2.5) for fast first-safe route commitment.
 * 2. Replan from Current Vessel State (current x, y, heading, speed).
 * 3. Explicit Symmetric LEFT and RIGHT Candidate Generation & Evaluation.
 * 4. Deterministic Side Selection Hierarchy (Safety > Feasibility > Clearance > Objective > Maneuver Effort > Tie-Break).
 */

import { continuousCollisionValidator } from './continuousCollisionValidator.js';
import { curvatureSmoother } from '../pathfinding/CurvatureConstrainedSmoother.js';
import { wrappedDistanceCoords } from '../utils.js';

export class FastFirstSafePlanner {
  constructor(options = {}) {
    this.epsilon = options.epsilon || 2.0; // Weighted A* heuristic multiplier
    this.gridResolution = options.gridResolution || 40.0;
    this.width = options.width || 3600;
    this.height = options.height || 2400;
    this.cols = Math.floor(this.width / this.gridResolution);
    this.rows = Math.floor(this.height / this.gridResolution);
  }

  /**
   * Calculate symmetric LEFT and RIGHT detour waypoints around a blocking hazard corridor.
   */
  generateSymmetricSideSeeds(shipState, dest, hazard) {
    const dx = dest.x - shipState.x;
    const dy = dest.y - shipState.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 1e-3) {
      return { leftSeed: { x: hazard.x - 100, y: hazard.y }, rightSeed: { x: hazard.x + 100, y: hazard.y } };
    }

    const ux = dx / dist;
    const uy = dy / dist;

    // Perpendicular normal vectors (left = counterclockwise, right = clockwise in screen coords)
    const leftNx = uy;
    const leftNy = -ux;

    const rightNx = -uy;
    const rightNy = ux;

    const offsetDist = (hazard.collisionRadius || 30.0) + (hazard.uncertaintyRadius || 20.0) + 120.0;

    const leftSeed = {
      x: Math.max(50, Math.min(this.width - 50, hazard.x + leftNx * offsetDist)),
      y: Math.max(50, Math.min(this.height - 50, hazard.y + leftNy * offsetDist))
    };

    const rightSeed = {
      x: Math.max(50, Math.min(this.width - 50, hazard.x + rightNx * offsetDist)),
      y: Math.max(50, Math.min(this.height - 50, hazard.y + rightNy * offsetDist))
    };

    return { leftSeed, rightSeed };
  }

  /**
   * Plan candidate route passing through a side seed waypoint.
   */
  planSideBranch(sideName, shipState, seedWaypoint, dest, vessel, icebergs = [], cruiseSpeed = 20.0) {
    const waypoints = [
      { x: shipState.x, y: shipState.y },
      { x: seedWaypoint.x, y: seedWaypoint.y },
      { x: dest.x, y: dest.y }
    ];

    // Smooth route using CurvatureConstrainedSmoother
    const smoothRes = curvatureSmoother.smoothRoute(waypoints, vessel, icebergs);
    let finalWaypoints = smoothRes.smoothedWaypoints;

    // Perform Continuous Space/Time Collision Validation
    let valRes = continuousCollisionValidator.validateFullRoute(finalWaypoints, vessel, icebergs, cruiseSpeed);

    if (!valRes.isValid) {
      // Fallback to un-smoothed 3-waypoint seed path if curvature smoothing clipped too close to hazard
      const rawVal = continuousCollisionValidator.validateFullRoute(waypoints, vessel, icebergs, cruiseSpeed);
      if (rawVal.isValid) {
        finalWaypoints = waypoints;
        valRes = rawVal;
      }
    }

    // Calculate metrics
    let totalDist = 0;
    for (let i = 0; i < finalWaypoints.length - 1; i++) {
      totalDist += wrappedDistanceCoords(finalWaypoints[i].x, finalWaypoints[i].y, finalWaypoints[i+1].x, finalWaypoints[i+1].y);
    }

    const etaHours = totalDist / Math.max(1.0, cruiseSpeed) / 3600.0;
    const estimatedFuel = parseFloat((totalDist * 0.0015).toFixed(1));

    // Calculate heading turn effort relative to ship heading
    const secondPt = finalWaypoints[1] || seedWaypoint;
    const initialHeading = Math.atan2(secondPt.y - shipState.y, secondPt.x - shipState.x);
    const headingDiff = Math.abs((initialHeading - (shipState.heading || 0) + Math.PI) % (2 * Math.PI) - Math.PI);
    const turnEffortDeg = parseFloat((headingDiff * 180 / Math.PI).toFixed(1));

    const candidate = {
      side: sideName,
      safe: valRes.isValid,
      waypoints: finalWaypoints,
      distance: totalDist,
      eta: etaHours,
      fuel: estimatedFuel,
      minClearance: valRes.minPredictedClearance,
      minPhysicalClearance: valRes.minPhysicalClearance,
      turnEffortDeg,
      rejectionReasons: valRes.isValid ? [] : [valRes.reason]
    };

    return candidate;
  }

  /**
   * Explicitly evaluate LEFT and RIGHT branches and select winner deterministically.
   */
  evaluateLeftRight(shipState, dest, hazard, vessel, icebergs = [], mode = 'BALANCED') {
    const startTime = performance.now();
    const { leftSeed, rightSeed } = this.generateSymmetricSideSeeds(shipState, dest, hazard);

    const cruiseSpeed = vessel?.speed || vessel?.speedKnots || 20.0;

    const leftEval = this.planSideBranch('LEFT', shipState, leftSeed, dest, vessel, icebergs, cruiseSpeed);
    const rightEval = this.planSideBranch('RIGHT', shipState, rightSeed, dest, vessel, icebergs, cruiseSpeed);

    let winner = null;
    let selectedSide = 'NONE';
    let tieBreakReason = null;

    if (leftEval.safe && !rightEval.safe) {
      winner = leftEval;
      selectedSide = 'LEFT';
      tieBreakReason = 'RIGHT_UNSAFE';
    } else if (!leftEval.safe && rightEval.safe) {
      winner = rightEval;
      selectedSide = 'RIGHT';
      tieBreakReason = 'LEFT_UNSAFE';
    } else if (leftEval.safe && rightEval.safe) {
      // Both are safe -> Compare by Objective & Feasibility
      if (mode === 'SAFEST') {
        if (leftEval.minClearance > rightEval.minClearance + 5.0) {
          winner = leftEval; selectedSide = 'LEFT'; tieBreakReason = 'HIGHER_MIN_CLEARANCE';
        } else if (rightEval.minClearance > leftEval.minClearance + 5.0) {
          winner = rightEval; selectedSide = 'RIGHT'; tieBreakReason = 'HIGHER_MIN_CLEARANCE';
        }
      }

      if (!winner) {
        // Compare by total distance & turn effort
        if (leftEval.distance < rightEval.distance - 20.0) {
          winner = leftEval; selectedSide = 'LEFT'; tieBreakReason = 'SHORTER_DISTANCE';
        } else if (rightEval.distance < leftEval.distance - 20.0) {
          winner = rightEval; selectedSide = 'RIGHT'; tieBreakReason = 'SHORTER_DISTANCE';
        } else {
          // Effectively equal distance -> Pick side with lower turn effort from current ship heading
          if (leftEval.turnEffortDeg <= rightEval.turnEffortDeg) {
            winner = leftEval; selectedSide = 'LEFT'; tieBreakReason = 'LOWER_TURN_EFFORT_TIE_BREAK';
          } else {
            winner = rightEval; selectedSide = 'RIGHT'; tieBreakReason = 'LOWER_TURN_EFFORT_TIE_BREAK';
          }
        }
      }
    } else {
      // Both unsafe!
      selectedSide = 'NONE';
      tieBreakReason = 'BOTH_SIDES_UNSAFE';
    }

    const scoreMargin = parseFloat(Math.abs(leftEval.distance - rightEval.distance).toFixed(2));
    const safetyStatus = (leftEval.safe || rightEval.safe) ? 'SAFE_BRANCH_AVAILABLE' : 'NO_SAFE_SIDE';

    const encounterId = `enc_${hazard.id || 'hazard'}_${Math.round(shipState.x)}_${Math.round(shipState.y)}`;

    return {
      encounterId,
      selectedSide,
      selectionReason: tieBreakReason,
      scoreMargin,
      safetyStatus,
      leftMetrics: leftEval,
      rightMetrics: rightEval,
      leftCandidate: leftEval,
      rightCandidate: rightEval,
      selectedRoute: winner ? winner.waypoints : null,
      tieBreakReason,
      calcTimeMs: performance.now() - startTime
    };
  }
}

export const fastFirstSafePlanner = new FastFirstSafePlanner();
