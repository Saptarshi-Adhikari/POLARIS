/**
 * POLARIS Nav-OS — Robust AIS Target Tracking, Gap Extrapolation & Uncertainty Engine (Phase 2B)
 *
 * Implements deterministic track estimation, MMSI association, bounded turn-rate/velocity motion model,
 * gap state management, uncertainty covariance propagation, track quality scoring, and COLREGs integration.
 */

import { validateGeoCoordinates, geoToWorld, DEFAULT_ANTARCTIC_BBOX } from '../providers/geoTransform.js';

export const TRACK_STATUS = Object.freeze({
  FRESH: 'FRESH',
  PREDICTED: 'PREDICTED',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  INVALID: 'INVALID'
});

export const DEFAULT_TRACKER_CONFIG = {
  freshThresholdSec: 5.0,        // <= 5s -> FRESH
  staleThresholdSec: 30.0,       // > 30s -> STALE
  expireThresholdSec: 300.0,     // > 300s -> EXPIRED
  maxPredictionHorizonSec: 300.0,// Max extrapolation horizon (5m)
  maxSpeedKnots: 60.0,           // Rejects impossible speed (> 60 kts)
  maxPositionJumpSU: 500.0,      // Rejects impossible instantaneous position jump (SU)
  processNoisePos: 0.2,          // Position process noise growth rate (SU/s)
  processNoiseVel: 0.05,         // Velocity process noise growth rate (SU/s^2)
  processNoiseHeading: 0.1       // Heading process noise growth rate (deg/s)
};

export class AisTargetTracker {
  constructor(config = {}, bbox = DEFAULT_ANTARCTIC_BBOX) {
    this.config = { ...DEFAULT_TRACKER_CONFIG, ...config };
    this.bbox = bbox;
    // Map<mmsi, TrackState>
    this.tracks = new Map();
    this.lastProcessTimestamp = Date.now();
  }

  /**
   * Reset all tracks (diagnostic / test reset).
   */
  reset() {
    this.tracks.clear();
    this.lastProcessTimestamp = Date.now();
  }

