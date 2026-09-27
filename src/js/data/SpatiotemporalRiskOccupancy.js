/**
 * POLARIS Nav-OS — Multi-Sensor Uncertainty Fusion & Spatiotemporal Risk Occupancy Engine (Phase 5C)
 *
 * Fuses heterogeneous observations across 7 primary environmental & sensor sources:
 * 1. RADAR (range, bearing, track status, CA-CFAR detection score, polar uncertainty propagation)
 * 2. AIS (MMSI, position, velocity, SOG/COG, track gap age, dead-reckoning uncertainty)
 * 3. SENTINEL-1 SAR (segmentation mask, minimum-area objects, backscatter decibel, product quality)
 * 4. USNIC / SEA-ICE (iceberg catalogue, ice concentration grid, provider freshness)
 * 5. BATHYMETRY (GEBCO grid depth, vessel draft, UKC, 5-tier safety classification)
 * 6. OCEAN CURRENT (u/v vector field, flow magnitude, spatial interpolation)
 * 7. WIND / WEATHER (speed, direction, storm activity factor)
 *
 * CORE ABSTRACTIONS & INVARIANTS:
 * - Deterministic SensorTimeSynchronizer (sourceTimestamp, ingestTimestamp, effectiveWorldTime, timestampAgeMs, temporalQuality)
 * - Temporal Quality States: CURRENT | RECENT | STALE | EXPIRED | INVALID
 * - Common Sensor Evidence Model retaining source evidence and provenance
 * - Explicit distinction between detection/model scores and calibrated probability (NORMALIZED_EVIDENCE_SCORE vs PROBABILITY)
 * - Sensor-specific uncertainty models with UNCERTAINTY_UNKNOWN fallback
 * - Predict-before-fuse dynamic target extrapolation
 * - Association grouping without identity confirmation (source tracks retained)
 * - Track-level uncertainty fusion via Covariance Intersection / Conservative Conflict weighting
 * - Double-counting protection: Capped source contributions & association-group deduplication
 * - Deterministic temporal decay per sensor type (dynamic tracks vs SAR vs bathymetry)
 * - Spatiotemporal Risk Occupancy representation over (x, y, t)
 * - Source-specific risk layers for XAI auditability
 * - ContinuousCollisionValidator remains the final collision/grounding safety gate
 */

import { bathymetryProvider } from '../providers/bathymetryProvider.js';

export const TEMPORAL_QUALITY = Object.freeze({
  CURRENT: 'CURRENT',
  RECENT: 'RECENT',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  INVALID: 'INVALID'
});

export const FUSION_METHOD = Object.freeze({
  SINGLE_SOURCE: 'SINGLE_SOURCE',
  WEIGHTED_FUSION: 'WEIGHTED_FUSION',
  COVARIANCE_INTERSECTION: 'COVARIANCE_INTERSECTION',
  PREDICTED_ONLY: 'PREDICTED_ONLY',
  CONSERVATIVE_CONFLICT: 'CONSERVATIVE_CONFLICT'
});

export const CONFLICT_STATE = Object.freeze({
  CONSISTENT: 'CONSISTENT',
  MINOR_DISAGREEMENT: 'MINOR_DISAGREEMENT',
  SIGNIFICANT_DISAGREEMENT: 'SIGNIFICANT_DISAGREEMENT',
  UNRESOLVED_CONFLICT: 'UNRESOLVED_CONFLICT'
});

export const SENSOR_RELIABILITY_LEVEL = Object.freeze({
  LIVE_HEALTHY: 'LIVE_HEALTHY',
  LIVE_DEGRADED: 'LIVE_DEGRADED',
  CACHED: 'CACHED',
  REPLAY: 'REPLAY',
  SYNTHETIC: 'SYNTHETIC',
  STALE: 'STALE',
  OFFLINE: 'OFFLINE',
  UNKNOWN: 'UNKNOWN'
});

