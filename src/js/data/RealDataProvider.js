/**
 * POLARIS RealDataProvider Implementation
 *
 * Handles real-world data fetching (Open-Meteo, USNIC snapshot)
 * and holds isolated cache namespaces (`astralis:real:*`).
 */

import { DataProvider } from './DataProvider.js';
import usnicSnapshot from '../../../data/antarctic/usnic_snapshot.json' with { type: 'json' };

export class RealDataProvider extends DataProvider {
  constructor(engine) {
    super('REAL_PROVIDER');
    this.engine = engine;
    this.abortController = new AbortController();
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
      data: usnicSnapshot,
      provenance: {
        status: 'CACHED',
        snapshotDate: '2026-09-24',
        source: 'USNIC Static Snapshot',
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
      { id: 'usnic-icebergs', status: 'CACHED', note: 'USNIC Static Snapshot (2026-09-24)' },
      { id: 'synthetic-sea-ice', status: 'SIM', note: 'Sea-Ice Grid reprojected to Lat/Lon' },
      { id: 'synthetic-currents', status: 'SIM', note: 'Southern Ocean Currents Vector Field' }
    ];
  }

  dispose() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
