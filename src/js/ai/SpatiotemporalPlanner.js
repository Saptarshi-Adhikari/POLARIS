/**
 * POLARIS Nav-OS — True Spatiotemporal (x, y, t) Path Planner (Phase 3A)
 *
 * Implements Time-Expanded Spatiotemporal A* (TIME_SPATIOTEMPORAL_ASTAR) over explicit (x, y, t) state keys.
 * Evaluates time-dependent hazard occupancy, predicted iceberg trajectory corridors, predicted AIS targets,
 * arrival-time environmental risk, bathymetric clearance, vessel maneuverability, and continuous space/time collision validation.
 */

import { continuousCollisionValidator } from './continuousCollisionValidator.js';
import { curvatureSmoother } from '../pathfinding/CurvatureConstrainedSmoother.js';
import { vesselManeuveringEngine } from './VesselManeuveringEngine.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';
import { wrappedDistanceCoords } from '../utils.js';
import { spatiotemporalRiskOccupancy } from '../data/SpatiotemporalRiskOccupancy.js';

export const DEFAULT_SPATIOTEMPORAL_CONFIG = {
  gridStepSU: 40.0,             // Spatial cell size in Simulation Units (SU)
  timeStepSeconds: 10.0,         // Temporal bucket discretization in seconds
  maxPlanningHorizonSec: 1800.0, // Maximum planning horizon (30 min)
  heuristicEpsilon: 1.5,         // Weighted A* admissibility multiplier for fast-first-safe search
  cruiseSpeedSU: 15.0,           // Nominal vessel cruise speed in SU/s
  vesselLengthM: 80.0,
  vesselBeamM: 20.0
};

class PriorityQueue {
  constructor() { this._nodes = []; }
  get size() { return this._nodes.length; }
  push(node) {
    this._nodes.push(node);
    this._up(this._nodes.length - 1);
  }
  pop() {
    const top = this._nodes[0];
    const last = this._nodes.pop();
    if (this._nodes.length > 0) {
      this._nodes[0] = last;
      this._down(0);
    }
    return top;
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._nodes[p].f <= this._nodes[i].f) break;
      [this._nodes[p], this._nodes[i]] = [this._nodes[i], this._nodes[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this._nodes.length;
    for (;;) {
      let s = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._nodes[l].f < this._nodes[s].f) s = l;
      if (r < n && this._nodes[r].f < this._nodes[s].f) s = r;
      if (s === i) break;
      [this._nodes[s], this._nodes[i]] = [this._nodes[i], this._nodes[s]];
      i = s;
    }
  }
}

export class SpatiotemporalPlanner {
  constructor(config = {}) {
    this.config = { ...DEFAULT_SPATIOTEMPORAL_CONFIG, ...config };
    this.widthSU = 3600;
    this.heightSU = 2400;
  }

  /**
   * Derive deterministic state key including explicit time bucket.
   * State Key: `${xGrid}:${yGrid}:${tBucket}`
   */
  getStateKey(x, y, t) {
    const gx = Math.round(x / this.config.gridStepSU);
    const gy = Math.round(y / this.config.gridStepSU);
    const gt = Math.floor(t / this.config.timeStepSeconds);
    return `${gx}:${gy}:${gt}`;
  }

  /**
   * Extrapolate predicted position of an iceberg at future timestamp t (seconds from start).
   */
  getIcebergPositionAt(iceberg, tSec) {
    if (!iceberg) return { x: 0, y: 0, vx: 0, vy: 0 };
    const basePos = { x: iceberg.x || iceberg.worldX || 0, y: iceberg.y || iceberg.worldY || 0 };
    const vx = iceberg.vx || 0;
    const vy = iceberg.vy || 0;

    // Scale by dynamic effective drag parameter if available
    const dragMult = iceberg.effectiveDragParam !== undefined ? iceberg.effectiveDragParam : 1.0;

    return {
      x: basePos.x + vx * dragMult * tSec,
      y: basePos.y + vy * dragMult * tSec,
      vx: vx * dragMult,
      vy: vy * dragMult,
      collisionRadius: iceberg.collisionRadius || 20.0,
      uncertaintyRadius: (iceberg.uncertaintyRadius || 10.0) + tSec * 0.05
    };
  }

