/**
 * POLARIS RealDataProvider Implementation
 *
 * Handles real-world data fetching (Open-Meteo, USNIC NOAA ERDDAP Iceberg Dataset)
 * and holds isolated cache namespaces (`astralis:real:*`).
 */

import { DataProvider } from './DataProvider.js';
import { haversineDistanceNM, calculateInitialBearing } from '../geo/projection.js';
import usnicSnapshot from '../../../data/antarctic/usnic_snapshot.json' with { type: 'json' };

export class RealDataProvider extends DataProvider {
  constructor(engine) {
    super('REAL_PROVIDER');
    this.engine = engine;
    this.abortController = new AbortController();
    this.icebergsData = [];
    this.icebergsRetrievedAt = new Date().toISOString().split('T')[0];
    this.icebergsStatus = 'CACHED';
    this.icebergsSource = 'USNIC / NOAA ERDDAP';

    // Synchronously initialize fallback, then asynchronously fetch live ERDDAP operational data
    this.initFallbackIcebergs();
    this.fetchUSNICIcebergs();
  }

  initFallbackIcebergs() {
    const cacheKey = 'astralis:real:usnic_icebergs';
    if (typeof localStorage !== 'undefined') {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed.data) && parsed.data.length > 0) {
            this.icebergsData = parsed.data;
            this.icebergsRetrievedAt = parsed.retrievedAt || new Date().toISOString().split('T')[0];
            this.icebergsStatus = 'CACHED';
            this.icebergsSource = 'USNIC / NOAA ERDDAP';
            return;
          }
        }
      } catch (e) {}
    }

    if (Array.isArray(usnicSnapshot)) {
      this.icebergsData = usnicSnapshot.map(item => ({
        id: item.id ? `USNIC_${item.id}` : `USNIC_${item.name}`,
        name: item.name || item.id || 'USNIC Iceberg',
        timestamp: item.snapshot_date || '2026-09-24',
        latitude: item.lat,
        longitude: item.lon,
        lengthNm: item.size_km ? Math.round(item.size_km * 0.539957) : null,
        widthNm: null,
        areaSqNm: null,
        source: item.source || 'USNIC / NOAA ERDDAP Snapshot',
        remarks: item.note || ''
      })).filter(item => typeof item.latitude === 'number' && typeof item.longitude === 'number' && item.latitude <= -45.0);

      this.icebergsRetrievedAt = '2026-09-24';
      this.icebergsStatus = 'CACHED';
      this.icebergsSource = 'USNIC / NOAA ERDDAP';
    }
  }

  async fetchUSNICIcebergs() {
    const cacheKey = 'astralis:real:usnic_icebergs';
    const erddapUrl = 'https://polarwatch.noaa.gov/erddap/tabledap/usnic_weekly_iceberg.json?time,latitude,longitude,Iceberg,length_nm,width,area,source,remarks&time>=2026-01-01';

    try {
      const res = await fetch(erddapUrl, { signal: this.abortController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json && json.table && Array.isArray(json.table.rows)) {
        const rows = json.table.rows;
        const normalized = [];

        for (const r of rows) {
          const [timeStr, latNum, lonNum, iceName, len, wid, ar, src, rem] = r;

          // Validation (Step 5)
          if (!iceName || typeof iceName !== 'string' || !iceName.trim()) continue;
          if (typeof latNum !== 'number' || typeof lonNum !== 'number' || isNaN(latNum) || isNaN(lonNum) || !isFinite(latNum) || !isFinite(lonNum)) continue;
          if (latNum < -90 || latNum > 90 || lonNum < -180 || lonNum > 180) continue;

          // Antarctic Filter (Step 6): latitude <= -45
          if (latNum > -45.0) continue;

          const datePart = typeof timeStr === 'string' ? timeStr.split('T')[0] : '2026-01-01';
          const cleanName = iceName.trim();

          normalized.push({
            id: `USNIC_${cleanName}_${datePart}`,
            name: cleanName,
            timestamp: timeStr || datePart,
            latitude: latNum,
            longitude: lonNum,
            lengthNm: typeof len === 'number' && !isNaN(len) ? len : null,
            widthNm: typeof wid === 'number' && !isNaN(wid) ? wid : null,
            areaSqNm: typeof ar === 'number' && !isNaN(ar) ? ar : null,
            source: src || 'USNIC / NOAA ERDDAP',
            remarks: rem || ''
          });
        }

        if (normalized.length > 0) {
          // Group observations by iceberg name to compute observed drift velocity
          const byName = {};
          for (const item of normalized) {
            if (!byName[item.name]) byName[item.name] = [];
            byName[item.name].push(item);
          }

          const latestObservations = [];
          for (const name in byName) {
            const obsList = byName[name];
            obsList.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

            const latest = obsList[obsList.length - 1];
            if (obsList.length >= 2) {
              const prev = obsList[obsList.length - 2];
              const t1 = new Date(prev.timestamp).getTime();
              const t2 = new Date(latest.timestamp).getTime();
              const dtHours = (t2 - t1) / (1000 * 3600);

              if (dtHours > 0.5 && dtHours < 720) { // Valid time delta (0.5h to 30 days)
                const dNm = haversineDistanceNM(prev.latitude, prev.longitude, latest.latitude, latest.longitude);
                const brg = calculateInitialBearing(prev.latitude, prev.longitude, latest.latitude, latest.longitude);
                const speedKn = Math.round((dNm / dtHours) * 10) / 10;

                latest.observedDrift = {
                  speedKn,
                  bearingDeg: brg,
                  obsCount: obsList.length,
                  intervalHours: Math.round(dtHours),
                  source: 'USNIC / NOAA ERDDAP Sequential Observations'
                };
              } else {
                latest.observedDrift = null;
              }
            } else {
              latest.observedDrift = null;
            }
            latestObservations.push(latest);
          }

          const retrievedDate = new Date().toISOString().split('T')[0];
          this.icebergsData = latestObservations;
          this.icebergsRetrievedAt = retrievedDate;
          this.icebergsStatus = 'CACHED';
          this.icebergsSource = 'USNIC / NOAA ERDDAP';

          if (typeof localStorage !== 'undefined') {
            try {
              localStorage.setItem(cacheKey, JSON.stringify({
                retrievedAt: retrievedDate,
                data: normalized
              }));
            } catch (e) {}
          }
        }
      }
    } catch (e) {
      console.warn('[RealDataProvider] ERDDAP fetch deferred/failed (using cache fallback):', e);
    }
  }

  getSeaIce(viewport) {
    return {
      synthetic: true,
      data: { averageConcentration: 0.2 },
      provenance: {
        status: 'SIM',
        source: 'Sea-Ice Grid reprojected to Lat/Lon',
        license: 'Synthetic Model'
      },
      units: 'Concentration (0-1)'
    };
  }

  getCurrents(viewport) {
    return {
      synthetic: true,
      data: { speed: 1.8, direction: 127 },
      provenance: {
        status: 'SIM',
        source: 'Southern Ocean Currents Vector Field',
        license: 'Synthetic Model'
      },
      units: 'SU/s @ deg'
    };
  }

  getIcebergs() {
    return {
      data: this.icebergsData,
      provenance: {
        status: 'CACHED',
        snapshotDate: this.icebergsRetrievedAt,
        retrievedAt: this.icebergsRetrievedAt,
        source: this.icebergsSource,
        license: 'U.S. Public Domain'
      },
      units: 'Lat/Lon'
    };
  }

  async getMeteo(lat = -69.4, lon = 76.187) {
    const isBlackout = typeof window !== 'undefined' && (window.location.search.includes('comms=blackout') || window.__COMMS_BLACKOUT__);
    if (isBlackout) {
      return {
        data: null,
        provenance: {
          status: 'CACHED',
          source: 'Open-Meteo Offline Cache',
          license: 'CC-BY 4.0'
        },
        units: 'knots / deg'
      };
    }

    const cacheKey = `astralis:real:meteo:${lat.toFixed(1)}_${lon.toFixed(1)}`;
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    const now = Date.now();

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (now - parsed.timestamp < 30 * 60 * 1000) {
          return {
            data: parsed.data,
            provenance: {
              status: 'LIVE',
              updatedAt: new Date(parsed.timestamp).toISOString(),
              source: `Open-Meteo Marine (${lat.toFixed(1)}°S, ${lon.toFixed(1)}°E)`,
              license: 'CC-BY 4.0'
            },
            units: 'knots / deg'
          };
        }
      } catch (e) {}
    }

    try {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,wave_height,wave_direction,wave_period,sea_surface_temperature&forecast_days=2`;
      const res = await fetch(url, { signal: this.abortController.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
      }
      return {
        data,
        provenance: {
          status: 'LIVE',
          updatedAt: new Date(now).toISOString(),
          source: `Open-Meteo Marine (${lat.toFixed(1)}°S, ${lon.toFixed(1)}°E)`,
          license: 'CC-BY 4.0'
        },
        units: 'knots / deg'
      };
    } catch (err) {
      return {
        data: null,
        provenance: {
          status: 'CACHED',
          source: 'Open-Meteo Fallback',
          license: 'CC-BY 4.0'
        },
        units: 'knots / deg'
      };
    }
  }

  getProvenance() {
    return [
      { id: 'natural-earth-coastline', status: 'BUNDLED', note: 'Antarctic Coastline GeoJSON' },
      { id: 'stylized-bathymetry', status: 'STYLIZED', note: 'Coastal Bathymetry Depth Bands' },
      { id: 'open-meteo-marine', status: 'LIVE', note: 'Open-Meteo at Bharati Corridor (-69.4°S, 76.18°E)' },
      { id: 'usnic-icebergs', status: 'CACHED', note: `USNIC / NOAA ERDDAP Operational Icebergs (Retrieved: ${this.icebergsRetrievedAt})` },
      { id: 'byu-tracks', status: 'HISTORICAL', note: 'BYU / NIC Scatterometer Climate Record (SCP)' },
      { id: 'own-ship-state', status: 'SIMULATED', note: 'ASTRALIS Mission Vessel (SIMULATED State)' },
      { id: 'maptiler-hybrid', status: 'LIVE', note: 'MapTiler Satellite Hybrid Antarctic Map' }
    ];
  }

  dispose() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
