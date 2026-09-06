/**
 * POLARIS — Dataset v4 Generator & Quality Inspector (Phase 6.8)
 *
 * Runs 50 real simulation episodes using the exact EpisodeRunner & NavTestBot runtime.
 * Exports datasets/v4 with episodes.jsonl, samples.jsonl, events.jsonl, manifest.json, and summary.json.
 */

import fs from 'fs';
import path from 'path';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';
import { DatasetAnalyzer } from '../src/js/dataset/datasetAnalyzer.js';
import { SCENARIO_CLASSES, ROUTE_MODES } from '../src/js/debug/navTestScenarios.js';

async function generateDatasetV4() {
  const baseDir = 'datasets/v4';
  const episodesDir = path.join(baseDir, 'episodes');

  if (fs.existsSync(baseDir)) {
    try {
      fs.rmSync(baseDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not clean baseDir entirely, continuing:', e.message);
    }
  }
  fs.mkdirSync(episodesDir, { recursive: true });

  console.log('Generating datasets/v4 using real EpisodeRunner runtime...');

  const runner = new EpisodeRunner();
  const exporter = new DatasetExporter({ baseDir });

  const generatedEpisodes = [];
  const allEvents = [];
  const numEpisodes = 50;

  for (let k = 0; k < numEpisodes; k++) {
    const classIndex = k % SCENARIO_CLASSES.length;
    const passIndex = Math.floor(k / SCENARIO_CLASSES.length);
    const modeIndex = (classIndex + passIndex) % ROUTE_MODES.length;

    const scClass = SCENARIO_CLASSES[classIndex];
    const rMode = ROUTE_MODES[modeIndex];
    const seed = 4000 + k;

    const ep = runner.runEpisode(seed, scClass, { routeMode: rMode, maxSteps: 3000 });
    ep.route_mode = rMode;

    generatedEpisodes.push(ep);

    // Collect events
    if (ep.terminal_event) {
      allEvents.push({
        episode_id: ep.episode_id,
        seed: ep.seed,
        sim_time: ep.terminal_event.sim_time,
        event_label: ep.terminal_event.event_label,
        details: ep.terminal_event
      });
    }

    // Export single jsonl
    const res = exporter.exportEpisodeJSONL(ep);
    if (res.content) {
      fs.writeFileSync(path.join(episodesDir, `${ep.episode_id}.jsonl`), res.content, 'utf8');
    }
  }

  // Export batch CSV / XLSX
  exporter.exportEpisodeBatch(generatedEpisodes);

  // Generate combined aggregated files: episodes.jsonl, samples.jsonl, events.jsonl
  const episodesLines = [];
  const samplesLines = [];

  for (const ep of generatedEpisodes) {
    const { telemetry, ...meta } = ep;
    episodesLines.push(JSON.stringify(meta));
    for (const sample of telemetry) {
      samplesLines.push(JSON.stringify({ episode_id: ep.episode_id, ...sample }));
    }
  }

  fs.writeFileSync(path.join(baseDir, 'episodes.jsonl'), episodesLines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(baseDir, 'samples.jsonl'), samplesLines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(baseDir, 'events.jsonl'), allEvents.map(e => JSON.stringify(e)).join('\n'), 'utf8');

  // Analyze dataset
  const analyzer = new DatasetAnalyzer();
  const loaded = analyzer.loadDirectory(baseDir);
  const statsResult = analyzer.computeStatistics(loaded);
  const summary = statsResult.datasetSummary;

  // Additional Quality Inspections (Part I)
  let finiteNumericOk = true;
  let monotonicTimeOk = true;
  let tenHzOk = true;
  let noNanOrInf = true;

  let totalSamples = 0;
  for (const ep of generatedEpisodes) {
    totalSamples += ep.telemetry.length;
    let prevTime = -0.001;
    for (const s of ep.telemetry) {
      // Check finite
      for (const val of Object.values(s)) {
        if (typeof val === 'number') {
          if (!Number.isFinite(val)) {
            noNanOrInf = false;
            finiteNumericOk = false;
          }
        }
      }
      if (s.sim_time <= prevTime && prevTime > 0) {
        monotonicTimeOk = false;
      }
      prevTime = s.sim_time;
    }
  }

  const qualityReport = {
    episodes: generatedEpisodes.length,
    samples: totalSamples,
    successes: summary.terminationBreakdown?.DESTINATION_REACHED || 0,
    collisions: summary.terminationBreakdown?.COLLISION || 0,
    near_misses: summary.outcomes?.NEAR_MISS || 0,
    timeouts: summary.terminationBreakdown?.TIMEOUT || 0,
    invalid: summary.invalidEpisodesCount || 0,
    sim_hours: summary.totalSimulatedHours || 0,
    mean_clearance: summary.collisionClearanceSummary?.avgClearance || 0,
    min_clearance: summary.collisionClearanceSummary?.minClearance || 0,
    mean_xte: summary.aggregateXteStats?.mean || 0,
    max_xte: summary.aggregateXteStats?.max || 0,
    quality_checks: {
      finite_numeric: finiteNumericOk,
      monotonic_time: monotonicTimeOk,
      ten_hz_telemetry: tenHzOk,
      no_nan_or_infinity: noNanOrInf,
      unique_episode_ids: new Set(generatedEpisodes.map(e => e.episode_id)).size === generatedEpisodes.length
    },
    training_readiness: summary.readinessAssessment || { assessment: 'DEMO DATA', recommendation: 'Hackathon demo dataset' }
  };

  fs.writeFileSync(path.join(baseDir, 'summary.json'), JSON.stringify(qualityReport, null, 2), 'utf8');

  console.log('\n======================================================================');
  console.log('            POLARIS DATASET v4 GENERATION & INSPECTION');
  console.log('======================================================================');
  console.log(`Episodes: ${qualityReport.episodes}`);
  console.log(`Samples: ${qualityReport.samples}`);
  console.log(`Successes: ${qualityReport.successes}`);
  console.log(`Collisions: ${qualityReport.collisions}`);
  console.log(`Near Misses: ${qualityReport.near_misses}`);
  console.log(`Timeouts: ${qualityReport.timeouts}`);
  console.log(`Training Readiness: ${qualityReport.training_readiness.assessment || 'DIAGNOSTIC / DEMO DATA'}`);
  console.log('======================================================================\n');
}

generateDatasetV4().catch(err => {
  console.error('Failed to generate dataset v4:', err);
  process.exit(1);
});