  /**
   * Extrapolate predicted position of an AIS vessel target at future timestamp t (seconds from start).
   */
  getAisTargetPositionAt(target, tSec) {
    if (!target) return { x: 0, y: 0, vx: 0, vy: 0 };
    const basePos = { x: target.position?.x ?? target.worldX ?? target.x ?? 0, y: target.position?.y ?? target.worldY ?? target.y ?? 0 };
    const vx = target.velocity?.vx ?? target.vx ?? 0;
    const vy = target.velocity?.vy ?? target.vy ?? 0;

    return {
      x: basePos.x + vx * tSec,
      y: basePos.y + vy * tSec,
      vx,
      vy,
      collisionRadius: 25.0,
      uncertaintyRadius: (target.positionUncertainty || 5.0) + tSec * 0.1
    };
  }

  /**
   * Evaluate time-dependent hazard occupancy at candidate state (x, y, t).
   */
  evaluateTimeDependentOccupancy(x, y, tSec, icebergs = [], aisTargets = [], vessel = null) {
    const vesselState = {
      x,
      y,
      heading: 0,
      length: vessel?.length || this.config.vesselLengthM,
      beam: vessel?.beam || this.config.vesselBeamM
    };

    // 1. Iceberg Temporal Occupancy
    for (const ice of icebergs) {
      const iceAtT = this.getIcebergPositionAt(ice, tSec);
      const clearanceRes = continuousCollisionValidator.calculateVesselToIcebergClearance(vesselState, iceAtT, tSec / 3600.0);
      if (clearanceRes.clearance <= 0) {
        return { isOccupied: true, reason: `FUTURE_ICEBERG_OCCUPANCY_${ice.id || 'ICE'}` };
      }
    }

    // 2. AIS Target Temporal Occupancy
    for (const tgt of aisTargets) {
      const tgtAtT = this.getAisTargetPositionAt(tgt, tSec);
      const dist = Math.hypot(x - tgtAtT.x, y - tgtAtT.y);
      const safeRadius = tgtAtT.collisionRadius + (vesselState.length / 2) + tgtAtT.uncertaintyRadius;
      if (dist < safeRadius) {
        return { isOccupied: true, reason: `FUTURE_AIS_TARGET_OCCUPANCY_${tgt.mmsi || 'TGT'}` };
      }
    }

    return { isOccupied: false, reason: null };
  }

  /**
   * Evaluate arrival-time environmental cost at candidate state (x, y, tSec).
   */
  evaluateArrivalEnvironmentCost(x, y, tSec, icebergs = [], environment = {}) {
    let cost = 1.0;

    // Phase 5C Spatiotemporal Risk Occupancy Query
    const queryWorldTime = (environment.worldTime || Date.now()) + tSec * 1000.0;
    const fusedRisk = spatiotemporalRiskOccupancy.querySpatiotemporalRisk(x, y, queryWorldTime, environment.snapshot || {});

    if (fusedRisk.isHardBlocked) {
      return 1000.0; // Hard collision/grounding cost penalty
    }

    if (fusedRisk.maximumRisk > 0) {
      cost += fusedRisk.maximumRisk * 15.0;
    }

    // Dynamic Iceberg Proximity Cost fallback at arrival time t
    for (const ice of icebergs) {
      const iceAtT = this.getIcebergPositionAt(ice, tSec);
      const dist = Math.hypot(x - iceAtT.x, y - iceAtT.y);
      const softInner = iceAtT.collisionRadius + 25.0 + iceAtT.uncertaintyRadius;
      const softOuter = softInner + 200.0;

      if (dist < softOuter) {
        const factor = Math.max(0, 1.0 - (dist - softInner) / (softOuter - softInner));
        cost += factor * factor * 15.0;
      }
    }

    // Weather / Storm cost at arrival time t
    if (environment.stormActive || environment.windSpeed > 30.0) {
      cost *= 1.35;
    }

    return cost;
  }

