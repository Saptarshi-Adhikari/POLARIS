/**
 * Hierarchical Planner (Phase 9)
 * Combines Global A* (long-range) with Local D* Lite (fast incremental avoidance).
 */

import { createDStarLite } from './dStarLite.js';

export class HierarchicalPlanner {
  constructor(gridWidth = 3600, gridHeight = 2400, options = {}) {
    this.gridWidth = gridWidth;
    this.gridHeight = gridHeight;

    this.globalPlanner = {
      algorithm: 'a_star',
      resolution: options.globalResolution || 40,
      lastPlanTime: 0,
      planCooldown: options.globalCooldown || 5000
    };

    const dStarCols = Math.ceil(gridWidth / 20);
    const dStarRows = Math.ceil(gridHeight / 20);

    this.localPlanner = {
      algorithm: 'd_star_lite',
      resolution: options.localResolution || 20,
      dStar: createDStarLite(dStarCols, dStarRows),
      lastUpdate: 0,
      updateInterval: options.localUpdateInterval || 100
    };

    this.globalRoute = null;
    this.localRoute = null;

    this.stats = {
      globalPlans: 0,
      localReplans: 0,
      avgGlobalTime: 12.0,
      avgLocalTime: 1.2
    };
  }

  async planRoute(start, goal, icebergs = [], globalPlannerFallback = null) {
    const startTime = performance.now();

    let globalPlan = null;
    if (globalPlannerFallback && typeof globalPlannerFallback === 'function') {
      const gStart = performance.now();
      globalPlan = await globalPlannerFallback(start, goal);
      const gTime = performance.now() - gStart;
      this.stats.avgGlobalTime = (this.stats.avgGlobalTime * 0.7) + (gTime * 0.3);
      this.stats.globalPlans++;
    }

    if (!globalPlan || globalPlan.length === 0) {
      return null;
    }

    this.globalRoute = globalPlan;

    const lStart = performance.now();
    const localPlan = this.planLocalRoute(start, globalPlan, icebergs);
    const lTime = performance.now() - lStart;

    this.stats.avgLocalTime = (this.stats.avgLocalTime * 0.7) + (lTime * 0.3);
    this.stats.localReplans++;

    if (localPlan && localPlan.length > 0) {
      this.localRoute = localPlan;
      return localPlan;
    }

    return globalPlan;
  }

  planLocalRoute(start, globalRoute, icebergs) {
    const res = this.localPlanner.resolution;
    const startCell = {
      x: Math.floor(start.x / res),
      y: Math.floor(start.y / res)
    };

    const goalPt = globalRoute[Math.min(3, globalRoute.length - 1)];
    const goalCell = {
      x: Math.floor(goalPt.x / res),
      y: Math.floor(goalPt.y / res)
    };

    const now = performance.now();
    const changedEdges = this.detectChangedObstacles(icebergs, res);

    if (this.localPlanner.dStar.openSet.length > 0 && changedEdges.length > 0) {
      this.localPlanner.dStar.updateGraph(changedEdges);
    } else {
      this.localPlanner.dStar.initialize(startCell, goalCell);
      this.localPlanner.dStar.computeShortestPath();
    }
    this.localPlanner.lastUpdate = now;

    const rawPath = this.localPlanner.dStar.extractPath();
    if (!rawPath) return null;

    return rawPath.map(p => ({
      x: p.x * res + res / 2,
      y: p.y * res + res / 2
    }));
  }

  detectChangedObstacles(icebergs, resolution) {
    const changed = [];
    for (const ice of icebergs) {
      const radius = (ice.collisionRadius || 15) + 15;
      const cellRad = Math.ceil(radius / resolution);
      const cx = Math.floor(ice.x / resolution);
      const cy = Math.floor(ice.y / resolution);

      for (let dx = -cellRad; dx <= cellRad; dx++) {
        for (let dy = -cellRad; dy <= cellRad; dy++) {
          changed.push({
            x: cx + dx,
            y: cy + dy,
            newCost: 1
          });
        }
      }
    }
    return changed;
  }

  getStats() {
    return {
      globalPlans: this.stats.globalPlans,
      localReplans: this.stats.localReplans,
      avgGlobalTime: parseFloat(this.stats.avgGlobalTime.toFixed(2)),
      avgLocalTime: parseFloat(this.stats.avgLocalTime.toFixed(2)),
      algorithm: 'hierarchical_a_star_d_star_lite'
    };
  }
}

export function createHierarchicalPlanner(width, height, options = {}) {
  return new HierarchicalPlanner(width, height, options);
}
