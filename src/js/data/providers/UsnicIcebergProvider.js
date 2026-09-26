/**
 * POLARIS USNIC Iceberg Data Provider
 * Fetches real Antarctic iceberg observations from USNIC ERDDAP / official products,
 * falling back gracefully to bundled verified USNIC samples if offline/unreachable.
 */

import { USNIC_ICEBERG_SAMPLES } from '../../providers/realMaritimeDataset.js';

export class UsnicIcebergProvider {
  constructor() {
    this.name = 'USNIC ERDDAP / NOAA PolarWatch';
    this.erddapUrl = 'https://polarwatch.noaa.gov/erddap/tabledap/usnic_weekly_iceberg.json';
    this.officialPageUrl = 'https://usicecenter.gov/Products/AntarcIcebergs';
    this.lastFetchedAt = null;
    this.status = 'READY';
  }

  async fetchIcebergs() {
    const fetchStart = performance.now();
    try {
      // Attempt live fetch with tight timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(this.erddapUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json();
        const records = this._parseErddapResponse(json);
        if (records && records.length > 0) {
          this.lastFetchedAt = Date.now();
          this.status = 'LIVE';
          return {
            records,
            source: 'USNIC ERDDAP Live Feed',
            latencyMs: Math.round(performance.now() - fetchStart),
            isCached: false
          };
        }
      }
    } catch (err) {
      console.info('[UsnicIcebergProvider] Live ERDDAP fetch unavailable/offline. Using bundled USNIC dataset:', err.message);
    }

    // Fallback to verified bundled USNIC dataset
    this.lastFetchedAt = Date.now();
    this.status = 'BUNDLED_CACHE';
    return {
      records: USNIC_ICEBERG_SAMPLES,
      source: 'USNIC (U.S. National Ice Center) Bundled Snapshot',
      latencyMs: Math.round(performance.now() - fetchStart),
      isCached: true
    };
  }

  _parseErddapResponse(json) {
    if (!json || !json.table || !json.table.rows) return null;
    const cols = json.table.columnNames || [];
    const idIdx = cols.indexOf('iceberg_id') !== -1 ? cols.indexOf('iceberg_id') : cols.indexOf('name');
    const latIdx = cols.indexOf('latitude');
    const lonIdx = cols.indexOf('longitude');
    const timeIdx = cols.indexOf('time');

    if (latIdx === -1 || lonIdx === -1) return null;

    return json.table.rows.map((row, idx) => ({
      id: idIdx !== -1 ? row[idIdx] : `USNIC-${idx}`,
      name: idIdx !== -1 ? row[idIdx] : `Iceberg ${idx}`,
      latitude: row[latIdx],
      longitude: row[lonIdx],
      timestamp: timeIdx !== -1 ? row[timeIdx] : new Date().toISOString(),
      source: 'USNIC ERDDAP'
    }));
  }
}
