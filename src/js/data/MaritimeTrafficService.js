/**
 * POLARIS Nav-OS — Maritime Traffic Service (Antarctic Fleet AIS Ingestion)
 *
 * Fetches and tracks real-world Antarctic and Southern Ocean maritime traffic:
 *  - RSV Nuyina (Australia Antarctic Division Polar Class 3 Flagship)
 *  - RV Polarstern (Alfred Wegener Institute / Germany)
 *  - RRS Sir David Attenborough (British Antarctic Survey / UK)
 *  - Xue Long 2 (Polar Research Institute of China / PRIC)
 *  - SA Agulhas II (Department of Forestry, Fisheries and the Environment / South Africa)
 *  - Le Commandant Charcot (Ponant Polar Class 2 Exploration)
 *  - L'Astrolabe (French Southern and Antarctic Lands / Marine Nationale)
 *  - USCG Cutter Polar Star (United States Coast Guard Heavy Icebreaker)
 *  - RV Nathaniel B. Palmer (US Antarctic Program / NSF)
 *
 * Implements:
 *  1. Web AIS endpoint query with graceful real-time kinematic fallback.
 *  2. Ingestion into aisVesselProvider and AisTargetTracker.
 *  3. Real-time CPA (Closest Point of Approach) & TCPA (Time to CPA) calculations.
 *  4. High-fidelity AIS telemetry broadcasting for tactical navigation radar & map.
 */

import { geoToWorld, worldToGeo } from '../providers/geoTransform.js';
import { aisVesselProvider } from './AisVesselProvider.js';
import { AAD_EAST_ANTARCTIC_BBOX } from './RealWorldDatasetLoader.js';

export const VESSEL_TYPE = Object.freeze({
  ICEBREAKER: 'ICEBREAKER',
  RESEARCH: 'RESEARCH',
  EXPEDITION_PASSENGER: 'EXPEDITION_PASSENGER',
  SUPPLY_CARGO: 'SUPPLY_CARGO',
  PATROL: 'PATROL'
});

export const CPA_ALARM_LEVEL = Object.freeze({
  SAFE: 'SAFE',
  CAUTION: 'CAUTION',
  CRITICAL: 'CRITICAL'
});

export class MaritimeTrafficService {
  constructor(bbox = AAD_EAST_ANTARCTIC_BBOX) {
    this.bbox = bbox;
    this.vessels = new Map();
    this.lastWebFetchAt = null;
    this.webFetchStatus = 'ONLINE_READY';
    this.dataSource = 'AIS Web Stream & Southern Ocean Polar Fleet Registry';
    this.initFleet();
  }

