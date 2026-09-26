/**
 * POLARIS Integrated SAR Contact Provider & Detection Ingestion Interface
 * Ingests, normalizes, and manages SAR (Sentinel-1 / radar satellite) object detections.
 * Keeps catalogued USNIC icebergs strictly separate from unverified SAR detections.
 */

import { geoToWorld, validateGeoCoordinates, DEFAULT_ANTARCTIC_BBOX } from '../providers/geoTransform.js';

export const SAR_VERIFICATION_STATUS = {
  UNVERIFIED: 'UNVERIFIED',
  CORRELATED: 'CORRELATED',
  CONFIRMED: 'CONFIRMED'
};

export const SAR_CLASSIFICATION = {
  ICEBERG: 'ICEBERG',
  SHIP: 'SHIP',
  UNKNOWN: 'UNKNOWN'
};

export class SarContactProvider {
  constructor(bbox = DEFAULT_ANTARCTIC_BBOX) {
    this.name = 'Sentinel-1 SAR Detection Interface';
    this.bbox = bbox;
    this.contacts = [];
    this.lastFetchedAt = null;
    this.status = 'READY';
  }

  /**
   * Ingest raw SAR detection objects (Live API / Bundled JSON / User Import)
   */
  ingestSarContacts(rawContacts, fetchTime = Date.now()) {
    if (!Array.isArray(rawContacts)) return [];

    const normalized = [];
    for (const raw of rawContacts) {
      if (!raw || typeof raw !== 'object') continue;

      const lat = Number(raw.latitude ?? raw.lat);
      const lon = Number(raw.longitude ?? raw.lon);

      const check = validateGeoCoordinates(lat, lon);
      if (!check.valid) {
        console.warn(`[SarContactProvider] Rejecting invalid SAR contact coordinates (${lat}, ${lon}): ${check.reason}`);
        continue;
      }

      const worldPos = geoToWorld(lat, lon, this.bbox);
      const contactId = raw.contactId || raw.id || `SAR-CT-${Math.floor(1000 + Math.random() * 9000)}`;

      const sarContact = {
        contactId,
        id: contactId,
        name: raw.name || contactId,
        timestamp: raw.timestamp ? (typeof raw.timestamp === 'number' ? raw.timestamp : Date.parse(raw.timestamp)) : fetchTime,
        latitude: lat,
        longitude: lon,
        worldX: worldPos.x,
        worldY: worldPos.y,
        position: { x: worldPos.x, y: worldPos.y },
        velocity: { vx: raw.vx || 0, vy: raw.vy || 0 },

        classification: raw.classification || SAR_CLASSIFICATION.UNKNOWN,
        confidence: Number(raw.confidence ?? 0.75),
        source: raw.source || 'SENTINEL-1',
        verification: raw.verification || SAR_VERIFICATION_STATUS.UNVERIFIED,
        sourceSceneId: raw.sourceSceneId || 'S1A_IW_GRDH_1SDV_ANTARCTIC',
        detectionMethod: raw.detectionMethod || 'CFAR_BRIGHT_SPOT',

        // Geometry / Radius for collision avoidance
        collisionRadius: raw.collisionRadius || raw.radius || 25,
        size: raw.size || 600,
        matchedTargetId: raw.matchedTargetId || null,
        isSarContact: true,
        rawObserved: false
      };

      normalized.push(sarContact);
    }

    this.contacts = normalized;
    this.lastFetchedAt = fetchTime;
    this.status = 'ACTIVE';
    return this.contacts;
  }

  getContacts() {
    return this.contacts;
  }

  /**
   * Sample Antarctic SAR scene detection dataset for offline/demo mode
   */
  loadSampleSarScene() {
    const sampleRaw = [
      {
        contactId: 'SAR-CT-0042',
        latitude: -65.10,
        longitude: -61.20,
        classification: 'UNKNOWN',
        confidence: 0.82,
        verification: 'UNVERIFIED',
        sourceSceneId: 'S1B_IW_GRDH_20260315'
      },
      {
        contactId: 'SAR-CT-0089',
        latitude: -64.80,
        longitude: -62.10,
        classification: 'ICEBERG',
        confidence: 0.91,
        verification: 'CORRELATED',
        matchedTargetId: 'USNIC-B15A',
        sourceSceneId: 'S1B_IW_GRDH_20260315'
      },
      {
        contactId: 'SAR-CT-0105',
        latitude: -67.10,
        longitude: -56.40,
        classification: 'SHIP',
        confidence: 0.88,
        verification: 'UNVERIFIED',
        sourceSceneId: 'S1A_IW_GRDH_20260315'
      }
    ];

    return this.ingestSarContacts(sampleRaw);
  }
}
