/**
 * POLARIS Nav-OS — Marine Radar Perception Engine, Calibration & Geometry Hardening (Phase 5B)
 *
 * Implements canonical radar observation schema, locked POLARIS angular convention,
 * deterministic polar <-> world transformations, separate range-dependent normalization,
 * simulation-grade CA-CFAR local noise estimation, physical uncertainty propagation,
 * target tracker state machine, AIS+Radar & SAR+Radar association validation,
 * explainable target confidence, deterministic validation harness (Scenarios A-M),
 * extended Semantic XAI provenance, and common sensor observation schema.
 */

import { DEFAULT_ANTARCTIC_BBOX, geoToWorld } from '../providers/geoTransform.js';

export const RADAR_INPUT_MODES = Object.freeze({
  DEMO: 'DEMO',
  REPLAY: 'REPLAY',
  REAL: 'REAL',
  OFFLINE: 'OFFLINE'
});

export const RADAR_QUALITY = Object.freeze({
  OK: 'RADAR_QUALITY_OK',
  DEGRADED: 'RADAR_QUALITY_DEGRADED',
  INVALID: 'RADAR_QUALITY_INVALID'
});

export const RADAR_TRACK_STATUS = Object.freeze({
  FRESH: 'FRESH',
  PREDICTED: 'PREDICTED',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED'
});

export const AIS_RADAR_ASSOCIATION_STATE = Object.freeze({
  AIS_ONLY: 'AIS_ONLY',
  RADAR_ONLY: 'RADAR_ONLY',
  AIS_RADAR_ASSOCIATED: 'AIS_RADAR_ASSOCIATED',
  AMBIGUOUS: 'AMBIGUOUS',
  EXPIRED: 'EXPIRED'
});

export const SAR_RADAR_ASSOCIATION_STATE = Object.freeze({
  SAR_ONLY: 'SAR_ONLY',
  RADAR_ONLY: 'RADAR_ONLY',
  SAR_RADAR_POSSIBLE_ASSOCIATION: 'SAR_RADAR_POSSIBLE_ASSOCIATION',
  SAR_RADAR_PROBABLE_ASSOCIATION: 'SAR_RADAR_PROBABLE_ASSOCIATION',
  CONFIRMED_IDENTITY: 'CONFIRMED_IDENTITY'
});

/**
 * POLARIS LOCKED ANGULAR & GEOMETRIC CONVENTION
 * +X = East
 * +Y = South (Canvas Y increases downward)
 * Ship Heading 0° = East (along +X)
 * Ship Heading 90° = South (along +Y)
 * Heading & Bearing increase clockwise.
 *
 * Absolute Heading Angle (theta_abs) = (shipHeadingDeg + relativeBearingDeg) mod 360°
 * Forward polar transform:
 *   worldX = shipX + range * cos(theta_abs * PI / 180)
 *   worldY = shipY + range * sin(theta_abs * PI / 180)
 */
export function convertRadarPolarToWorld(rangeMeters, bearingDegrees, shipState = { x: 0, y: 0, heading: 0 }) {
  const range = Math.max(0.0, rangeMeters || 0.0);
  const relBearing = bearingDegrees || 0.0;
  const shipX = shipState.x || 0.0;
  const shipY = shipState.y || 0.0;
  const shipHeading = shipState.heading !== undefined ? shipState.heading : (shipState.shipHeadingRad !== undefined ? shipState.shipHeadingRad * 180 / Math.PI : 0.0);

  const absHeadingDeg = (shipHeading + relBearing + 3600.0) % 360.0;
  const absHeadingRad = (absHeadingDeg * Math.PI) / 180.0;

  const worldX = shipX + range * Math.cos(absHeadingRad);
  const worldY = shipY + range * Math.sin(absHeadingRad);

  return { worldX, worldY, absHeadingDeg, absHeadingRad };
}

/**
 * Inverse Polar Transform: World (worldX, worldY) -> Radar (rangeMeters, bearingDegrees)
 */
export function convertWorldToRadarPolar(worldX, worldY, shipState = { x: 0, y: 0, heading: 0 }) {
  const shipX = shipState.x || 0.0;
  const shipY = shipState.y || 0.0;
  const shipHeading = shipState.heading !== undefined ? shipState.heading : (shipState.shipHeadingRad !== undefined ? shipState.shipHeadingRad * 180 / Math.PI : 0.0);

  const dx = worldX - shipX;
  const dy = worldY - shipY;
  const rangeMeters = Math.hypot(dx, dy);

  if (rangeMeters < 1e-9) {
    return { rangeMeters: 0.0, bearingDegrees: 0.0, absoluteHeadingDeg: (shipHeading % 360 + 360) % 360 };
  }

  let absRad = Math.atan2(dy, dx);
  let absDeg = (absRad * 180.0 / Math.PI + 360.0) % 360.0;
  let relBearing = (absDeg - shipHeading + 360.0) % 360.0;

  return { rangeMeters, bearingDegrees: relBearing, absoluteHeadingDeg: absDeg };
}

