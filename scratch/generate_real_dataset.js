/**
 * POLARIS — Fresh Real Episode Generation & Dataset Export Script
 *
 * Deletes test-contaminated files, runs 48 real simulation episodes,
 * exports actual JSONL & JSON dataset files to datasets/v2, and analyzes stats.
 */

import fs from 'fs';
import path from 'path';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';
import { DatasetLoader } from '../src/js/dataset/datasetLoader.js';
import { SCENARIO_CLASSES, ROUTE_MODES } from '../src/js/debug/navTestScenarios.js';

const baseDir = 'datasets/v2';
const episodesDir = path.join(baseDir, 'episodes');

// 1. Clean existing dataset directory
if (fs.existsSync(baseDir)) {
  fs.rmSync(baseDir, { recursive: true, force: true });
}
fs.mkdirSync(episodesDir, { recursive: true });

console.log('Cleared datasets/v2 directory.');

// 2. Generate 48 real un-mocked episodes
const runner = new EpisodeRunner();
const exporter = new DatasetExporter({ baseDir });

console.log('Generating 48 real simulation episodes...');

const generatedEpisodes = [];

for (let k = 0; k < 48; k++) {
  const classIndex = k % SCENARIO_CLASSES.length;
  const passIndex = Math.floor(k / SCENARIO_CLASSES.length);
  const modeIndex = (classIndex + passIndex) % ROUTE_MODES.length;

  const scClass = SCENARIO_CLASSES[classIndex];
  const rMode = ROUTE_MODES[modeIndex];
  const seed = 3000 + k;

  const ep = runner.runEpisode(seed, scClass, { routeMode: rMode, maxSteps: 1500 });
  ep.route_mode = rMode; // ensure route_mode field is present

  generatedEpisodes.push(ep);

  // Write single JSONL file for this episode
  exporter.exportEpisodeJSONL(ep);
}

// Write batch export JSON file
exporter.exportBatchJSON(generatedEpisodes, `nav_test_bot_batch_${Date.now()}.json`);

console.log(`Successfully generated and exported ${generatedEpisodes.length} real episodes to ${baseDir}.`);

// 3. Analyze generated dataset
const loader = new DatasetLoader();
const dataset = loader.loadDirectory(baseDir);
const summary = loader.aggregateStats(dataset);

console.log('\n======================================================================');
console.log('  REAL 48-EPISODE DATASET AGGREGATION & SAFETY ANALYSIS REPORT');
console.log('======================================================================\n');
console.log(`Total Episodes Loaded: ${summary.totalEpisodes}`);
console.log(`Total Telemetry Samples: ${summary.totalTelemetrySamples}`);
console.log(`Overall Success Rate: ${(summary.overallSuccessRate * 100).toFixed(1)}%`);
console.log(`Overall Collision Rate: ${(summary.overallCollisionRate * 100).toFixed(1)}%`);
console.log(`Avg Episode Duration: ${summary.averageDurationSeconds.toFixed(1)}s (${summary.averageDurationHours.toFixed(4)} hrs)`);
console.log(`Avg Distance Traveled: ${summary.averageDistanceTraveledSU.toFixed(1)} SU`);
console.log(`Total Collisions: ${summary.safetyAnalysis.totalCollisions}`);
console.log(`Avg Clearance at Collision: ${summary.safetyAnalysis.avgClearanceAtCollisionSU} SU`);

console.log('\n--- Scenario Class Metrics Table ---');
console.table(
  Object.keys(summary.scenarioClassMetrics).map(sc => {
    const m = summary.scenarioClassMetrics[sc];
    return {
      scenarioClass: sc,
      totalEpisodes: m.totalEpisodes,
      successCount: m.successCount,
      collisionCount: m.collisionCount,
      timeoutCount: m.timeoutCount,
      collisionRate: `${(m.collisionRate * 100).toFixed(1)}%`,
      avgDurationSec: m.avgDurationSeconds.toFixed(1),
      avgMinClearanceSU: m.avgMinClearanceSU === Infinity ? 'Infinity' : m.avgMinClearanceSU.toFixed(1)
    };
  })
);