  /**
   * Execute Time-Expanded Spatiotemporal A* (TIME_SPATIOTEMPORAL_ASTAR) path search over (x, y, t).
   */
  planSpatiotemporalRoute(start, dest, vessel = null, icebergs = [], aisTargets = [], environment = {}, options = {}) {
    const startTime = performance.now();
    const speedSU = vessel?.speed || options.cruiseSpeedSU || this.config.cruiseSpeedSU;

    // Check direct feasibility
    const directDist = Math.hypot(dest.x - start.x, dest.y - start.y);
    const directTimeSec = directDist / speedSU;

    // Bathymetry check on start waypoint
    const startDepthM = bathymetryProvider.getDepthAt(start.x, start.y);
    const startDepthClass = bathymetryProvider.classifyDepth(startDepthM);
    if (startDepthClass === 'GROUNDING_RISK') {
      return {
        success: false,
        waypoints: [{ x: start.x, y: start.y }, { x: dest.x, y: dest.y }],
        plannerType: 'TIME_SPATIOTEMPORAL_ASTAR',
        reason: 'START_WAYPOINT_GROUNDING_RISK'
      };
    }

    const openSet = new PriorityQueue();
    const closedSet = new Map(); // key -> gScore
    const parentMap = new Map(); // key -> parentState

    let expandedStates = 0;
    let generatedNodes = 0;
    let firstSafeLatencyMs = null;
    let firstSafeRoute = null;

    const startState = {
      x: start.x,
      y: start.y,
      t: 0.0, // relative elapsed time in seconds
      worldTime: options.worldTime || Date.now(),
      g: 0.0,
      h: (directDist / speedSU),
      f: (directDist / speedSU) * this.config.heuristicEpsilon,
      key: this.getStateKey(start.x, start.y, 0.0)
    };

    openSet.push(startState);
    closedSet.set(startState.key, 0.0);
    generatedNodes++;

    // 8-neighbor spatial direction vectors
    const step = this.config.gridStepSU;
    const directions = [
      { dx: step, dy: 0 }, { dx: -step, dy: 0 },
      { dx: 0, dy: step }, { dx: 0, dy: -step },
      { dx: step * 0.7071, dy: step * 0.7071 },
      { dx: -step * 0.7071, dy: step * 0.7071 },
      { dx: step * 0.7071, dy: -step * 0.7071 },
      { dx: -step * 0.7071, dy: -step * 0.7071 }
    ];

    let bestEndState = null;

    while (openSet.size > 0 && expandedStates < 2500) {
      const current = openSet.pop();
      expandedStates++;

      // Arrival at destination
      const distToDest = Math.hypot(dest.x - current.x, dest.y - current.y);
      if (distToDest <= step * 1.2) {
        bestEndState = current;

        if (firstSafeLatencyMs === null) {
          firstSafeLatencyMs = Math.round(performance.now() - startTime);
          firstSafeRoute = this.reconstructPath(bestEndState, parentMap, dest);
        }

        // If Fast-First-Safe request, return immediately upon finding first valid safe route
        if (options.fastFirstSafeOnly) {
          break;
        }
      }

      for (const dir of directions) {
        const nextX = current.x + dir.dx;
        const nextY = current.y + dir.dy;

        // Bounds Check
        if (nextX < 50 || nextX > this.widthSU - 50 || nextY < 50 || nextY > this.heightSU - 50) continue;

        // Transition time computation
        const stepDist = Math.hypot(dir.dx, dir.dy);
        const transitionTimeSec = stepDist / speedSU;
        const nextT = current.t + transitionTimeSec;

        if (nextT > this.config.maxPlanningHorizonSec) continue;

        // 1. Time-Dependent Hazard Occupancy Check
        const occRes = this.evaluateTimeDependentOccupancy(nextX, nextY, nextT, icebergs, aisTargets, vessel);
        if (occRes.isOccupied) continue;

        // 2. Bathymetry Safety Gate
        const depthM = bathymetryProvider.getDepthAt(nextX, nextY);
        const depthClass = bathymetryProvider.classifyDepth(depthM);
        if (depthClass === 'GROUNDING_RISK') continue;

        // 3. Maneuverability Feasibility Gate
        const segmentFeasibility = vesselManeuveringEngine.evaluateRouteFeasibility([
          { x: current.x, y: current.y },
          { x: nextX, y: nextY }
        ], { speed: speedSU });

        if (!segmentFeasibility.isFeasible) continue;

        // Cost Calculation
        const envCost = this.evaluateArrivalEnvironmentCost(nextX, nextY, nextT, icebergs, environment);
        const depthPenalty = depthClass === 'SHALLOW' ? 2.5 : 1.0;
        const stepCost = stepDist * envCost * depthPenalty;

        const nextG = current.g + stepCost;
        const nextH = Math.hypot(dest.x - nextX, dest.y - nextY) / speedSU;
        const nextF = nextG + nextH * this.config.heuristicEpsilon;

        const nextKey = this.getStateKey(nextX, nextY, nextT);
        const existingG = closedSet.get(nextKey);

        if (existingG === undefined || nextG < existingG) {
          closedSet.set(nextKey, nextG);

          const nextState = {
            x: nextX,
            y: nextY,
            t: nextT,
            worldTime: current.worldTime + transitionTimeSec * 1000,
            g: nextG,
            h: nextH,
            f: nextF,
            key: nextKey
          };

          parentMap.set(nextKey, current);
          openSet.push(nextState);
          generatedNodes++;
        }
      }
    }

    const finalRoute = bestEndState ? this.reconstructPath(bestEndState, parentMap, dest) : null;
    const calcEnd = performance.now();

    if (!finalRoute || finalRoute.length < 2) {
      return {
        success: false,
        plannerType: 'TIME_SPATIOTEMPORAL_ASTAR',
        waypoints: [{ x: start.x, y: start.y }, { x: dest.x, y: dest.y }],
        expandedStates,
        generatedNodes,
        latencyMs: Math.round(calcEnd - startTime),
        reason: 'NO_FEASIBLE_SPATIOTEMPORAL_PATH'
      };
    }

    // Curvature Smoothing & Revalidation
    const smoothRes = curvatureSmoother.smoothRoute(finalRoute, vessel, icebergs);
    let finalWaypoints = smoothRes.smoothedWaypoints;

    // Continuous Space/Time Safety Re-validation
    const valRes = continuousCollisionValidator.validateFullRoute(finalWaypoints, vessel, icebergs, speedSU);
    if (!valRes.isValid) {
      // Fallback to raw spatiotemporal waypoints if smoothing clipped hazard
      finalWaypoints = finalRoute;
    }

    return {
      success: true,
      plannerType: 'TIME_SPATIOTEMPORAL_ASTAR',
      waypoints: finalWaypoints,
      rawWaypoints: finalRoute,
      expandedStates,
      generatedNodes,
      firstSafeLatencyMs: firstSafeLatencyMs || Math.round(calcEnd - startTime),
      finalRouteLatencyMs: Math.round(calcEnd - startTime),
      temporalHorizonSec: this.config.maxPlanningHorizonSec,
      temporalResolutionSec: this.config.timeStepSeconds
    };
  }

  /**
   * Reconstruct waypoints from parent state map.
   */
  reconstructPath(endState, parentMap, dest) {
    const path = [{ x: dest.x, y: dest.y, t: endState.t }];
    let curr = endState;

    while (curr) {
      path.push({ x: curr.x, y: curr.y, t: curr.t });
      curr = parentMap.get(curr.key);
    }

    path.reverse();
    return path;
  }

  planPath(start, dest, icebergs = [], options = {}) {
    const res = this.planSpatiotemporalRoute(start, dest, options.vessel || null, icebergs, options.aisTargets || [], options.environment || {}, options);
    return res.waypoints ? { waypoints: res.waypoints } : res;
  }
}

export const spatiotemporalPlanner = new SpatiotemporalPlanner();