/**
 * Propagates Polar Range/Bearing Uncertainties into Cartesian Position Uncertainty & Covariance
 */
export function propagateRadarUncertainty(rangeMeters, bearingDegrees, rangeSigmaM = 10.0, bearingSigmaDeg = 0.5, shipHeadingSigmaDeg = 0.1) {
  const r = Math.max(1.0, rangeMeters);
  const totalBearingSigmaDeg = Math.sqrt(bearingSigmaDeg * bearingSigmaDeg + shipHeadingSigmaDeg * shipHeadingSigmaDeg);
  const totalBearingSigmaRad = (totalBearingSigmaDeg * Math.PI) / 180.0;

  // Linearized variance components: var_r = sigma_r^2, var_theta = r^2 * sigma_theta_rad^2
  const varR = rangeSigmaM * rangeSigmaM;
  const varTheta = r * r * totalBearingSigmaRad * totalBearingSigmaRad;

  // Scalar uncertainty radius (root mean square of radial and transverse uncertainties)
  const positionUncertaintyMeters = Math.sqrt(varR + varTheta);

  return {
    rangeUncertainty: rangeSigmaM,
    bearingUncertainty: totalBearingSigmaDeg,
    positionUncertainty: parseFloat(positionUncertaintyMeters.toFixed(2)),
    velocityUncertainty: 1.0,
    covariance: {
      varR: parseFloat(varR.toFixed(2)),
      varTheta: parseFloat(varTheta.toFixed(2)),
      trace: parseFloat((varR + varTheta).toFixed(2))
    }
  };
}

/**
 * Creates a Canonical Radar Observation Schema (Phase 5B Hardened)
 */
export function createCanonicalRadarObservation(raw = {}) {
  const rangeMeters = raw.rangeMeters !== undefined ? raw.rangeMeters : (raw.range || 0.0);
  const bearingDegrees = raw.bearingDegrees !== undefined ? raw.bearingDegrees : (raw.bearingRad !== undefined ? (raw.bearingRad * 180 / Math.PI) : 0.0);
  const radialVelocity = raw.radialVelocity !== undefined ? raw.radialVelocity : (raw.relativeSpeed || 0.0);
  const intensity = raw.intensity !== undefined ? raw.intensity : (raw.backscatterDb || -15.0);
  const timestamp = raw.timestamp || Date.now();
  const sensorId = raw.sensorId || 'X_BAND_RADAR_01';
  const sourceType = raw.sourceType || RADAR_INPUT_MODES.DEMO;

  const shipState = {
    x: raw.shipX || 0.0,
    y: raw.shipY || 0.0,
    heading: raw.shipHeadingDeg !== undefined ? raw.shipHeadingDeg : (raw.shipHeadingRad !== undefined ? (raw.shipHeadingRad * 180 / Math.PI) : 0.0)
  };

  const { worldX, worldY } = convertRadarPolarToWorld(rangeMeters, bearingDegrees, shipState);

  // Hardened uncertainty propagation
  const rangeSigma = raw.rangeUncertainty || 10.0;
  const bearingSigma = raw.bearingUncertainty || 0.5;
  const uncertainty = propagateRadarUncertainty(rangeMeters, bearingDegrees, rangeSigma, bearingSigma);
  uncertainty.timestampAgeMs = Math.max(0, Date.now() - timestamp);

  // Explainable target confidence score
  const detectionScore = raw.confidence !== undefined ? raw.confidence : Math.max(0.1, Math.min(0.99, 0.5 + (intensity + 20) / 40.0));

  return {
    observationId: raw.observationId || `RADAR-OBS-${Math.floor(100000 + Math.random() * 900000)}`,
    sensorId,
    timestamp,
    rangeMeters,
    bearingDegrees,
    radialVelocity,
    intensity,
    width: raw.width || 15.0,
    confidence: parseFloat(detectionScore.toFixed(3)),
    confidenceType: raw.confidenceType || 'NORMALIZED_DETECTION_SCORE',
    sourceType,
    processingStatus: raw.processingStatus || 'BASELINE_PROCESSED',
    quality: raw.quality || RADAR_QUALITY.OK,
    geometry: {
      type: 'Point',
      coordinates: [raw.longitude || 0.0, raw.latitude || 0.0]
    },
    centroid: {
      worldX: parseFloat(worldX.toFixed(2)),
      worldY: parseFloat(worldY.toFixed(2)),
      latitude: raw.latitude || -68.5,
      longitude: raw.longitude || 45.0
    },
    uncertainty
  };
}