  /**
   * Normalize and process a single incoming AIS observation payload or target object.
   */
  observeTarget(rawObs, sourceType = 'REPLAY') {
    if (!rawObs || typeof rawObs !== 'object') {
      return { success: false, reason: 'INVALID_OBSERVATION' };
    }

    const now = Date.now();
    const obsTime = rawObs.timestamp ? (typeof rawObs.timestamp === 'number' ? rawObs.timestamp : Date.parse(rawObs.timestamp)) : now;

    if (isNaN(obsTime) || obsTime <= 0) {
      return { success: false, reason: 'INVALID_TIMESTAMP' };
    }

    const mmsi = String(rawObs.mmsi || rawObs.id || '');
    if (!mmsi) {
      return { success: false, reason: 'MISSING_MMSI' };
    }

    const lat = Number(rawObs.latitude ?? rawObs.lat);
    const lon = Number(rawObs.longitude ?? rawObs.lon);

    let worldX = Number(rawObs.worldX ?? rawObs.x);
    let worldY = Number(rawObs.worldY ?? rawObs.y);

    if (isNaN(worldX) || isNaN(worldY)) {
      const geoCheck = validateGeoCoordinates(lat, lon);
      if (!geoCheck.valid) {
        return { success: false, reason: 'INVALID_COORDINATES' };
      }
      const worldPos = geoToWorld(lat, lon, this.bbox);
      worldX = worldPos.x;
      worldY = worldPos.y;
    }

    const sog = Number(rawObs.sog ?? rawObs.speedKnots ?? 12.0);
    if (isNaN(sog) || sog < 0 || sog > this.config.maxSpeedKnots) {
      return { success: false, reason: 'IMPOSSIBLE_SPEED' };
    }

    const cog = Number(rawObs.cog ?? rawObs.heading ?? 0.0);
    const heading = Number(rawObs.heading ?? cog);
    const turnRate = Number(rawObs.turnRate ?? 0.0);

    const existingTrack = this.tracks.get(mmsi);

    // Check timestamp anomalies / out-of-order observations
    if (existingTrack && obsTime < existingTrack.lastObservationTime) {
      return { success: false, reason: 'OUT_OF_ORDER_OBSERVATION', track: existingTrack };
    }

    // Check duplicate observation (exact same timestamp & position)
    if (existingTrack && obsTime === existingTrack.lastObservationTime && existingTrack.position.x === worldX && existingTrack.position.y === worldY) {
      return { success: false, reason: 'DUPLICATE_OBSERVATION', track: existingTrack };
    }

    // Check impossible instantaneous position jump
    if (existingTrack) {
      const dtSec = (obsTime - existingTrack.lastObservationTime) / 1000.0;
      if (dtSec > 0) {
        const jumpDist = Math.hypot(worldX - existingTrack.position.x, worldY - existingTrack.position.y);
        const maxDistAllowed = Math.max(this.config.maxPositionJumpSU, (sog * 0.514444 * 2.5) * dtSec + 50.0);
        if (jumpDist > maxDistAllowed) {
          return { success: false, reason: 'IMPOSSIBLE_POSITION_JUMP', track: existingTrack };
        }
      }
    }

    // Compute velocity vector (SU/s from SOG & COG)
    const speedSUs = sog * 0.514444; // Knots to SU/s
    const cogRad = (cog * Math.PI) / 180.0;
    const vx = speedSUs * Math.sin(cogRad);
    const vy = -speedSUs * Math.cos(cogRad);

    const initialPosUncertainty = 5.0; // 5m baseline GPS precision
    const initialVelUncertainty = 0.5;

    const newTrackState = {
      trackId: `TRK-${mmsi}`,
      mmsi,
      name: rawObs.name || `VESSEL-${mmsi}`,
      sourceType: rawObs.sourceType || sourceType,
      derivedFrom: rawObs.sourceType || sourceType,
      observation: { ...rawObs },
      lastObservationTime: obsTime,
      stateTime: obsTime,
      position: { x: parseFloat(worldX.toFixed(2)), y: parseFloat(worldY.toFixed(2)) },
      velocity: { vx: parseFloat(vx.toFixed(3)), vy: parseFloat(vy.toFixed(3)) },
      latitude: isNaN(lat) ? -68.5 : lat,
      longitude: isNaN(lon) ? 45.0 : lon,
      sog: parseFloat(sog.toFixed(2)),
      cog: parseFloat(cog.toFixed(2)),
      heading: parseFloat(heading.toFixed(2)),
      turnRate: parseFloat(turnRate.toFixed(2)),
      acceleration: 0.0,
      covariance: {
        pxx: initialPosUncertainty * initialPosUncertainty,
        pyy: initialPosUncertainty * initialPosUncertainty,
        pxy: 0.0,
        vxx: initialVelUncertainty * initialVelUncertainty,
        vyy: initialVelUncertainty * initialVelUncertainty
      },
      positionUncertainty: parseFloat(initialPosUncertainty.toFixed(2)),
      velocityUncertainty: parseFloat(initialVelUncertainty.toFixed(2)),
      headingUncertainty: 2.0,
      isPredicted: false,
      prediction: false,
      ageSeconds: 0,
      predictionAge: 0,
      quality: 1.0,
      trackStatus: TRACK_STATUS.FRESH,
      updateCount: existingTrack ? existingTrack.updateCount + 1 : 1
    };

    this.tracks.set(mmsi, newTrackState);
    return { success: true, track: newTrackState };
  }

  /**
   * Ingest multiple target observations.
   */
  ingestTargets(rawTargets = [], sourceType = 'REPLAY') {
    if (!Array.isArray(rawTargets)) return [];
    const updated = [];
    for (const raw of rawTargets) {
      const res = this.observeTarget(raw, sourceType);
      if (res.success) {
        updated.push(res.track);
      }
    }
    return updated;
  }

  /**
   * Propagate all tracks to a target timestamp using deterministic dead-reckoning and turn-rate model.
   * Returns active, non-expired target tracks with uncertainty.
   */
  getActiveTracks(currentTimestamp = Date.now()) {
    const active = [];

    for (const [mmsi, track] of this.tracks.entries()) {
      const updatedTrack = this.extrapolateTrack(track, currentTimestamp);
      this.tracks.set(mmsi, updatedTrack);

      if (updatedTrack.trackStatus !== TRACK_STATUS.INVALID) {
        active.push(updatedTrack);
      }
    }

    return active;
  }

