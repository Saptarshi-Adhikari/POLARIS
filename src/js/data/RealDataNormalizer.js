/**
 * POLARIS Real Data Normalizer & Validation Pipeline
 * Normalizes raw external observation payloads (USNIC, BYU, Copernicus, Open-Meteo)
 * into standard canonical runtime schemas.
 */

import { geoToWorld, validateGeoCoordinates, DEFAULT_ANTARCTIC_BBOX } from '../providers/geoTransform.js';
import { createNormalizedHazard, createNormalizedEnvironment, validateHazardSchema } from '../providers/schemas.js';

export class RealDataNormalizer {
  constructor(bbox = DEFAULT_ANTARCTIC_BBOX) {
    this.bbox = bbox;
  }

  /**
   * Normalize an array of raw iceberg observations.
   * Handles USNIC ERDDAP JSON, USNIC Antarctic Products, BYU tracks, and mirror formats.
   */
  normalizeIcebergs(rawRecords, fetchTime = Date.now()) {
    if (!Array.isArray(rawRecords)) return [];

    const normalizedList = [];
    const seenIds = new Set();

    for (const raw of rawRecords) {
      if (!raw || typeof raw !== 'object') continue;

      // Extract latitude & longitude
      const lat = Number(raw.latitude ?? raw.lat ?? raw.y_geo);
      const lon = Number(raw.longitude ?? raw.lon ?? raw.x_geo);

      const geoCheck = validateGeoCoordinates(lat, lon);
      if (!geoCheck.valid) {
        console.warn(`[RealDataNormalizer] Rejecting invalid iceberg coordinates (${lat}, ${lon}): ${geoCheck.reason}`);
        continue;
      }

      // Preserve official designation (USNIC / BYU names like A-76, B-22, D-15D)
      const officialName = raw.name || raw.designation || raw.iceberg_id || raw.id || null;
      const rawId = raw.id || officialName || `ICE-${Math.round(lat * 100)}-${Math.round(lon * 100)}`;
      const normalizedId = String(rawId).trim();

      if (seenIds.has(normalizedId)) {
        continue; // Deduplicate
      }
      seenIds.add(normalizedId);

      // Project geo (lat, lon) to world (worldX, worldY)
      let worldPos;
      try {
        worldPos = geoToWorld(lat, lon, this.bbox);
      } catch (err) {
        console.warn(`[RealDataNormalizer] Geo projection error for ${normalizedId}:`, err);
        continue;
      }

      // Preserve actual size/dimensions if provided, otherwise null / default scale
      const lengthM = raw.lengthMeters ?? raw.length ?? raw.size_m ?? null;
      const widthM = raw.widthMeters ?? raw.width ?? null;
      const sizeMeters = lengthM || raw.size || 800;
      const collisionRadius = raw.collisionRadius || Math.max(15, sizeMeters / 35);
      const massScale = raw.massScale || raw.mass || (sizeMeters / 300) * 1.5;

      const obsTimestamp = raw.timestamp ? (typeof raw.timestamp === 'number' ? raw.timestamp : Date.parse(raw.timestamp)) : fetchTime;
      const source = raw.source || 'USNIC';

      // Parse historical track if available
      const history = Array.isArray(raw.history || raw.track) 
        ? (raw.history || raw.track).map(pt => {
            const hLat = Number(pt.latitude ?? pt.lat);
            const hLon = Number(pt.longitude ?? pt.lon);
            const hWorld = geoToWorld(hLat, hLon, this.bbox);
            return {
              timestamp: pt.timestamp ? Date.parse(pt.timestamp) : obsTimestamp,
              latitude: hLat,
              longitude: hLon,
              x: hWorld.x,
              y: hWorld.y
            };
          })
        : [];

      const hazard = createNormalizedHazard({
        id: normalizedId,
        type: 'ICEBERG',
        latitude: lat,
        longitude: lon,
        position: { x: worldPos.x, y: worldPos.y },
        velocity: { vx: raw.vx || 0, vy: raw.vy || 0 },
        geometry: {
          size: sizeMeters,
          radius: collisionRadius,
          mass: massScale,
          lengthMeters: lengthM,
          widthMeters: widthM
        },
        timestamp: isNaN(obsTimestamp) ? fetchTime : obsTimestamp,
        uncertainty: raw.uncertainty ?? 0.05,
        confidence: raw.confidence ?? 0.95,
        source: source,
        rawObserved: true
      });

      // Attach additional normalized metadata
      hazard.name = officialName || normalizedId;
      hazard.worldX = worldPos.x;
      hazard.worldY = worldPos.y;
      hazard.x = worldPos.x;
      hazard.y = worldPos.y;
      hazard.history = history;
      hazard.fetchTimestamp = fetchTime;
      hazard.originalIdentifier = raw.id || officialName;

      const val = validateHazardSchema(hazard);
      if (val.valid) {
        normalizedList.push(hazard);
      } else {
        console.warn(`[RealDataNormalizer] Hazard validation failed for ${normalizedId}: ${val.reason}`);
      }
    }

    return normalizedList;
  }

  /**
   * Normalize ocean currents payload
   */
  normalizeOceanCurrents(rawEnv, fetchTime = Date.now()) {
    if (!rawEnv || typeof rawEnv !== 'object') return null;

    const current = rawEnv.current || rawEnv.ocean || {};
    const speed = Number(current.speedKnots ?? current.speed ?? 1.8);
    const direction = Number(current.directionDegrees ?? current.direction ?? 127);
    const u = current.vx ?? current.u ?? Math.cos((direction * Math.PI) / 180) * speed;
    const v = current.vy ?? current.v ?? Math.sin((direction * Math.PI) / 180) * speed;

    return {
      timestamp: rawEnv.timestamp ? Date.parse(rawEnv.timestamp) : fetchTime,
      speed,
      direction,
      vx: u,
      vy: v,
      source: rawEnv.source || 'Copernicus Marine'
    };
  }

  /**
   * Normalize wind payload
   */
  normalizeWind(rawWind, fetchTime = Date.now()) {
    if (!rawWind || typeof rawWind !== 'object') return null;

    const wind = rawWind.wind || rawWind;
    const speed = Number(wind.speedKnots ?? wind.speed ?? 40.0);
    const direction = Number(wind.directionDegrees ?? wind.direction ?? 240);
    const u = wind.vx ?? wind.u ?? Math.cos((direction * Math.PI) / 180) * speed;
    const v = wind.vy ?? wind.v ?? Math.sin((direction * Math.PI) / 180) * speed;

    return {
      timestamp: rawWind.timestamp ? Date.parse(rawWind.timestamp) : fetchTime,
      speed,
      direction,
      vx: u,
      vy: v,
      source: rawWind.source || 'Open-Meteo'
    };
  }
}