/**
 * Creates Configurable Radar Sensor Parameters (Phase 5B)
 */
export function createRadarSensorConfig(opts = {}) {
  return {
    rangeMax: opts.rangeMax || 10000.0,
    rangeResolution: opts.rangeResolution || 10.0,
    bearingResolution: opts.bearingResolution || 0.5,
    scanRateHz: opts.scanRateHz || 2.0,
    noiseFloorDb: opts.noiseFloorDb || -30.0,
    detectionThresholdDb: opts.detectionThresholdDb || -12.0,
    maxTargets: opts.maxTargets || 200,
    sensorLatencyMs: opts.sensorLatencyMs || 50.0,
    // CA-CFAR statistical parameters
    guardCellsRange: opts.guardCellsRange || 2,
    guardCellsAzimuth: opts.guardCellsAzimuth || 1,
    referenceCellsRange: opts.referenceCellsRange || 5,
    referenceCellsAzimuth: opts.referenceCellsAzimuth || 3,
    falseAlarmProbability: opts.falseAlarmProbability || 1e-4,
    cfarScaleFloorDb: opts.cfarScaleFloorDb || 3.0,
    // Separate range compensation config
    rangeCompensationEnabled: opts.rangeCompensationEnabled !== undefined ? opts.rangeCompensationEnabled : true,
    rangeLossReferenceM: opts.rangeLossReferenceM || 500.0,
    configMode: opts.configMode || 'SIMULATION_CONFIGURATION'
  };
}

/**
 * Raw Radar Provider Adapter (RadarProvider)
 */
export class RadarProvider {
  constructor(mode = RADAR_INPUT_MODES.DEMO, config = {}) {
    this.mode = mode;
    this.config = createRadarSensorConfig(config);
    this.isConnected = false;
    this.scanHistory = [];
    this.latestScan = null;
    this.replayBuffer = [];
    this.replayIndex = 0;
  }

  connect() {
    this.isConnected = true;
    return { status: 'CONNECTED', mode: this.mode };
  }

  disconnect() {
    this.isConnected = false;
    return { status: 'DISCONNECTED', mode: this.mode };
  }

  getStatus() {
    return {
      connected: this.isConnected,
      mode: this.mode,
      scanCount: this.scanHistory.length,
      latestTimestamp: this.latestScan ? this.latestScan.timestamp : null
    };
  }

  loadReplayBuffer(scans = []) {
    this.replayBuffer = scans;
    this.replayIndex = 0;
    this.mode = RADAR_INPUT_MODES.REPLAY;
  }