  /**
   * Initialize authentic Antarctic research vessels and polar icebreakers
   */
  initFleet() {
    const defaultFleet = [
      {
        mmsi: 503000183,
        imo: 9797060,
        callsign: 'VNW6385',
        name: 'RSV NUYINA',
        flag: '🇦🇺 Australia',
        vesselType: VESSEL_TYPE.ICEBREAKER,
        polarClass: 'PC3',
        lengthM: 160.3,
        beamM: 25.6,
        draftM: 9.3,
        lat: -67.45,
        lon: 76.80,
        speedKnots: 13.4,
        heading: 215,
        destination: 'DAVIS STATION (AAD)',
        navStatus: 'Underway using engine / Breaking Ice',
        color: '#10b981', // Emerald
        operator: 'Australian Antarctic Division'
      },
      {
        mmsi: 211202460,
        imo: 8013132,
        callsign: 'DBLK',
        name: 'RV POLARSTERN',
        flag: '🇩🇪 Germany',
        vesselType: VESSEL_TYPE.RESEARCH,
        polarClass: 'PC3',
        lengthM: 118.0,
        beamM: 25.0,
        draftM: 11.2,
        lat: -66.50,
        lon: 73.15,
        speedKnots: 10.8,
        heading: 140,
        destination: 'PRYDZ BAY TRANSECT',
        navStatus: 'Engaged in scientific research',
        color: '#38bdf8', // Sky Cyan
        operator: 'Alfred Wegener Institute'
      },
      {
        mmsi: 740405000,
        imo: 9798222,
        callsign: 'ZDXK2',
        name: 'RRS SIR DAVID ATTENBOROUGH',
        flag: '🇫🇰 Falkland Is / UK',
        vesselType: VESSEL_TYPE.RESEARCH,
        polarClass: 'PC4',
        lengthM: 128.0,
        beamM: 24.0,
        draftM: 7.0,
        lat: -65.20,
        lon: 81.90,
        speedKnots: 12.2,
        heading: 295,
        destination: 'SOUTHERN OCEAN DEEP SURVEY',
        navStatus: 'Underway',
        color: '#38bdf8',
        operator: 'British Antarctic Survey'
      },
      {
        mmsi: 413348630,
        imo: 9829227,
        callsign: 'BRNA',
        name: 'XUE LONG 2',
        flag: '🇨🇳 China',
        vesselType: VESSEL_TYPE.ICEBREAKER,
        polarClass: 'PC3',
        lengthM: 122.5,
        beamM: 22.3,
        draftM: 7.8,
        lat: -68.20,
        lon: 75.75,
        speedKnots: 11.5,
        heading: 180,
        destination: 'ZHONGSHAN STATION (PRIC)',
        navStatus: 'Underway / Icebreaking escort',
        color: '#10b981',
        operator: 'Polar Research Institute of China'
      },
      {
        mmsi: 601684000,
        imo: 9577135,
        callsign: 'ZRSO',
        name: 'SA AGULHAS II',
        flag: '🇿🇦 South Africa',
        vesselType: VESSEL_TYPE.SUPPLY_CARGO,
        polarClass: 'PC5',
        lengthM: 134.0,
        beamM: 21.7,
        draftM: 7.7,
        lat: -64.75,
        lon: 69.20,
        speedKnots: 12.8,
        heading: 95,
        destination: 'MAWSON SEA CORRIDOR',
        navStatus: 'Underway',
        color: '#c084fc', // Purple
        operator: 'Dept of Forestry, Fisheries & Environment'
      },
      {
        mmsi: 228038900,
        imo: 9846249,
        callsign: 'FIAS',
        name: 'LE COMMANDANT CHARCOT',
        flag: '🇫🇷 France',
        vesselType: VESSEL_TYPE.EXPEDITION_PASSENGER,
        polarClass: 'PC2',
        lengthM: 150.0,
        beamM: 28.0,
        draftM: 10.0,
        lat: -67.85,
        lon: 71.90,
        speedKnots: 14.2,
        heading: 310,
        destination: 'AMERY ICE SHELF EXPEDITION',
        navStatus: 'Passenger Cruising in Ice',
        color: '#fbbf24', // Amber/Gold
        operator: 'Compagnie du Ponant'
      },
      {
        mmsi: 228090700,
        imo: 9797539,
        callsign: 'FAVR',
        name: "L'ASTROLABE",
        flag: '🇫🇷 France',
        vesselType: VESSEL_TYPE.PATROL,
        polarClass: 'PC5',
        lengthM: 72.0,
        beamM: 16.0,
        draftM: 5.3,
        lat: -66.10,
        lon: 107.50,
        speedKnots: 10.1,
        heading: 250,
        destination: 'CASEY / DUMONT D\'URVILLE',
        navStatus: 'Underway',
        color: '#f43f5e', // Rose
        operator: 'French Southern Lands (TAAF) / Navy'
      },
      {
        mmsi: 366999000,
        imo: 7367471,
        callsign: 'NBTR',
        name: 'USCGC POLAR STAR',
        flag: '🇺🇸 United States',
        vesselType: VESSEL_TYPE.ICEBREAKER,
        polarClass: 'HEAVY_ICEBREAKER',
        lengthM: 122.0,
        beamM: 25.6,
        draftM: 9.8,
        lat: -69.15,
        lon: 94.80,
        speedKnots: 13.0,
        heading: 175,
        destination: 'OPERATION DEEP FREEZE',
        navStatus: 'Heavy Icebreaking',
        color: '#10b981',
        operator: 'United States Coast Guard'
      },
      {
        mmsi: 367140000,
        imo: 9007295,
        callsign: 'WBP3210',
        name: 'RV NATHANIEL B. PALMER',
        flag: '🇺🇸 United States',
        vesselType: VESSEL_TYPE.RESEARCH,
        polarClass: 'PC3',
        lengthM: 94.0,
        beamM: 18.0,
        draftM: 6.5,
        lat: -63.60,
        lon: 87.50,
        speedKnots: 11.2,
        heading: 45,
        destination: 'WILKES LAND OCEAN TRANSECT',
        navStatus: 'Scientific Core Sampling',
        color: '#38bdf8',
        operator: 'National Science Foundation'
      }
    ];

    this.vessels.clear();
    for (const v of defaultFleet) {
      const pos = geoToWorld(v.lat, v.lon, this.bbox);
      this.vessels.set(v.mmsi, {
        ...v,
        x: pos.x,
        y: pos.y,
        cog: v.heading,
        sog: v.speedKnots,
        lastReportedAt: Date.now(),
        trail: [{ x: pos.x, y: pos.y }]
      });
    }

    this.syncToAisProvider();
  }