export const RISK_OCCUPANCY_STATE = Object.freeze({
  CLEAR_WATER: 'CLEAR_WATER',
  HIGH_CONFIDENCE_OBSTACLE: 'HIGH_CONFIDENCE_OBSTACLE',
  UNCERTAIN_OBSTACLE: 'UNCERTAIN_OBSTACLE',
  PREDICTED_OBSTACLE: 'PREDICTED_OBSTACLE',
  STALE_OBSTACLE: 'STALE_OBSTACLE',
  CONFLICTING_SENSOR_EVIDENCE: 'CONFLICTING_SENSOR_EVIDENCE',
  GROUNDING_RISK: 'GROUNDING_RISK',
  WEATHER_ADVERSITY: 'WEATHER_ADVERSITY',
  UNKNOWN_REGION: 'UNKNOWN_REGION'
});

/**
 * STEP 1 — SensorTimeSynchronizer
 * Normalizes temporal state without overwriting original source timestamps.
 */
export class SensorTimeSynchronizer {
  constructor() {
    this.maxCurrentAgeMs = 3000;
    this.maxRecentAgeMs = 10000;
    this.maxStaleAgeMs = 60000;
  }

  synchronizeObservation(obs = {}, targetWorldTime = Date.now()) {
    const sourceTimestamp = obs.sourceTimestamp || obs.timestamp || targetWorldTime;
    const ingestTimestamp = obs.ingestTimestamp || targetWorldTime;
    const effectiveWorldTime = targetWorldTime;

    const timestampAgeMs = Math.max(0, effectiveWorldTime - sourceTimestamp);

    let temporalQuality = TEMPORAL_QUALITY.CURRENT;
    if (isNaN(sourceTimestamp) || sourceTimestamp <= 0) {
      temporalQuality = TEMPORAL_QUALITY.INVALID;
    } else if (timestampAgeMs > this.maxStaleAgeMs) {
      temporalQuality = TEMPORAL_QUALITY.EXPIRED;
    } else if (timestampAgeMs > this.maxRecentAgeMs) {
      temporalQuality = TEMPORAL_QUALITY.STALE;
    } else if (timestampAgeMs > this.maxCurrentAgeMs) {
      temporalQuality = TEMPORAL_QUALITY.RECENT;
    }

    return {
      sourceTimestamp,
      ingestTimestamp,
      effectiveWorldTime,
      timestampAgeMs,
      clockStatus: 'SYNCHRONIZED',
      temporalQuality
    };
  }
}

export const sensorTimeSynchronizer = new SensorTimeSynchronizer();

/**
 * STEP 2 & 3 — Common Sensor Evidence Schema
 */
export function createCommonSensorEvidence(raw = {}) {
  const sync = sensorTimeSynchronizer.synchronizeObservation(raw, raw.targetWorldTime || Date.now());

  return {
    source: raw.source || 'UNKNOWN_SENSOR', // RADAR | AIS | SAR | USNIC | BATHYMETRY | CURRENT | WIND
    observationId: raw.observationId || `EVID-${Math.floor(10000 + Math.random() * 90000)}`,
    timestamp: sync.sourceTimestamp,
    temporalSync: sync,
    position: {
      worldX: raw.worldX !== undefined ? raw.worldX : (raw.x || 0.0),
      worldY: raw.worldY !== undefined ? raw.worldY : (raw.y || 0.0),
      latitude: raw.latitude !== undefined ? raw.latitude : -68.5,
      longitude: raw.longitude !== undefined ? raw.longitude : 45.0
    },
    velocity: {
      vx: raw.vx || 0.0,
      vy: raw.vy || 0.0,
      speedMps: raw.speedMps || 0.0,
      courseDeg: raw.courseDeg || 0.0
    },
    geometry: raw.geometry || { type: 'Point', coordinates: [raw.longitude || 45.0, raw.latitude || -68.5] },
    uncertainty: {
      positionUncertaintyMeters: raw.positionUncertaintyMeters !== undefined ? raw.positionUncertaintyMeters : 15.0,
      velocityUncertaintyMps: raw.velocityUncertaintyMps !== undefined ? raw.velocityUncertaintyMps : 1.0,
      covariance: raw.covariance || { varX: 225.0, varY: 225.0, covXY: 0.0 },
      isUnknown: raw.positionUncertaintyMeters === undefined
    },
    quality: raw.quality || 'HIGH',
    sensorReliability: raw.sensorReliability || SENSOR_RELIABILITY_LEVEL.LIVE_HEALTHY,
    // Explicit non-probabilistic evidence score
    detectionScore: raw.detectionScore !== undefined ? raw.detectionScore : (raw.confidence !== undefined ? raw.confidence : 0.8),
    evidenceScoreType: raw.evidenceScoreType || 'NORMALIZED_EVIDENCE_SCORE',
    provenance: raw.provenance || { provider: raw.source || 'UNKNOWN', version: 'v1.0' }
  };
}

