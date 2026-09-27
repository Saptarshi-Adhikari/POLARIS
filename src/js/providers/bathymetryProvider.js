/**
 * POLARIS Nav-OS — Canonical Bathymetry Model, Depth Safety & Grounding Protection Layer
 *
 * Implements:
 * 1. Canonical Bathymetry Representation Model (Metadata, positive water depth convention, NaN/missing depth handling).
 * 2. Reusable Data Adapter supporting preprocessed JSON contours, grid arrays, and fallback datasets.
 * 3. 5-Tier Depth Safety Classification (SAFE, CAUTION, SHALLOW, GROUNDING_RISK, UNKNOWN).
 * 4. Vessel-specific safety limits derived from draft, underKeelClearance, safetyMargin, and uncertaintyAllowance.
 * 5. Continuous space-interpolated route segment depth validator for safety gates.
 */

import { worldToGeo, geoToWorld, DEFAULT_ANTARCTIC_BBOX } from './geoTransform.js';

export const DEPTH_CLASSIFICATION = Object.freeze({
  SAFE: 'SAFE',
  CAUTION: 'CAUTION',
  SHALLOW: 'SHALLOW',
  GROUNDING_RISK: 'GROUNDING_RISK',
  UNKNOWN: 'UNKNOWN'
});

export const DEFAULT_BATHYMETRY_CONFIG = {
  safeDepthM: 50.0,
  cautionDepthM: 30.0,
  minimumDepthM: 15.0,
  uncertaintyMarginM: 2.0,
  unknownDepthPolicy: 'CAUTION' // 'SAFE' | 'CAUTION' | 'REJECT'
};

export const DEFAULT_VESSEL_DEPTH_CONFIG = {
  draftM: 10.0,
  underKeelClearanceM: 3.0,
  safetyMarginM: 2.0,
  uncertaintyAllowanceM: 1.5
};

export class BathymetryProvider {
  constructor(options = {}) {
    this.source = options.source || 'GEBCO_IBCSO_BATHYMETRY';
    this.coordinateSystem = options.coordinateSystem || 'POLARIS_WORLD_GRID';
    this.gridWidth = options.gridWidth || 36;
    this.gridHeight = options.gridHeight || 24;
    this.units = 'METERS_POSITIVE_DOWN';
    this.quality = options.quality || 'SYNTHETIC_HIGH_RES_ALIGNED';
    this.timestamp = options.timestamp || new Date().toISOString();

    this.config = { ...DEFAULT_BATHYMETRY_CONFIG, ...(options.config || {}) };
    this.vesselConfig = { ...DEFAULT_VESSEL_DEPTH_CONFIG, ...(options.vesselConfig || {}) };

    // 36x24 depth grid (positive meters water column)
    this.depthGrid = new Float32Array(this.gridWidth * this.gridHeight);
    this.depthGridCache = new Map();

    this._initializeDepthGrid(options.customGrid || options.contours);
  }

  updateConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
    this.depthGridCache.clear();
  }

  updateVesselConfig(newVesselConfig = {}) {
    this.vesselConfig = { ...this.vesselConfig, ...newVesselConfig };
    this.depthGridCache.clear();
  }

  _initializeDepthGrid(customData) {
    this.depthGrid.fill(2500.0); // Default deep ocean (2500m)

    if (customData && Array.isArray(customData)) {
      // Ingest custom 1D array or flat depth data
      for (let i = 0; i < Math.min(this.depthGrid.length, customData.length); i++) {
        const val = Number(customData[i]);
        this.depthGrid[i] = isNaN(val) ? NaN : Math.max(0, val);
      }
      return;
    }

    // Default Antarctic Shelf & Shallow Shoal layout
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const idx = y * this.gridWidth + x;
        // Shoal region near (x=28..35, y=0..8) - shallow depth 4m..25m
        if (x >= 28 && y <= 8) {
          const distToShelf = Math.hypot(x - 30, y - 4);
          if (distToShelf < 6) {
            this.depthGrid[idx] = Math.max(3.0, 4.0 + distToShelf * 4.0);
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
   * Returns canonical bathymetry representation metadata model.
   */
  getMetadata() {
    return {
      source: this.source,
      coordinateSystem: this.coordinateSystem,
      resolution: `${this.gridWidth}x${this.gridHeight}`,
      width: this.gridWidth,
      height: this.gridHeight,
      units: this.units,
      quality: this.quality,
      timestamp: this.timestamp
    };
  }

  /**
   * Derive effective minimum safe depth for a vessel configuration.
   */
  getEffectiveSafeDepth(vesselOpts = {}) {
    const draft = vesselOpts.draft !== undefined ? vesselOpts.draft : (vesselOpts.draftM !== undefined ? vesselOpts.draftM : this.vesselConfig.draftM);
    const ukc = vesselOpts.underKeelClearance !== undefined ? vesselOpts.underKeelClearance : (vesselOpts.underKeelClearanceM !== undefined ? vesselOpts.underKeelClearanceM : this.vesselConfig.underKeelClearanceM);
    const margin = vesselOpts.safetyMargin !== undefined ? vesselOpts.safetyMargin : (vesselOpts.safetyMarginM !== undefined ? vesselOpts.safetyMarginM : this.vesselConfig.safetyMarginM);
    const uncertainty = vesselOpts.uncertaintyAllowance !== undefined ? vesselOpts.uncertaintyAllowance : (vesselOpts.uncertaintyAllowanceM !== undefined ? vesselOpts.uncertaintyAllowanceM : (this.config.uncertaintyMargin || this.vesselConfig.uncertaintyAllowanceM));
    return draft + ukc + margin + uncertainty;
  }

  /**
   * Get depth in meters at world coordinates (wx, wy).
   */
  getDepthAt(wx, wy, worldWidth = 3600, worldHeight = 2400) {
    if (isNaN(wx) || isNaN(wy)) return NaN;
    const cacheKey = `${Math.floor(wx)},${Math.floor(wy)}`;
    if (this.depthGridCache.has(cacheKey)) {
      return this.depthGridCache.get(cacheKey);
    }

    const gx = Math.max(0, Math.min(this.gridWidth - 1, Math.floor((wx / worldWidth) * this.gridWidth)));
    const gy = Math.max(0, Math.min(this.gridHeight - 1, Math.floor((wy / worldHeight) * this.gridHeight)));
    const idx = gy * this.gridWidth + gx;
    const depth = this.depthGrid[idx];

    this.depthGridCache.set(cacheKey, depth);
    if (this.depthGridCache.size > 2000) {
      this.depthGridCache.clear();
    }
    return depth;
  }

  /**
   * Classify depth safety tier for a given depth measurement and vessel parameters.
   */
  classifyDepth(depthM, vesselOpts = {}) {
    if (depthM === null || depthM === undefined || isNaN(depthM)) {
      return DEPTH_CLASSIFICATION.UNKNOWN;
    }

    const effectiveMin = this.getEffectiveSafeDepth(vesselOpts);
    const cautionThreshold = Math.max(effectiveMin + 15.0, this.config.cautionDepthM);
    const safeThreshold = Math.max(cautionThreshold + 20.0, this.config.safeDepthM);

    if (depthM < effectiveMin) {
      return DEPTH_CLASSIFICATION.GROUNDING_RISK;
    }
    if (depthM < cautionThreshold) {
      return DEPTH_CLASSIFICATION.SHALLOW;
    }
    if (depthM < safeThreshold) {
      return DEPTH_CLASSIFICATION.CAUTION;
    }
    return DEPTH_CLASSIFICATION.SAFE;
  }

  /**
   * Check if point (wx, wy) is a grounding hazard for vessel.
   */
  isGroundingHazard(wx, wy, vesselOpts = {}) {
    const depth = this.getDepthAt(wx, wy);
    const classification = this.classifyDepth(depth, vesselOpts);
    return classification === DEPTH_CLASSIFICATION.GROUNDING_RISK;
  }

  /**
   * Calculate bathymetric traversal cost multiplier for route planning.
   */
  getDepthCostMultiplier(wx, wy, vesselOpts = {}) {
    const depth = this.getDepthAt(wx, wy);
    const classification = this.classifyDepth(depth, vesselOpts);

    switch (classification) {
      case DEPTH_CLASSIFICATION.GROUNDING_RISK:
        return Infinity; // Hard unnavigable obstacle
      case DEPTH_CLASSIFICATION.SHALLOW:
        return 5.0; // High cost penalty
      case DEPTH_CLASSIFICATION.CAUTION:
        return 2.0; // Moderate cost penalty
      case DEPTH_CLASSIFICATION.UNKNOWN:
        return this.config.unknownDepthPolicy === 'REJECT' ? Infinity : 3.0;
      case DEPTH_CLASSIFICATION.SAFE:
      default:
        return 1.0;
    }
  }

  /**
   * Continuous space-interpolated route segment depth validator.
   */
  validateRouteDepth(waypoints = [], vesselOpts = {}, samplingSpacingSU = 30.0) {
    if (!waypoints || waypoints.length < 2) {
      return {
        safe: true,
        minimumDepth: 2500.0,
        criticalSegment: null,
        classification: DEPTH_CLASSIFICATION.SAFE,
        samplesChecked: 0,
        reason: 'Route contains less than 2 waypoints.'
      };
    }

    let minDepth = Infinity;
    let criticalClassification = DEPTH_CLASSIFICATION.SAFE;
    let criticalSegment = null;
    let samplesChecked = 0;
    const effectiveMin = this.getEffectiveSafeDepth(vesselOpts);

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const segDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.max(2, Math.ceil(segDist / samplingSpacingSU));

      for (let s = 0; s <= steps; s++) {
        const ratio = s / steps;
        const sx = p1.x + ratio * (p2.x - p1.x);
        const sy = p1.y + ratio * (p2.y - p1.y);

        samplesChecked++;
        const depth = this.getDepthAt(sx, sy);
        const cls = this.classifyDepth(depth, vesselOpts);

        if (isNaN(depth) || depth < minDepth) {
          minDepth = isNaN(depth) ? 0.0 : depth;
        }

        if (cls === DEPTH_CLASSIFICATION.GROUNDING_RISK) {
          return {
            safe: false,
            minimumDepth: parseFloat(minDepth.toFixed(1)),
            criticalSegment: { index: i, start: p1, end: p2, point: { x: sx, y: sy } },
            classification: DEPTH_CLASSIFICATION.GROUNDING_RISK,
            samplesChecked,
            reason: `Grounding risk detected: depth ${depth.toFixed(1)}m below effective safe minimum (${effectiveMin.toFixed(1)}m).`
          };
        }

        if (cls === DEPTH_CLASSIFICATION.SHALLOW && criticalClassification !== DEPTH_CLASSIFICATION.GROUNDING_RISK) {
          criticalClassification = DEPTH_CLASSIFICATION.SHALLOW;
          criticalSegment = { index: i, start: p1, end: p2, point: { x: sx, y: sy } };
        }
      }
    }

    return {
      safe: criticalClassification !== DEPTH_CLASSIFICATION.GROUNDING_RISK,
      minimumDepth: parseFloat(minDepth.toFixed(1)),
      criticalSegment,
      classification: criticalClassification,
      samplesChecked,
      reason: criticalClassification === DEPTH_CLASSIFICATION.SAFE
        ? 'Route depth validation passed across all segments.'
        : `Route passes through ${criticalClassification} water depth corridor.`
    };
  }

  isDepthSafe(wx, wy, vesselDraftM = 10.0) {
    const depth = this.getDepthAt(wx, wy);
    const cls = this.classifyDepth(depth, { draftM: vesselDraftM });
    return cls !== DEPTH_CLASSIFICATION.GROUNDING_RISK;
  }
}

export const bathymetryProvider = new BathymetryProvider();