  ingestRawScan(rawScan) {
    if (!rawScan) throw new Error('[RadarProvider] Malformed scan data');
    if (!this.isConnected) this.connect();

    if (this.mode === RADAR_INPUT_MODES.REAL && (!rawScan.hardwareVerified || rawScan.malformed)) {
      return { status: 'HARDWARE_DATA_REJECTED', error: 'Malformed hardware sensor packet' };
    }

    const timestamp = rawScan.timestamp || Date.now();
    const scan = {
      scanId: rawScan.scanId || `SCAN-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp,
      sourceType: this.mode,
      polarGrid: rawScan.polarGrid || null,
      pointTargets: rawScan.pointTargets || [],
      metadata: rawScan.metadata || {}
    };

    this.latestScan = scan;
    this.scanHistory.push(scan);
    if (this.scanHistory.length > 50) this.scanHistory.shift();

    return { status: 'SCAN_INGESTED', scanId: scan.scanId };
  }

  getLatestScan() {
    if (this.mode === RADAR_INPUT_MODES.REPLAY && this.replayBuffer.length > 0) {
      const scan = this.replayBuffer[this.replayIndex % this.replayBuffer.length];
      this.replayIndex++;
      return { ...scan, sourceType: RADAR_INPUT_MODES.REPLAY };
    }
    return this.latestScan;
  }

  getScanHistory() {
    return this.scanHistory;
  }

  getConfiguration() {
    return this.config;
  }
}

/**
 * Deterministic Radar Preprocessor — Decomposed Signal Normalization & Local Noise Estimator (Phase 5B)
 */
export class RadarPreprocessor {
  constructor() {
    this.processingVersion = 'RADAR_PREPROC_v2.0_DECOMPOSED';
  }

  /**
   * SEPARATE MECHANISM 1: Deterministic Range-Dependent Normalization / Compensation
   * Normalizes signal for spherical geometric spreading loss (20 log10(R / R_ref))
   */
  applyRangeCompensation(intensityDb, rangeMeters, refRangeMeters = 500.0) {
    if (rangeMeters <= 0.0) return intensityDb;
    const compensationDb = 10.0 * Math.log10(Math.max(1.0, rangeMeters) / refRangeMeters);
    return intensityDb - Math.max(0.0, compensationDb);
  }

  /**
   * SEPARATE MECHANISM 2: CA-CFAR Local Noise Estimation (Simulation-Grade / Baseline)
   * Estimates noise floor statistically from reference cells surrounding the CUT, excluding guard cells.
   */
  estimateCfarLocalNoise(targetIndex, targetsList, config) {
    const target = targetsList[targetIndex];
    const refRange = config.referenceCellsRange || 5;
    const guardRange = config.guardCellsRange || 2;

    const noiseFloorDb = config.noiseFloorDb || -30.0;
    let refSumLinear = 0.0;
    let refCount = 0;

    for (let i = 0; i < targetsList.length; i++) {
      if (i === targetIndex) continue;
      const other = targetsList[i];
      const deltaRange = Math.abs(other.range - target.range);
      const deltaBearing = Math.abs(other.bearing - target.bearing);

      // Check if in reference cell window but NOT in guard cell window
      const inRefWindow = (deltaRange <= refRange * config.rangeResolution) && (deltaBearing <= (config.referenceCellsAzimuth || 3) * config.bearingResolution);
      const inGuardWindow = (deltaRange <= guardRange * config.rangeResolution) && (deltaBearing <= (config.guardCellsAzimuth || 1) * config.bearingResolution);

      if (inRefWindow && !inGuardWindow) {
        // Convert dB to linear power for arithmetic mean
        const powerLin = Math.pow(10.0, other.intensity / 10.0);
        refSumLinear += powerLin;
        refCount++;
      }
    }

    if (refCount === 0) {
      // Fall back to baseline background sea-clutter noise model
      const clutterDb = noiseFloorDb + Math.max(0, 10.0 - target.range / refRange);
      return clutterDb;
    }

    const avgNoiseLinear = refSumLinear / refCount;
    return 10.0 * Math.log10(Math.max(1e-9, avgNoiseLinear));
  }

  preprocessRadarScan(rawScan = {}, config = createRadarSensorConfig()) {
    if (!rawScan) return null;

    const thresholdDb = config.detectionThresholdDb || -12.0;
    const cfarScaleDb = config.cfarScaleFloorDb || 3.0;

    const pointTargets = rawScan.pointTargets || [];

    const processedTargets = pointTargets.map((t, idx) => {
      const range = t.range !== undefined ? t.range : 100.0;
      const bearing = t.bearing !== undefined ? t.bearing : 0.0;
      let rawIntensity = t.intensity !== undefined ? t.intensity : -10.0;

      // Step 1: Range-dependent compensation / normalization (if enabled)
      let normalizedIntensity = rawIntensity;
      if (config.rangeCompensationEnabled) {
        normalizedIntensity = this.applyRangeCompensation(rawIntensity, range, config.rangeLossReferenceM);
      }

      // Step 2: CA-CFAR Local Noise Estimation
      const estimatedLocalNoiseDb = this.estimateCfarLocalNoise(idx, pointTargets, config);
      const cfarThresholdDb = estimatedLocalNoiseDb + cfarScaleDb;

      // Step 3: Detection Mask & Thresholding
      const isFiltered = normalizedIntensity < cfarThresholdDb || normalizedIntensity < thresholdDb;

      return {
        ...t,
        range,
        bearing,
        rawIntensity,
        intensity: normalizedIntensity,
        estimatedLocalNoiseDb,
        cfarThresholdDb,
        isFiltered
      };
    });

    const filteredTargets = processedTargets.filter(t => !t.isFiltered);

    return {
      scanId: rawScan.scanId || 'PROCESSED_SCAN',
      timestamp: rawScan.timestamp || Date.now(),
      processingVersion: this.processingVersion,
      noiseModel: 'CA_CFAR_BASELINE_SIMULATION_GRADE',
      filter: 'RANGE_NORM_CA_CFAR_DECOMPOSED',
      thresholdDb,
      source: rawScan.sourceType || RADAR_INPUT_MODES.DEMO,
      filteredTargets
    };
  }
}

/**
 * Baseline CFAR Radar Detector (Simulation-Grade / Baseline)
 */
export class CfarRadarDetector {
  constructor() {
    this.detectionMethod = 'CA_CFAR_BASELINE_SIMULATION_GRADE';
  }

  detectObjects(preprocessedScan = {}, shipState = { x: 0, y: 0, heading: 0 }) {
    if (!preprocessedScan || !preprocessedScan.filteredTargets) {
      return { detections: [], quality: RADAR_QUALITY.INVALID };
    }

    const detections = preprocessedScan.filteredTargets.map(t => {
      return createCanonicalRadarObservation({
        ...t,
        shipX: shipState.x,
        shipY: shipState.y,
        shipHeadingDeg: shipState.heading || 0.0,
        timestamp: preprocessedScan.timestamp,
        sourceType: preprocessedScan.source,
        processingStatus: 'CA_CFAR_DETECTED'
      });
    });

    const quality = detections.length >= 0 ? RADAR_QUALITY.OK : RADAR_QUALITY.DEGRADED;

    return {
      detections,
      quality,
      detectionMethod: this.detectionMethod,
      timestamp: preprocessedScan.timestamp || Date.now()
    };
  }
}

/**
 * Radar Target Tracker — State Machine & Lifecycle Validation
 */
export class RadarTargetTracker {
  constructor() {
    this.tracks = new Map();
    this.maxStaleAgeMs = 10000;
  }

  updateTracks(radarDetections = [], currentTime = Date.now()) {
    const activeIds = new Set();

    for (const det of radarDetections) {
      const trackId = det.observationId || `RADAR-TRK-${Math.floor(1000 + Math.random() * 9000)}`;
      activeIds.add(trackId);

      let existing = this.tracks.get(trackId);

      if (!existing) {
        existing = {
          trackId,
          firstObserved: currentTime,
          lastObserved: currentTime,
          observationCount: 1,
          state: RADAR_TRACK_STATUS.FRESH,
          position: { ...det.centroid },
          velocity: { radial: det.radialVelocity, vx: 0.0, vy: 0.0 },
          rangeMeters: det.rangeMeters,
          bearingDegrees: det.bearingDegrees,
          confidence: det.confidence,
          confidenceType: 'NORMALIZED_DETECTION_SCORE',
          uncertainty: { ...det.uncertainty }
        };
      } else {
        existing.lastObserved = currentTime;
        existing.observationCount++;
        existing.state = RADAR_TRACK_STATUS.FRESH;
        existing.rangeMeters = det.rangeMeters;
        existing.bearingDegrees = det.bearingDegrees;
        existing.confidence = Math.min(0.98, existing.confidence + 0.05);

        // Alpha-beta smoothing for position centroid (alpha = 0.7)
        existing.position.worldX += 0.7 * (det.centroid.worldX - existing.position.worldX);
        existing.position.worldY += 0.7 * (det.centroid.worldY - existing.position.worldY);
        existing.uncertainty.timestampAgeMs = 0;
      }

      this.tracks.set(trackId, existing);
    }

    // Lifecycle state machine update & stale growth
    for (const [id, track] of this.tracks.entries()) {
      const ageMs = currentTime - track.lastObserved;

      if (ageMs > this.maxStaleAgeMs) {
        track.state = RADAR_TRACK_STATUS.EXPIRED;
        this.tracks.delete(id);
      } else if (ageMs > 3000) {
        track.state = RADAR_TRACK_STATUS.STALE;
        track.confidence = Math.max(0.2, track.confidence - 0.05);
        track.uncertainty.positionUncertainty += 2.0;
      } else if (ageMs > 1000) {
        track.state = RADAR_TRACK_STATUS.PREDICTED;
        track.uncertainty.positionUncertainty += 0.5;
      }
    }

    return Array.from(this.tracks.values());
  }

  getActiveTracks() {
    return Array.from(this.tracks.values()).filter(t => t.state !== RADAR_TRACK_STATUS.EXPIRED);
  }
}

/**
 * AIS + Radar Association Engine — Strict Evidence Preservation
 */
export class AisRadarAssociationEngine {
  constructor() {
    this.maxAssociationDistanceMeters = 150.0;
  }

  associate(aisTracks = [], radarTracks = []) {
    const associations = [];
    const matchedRadar = new Set();

    for (const ais of aisTracks) {
      const aisX = ais.worldX !== undefined ? ais.worldX : ais.x;
      const aisY = ais.worldY !== undefined ? ais.worldY : ais.y;

      let bestRadar = null;
      let minDistance = Infinity;

      for (const rad of radarTracks) {
        const radX = rad.position ? rad.position.worldX : rad.centroid.worldX;
        const radY = rad.position ? rad.position.worldY : rad.centroid.worldY;

        const dist = Math.hypot(radX - aisX, radY - aisY);
        if (dist < minDistance && dist <= this.maxAssociationDistanceMeters) {
          minDistance = dist;
          bestRadar = rad;
        }
      }

      if (bestRadar) {
        matchedRadar.add(bestRadar.trackId || bestRadar.observationId);

        associations.push({
          associationId: `ASSOC-${ais.mmsi || 'AIS'}-${bestRadar.trackId || 'RAD'}`,
          associationState: AIS_RADAR_ASSOCIATION_STATE.AIS_RADAR_ASSOCIATED,
          aisEvidence: { mmsi: ais.mmsi, lat: ais.lat, lon: ais.lon, sog: ais.sog, cog: ais.cog },
          radarEvidence: { trackId: bestRadar.trackId, rangeMeters: bestRadar.rangeMeters, bearingDegrees: bestRadar.bearingDegrees },
          fusedState: {
            worldX: (aisX + bestRadar.position.worldX) / 2.0,
            worldY: (aisY + bestRadar.position.worldY) / 2.0,
            speedMps: (ais.sog || 0) * 0.514444
          },
          uncertainty: { positionUncertaintyMeters: parseFloat((minDistance * 0.5).toFixed(2)) }
        });
      } else {
        associations.push({
          associationId: `ASSOC-AIS-ONLY-${ais.mmsi || Math.random()}`,
          associationState: AIS_RADAR_ASSOCIATION_STATE.AIS_ONLY,
          aisEvidence: { mmsi: ais.mmsi, lat: ais.lat, lon: ais.lon },
          radarEvidence: null,
          fusedState: { worldX: aisX, worldY: aisY },
          uncertainty: { positionUncertaintyMeters: 20.0 }
        });
      }
    }

    for (const rad of radarTracks) {
      const id = rad.trackId || rad.observationId;
      if (!matchedRadar.has(id)) {
        const radX = rad.position ? rad.position.worldX : rad.centroid.worldX;
        const radY = rad.position ? rad.position.worldY : rad.centroid.worldY;

        associations.push({
          associationId: `ASSOC-RADAR-ONLY-${id}`,
          associationState: AIS_RADAR_ASSOCIATION_STATE.RADAR_ONLY,
          aisEvidence: null,
          radarEvidence: { trackId: id, rangeMeters: rad.rangeMeters, bearingDegrees: rad.bearingDegrees },
          fusedState: { worldX: radX, worldY: radY },
          uncertainty: { positionUncertaintyMeters: rad.uncertainty ? rad.uncertainty.positionUncertainty : 25.0 }
        });
      }
    }

    return associations;
  }
}

/**
 * SAR + Radar Association Engine — Conservative Identity Claim
 */
export class SarRadarAssociationEngine {
  constructor() {
    this.maxSpatialDistanceMeters = 300.0;
  }

  associateSarAndRadar(sarObservations = [], radarDetections = []) {
    const candidateMatches = [];

    for (const sar of sarObservations) {
      const sarX = sar.centroid ? sar.centroid.worldX : 0;
      const sarY = sar.centroid ? sar.centroid.worldY : 0;

      for (const rad of radarDetections) {
        const radX = rad.centroid ? rad.centroid.worldX : 0;
        const radY = rad.centroid ? rad.centroid.worldY : 0;

        const dist = Math.hypot(radX - sarX, radY - sarY);
        if (dist <= this.maxSpatialDistanceMeters) {
          let associationType = SAR_RADAR_ASSOCIATION_STATE.SAR_RADAR_POSSIBLE_ASSOCIATION;
          if (dist < 50.0) {
            associationType = SAR_RADAR_ASSOCIATION_STATE.SAR_RADAR_PROBABLE_ASSOCIATION;
          }

          candidateMatches.push({
            associationType,
            sarObservationId: sar.observationId,
            radarObservationId: rad.observationId,
            spatialDistanceMeters: parseFloat(dist.toFixed(2)),
            confidence: parseFloat(Math.min(0.95, 0.6 + (1 - dist / this.maxSpatialDistanceMeters) * 0.35).toFixed(3))
          });
        }
      }
    }

    return candidateMatches;
  }
}

/**
 * Extended Semantic XAI Radar Provenance Formatter (Phase 5B)
 */
export function formatRadarXaiProvenance(observation = {}) {
  const sensor = observation.sensorId || 'RADAR-01';
  const detection = observation.observationId || 'TARGET-17';
  const range = (observation.rangeMeters !== undefined ? observation.rangeMeters.toFixed(1) : '1450.0') + 'm';
  const bearing = (observation.bearingDegrees !== undefined ? observation.bearingDegrees.toFixed(1) : '42.5') + '°';
  const radialVel = (observation.radialVelocity !== undefined ? observation.radialVelocity.toFixed(1) : '-3.2') + ' m/s';
  const detectionMethod = observation.detectionMethod || 'CA_CFAR_BASELINE_SIMULATION_GRADE';
  const confidenceScore = (observation.confidence !== undefined ? observation.confidence.toFixed(3) : '0.885') + ` (${observation.confidenceType || 'NORMALIZED_DETECTION_SCORE'})`;
  const trackStatus = observation.associationState || observation.trackStatus || 'AIS_RADAR_ASSOCIATED';
  const posUncertainty = observation.uncertainty ? `${observation.uncertainty.positionUncertainty}m` : '15.0m';
  const decisionEffect = observation.decisionEffect || 'REROUTE_MARGIN_EXPANSION';

  return `RADAR EVIDENCE
Sensor: ${sensor}
Detection: ${detection}
Range: ${range}
Bearing: ${bearing}
Radial velocity: ${radialVel}
Detection method: ${detectionMethod}
Detection score: ${confidenceScore}
Track status: ${trackStatus}
Position uncertainty: ${posUncertainty}
Decision effect: ${decisionEffect}`;
}

/**
 * Common Sensor Observation Schema (Unifying AIS, RADAR, SAR, USNIC)
 */
export function createCommonSensorObservation(raw = {}) {
  return {
    source: raw.source || 'RADAR',
    observationId: raw.observationId || `COMMON-OBS-${Math.floor(1000 + Math.random() * 9000)}`,
    timestamp: raw.timestamp || Date.now(),
    position: {
      latitude: raw.latitude !== undefined ? raw.latitude : -68.5,
      longitude: raw.longitude !== undefined ? raw.longitude : 45.0,
      worldX: raw.worldX || 0.0,
      worldY: raw.worldY || 0.0
    },
    velocity: {
      speedMps: raw.speedMps || 0.0,
      courseDeg: raw.courseDeg || 0.0
    },
    geometry: raw.geometry || { type: 'Point', coordinates: [raw.longitude || 45.0, raw.latitude || -68.5] },
    uncertainty: {
      positionUncertaintyMeters: raw.positionUncertaintyMeters || 15.0,
      velocityUncertaintyMps: raw.velocityUncertaintyMps || 1.0
    },
    quality: raw.quality || 'HIGH'
  };
}

/**
 * Phase 5B Deterministic Replay Validation Harness (Scenarios A through M)
 */
export class RadarValidationHarness {
  constructor() {
    this.scenarios = {
      SCENARIO_A_NO_TARGETS: { pointTargets: [] },
      SCENARIO_B_ONE_STRONG_TARGET: { pointTargets: [{ range: 1000, bearing: 45, intensity: 10.0 }] },
      SCENARIO_C_ONE_WEAK_TARGET: { pointTargets: [{ range: 2000, bearing: 90, intensity: -5.0 }] },
      SCENARIO_D_TWO_NEARBY_TARGETS: { pointTargets: [{ range: 1500, bearing: 30, intensity: 15.0 }, { range: 1520, bearing: 45, intensity: 15.0 }] },
      SCENARIO_E_MULTIPLE_TARGETS: { pointTargets: Array.from({ length: 8 }, (_, i) => ({ range: 800 + i * 400, bearing: i * 45, intensity: 8.0 })) },
      SCENARIO_F_SHORT_RANGE: { pointTargets: [{ range: 250, bearing: 180, intensity: 12.0 }] },
      SCENARIO_G_MEDIUM_RANGE: { pointTargets: [{ range: 2500, bearing: 270, intensity: 5.0 }] },
      SCENARIO_H_LONG_RANGE: { pointTargets: [{ range: 8500, bearing: 0, intensity: 15.0 }] },
      SCENARIO_I_CLUTTER_HEAVY: { pointTargets: Array.from({ length: 30 }, (_, i) => ({ range: 100 + i * 150, bearing: (i * 12) % 360, intensity: -25.0 + (i % 5) })) },
      SCENARIO_J_MISSED_SCAN: { pointTargets: null },
      SCENARIO_K_NOISY_SCAN: { pointTargets: [{ range: 1200, bearing: 60, intensity: 5.0 }, { range: 1400, bearing: 62, intensity: -28.0 }] },
      SCENARIO_L_INTERMITTENT_TARGET: { sequence: [{ range: 1000, bearing: 15 }, null, { range: 1010, bearing: 15 }] },
      SCENARIO_M_CHANGING_RADIAL_VELOCITY: { pointTargets: [{ range: 1000, bearing: 90, intensity: 5.0, relativeSpeed: 5.0 }, { range: 980, bearing: 90, intensity: 5.0, relativeSpeed: 12.0 }] }
    };
  }

  evaluateScenario(scenarioId, engine = new RadarPerceptionEngine()) {
    const sc = this.scenarios[scenarioId];
    if (!sc) return { scenarioId, status: 'UNKNOWN_SCENARIO' };

    const tStart = performance.now();
    const shipState = { x: 500, y: 500, heading: 0 };
    const rawScan = { scanId: scenarioId, timestamp: Date.now(), pointTargets: sc.pointTargets || [] };

    const result = engine.processRadarPipeline(rawScan, shipState, [], []);
    const tEnd = performance.now();

    const expectedCount = (sc.pointTargets || []).filter(t => (t.intensity !== undefined ? t.intensity : -10.0) >= -12.0).length;
    const detectedCount = result.detections.length;
    const missCount = Math.max(0, expectedCount - detectedCount);
    const falseAlarmCount = Math.max(0, detectedCount - expectedCount);

    return {
      scenarioId,
      detectionRate: expectedCount > 0 ? parseFloat((detectedCount / expectedCount).toFixed(3)) : 1.0,
      falseAlarmRate: parseFloat((falseAlarmCount / Math.max(1, (sc.pointTargets || []).length)).toFixed(3)),
      missRate: expectedCount > 0 ? parseFloat((missCount / expectedCount).toFixed(3)) : 0.0,
      detectedTargets: detectedCount,
      trackCount: result.tracks.length,
      latencyMs: parseFloat((tEnd - tStart).toFixed(2))
    };
  }
}

/**
 * Master Radar Perception Engine
 */
export class RadarPerceptionEngine {
  constructor(mode = RADAR_INPUT_MODES.DEMO) {
    this.provider = new RadarProvider(mode);
    this.preprocessor = new RadarPreprocessor();
    this.detector = new CfarRadarDetector();
    this.tracker = new RadarTargetTracker();
    this.aisAssociator = new AisRadarAssociationEngine();
    this.sarAssociator = new SarRadarAssociationEngine();
    this.metrics = {
      detectionCount: 0,
      trackCount: 0,
      associationCount: 0,
      processingLatencyMs: 0
    };
  }

  processRadarPipeline(rawScan = null, shipState = { x: 0, y: 0, heading: 0 }, aisTracks = [], sarObservations = []) {
    const tStart = performance.now();

    if (rawScan) {
      this.provider.ingestRawScan(rawScan);
    }
    const scan = this.provider.getLatestScan();

    const preproc = this.preprocessor.preprocessRadarScan(scan, this.provider.getConfiguration());
    const detectRes = this.detector.detectObjects(preproc, shipState);
    const tracks = this.tracker.updateTracks(detectRes.detections);
    const aisAssociations = this.aisAssociator.associate(aisTracks, tracks);
    const sarAssociations = this.sarAssociator.associateSarAndRadar(sarObservations, detectRes.detections);

    const tEnd = performance.now();
    this.metrics = {
      detectionCount: detectRes.detections.length,
      trackCount: tracks.length,
      associationCount: aisAssociations.length,
      processingLatencyMs: parseFloat((tEnd - tStart).toFixed(2))
    };

    return {
      scanId: scan ? scan.scanId : 'NO_SCAN',
      timestamp: Date.now(),
      mode: this.provider.mode,
      quality: detectRes.quality,
      detections: detectRes.detections,
      tracks,
      aisAssociations,
      sarAssociations,
      metrics: this.metrics
    };
  }
}

export const radarPerceptionEngine = new RadarPerceptionEngine();

