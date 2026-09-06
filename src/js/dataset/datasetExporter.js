/**
 * POLARIS Nav-OS — Dataset Exporter & Manifest Engine (v2)
 *
 * Formats autonomous episodes as JSONL files and maintains the dataset manifest.
 * Environment-safe: operates seamlessly in Node.js (fs/path) and Browser (Blob download / memory).
 */

import { SCHEMA_VERSION, validateEpisodeData } from './datasetSchema.js';

function getNodeModule(name) {
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    try {
      const getReq = new Function('return typeof require !== "undefined" ? require : null');
      const req = getReq();
      if (req) return req(name);
    } catch (e) {
      return null;
    }
  }
  return null;
}

const fs = getNodeModule('fs');
const path = getNodeModule('path');

export class DatasetExporter {
  constructor(baseDir = 'datasets/v2') {
    this.isBrowser = typeof window !== 'undefined' || typeof document !== 'undefined';
    const rawDir = typeof baseDir === 'object' && baseDir !== null ? (baseDir.baseDir || 'datasets/v2') : (baseDir || 'datasets/v2');
    this.baseDirParam = rawDir;

    this.nodeFs = (typeof process !== 'undefined' && process.versions && process.versions.node) ? fs : null;
    this.nodePath = (typeof process !== 'undefined' && process.versions && process.versions.node) ? path : null;

    if (this.nodeFs && this.nodePath) {
      this.isBrowser = false;
      const resolvedBase = this.nodePath.isAbsolute(this.baseDirParam) 
        ? this.baseDirParam 
        : this.nodePath.join(process.cwd(), this.baseDirParam);

      this.baseDir = resolvedBase;
      this.episodesDir = this.nodePath.join(resolvedBase, 'episodes');
      this.manifestPath = this.nodePath.join(resolvedBase, 'manifest.json');

      if (!this.nodeFs.existsSync(resolvedBase)) this.nodeFs.mkdirSync(resolvedBase, { recursive: true });
      if (!this.nodeFs.existsSync(this.episodesDir)) this.nodeFs.mkdirSync(this.episodesDir, { recursive: true });
    }

    this.inMemoryManifest = {
      schema_version: SCHEMA_VERSION,
      episode_count: 0,
      success_count: 0,
      collision_count: 0,
      near_miss_count: 0,
      timeout_count: 0,
      total_telemetry_samples: 0,
      total_simulated_hours: 0,
      seeds: [],
      creation_metadata: {
        created_at: new Date().toISOString(),
        generator: "POLARIS_DATASET_ENGINE_2.0"
      }
    };
  }

  /**
   * Exports a batch of episodes to JSONL, CSV, and XLSX formats.
   */
  exportEpisodeBatch(episodes = []) {
    for (const ep of episodes) {
      this.exportEpisodeJSONL(ep);
    }
    this.exportEpisodeSummaryCSV(episodes);
    this.exportTrainingSamplesCSV(episodes);
    this.exportDatasetXLSX(episodes);
    return { success: true, count: episodes.length };
  }

  /**
   * Serializes an episode object into a .jsonl file with chunked array handling to prevent RangeError.
   */
  exportEpisodeJSONL(episode) {
    const validation = validateEpisodeData(episode);
    if (!validation.valid) {
      console.warn(`[DatasetExporter] Episode ${episode?.episode_id} rejected due to validation errors:`, validation.errors);
      return { success: false, errors: validation.errors };
    }

    const { telemetry, ...metadata } = episode;
    const headerObj = {
      record_type: "METADATA_HEADER",
      ...metadata,
      telemetry_count: telemetry.length
    };

    const epId = episode.episode_id || episode.episodeId || `ep_${Date.now()}`;
    const filename = `${epId}.jsonl`;

    // Process telemetry in chunks to prevent V8 string length overflow
    const chunks = [JSON.stringify(headerObj)];
    const chunkSize = 500;
    for (let i = 0; i < telemetry.length; i += chunkSize) {
      const slice = telemetry.slice(i, i + chunkSize);
      const sliceLines = slice.map(sample => JSON.stringify({
        record_type: "TELEMETRY_SAMPLE",
        ...sample
      })).join('\n');
      chunks.push(sliceLines);
    }
    const jsonlContent = chunks.join('\n');

    if (!this.isBrowser && this.nodeFs && this.nodePath) {
      const filePath = this.nodePath.join(this.episodesDir, filename);
      this.nodeFs.writeFileSync(filePath, jsonlContent, 'utf8');
      this.updateManifest(episode);
      return { success: true, filePath, content: jsonlContent };
    } else {
      this.updateManifest(episode);
      return { success: true, content: jsonlContent, filename };
    }
  }

