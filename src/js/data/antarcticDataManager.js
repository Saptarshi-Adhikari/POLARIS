import metadata from '../../data/antarctic/metadata.json' with { type: 'json' };
import seaIceSample from '../../data/antarctic/sea_ice_sample.json' with { type: 'json' };
import oceanCurrentsSample from '../../data/antarctic/ocean_currents_sample.json' with { type: 'json' };
import windSample from '../../data/antarctic/wind_sample.json' with { type: 'json' };
import icebergTracksSample from '../../data/antarctic/iceberg_tracks_sample.json' with { type: 'json' };

export class AntarcticDataManager {
  constructor(engine) {
    this.engine = engine;
    this.metadata = metadata;
    this.seaIceData = seaIceSample;
    this.oceanCurrentsData = oceanCurrentsSample;
    this.windData = windSample;
    this.icebergTracksData = icebergTracksSample;
    this.active = false;
    this.status = 'ONLINE'; // ONLINE | FALLBACK
  }

  getEnvironmentAt(simTimeHours) {
    return {
      metadata: this.metadata,
      timeStep: this.getClosestTimeStepIndex(simTimeHours)
    };
  }

  getSeaIceAt(x, y, simTimeHours) {
    try {
      const stepIdx = this.getClosestTimeStepIndex(simTimeHours);
      const w = this.seaIceData.grid_w;
      const h = this.seaIceData.grid_h;
      const col = Math.max(0, Math.min(w - 1, Math.floor((x / 3600) * w)));
      const row = Math.max(0, Math.min(h - 1, Math.floor((y / 2400) * h)));
      return this.seaIceData.concentrations[stepIdx][row][col] || 0.0;
    } catch (e) {
      console.warn("Sea ice read error, falling back", e);
      this.status = 'FALLBACK';
      return null; // Fallback trigger
    }
  }

  getCurrentAt(x, y, simTimeHours) {
    try {
      const stepIdx = this.getClosestTimeStepIndex(simTimeHours);
      const w = this.oceanCurrentsData.grid_w;
      const h = this.oceanCurrentsData.grid_h;
      const col = Math.max(0, Math.min(w - 1, Math.floor((x / 3600) * w)));
      const row = Math.max(0, Math.min(h - 1, Math.floor((y / 2400) * h)));
      const entry = this.oceanCurrentsData.currents[stepIdx][row * w + col];
      return entry ? { u: entry.u, v: entry.v } : null;
    } catch (e) {
      console.warn("Current read error, falling back", e);
      this.status = 'FALLBACK';
      return null;
    }
  }

  getWindAt(x, y, simTimeHours) {
    try {
      const stepIdx = this.getClosestTimeStepIndex(simTimeHours);
      const w = this.windData.grid_w;
      const h = this.windData.grid_h;
      const col = Math.max(0, Math.min(w - 1, Math.floor((x / 3600) * w)));
      const row = Math.max(0, Math.min(h - 1, Math.floor((y / 2400) * h)));
      const entry = this.windData.wind[stepIdx][row * w + col];
      return entry ? { u: entry.u, v: entry.v } : null;
    } catch (e) {
      console.warn("Wind read error, falling back", e);
      this.status = 'FALLBACK';
      return null;
    }
  }

  getIcebergsAt(simTimeHours) {
    try {
      const stepIdx = this.getClosestTimeStepIndex(simTimeHours);
      return this.icebergTracksData.icebergs.map(ice => {
        const track = ice.tracks[stepIdx] || ice.tracks[0];
        return {
          id: ice.id,
          name: ice.name,
          size: ice.size,
          mass: ice.mass,
          x: track.x,
          y: track.y,
          vx: track.vx,
          vy: track.vy
        };
      });
    } catch (e) {
      console.warn("Icebergs read error, falling back", e);
      this.status = 'FALLBACK';
      return null;
    }
  }

  getClosestTimeStepIndex(hours) {
    // Clamped time steps index finding (0, 12, 24)
    if (hours < 6) return 0;
    if (hours < 18) return 1;
    return 2;
  }

  async fetchLiveOpenMeteoMarine(lat = -69.4, lon = 76.187) {
    const isBlackout = typeof window !== 'undefined' && (window.location.search.includes('comms=blackout') || window.__COMMS_BLACKOUT__);
    if (isBlackout) {
      console.log('[OpenMeteo] Comms blackout active — skipping live fetch, using CACHED/SIM');
      return null;
    }

    const cacheKey = `polaris_meteo_${lat.toFixed(1)}_${lon.toFixed(1)}`;
    const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    const now = Date.now();

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (now - parsed.timestamp < 30 * 60 * 1000) { // 30 min cache
          return parsed.data;
        }
      } catch (e) {}
    }

    try {
      const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,wave_height,wave_direction,wave_period,sea_surface_temperature&forecast_days=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(cacheKey, JSON.stringify({ timestamp: now, data }));
      }
      return data;
    } catch (err) {
      console.warn('[OpenMeteo] Live fetch failed, using cached fallback:', err);
      return null;
    }
  }
}
