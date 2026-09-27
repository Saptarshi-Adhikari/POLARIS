/**
 * POLARIS Nav-OS — AIS Vessel Data & Target Tracking Adapter (Phase 2B)
 *
 * Ingests, normalizes, and tracks AIS vessel target observations using AisTargetTracker.
 * Exposes dead-reckoning extrapolation and target state for temporary AIS transmission gaps.
 */

import { validateGeoCoordinates, geoToWorld, DEFAULT_ANTARCTIC_BBOX } from '../providers/geoTransform.js';
import { ENVIRONMENTAL_SOURCE_TYPE } from './ProviderHealthModel.js';
import { AisTargetTracker, TRACK_STATUS } from '../ai/AisTargetTracker.js';

export class AisVesselProvider {
  constructor(bbox = DEFAULT_ANTARCTIC_BBOX) {
    this.name = 'AIS Maritime Target Stream Provider';
    this.bbox = bbox;
    this.tracker = new AisTargetTracker({}, bbox);
    this.lastFetchedAt = null;
  }

  reset() {
    this.tracker.reset();
    this.lastFetchedAt = null;
  }

  /**
   * Ingest raw AIS vessel target list (LIVE stream, REPLAY file, or FIXTURE).
   */
  ingestAisTargets(rawTargets = [], sourceType = ENVIRONMENTAL_SOURCE_TYPE.REPLAY) {
    if (!Array.isArray(rawTargets)) return [];

    const now = Date.now();
    const ingested = [];

    for (const raw of rawTargets) {
      if (!raw || typeof raw !== 'object') continue;
      const res = this.tracker.observeTarget(raw, sourceType);
      if (res.success) {
        ingested.push(res.track);
      }
    }

    this.lastFetchedAt = now;
    return ingested;
  }

  /**
   * Extrapolated target tracks for active collision risk and planning.
   */
  getExtrapolatedTargets(currentTimestamp = Date.now(), maxAgeSeconds = 300) {
    const active = this.tracker.getActiveTracks(currentTimestamp);

    // Map to legacy format expected by downstream consumers while maintaining Phase 2B fields
    return active
      .filter(t => t.trackStatus !== TRACK_STATUS.EXPIRED && t.ageSeconds <= maxAgeSeconds)
      .map(t => ({
        ...t,
        worldX: t.position.x,
        worldY: t.position.y,
        latitude: t.latitude,
        longitude: t.longitude,
        timestamp: t.lastObservationTime,
        isPredicted: t.isPredicted,
        prediction: t.isPredicted,
        ageSeconds: t.ageSeconds,
        predictionAge: t.predictionAge,
        positionUncertainty: t.positionUncertainty,
        velocityUncertainty: t.velocityUncertainty,
        headingUncertainty: t.headingUncertainty,
        trackStatus: t.trackStatus,
        quality: t.quality
      }));
  }

  /**
   * Diagnostic interface returning all tracks including EXPIRED.
   */
  getAllDiagnosticTracks(currentTimestamp = Date.now()) {
    return this.tracker.getAllTracksDiagnostic(currentTimestamp);
  }
}

export const aisVesselProvider = new AisVesselProvider();
