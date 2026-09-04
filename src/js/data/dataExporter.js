/**
 * ASTRALIS Nav-OS — Data Exporter (Phase 6)
 *
 * Exports DataRecorder buffer to JSON or CSV for ML training pipelines.
 * Uses Blob + anchor-click pattern — runs entirely client-side, no network I/O.
 */

export class DataExporter {
  constructor() {
    this.defaultFormat = 'json';
  }

  // ── JSON export ─────────────────────────────────────────────────────────

  exportToJson(data, filename = 'iceberg_data.json') {
    if (!data || data.length === 0) {
      console.warn('[DataExporter] Buffer is empty — nothing to export');
      return;
    }
    const content = JSON.stringify(data, null, 2);
    this._downloadBlob(content, filename, 'application/json');
    console.info(`[DataExporter] Exported ${data.length} samples → ${filename}`);
  }

  // ── CSV export ──────────────────────────────────────────────────────────

  exportToCSV(data, filename = 'iceberg_data.csv') {
    if (!data || data.length === 0) {
      console.warn('[DataExporter] Buffer is empty — nothing to export');
      return;
    }

    const headers = Object.keys(data[0]);
    const rows    = [headers.join(',')];

    for (const row of data) {
      const values = headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
        if (typeof v === 'string')  return `"${v.replace(/"/g, '""')}"`;
        return v;
      });
      rows.push(values.join(','));
    }

    this._downloadBlob(rows.join('\n'), filename, 'text/csv');
    console.info(`[DataExporter] Exported ${data.length} samples → ${filename}`);
  }

  // ── Session export (convenience wrapper) ────────────────────────────────

  /**
   * Export the full buffer from a DataRecorder.
   * @param {import('./dataRecorder.js').DataRecorder} recorder
   * @param {'json'|'csv'} format
   */
  exportSession(recorder, format = 'json') {
    const data      = recorder.getBuffer();
    const ts        = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const ext       = format === 'csv' ? 'csv' : 'json';
    const filename  = `astralis_iceberg_${recorder.sessionId}_${ts}.${ext}`;

    if (format === 'csv') {
      this.exportToCSV(data, filename);
    } else {
      this.exportToJson(data, filename);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const dataExporter = new DataExporter();
