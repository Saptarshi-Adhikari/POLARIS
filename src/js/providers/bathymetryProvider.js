/**
 * POLARIS Nav-OS — Bathymetry Provider & Shallow-Water Safety Layer (Phase 3)
 *
 * Implements normalized depth grid provider interface (GEBCO / IBCSO sample ingestion).
 * Computes depth-aware route costs, shallow-water penalties, and grounding safety checks.
 * Configurable vessel draft & safety clearance thresholds.
 */

import { worldToGeo } from './geoTransform.js';

export class BathymetryProvider {
  constructor(options = {}) {
    this.name = options.name || 'GEBCO_IBCSO_BATHYMETRY';
    this.gridWidth = options.gridWidth || 36;
    this.gridHeight = options.gridHeight || 24;
    this.minSafeDepthM = options.minSafeDepthM || 12.0; // Default vessel draft safety margin (12.0m)
    this.shallowCautionDepthM = options.shallowCautionDepthM || 30.0; // Shallow water caution margin (30.0m)
    
    // Default 36x24 depth grid (in meters below sea level; positive depth = meters water column)
    this.depthGrid = new Float32Array(this.gridWidth * this.gridHeight);
    this._initializeSampleDepthGrid();
  }

  _initializeSampleDepthGrid() {
    // Fill with deep ocean defaults (2500m depth)
    this.depthGrid.fill(2500.0);

    // Simulate Antarctic Shelf Shoal & Shallow Water Banks in top-right / coastal regions
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const idx = y * this.gridWidth + x;
        // Shoal region near (x=28..35, y=0..8) - shallow depth 5m..25m
        if (x >= 28 && y <= 8) {
          const distToShelf = Math.hypot(x - 30, y - 4);
          if (distToShelf < 6) {
            this.depthGrid[idx] = Math.max(4.0, 5.0 + distToShelf * 4.0); // Shallow grounding risk (< 12m)
          }
        }
        // Continental slope depth transition
        else if (x >= 20 && y <= 12) {
          this.depthGrid[idx] = 120.0 + (x - 20) * 15.0;
        }
      }
    }
  }

  /**
   * Get depth in meters at world coordinates (wx, wy).
   */
  getDepthAt(wx, wy, worldWidth = 3600, worldHeight = 2400) {
    const gx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor((wx / worldWidth) * this.gridWidth)));
    const gy = Math.max(0, Math.min(this.gridHeight - 1, Math.floor((wy / worldHeight) * this.gridHeight)));
    const idx = gy * this.gridWidth + gx;
    return this.depthGrid[idx];
  }

  /**
   * Check if cell at (wx, wy) is a grounding hazard for vessel with specified draft.
   */
  isGroundingHazard(wx, wy, vesselDraftM = 10.0, safetyMarginM = 2.0) {
    const depth = this.getDepthAt(wx, wy);
    const minRequiredDepth = vesselDraftM + safetyMarginM;
    return depth < minRequiredDepth;
  }

  /**
   * Calculate bathymetric traversal cost multiplier.
   */
  getDepthCostMultiplier(wx, wy, vesselDraftM = 10.0) {
    const depth = this.getDepthAt(wx, wy);
    const minRequired = vesselDraftM + 2.0;

    if (depth < minRequired) {
      return Infinity; // Unnavigable grounding cell
    }
    if (depth < this.shallowCautionDepthM) {
      // Shallow water hydrodynamic resistance penalty
      const ratio = 1.0 - (depth - minRequired) / (this.shallowCautionDepthM - minRequired);
      return 1.0 + ratio * 3.0; // Up to 4.0x cost multiplier
    }
    return 1.0; // Deep water normal cost
  }
}