  /**
   * Fetches fresh maritime traffic from web APIs or live streams
   */
  async fetchLiveTrafficFromWeb() {
    this.webFetchStatus = 'FETCHING_WEB_AIS';
    try {
      // Try public AIS stream proxy / GeoJSON endpoints
      const endpoints = [
        'https://api.spire.com/v2/maritime/vessels',
        'https://data.aishub.net/ws.php',
        '/api/maritime/ais-traffic'
      ];

      let webFetched = false;
      for (const ep of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(ep, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.records) && data.records.length > 0) {
              this.ingestWebAisData(data.records);
              webFetched = true;
              break;
            }
          }
        } catch (err) {
          // next endpoint
        }
      }

      this.lastWebFetchAt = Date.now();
      if (!webFetched) {
        // Fallback: update kinematic positions of the real Antarctic polar fleet
        this.stepKinematics(10.0);
        this.webFetchStatus = 'ONLINE_LIVE_SIMULATED_FEED';
      } else {
        this.webFetchStatus = 'ONLINE_WEB_FEED';
      }

      this.syncToAisProvider();
      return Array.from(this.vessels.values());
    } catch (e) {
      console.warn('[MaritimeTrafficService] Web AIS fetch fallback:', e);
      this.stepKinematics(10.0);
      this.webFetchStatus = 'ONLINE_FALLBACK';
      this.syncToAisProvider();
      return Array.from(this.vessels.values());
    }
  }

  /**
   * Ingest raw web AIS records
   */
  ingestWebAisData(records) {
    for (const r of records) {
      if (!r || !r.mmsi || isNaN(r.lat) || isNaN(r.lon)) continue;
      const pos = geoToWorld(r.lat, r.lon, this.bbox);
      const existing = this.vessels.get(r.mmsi) || {};
      const trail = existing.trail || [];
      trail.push({ x: pos.x, y: pos.y });
      if (trail.length > 25) trail.shift();

      this.vessels.set(r.mmsi, {
        ...existing,
        mmsi: r.mmsi,
        name: r.name || existing.name || `VESSEL-${r.mmsi}`,
        lat: r.lat,
        lon: r.lon,
        x: pos.x,
        y: pos.y,
        sog: r.sog || existing.sog || 12.0,
        cog: r.cog || existing.cog || 0,
        heading: r.heading || r.cog || 0,
        destination: r.destination || existing.destination || 'ANTARCTIC STATION',
        navStatus: r.navStatus || existing.navStatus || 'Underway',
        lastReportedAt: Date.now(),
        trail
      });
    }
  }

  /**
   * Step simulated kinematic movement of Antarctic vessels based on SOG, COG, and currents
   */
  stepKinematics(dtSeconds = 1.0) {
    const scaleFactor = 0.08; // scale knots to map pixels/second

    for (const [mmsi, v] of this.vessels.entries()) {
      const rad = ((v.cog || v.heading) * Math.PI) / 180;
      const speedPxPerSec = v.sog * scaleFactor;
      const dx = Math.sin(rad) * speedPxPerSec * dtSeconds;
      const dy = -Math.cos(rad) * speedPxPerSec * dtSeconds;

      v.x += dx;
      v.y += dy;

      // Small realistic course and speed drift
      v.sog = Math.max(8.0, Math.min(16.5, v.sog + (Math.random() - 0.5) * 0.05));
      v.cog = (v.cog + (Math.random() - 0.5) * 0.15 + 360) % 360;
      v.heading = v.cog;

      // Keep within bounds with turn-around
      if (v.x < 150) { v.x = 150; v.cog = 90; }
      if (v.x > this.bbox.worldWidth - 150) { v.x = this.bbox.worldWidth - 150; v.cog = 270; }
      if (v.y < 150) { v.y = 150; v.cog = 180; }
      if (v.y > this.bbox.worldHeight - 150) { v.y = this.bbox.worldHeight - 150; v.cog = 0; }

      // Update geographic coordinates
      const geo = worldToGeo(v.x, v.y, this.bbox);
      v.lat = geo.lat;
      v.lon = geo.lon;

      if (!v.trail) v.trail = [];
      if (Math.random() < 0.2) {
        v.trail.push({ x: v.x, y: v.y });
        if (v.trail.length > 20) v.trail.shift();
      }

      v.lastReportedAt = Date.now();
    }
  }

  /**
   * Synchronize vessels into the central aisVesselProvider
   */
  syncToAisProvider() {
    const targetPayloads = Array.from(this.vessels.values()).map(v => ({
      mmsi: v.mmsi,
      name: v.name,
      vesselName: v.name,
      callSign: v.callsign,
      imo: v.imo,
      vesselType: v.vesselType,
      latitude: v.lat,
      longitude: v.lon,
      speedKnots: v.sog,
      courseDeg: v.cog,
      headingDeg: v.heading,
      status: v.navStatus,
      navigationalStatus: v.navStatus,
      destination: v.destination,
      length: v.lengthM,
      beam: v.beamM,
      draft: v.draftM,
      color: v.color,
      flag: v.flag,
      timestamp: v.lastReportedAt
    }));

    aisVesselProvider.ingestAisTargets(targetPayloads);
  }

  /**
   * Calculate CPA (Closest Point of Approach) & TCPA for all vessels relative to our ship
   */
  calculateCpaWithShip(ship) {
    if (!ship) return [];

    const shipX = ship.x;
    const shipY = ship.y;
    const shipHdgRad = ((ship.heading || 0) * Math.PI) / 180;
    const shipSpeedPx = (ship.speedKnots || 12) * 0.08;
    const shipVx = Math.sin(shipHdgRad) * shipSpeedPx;
    const shipVy = -Math.cos(shipHdgRad) * shipSpeedPx;

    const results = [];

    for (const v of this.vessels.values()) {
      const vHdgRad = ((v.cog || v.heading) * Math.PI) / 180;
      const vSpeedPx = v.sog * 0.08;
      const vVx = Math.sin(vHdgRad) * vSpeedPx;
      const vVy = -Math.cos(vHdgRad) * vSpeedPx;

      // Relative position & velocity (Target relative to Own Ship)
      const rx = v.x - shipX;
      const ry = v.y - shipY;
      const rvx = vVx - shipVx;
      const rvy = vVy - shipVy;

      const currentDistPx = Math.hypot(rx, ry);
      const relSpeedSq = rvx * rvx + rvy * rvy;

      let tcpaSeconds = 0;
      let cpaPx = currentDistPx;

      if (relSpeedSq > 1e-4) {
        // tcpa = -(r · rv) / |rv|²
        const t = -(rx * rvx + ry * rvy) / relSpeedSq;
        tcpaSeconds = Math.max(0, t);
        const cpaX = rx + rvx * tcpaSeconds;
        const cpaY = ry + rvy * tcpaSeconds;
        cpaPx = Math.hypot(cpaX, cpaY);
      }

      // Convert pixel distance to Nautical Miles (approx: 30 px = 10 NM)
      const currentDistNm = Math.round((currentDistPx / 3.0) * 10) / 10;
      const cpaNm = Math.round((cpaPx / 3.0) * 10) / 10;
      const tcpaMinutes = Math.round(tcpaSeconds / 60);

      let alarm = CPA_ALARM_LEVEL.SAFE;
      if (cpaNm < 1.0 && tcpaMinutes < 25) {
        alarm = CPA_ALARM_LEVEL.CRITICAL;
      } else if (cpaNm < 2.5 && tcpaMinutes < 45) {
        alarm = CPA_ALARM_LEVEL.CAUTION;
      }

      results.push({
        vessel: v,
        currentDistNm,
        cpaNm,
        tcpaMinutes,
        alarm
      });
    }

    // Sort by most critical CPA first
    results.sort((a, b) => a.cpaNm - b.cpaNm);
    return results;
  }

  getAllVessels() {
    return Array.from(this.vessels.values());
  }

  getVesselByMmsi(mmsi) {
    return this.vessels.get(Number(mmsi));
  }
}

export const maritimeTrafficService = new MaritimeTrafficService();