  /**
   * Extrapolate a single track state to `currentTimestamp`.
   */
  extrapolateTrack(track, currentTimestamp = Date.now()) {
    const ageSec = (currentTimestamp - track.lastObservationTime) / 1000.0;

    if (isNaN(ageSec) || ageSec < 0) {
      return { ...track, trackStatus: TRACK_STATUS.INVALID, quality: 0.0 };
    }

    // Evaluate track status
    let trackStatus = TRACK_STATUS.FRESH;
    if (ageSec > this.config.expireThresholdSec) {
      trackStatus = TRACK_STATUS.EXPIRED;
    } else if (ageSec > this.config.staleThresholdSec) {
      trackStatus = TRACK_STATUS.STALE;
    } else if (ageSec > this.config.freshThresholdSec) {
      trackStatus = TRACK_STATUS.PREDICTED;
    }

    const isPredicted = ageSec > this.config.freshThresholdSec;
    const clampedAge = Math.min(ageSec, this.config.maxPredictionHorizonSec);

    // Deterministic Motion Propagation (Constant Velocity + Turn Rate)
    let currentCog = track.cog;
    if (Math.abs(track.turnRate) > 0.01) {
      currentCog = (track.cog + track.turnRate * clampedAge + 360) % 360;
    }

    const speedSUs = track.sog * 0.514444;
    const cogRad = (currentCog * Math.PI) / 180.0;
    const vx = speedSUs * Math.sin(cogRad);
    const vy = -speedSUs * Math.cos(cogRad);

    const extX = track.position.x + vx * clampedAge;
    const extY = track.position.y + vy * clampedAge;

    // Uncertainty Covariance Growth
    const posNoise = this.config.processNoisePos * clampedAge;
    const velNoise = this.config.processNoiseVel * clampedAge;
    const headingNoise = this.config.processNoiseHeading * clampedAge;

    const basePosUncertainty = 5.0;
    const totalPosUncertainty = parseFloat((basePosUncertainty + posNoise * posNoise).toFixed(2));
    const totalVelUncertainty = parseFloat((0.5 + velNoise).toFixed(2));
    const totalHeadingUncertainty = parseFloat((2.0 + headingNoise).toFixed(2));

    // Transparent Quality Score (1.0 down to 0.0)
    let quality = 1.0;
    if (trackStatus === TRACK_STATUS.PREDICTED) {
      quality = parseFloat(Math.max(0.4, 1.0 - (ageSec - 5.0) / 60.0).toFixed(2));
    } else if (trackStatus === TRACK_STATUS.STALE) {
      quality = parseFloat(Math.max(0.1, 0.4 - (ageSec - 30.0) / 270.0).toFixed(2));
    } else if (trackStatus === TRACK_STATUS.EXPIRED) {
      quality = 0.0;
    }

    if (track.sourceType === 'SYNTHETIC') quality *= 0.8;
    else if (track.sourceType === 'CACHED') quality *= 0.85;

    return {
      ...track,
      stateTime: currentTimestamp,
      position: { x: parseFloat(extX.toFixed(2)), y: parseFloat(extY.toFixed(2)) },
      worldX: parseFloat(extX.toFixed(2)),
      worldY: parseFloat(extY.toFixed(2)),
      velocity: { vx: parseFloat(vx.toFixed(3)), vy: parseFloat(vy.toFixed(3)) },
      cog: parseFloat(currentCog.toFixed(2)),
      heading: parseFloat(currentCog.toFixed(2)),
      covariance: {
        pxx: parseFloat((totalPosUncertainty * totalPosUncertainty).toFixed(2)),
        pyy: parseFloat((totalPosUncertainty * totalPosUncertainty).toFixed(2)),
        pxy: 0.0,
        vxx: parseFloat((totalVelUncertainty * totalVelUncertainty).toFixed(2)),
        vyy: parseFloat((totalVelUncertainty * totalVelUncertainty).toFixed(2))
      },
      positionUncertainty: totalPosUncertainty,
      velocityUncertainty: totalVelUncertainty,
      headingUncertainty: totalHeadingUncertainty,
      isPredicted,
      prediction: isPredicted,
      ageSeconds: Math.floor(ageSec),
      predictionAge: Math.floor(ageSec),
      quality: parseFloat(quality.toFixed(2)),
      trackStatus
    };
  }

  /**
   * Interface for external sensors (e.g. Radar, SAR) to query active target tracks.
   */
  getTargetTracks(currentTimestamp = Date.now()) {
    return this.getActiveTracks(currentTimestamp).filter(t => t.trackStatus !== TRACK_STATUS.EXPIRED);
  }

  /**
   * Interface for diagnostic inspection of all tracks including EXPIRED.
   */
  getAllTracksDiagnostic(currentTimestamp = Date.now()) {
    return this.getActiveTracks(currentTimestamp);
  }
}

export const aisTargetTracker = new AisTargetTracker();
