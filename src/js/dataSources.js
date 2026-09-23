/**
 * POLARIS Data Sources & Provenance Registry
 */

export const DATA_SOURCES = [
  {
    id: 'open-meteo-marine',
    name: 'Open-Meteo Marine API',
    category: 'meteorology',
    status: 'SIM', // Updated dynamically to LIVE/CACHED
    updatedAt: null,
    license: 'CC-BY 4.0',
    note: 'ECMWF IFS HRES surface wind, gusts, and wave model.'
  },
  {
    id: 'usnic-icebergs',
    name: 'USNIC Antarctic Icebergs',
    category: 'iceberg',
    status: 'SIM', // Updated dynamically to LIVE/CACHED
    updatedAt: null,
    license: 'U.S. Public Domain',
    note: 'Tracked Antarctic named iceberg dataset.'
  },
  {
    id: 'synthetic-sea-ice',
    name: 'Antarctic Sea-Ice Grid',
    category: 'satellite',
    status: 'SIM',
    updatedAt: new Date().toISOString(),
    license: 'Synthetic Model',
    note: 'Procedural/data-driven concentration grid.'
  },
  {
    id: 'synthetic-currents',
    name: 'Southern Ocean Currents',
    category: 'oceanography',
    status: 'SIM',
    updatedAt: new Date().toISOString(),
    license: 'Synthetic Model',
    note: 'Simulated 2D current vector field.'
  },
  {
    id: 'natural-earth-coastline',
    name: 'Antarctic Coastline GeoJSON',
    category: 'geography',
    status: 'BUNDLED',
    updatedAt: new Date().toISOString(),
    license: 'Natural Earth (Public Domain)',
    note: 'Simplified Antarctic coastline vector data clipped < -45°S.'
  },
  {
    id: 'stylized-bathymetry',
    name: 'Stylized Coastal Bathymetry',
    category: 'oceanography',
    status: 'STYLIZED',
    updatedAt: new Date().toISOString(),
    license: 'Synthetic Geometry',
    note: 'Distance-to-coast depth band rendering.'
  }
];

export class DataProvenanceRegistry {
  constructor() {
    this.sources = new Map(DATA_SOURCES.map(src => [src.id, { ...src }]));
    this.listeners = [];
  }

  updateStatus(id, status, extra = {}) {
    if (this.sources.has(id)) {
      const item = this.sources.get(id);
      item.status = status;
      item.updatedAt = new Date().toISOString();
      Object.assign(item, extra);
      this.notify();
    }
  }

  getSource(id) {
    return this.sources.get(id);
  }

  getAll() {
    return Array.from(this.sources.values());
  }

  subscribe(fn) {
    this.listeners.push(fn);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.getAll());
      } catch (e) {
        console.error('Error in provenance listener:', e);
      }
    }
  }
}

export const provenanceRegistry = new DataProvenanceRegistry();