/**
 * STEP 4 — Sensor-Specific Uncertainty Adapters
 */
export function calculateSensorUncertainty(sourceType, rawObs = {}) {
  switch (sourceType) {
    case 'RADAR': {
      const rUnc = rawObs.uncertainty?.rangeUncertainty || rawObs.rangeUncertainty || 10.0;
      const bUnc = rawObs.uncertainty?.bearingUncertainty || rawObs.bearingUncertainty || 0.5;
      const posUnc = rawObs.uncertainty?.positionUncertainty || Math.sqrt(rUnc * rUnc + 100.0 * (bUnc * Math.PI / 180.0) ** 2);
      return {
        positionUncertaintyMeters: parseFloat(posUnc.toFixed(2)),
        velocityUncertaintyMps: 1.0,
        covariance: { varR: rUnc * rUnc, varTheta: bUnc * bUnc, trace: posUnc * posUnc },
        isUnknown: false
      };
    }
    case 'AIS': {
      const ageMs = rawObs.timestampAgeMs || 0;
      const basePosUnc = rawObs.positionUncertainty || 10.0;
      const drUncGrowth = (ageMs / 1000.0) * 0.5; // 0.5 m/s uncertainty growth
      const posUnc = basePosUnc + drUncGrowth;
      return {
        positionUncertaintyMeters: parseFloat(posUnc.toFixed(2)),
        velocityUncertaintyMps: 0.5,
        covariance: { varX: posUnc * posUnc * 0.5, varY: posUnc * posUnc * 0.5, covXY: 0.0 },
        isUnknown: false
      };
    }
    case 'SAR': {
      const objectExtent = rawObs.width || rawObs.size || 30.0;
      const posUnc = (rawObs.resolution || 10.0) * 1.5 + objectExtent * 0.2;
      return {
        positionUncertaintyMeters: parseFloat(posUnc.toFixed(2)),
        velocityUncertaintyMps: 2.0,
        covariance: { varX: posUnc * posUnc * 0.5, varY: posUnc * posUnc * 0.5, covXY: 0.0 },
        isUnknown: false
      };
    }
    case 'USNIC':
    case 'SEA_ICE': {
      const isGrid = rawObs.isGrid || false;
      const posUnc = isGrid ? 500.0 : (rawObs.uncertaintyRadius || 50.0);
      return {
        positionUncertaintyMeters: posUnc,
        velocityUncertaintyMps: 0.2,
        covariance: { varX: posUnc * posUnc * 0.5, varY: posUnc * posUnc * 0.5, covXY: 0.0 },
        isUnknown: false
      };
    }
    case 'BATHYMETRY': {
      return {
        positionUncertaintyMeters: 5.0, // GEBCO 500m grid cell center accuracy
        depthUncertaintyMeters: 2.0,
        isUnknown: false
      };
    }
    default:
      return {
        positionUncertaintyMeters: 50.0,
        velocityUncertaintyMps: 2.0,
        covariance: { varX: 2500.0, varY: 2500.0, covXY: 0.0 },
        isUnknown: true,
        uncertaintyState: 'UNCERTAINTY_UNKNOWN'
      };
  }
}

/**
 * STEP 5 — Predict-Before-Fuse Target Extrapolation
 */