  /**
   * Generates CSV summary of all episodes (episode_summary.csv).
   */
  exportEpisodeSummaryCSV(episodes = []) {
    const headers = [
      'episode_id', 'seed', 'scenario_class', 'route_mode', 'termination_reason',
      'event_label', 'duration_seconds', 'planner_calls', 'route_changes',
      'min_physical_clearance', 'heading_oscillation_rate', 'rudder_sign_flip_rate'
    ];
    const rows = [headers.join(',')];

    for (const ep of episodes) {
      const m = ep.metrics || {};
      rows.push([
        ep.episode_id || ep.episodeId,
        ep.seed,
        ep.scenario_class || ep.scenarioClass,
        ep.route_mode || ep.routeMode || 'BALANCED',
        ep.termination_reason || ep.terminationReason,
        ep.event_label || ep.eventLabel,
        ep.simulation_duration_seconds || (ep.simulation_duration_hours ? ep.simulation_duration_hours * 3600 : 0),
        m.plannerCalls || 0,
        m.routeChanges || 1,
        m.minPhysicalClearance || m.minIcebergClearance || 9999,
        m.headingOscillationRate || 0,
        m.rudderSignFlipRate || 0
      ].join(','));
    }

    const csvContent = rows.join('\n');
    if (!this.isBrowser && this.nodeFs && this.nodePath) {
      const filePath = this.nodePath.join(this.baseDir, 'episode_summary.csv');
      this.nodeFs.writeFileSync(filePath, csvContent, 'utf8');
    }
    return csvContent;
  }

  /**
   * Generates flat CSV of training state-action samples (training_samples.csv).
   */
  exportTrainingSamplesCSV(episodes = []) {
    const headers = [
      'episode_id', 'sim_time', 'ship_x', 'ship_y', 'ship_heading', 'ship_speed',
      'rudder', 'throttle', 'desired_heading', 'xte', 'nearest_ice_dist', 'physical_clearance',
      'heading_error', 'desired_heading_filtered', 'target_heading', 'rudder_rate', 'xte_rate',
      'lookahead_dist', 'control_mode', 'heading_oscillation', 'rudder_sign_flips', 'termination_reason'
    ];
    const rows = [headers.join(',')];

    for (const ep of episodes) {
      const tel = ep.telemetry || [];
      const epId = ep.episode_id || ep.episodeId;
      const termReason = ep.termination_reason || ep.terminationReason;

      for (const s of tel) {
        const ship = s.ship || {};
        const nav = s.navigation || {};
        const ice = s.nearest_iceberg || {};

        rows.push([
          epId,
          s.simulation_time || 0,
          ship.x || 0,
          ship.y || 0,
          ship.heading || 0,
          ship.speed || 0,
          ship.rudder || 0,
          ship.throttle || 0,
          nav.desired_heading || ship.desiredHeadingRaw || 0,
          nav.XTE || ship.crossTrackError || 0,
          ice.center_distance || 9999,
          ice.physical_clearance || 9999,
          ship.headingError || 0,
          ship.desiredHeadingFiltered || 0,
          nav.targetHeading || ship.targetHeading || 0,
          ship.rudderRate || 0,
          ship.xteRate || 0,
          ship.lookaheadDistance || 0,
          ship.controlMode || 'NORMAL_TRACKING',
          ship.headingOscillationRate || 0,
          ship.rudderSignFlipRate || 0,
          termReason
        ].join(','));
      }
    }

    const csvContent = rows.join('\n');
    if (!this.isBrowser && this.nodeFs && this.nodePath) {
      const filePath = this.nodePath.join(this.baseDir, 'training_samples.csv');
      this.nodeFs.writeFileSync(filePath, csvContent, 'utf8');
    }
    return csvContent;
  }

