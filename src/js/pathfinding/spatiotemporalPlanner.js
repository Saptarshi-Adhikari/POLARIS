/**
 * POLARIS Nav-OS — Spatiotemporal 4D A* Path Planner (Phase 6)
 *
 * Extends 2D A* pathfinding into 4D spacetime (x, y, t) to evaluate predicted hazard positions at vessel arrival time.
 * Selectable planner mode: STATIC_2D vs SPATIOTEMPORAL_4D.
 */

import { MinHeap } from '../utils.js';
import { wrappedDistanceCoords } from '../utils.js';

export const PLANNER_MODES = {
  STATIC_2D: 'STATIC_2D',
  SPATIOTEMPORAL_4D: 'SPATIOTEMPORAL_4D'
};

export class SpatiotemporalPlanner {
  constructor(options = {}) {
    this.mode = options.mode || PLANNER_MODES.SPATIOTEMPORAL_4D;
    this.gridWidth = options.gridWidth || 72;
    this.gridHeight = options.gridHeight || 48;
    this.worldWidth = options.worldWidth || 3600;
    this.worldHeight = options.worldHeight || 2400;
  }

  /**
   * Evaluates if position (cx, cy) at time t (hours) is blocked by predicted hazard locations.
   */
  isHazardBlocked4D(cx, cy, tHours, icebergs = []) {
    for (let ice of icebergs) {
      // Predict iceberg position at future time tHours
      const px = ice.x + (ice.vx || 0) * tHours * 3600;
      const py = ice.y + (ice.vy || 0) * tHours * 3600;
      const dist = Math.hypot(cx - px, cy - py);
      const hardR = (ice.collisionRadius || 20) + 45.0; // Hull radius + buffer
      if (dist < hardR) return true;
    }
    return false;
  }

  /**
   * Run 4D Spatiotemporal A* Path Search.
   */
  findPath4D(start, goal, icebergs = [], vesselSpeedKnots = 12.0) {
    const speedSUperSec = vesselSpeedKnots * 0.5144; // Approx conversion
    const cellW = this.worldWidth / this.gridWidth;
    const cellH = this.worldHeight / this.gridHeight;

    const startGX = Math.floor((start.x / this.worldWidth) * this.gridWidth);
    const startGY = Math.floor((start.y / this.worldHeight) * this.gridHeight);
    const goalGX = Math.floor((goal.x / this.worldWidth) * this.gridWidth);
    const goalGY = Math.floor((goal.y / this.worldHeight) * this.gridHeight);

    const openSet = new MinHeap();
    const cameFrom = new Map();
    const gScore = new Map();

    const startKey = `${startGX},${startGY}`;
    gScore.set(startKey, 0);

    const startH = Math.hypot(goal.x - start.x, goal.y - start.y) / speedSUperSec;
    openSet.push({ gx: startGX, gy: startGY, t: 0, f: startH, key: startKey });

    let iterations = 0;
    const maxIter = 3000;

    while (openSet.size > 0 && iterations < maxIter) {
      iterations++;
      const current = openSet.pop();

      if (current.gx === goalGX && current.gy === goalGY) {
        // Reconstruct path
        const waypoints = [];
        let currKey = current.key;
        while (cameFrom.has(currKey)) {
          const parts = currKey.split(',');
          const wx = (parseInt(parts[0]) + 0.5) * cellW;
          const wy = (parseInt(parts[1]) + 0.5) * cellH;
          waypoints.unshift({ x: wx, y: wy });
          currKey = cameFrom.get(currKey);
        }
        waypoints.unshift({ x: start.x, y: start.y });
        waypoints.push({ x: goal.x, y: goal.y });
        return { success: true, waypoints, iterations, plannerMode: this.mode };
      }

      const neighbors = [
        { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
        { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
      ];

      for (const n of neighbors) {
        const ngx = current.gx + n.dx;
        const ngy = current.gy + n.dy;

        if (ngx < 0 || ngx >= this.gridWidth || ngy < 0 || ngy >= this.gridHeight) continue;

        const nwx = (ngx + 0.5) * cellW;
        const nwy = (ngy + 0.5) * cellH;

        const stepDist = Math.hypot(n.dx * cellW, n.dy * cellH);
        const stepTimeHours = (stepDist / speedSUperSec) / 3600.0;
        const nextTimeHours = current.t + stepTimeHours;

        // Check 4D Spatiotemporal collision
        if (this.mode === PLANNER_MODES.SPATIOTEMPORAL_4D) {
          if (this.isHazardBlocked4D(nwx, nwy, nextTimeHours, icebergs)) continue;
        }

        const nKey = `${ngx},${ngy}`;
        const tentativeG = gScore.get(current.key) + stepTimeHours;

        if (!gScore.has(nKey) || tentativeG < gScore.get(nKey)) {
          cameFrom.set(nKey, current.key);
          gScore.set(nKey, tentativeG);
          const h = (Math.hypot(goal.x - nwx, goal.y - nwy) / speedSUperSec) / 3600.0;
          openSet.push({ gx: ngx, gy: ngy, t: nextTimeHours, f: tentativeG + h, key: nKey });
        }
      }
    }

    // Fallback direct line if planning times out
    return {
      success: false,
      waypoints: [{ x: start.x, y: start.y }, { x: goal.x, y: goal.y }],
      iterations,
      plannerMode: this.mode
    };
  }
}