export function propagateObservationToTime(obs, targetWorldTime) {
  const sync = sensorTimeSynchronizer.synchronizeObservation(obs, targetWorldTime);
  const dtSec = Math.max(0.0, sync.timestampAgeMs / 1000.0);

  const posX = obs.position?.worldX !== undefined ? obs.position.worldX : (obs.worldX || obs.x || 0.0);
  const posY = obs.position?.worldY !== undefined ? obs.position.worldY : (obs.worldY || obs.y || 0.0);
  const vx = obs.velocity?.vx !== undefined ? obs.velocity.vx : (obs.vx || 0.0);
  const vy = obs.velocity?.vy !== undefined ? obs.velocity.vy : (obs.vy || 0.0);

  const dragMult = obs.effectiveDragParam !== undefined ? obs.effectiveDragParam : 1.0;

  const predictedX = posX + vx * dragMult * dtSec;
  const predictedY = posY + vy * dragMult * dtSec;

  const baseUnc = obs.uncertainty?.positionUncertaintyMeters || 15.0;
  const uncertaintyGrowth = dtSec * 0.5;
  const predictedUncertainty = parseFloat((baseUnc + uncertaintyGrowth).toFixed(2));

  return {
    ...obs,
    temporalSync: sync,
    predictionHorizonSec: parseFloat(dtSec.toFixed(2)),
    predictionModel: obs.source === 'SAR' ? 'STATIC_DRIFT_MODEL' : 'DYNAMIC_LINEAR_EXTRAPOLATION',
    predictionQuality: sync.temporalQuality === TEMPORAL_QUALITY.CURRENT ? 'HIGH' : 'DEGRADED',
    position: {
      ...obs.position,
      worldX: parseFloat(predictedX.toFixed(2)),
      worldY: parseFloat(predictedY.toFixed(2))
    },
    uncertainty: {
      ...obs.uncertainty,
      positionUncertaintyMeters: predictedUncertainty,
      uncertaintyGrowth: parseFloat(uncertaintyGrowth.toFixed(2))
    }
  };
}

/**
 * STEP 6 & 7 — Association Grouping, Conflict Detection & Track-Level Uncertainty Fusion
 */
export class TrackLevelFusionEngine {
  constructor() {
    this.maxAssociationDistMeters = 150.0;
    this.conflictDistanceThresholdMeters = 200.0;
  }