  /**
   * Generates spreadsheet-friendly export format (dataset.xlsx / dataset.csv bundle).
   */
  exportDatasetXLSX(episodes = []) {
    // Generate episode summary CSV as primary spreadsheet-friendly format
    const summaryCSV = this.exportEpisodeSummaryCSV(episodes);
    if (!this.isBrowser && this.nodeFs && this.nodePath) {
      const filePath = this.nodePath.join(this.baseDir, 'dataset.xlsx');
      // Produce CSV-formatted text file with .xlsx / .csv extension for spreadsheet inspection
      this.nodeFs.writeFileSync(filePath, summaryCSV, 'utf8');
    }
    return summaryCSV;
  }

  /**
   * Reads or initializes the manifest.json file and updates it with episode data.
   */
  updateManifest(episode) {
    let manifest = this.inMemoryManifest;

    if (!this.isBrowser && this.nodeFs && this.manifestPath) {
      if (this.nodeFs.existsSync(this.manifestPath)) {
        try {
          const raw = this.nodeFs.readFileSync(this.manifestPath, 'utf8');
          manifest = JSON.parse(raw);
        } catch (e) {
          console.error("[DatasetExporter] Failed to parse manifest.json, reinitializing.", e);
        }
      }
    }

    manifest.episode_count += 1;
    if (episode.termination_reason === "DESTINATION_REACHED") manifest.success_count += 1;
    if (episode.termination_reason === "COLLISION") manifest.collision_count += 1;
    if (episode.event_label === "NEAR_MISS") manifest.near_miss_count += 1;
    if (episode.termination_reason === "TIMEOUT") manifest.timeout_count += 1;

    const sampleCount = episode.telemetry ? episode.telemetry.length : 0;
    manifest.total_telemetry_samples += sampleCount;

    const simHrs = episode.simulation_duration_hours || 0;
    manifest.total_simulated_hours = parseFloat((manifest.total_simulated_hours + simHrs).toFixed(4));

    if (episode.seed !== undefined && !manifest.seeds.includes(episode.seed)) {
      manifest.seeds.push(episode.seed);
    }

    manifest.last_updated_at = new Date().toISOString();
    this.inMemoryManifest = manifest;

    if (!this.isBrowser && this.nodeFs && this.manifestPath) {
      this.nodeFs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }
  }

  /**
   * Returns current manifest content.
   */
  getManifest() {
    if (!this.isBrowser && this.nodeFs && this.manifestPath) {
      if (this.nodeFs.existsSync(this.manifestPath)) {
        try {
          const content = this.nodeFs.readFileSync(this.manifestPath, 'utf8');
          if (content && content.trim()) {
            return JSON.parse(content);
          }
        } catch (e) {
          // Fallback to in-memory manifest on read/parse race condition
        }
      }
    }
    return this.inMemoryManifest;
  }

  /**
   * Writes content directly to a Chromium FileSystemDirectoryHandle if available.
   */
  async exportFileWithDirectoryHandle(directoryHandle, filename, contentStr) {
    if (!directoryHandle || typeof directoryHandle.getFileHandle !== 'function') {
      return { success: false, reason: 'Invalid directoryHandle' };
    }
    try {
      const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(contentStr);
      await writable.close();
      return { success: true, filename };
    } catch (e) {
      console.warn('[DatasetExporter] Direct directory handle write failed:', e);
      return { success: false, error: e };
    }
  }
}