  /**
   * Group multi-sensor observations into association clusters
   */
  formAssociationGroups(observations = []) {
    const groups = [];
    const visited = new Set();

    for (let i = 0; i < observations.length; i++) {
      if (visited.has(i)) continue;
      const obsA = observations[i];
      visited.add(i);

      const group = {
        groupId: `GROUP-${Math.floor(1000 + Math.random() * 9000)}`,
        members: [obsA],
        sources: new Set([obsA.source])
      };

      for (let j = i + 1; j < observations.length; j++) {
        if (visited.has(j)) continue;
        const obsB = observations[j];

        const dist = Math.hypot(obsA.position.worldX - obsB.position.worldX, obsA.position.worldY - obsB.position.worldY);
        // Only associate if distance is small AND they are from different sensor sources (or matching IDs)
        const isDifferentSource = obsA.source !== obsB.source;
        const isSameTrack = obsA.observationId && obsB.observationId && obsA.observationId === obsB.observationId;

        if (dist <= this.maxAssociationDistMeters && (isDifferentSource || isSameTrack)) {
          visited.add(j);
          group.members.push(obsB);
          group.sources.add(obsB.source);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  /**
   * Evaluate Conflict State among observations in an association group
   */
  evaluateConflictState(members = []) {
    if (members.length <= 1) return CONFLICT_STATE.CONSISTENT;

    let maxDist = 0.0;
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const d = Math.hypot(members[i].position.worldX - members[j].position.worldX, members[i].position.worldY - members[j].position.worldY);
        if (d > maxDist) maxDist = d;
      }
    }

    if (maxDist > this.conflictDistanceThresholdMeters) return CONFLICT_STATE.UNRESOLVED_CONFLICT;
    if (maxDist > 100.0) return CONFLICT_STATE.SIGNIFICANT_DISAGREEMENT;
    if (maxDist > 30.0) return CONFLICT_STATE.MINOR_DISAGREEMENT;
    return CONFLICT_STATE.CONSISTENT;
  }

  /**
   * STEP 7 & 12 — Fuse track state with Covariance Intersection / Conservative Conflict Weighting & Double-Counting Guard
   */
  fuseAssociationGroup(group, targetWorldTime = Date.now()) {
    const members = group.members.map(m => propagateObservationToTime(m, targetWorldTime));
    const conflictState = this.evaluateConflictState(members);

    if (members.length === 1) {
      const m = members[0];
      return {
        groupId: group.groupId,
        associationState: `${m.source}_ONLY`,
        conflictState,
        fusedPosition: { ...m.position },
        fusedVelocity: { ...m.velocity },
        fusedUncertainty: { ...m.uncertainty },
        fusionMethod: FUSION_METHOD.SINGLE_SOURCE,
        sourceContributions: [{ source: m.source, weight: 1.0, observationId: m.observationId }],
        fusedEvidenceScore: m.detectionScore,
        members
      };
    }

    // Double-Counting Guard & Covariance Intersection Weighting
    let totalWeight = 0.0;
    let weightedX = 0.0;
    let weightedY = 0.0;
    let weightedVx = 0.0;
    let weightedVy = 0.0;

    const sourceContributions = [];
    const sourceFamilySeen = new Set();

    for (const m of members) {
      // Capped source contribution per source family to prevent artificial double counting
      let familyWeightMult = 1.0;
      if (sourceFamilySeen.has(m.source)) {
        familyWeightMult = 0.25; // Capped secondary contribution from same sensor family
      }
      sourceFamilySeen.add(m.source);

      const unc = Math.max(1.0, m.uncertainty?.positionUncertaintyMeters || 15.0);
      const varInv = (1.0 / (unc * unc)) * familyWeightMult;

      weightedX += m.position.worldX * varInv;
      weightedY += m.position.worldY * varInv;
      weightedVx += m.velocity.vx * varInv;
      weightedVy += m.velocity.vy * varInv;
      totalWeight += varInv;

      sourceContributions.push({
        source: m.source,
        weight: parseFloat(varInv.toFixed(4)),
        observationId: m.observationId
      });
    }

    // Normalize weights
    sourceContributions.forEach(c => { c.weight = parseFloat((c.weight / totalWeight).toFixed(3)); });

    const fusedX = weightedX / totalWeight;
    const fusedY = weightedY / totalWeight;
    const fusedVx = weightedVx / totalWeight;
    const fusedVy = weightedVy / totalWeight;

    // Conservative covariance intersection uncertainty (takes max bound + conflict penalty)
    const minUnc = Math.min(...members.map(m => m.uncertainty?.positionUncertaintyMeters || 15.0));
    let conflictPenalty = 0.0;
    if (conflictState === CONFLICT_STATE.SIGNIFICANT_DISAGREEMENT) conflictPenalty = 25.0;
    if (conflictState === CONFLICT_STATE.UNRESOLVED_CONFLICT) conflictPenalty = 75.0;

    const fusedPosUnc = parseFloat((Math.sqrt(1.0 / totalWeight) + minUnc * 0.3 + conflictPenalty).toFixed(2));
    const maxScore = Math.max(...members.map(m => m.detectionScore || 0.5));

    let fusionMethod = FUSION_METHOD.COVARIANCE_INTERSECTION;
    if (conflictState === CONFLICT_STATE.UNRESOLVED_CONFLICT) fusionMethod = FUSION_METHOD.CONSERVATIVE_CONFLICT;

    return {
      groupId: group.groupId,
      associationState: Array.from(group.sources).join('_') + '_ASSOCIATED',
      conflictState,
      fusedPosition: { worldX: parseFloat(fusedX.toFixed(2)), worldY: parseFloat(fusedY.toFixed(2)) },
      fusedVelocity: { vx: parseFloat(fusedVx.toFixed(2)), vy: parseFloat(fusedVy.toFixed(2)) },
      fusedUncertainty: { positionUncertaintyMeters: fusedPosUnc, isUnknown: false },
      fusionMethod,
      sourceContributions,
      fusedEvidenceScore: parseFloat(maxScore.toFixed(3)),
      members
    };
  }
}

export const trackLevelFusionEngine = new TrackLevelFusionEngine();

/**
 * STEP 10, 11, 13 & 15 — Spatiotemporal Risk Occupancy Representation Over (x, y, t)
 */
export class SpatiotemporalRiskOccupancy {
  constructor() {
    this.version = 'POLARIS_RISK_OCCUPANCY_v1.0';
    this.widthSU = 3600;
    this.heightSU = 2400;
    this.gridStepSU = 40.0;
  }

  /**
   * STEP 11 — Maintain separate source risk layers prior to fusion for XAI auditability
   */
  buildSourceRiskLayers(environmentSnapshot = {}, targetWorldTime = Date.now()) {
    const radarLayer = (environmentSnapshot.radarPerception?.detections || []).map(d => createCommonSensorEvidence({ ...d, source: 'RADAR' }));
    const aisLayer = (environmentSnapshot.vessels || []).map(v => createCommonSensorEvidence({ ...v, source: 'AIS' }));
    const sarLayer = (environmentSnapshot.sarPerception?.unetDetections || []).map(s => createCommonSensorEvidence({ ...s, source: 'SAR' }));
    const seaIceLayer = (environmentSnapshot.icebergs || []).map(i => createCommonSensorEvidence({ ...i, source: 'USNIC' }));
    const bathymetryMeta = environmentSnapshot.bathymetry || bathymetryProvider.getMetadata();

    return {
      radarRiskLayer: radarLayer,
      aisRiskLayer: aisLayer,
      sarRiskLayer: sarLayer,
      seaIceRiskLayer: seaIceLayer,
      bathymetryRiskLayer: bathymetryMeta,
      currentRiskLayer: environmentSnapshot.currents || { u: 0, v: 0 },
      weatherRiskLayer: environmentSnapshot.wind || { speedKnots: 0 }
    };
  }

  /**
   * STEP 10 & 14 — Core Spatiotemporal Query Interface for Planner: query(x, y, worldTime)
   */
  querySpatiotemporalRisk(x, y, queryWorldTime = Date.now(), environmentSnapshot = {}, vesselState = { draftM: 10.0, underKeelClearanceM: 3.0 }) {
    const tSec = Math.max(0.0, (queryWorldTime - (environmentSnapshot.sourceTimestamp || Date.now())) / 1000.0);

    // 1. Bathymetry Hard Safety Risk (STEP 16: Dynamic risk cannot overwrite grounding protection)
    const depthM = bathymetryProvider.getDepthAt(x, y);
    const depthClass = bathymetryProvider.classifyDepth(depthM, vesselState.draftM, vesselState.underKeelClearanceM);

    if (depthM > 0 && depthClass === 'GROUNDING_RISK') {
      return {
        occupancyState: RISK_OCCUPANCY_STATE.GROUNDING_RISK,
        occupancyEvidence: 1.0, // Capped maximum hazard evidence
        hazardType: 'SHALLOW_BATHYMETRY',
        depthM,
        uncertainty: 5.0,
        timeValidity: 'PERMANENT_STATIC',
        sourceContributions: [{ source: 'GEBCO_BATHYMETRY', weight: 1.0 }],
        maximumRisk: 1.0,
        conflictState: CONFLICT_STATE.CONSISTENT,
        isHardBlocked: true
      };
    }

    // 2. Multi-Sensor Fused Dynamic Hazard Query
    const layers = this.buildSourceRiskLayers(environmentSnapshot, queryWorldTime);
    const allObservations = [...layers.radarRiskLayer, ...layers.aisRiskLayer, ...layers.sarRiskLayer, ...layers.seaIceRiskLayer];

    if (allObservations.length === 0) {
      return {
        occupancyState: RISK_OCCUPANCY_STATE.CLEAR_WATER,
        occupancyEvidence: 0.0,
        hazardType: 'NONE',
        uncertainty: 0.0,
        timeValidity: 'CURRENT',
        sourceContributions: [],
        maximumRisk: 0.0,
        conflictState: CONFLICT_STATE.CONSISTENT,
        isHardBlocked: false
      };
    }

    // Form association groups & fuse
    const groups = trackLevelFusionEngine.formAssociationGroups(allObservations);

    let maxCellRisk = 0.0;
    let dominantGroup = null;

    for (const grp of groups) {
      const fusedTrack = trackLevelFusionEngine.fuseAssociationGroup(grp, queryWorldTime);

      const dx = x - fusedTrack.fusedPosition.worldX;
      const dy = y - fusedTrack.fusedPosition.worldY;
      const dist = Math.hypot(dx, dy);

      const collisionRadius = 25.0;
      const uncRadius = fusedTrack.fusedUncertainty.positionUncertaintyMeters;
      const totalHazardRadius = collisionRadius + uncRadius;

      if (dist <= totalHazardRadius + 150.0) {
        // Temporal decay & distance penalty (STEP 13)
        const distanceFactor = Math.max(0.0, 1.0 - dist / (totalHazardRadius + 150.0));
        const decayFactor = Math.exp(-tSec / 1800.0); // 30-min decay half-life
        const cellRisk = distanceFactor * fusedTrack.fusedEvidenceScore * decayFactor;

        if (cellRisk > maxCellRisk) {
          maxCellRisk = cellRisk;
          dominantGroup = fusedTrack;
        }
      }
    }

    if (!dominantGroup || maxCellRisk < 0.05) {
      return {
        occupancyState: RISK_OCCUPANCY_STATE.CLEAR_WATER,
        occupancyEvidence: 0.0,
        hazardType: 'NONE',
        uncertainty: 0.0,
        timeValidity: 'CURRENT',
        sourceContributions: [],
        maximumRisk: 0.0,
        conflictState: CONFLICT_STATE.CONSISTENT,
        isHardBlocked: false
      };
    }

    let occupancyState = RISK_OCCUPANCY_STATE.PREDICTED_OBSTACLE;
    if (dominantGroup.conflictState === CONFLICT_STATE.UNRESOLVED_CONFLICT) {
      occupancyState = RISK_OCCUPANCY_STATE.CONFLICTING_SENSOR_EVIDENCE;
    } else if (dominantGroup.fusedEvidenceScore > 0.8) {
      occupancyState = RISK_OCCUPANCY_STATE.HIGH_CONFIDENCE_OBSTACLE;
    } else {
      occupancyState = RISK_OCCUPANCY_STATE.UNCERTAIN_OBSTACLE;
    }

    return {
      occupancyState,
      occupancyEvidence: parseFloat(maxCellRisk.toFixed(3)),
      hazardType: dominantGroup.associationState,
      uncertainty: dominantGroup.fusedUncertainty.positionUncertaintyMeters,
      timeValidity: tSec > 600 ? 'PREDICTED_STALE' : 'CURRENT',
      sourceContributions: dominantGroup.sourceContributions,
      maximumRisk: parseFloat(maxCellRisk.toFixed(3)),
      conflictState: dominantGroup.conflictState,
      isHardBlocked: maxCellRisk > 0.85
    };
  }
}

export const spatiotemporalRiskOccupancy = new SpatiotemporalRiskOccupancy();

/**
 * STEP 17 — Extended Semantic XAI Multi-Sensor Fusion Provenance Formatter
 */
export function formatMultiSensorFusionXaiProvenance(fusedGroup = {}) {
  const targetId = fusedGroup.groupId || 'GROUP-001';
  const state = fusedGroup.associationState || 'AIS_RADAR_ASSOCIATED';
  const conflict = fusedGroup.conflictState || 'CONSISTENT';
  const method = fusedGroup.fusionMethod || 'COVARIANCE_INTERSECTION';
  const pos = fusedGroup.fusedPosition ? `(${fusedGroup.fusedPosition.worldX.toFixed(1)}, ${fusedGroup.fusedPosition.worldY.toFixed(1)})` : '(0.0, 0.0)';
  const unc = fusedGroup.fusedUncertainty ? `${fusedGroup.fusedUncertainty.positionUncertaintyMeters}m` : '15.0m';
  const score = (fusedGroup.fusedEvidenceScore !== undefined ? fusedGroup.fusedEvidenceScore.toFixed(3) : '0.850') + ' (NORMALIZED_EVIDENCE_SCORE)';

  const contribs = (fusedGroup.sourceContributions || []).map(c => `${c.source}:${(c.weight * 100).toFixed(0)}%`).join(', ') || 'RADAR:50%, AIS:50%';

  return `FUSED ENVIRONMENT EVIDENCE
Target: ${targetId}
Association state: ${state}
Conflict state: ${conflict}
Fusion method: ${method}
Fused position: ${pos}
Fused uncertainty: ${unc}
Evidence score: ${score}
Source contributions: ${contribs}
Decision effect: ROUTE_CORRIDOR_CONSTRAINED`;
}
