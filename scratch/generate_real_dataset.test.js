/**
 * POLARIS — Fresh Real Episode Generation & Dataset Export Test
 *
 * Deletes test-contaminated files, runs 48 real simulation episodes,
 * exports actual JSONL & JSON dataset files to datasets/v2, and analyzes stats.
 */

import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';
import { DatasetAnalyzer } from '../src/js/dataset/datasetAnalyzer.js';
import { SCENARIO_CLASSES, ROUTE_MODES } from '../src/js/debug/navTestScenarios.js';

describe('Real Dataset Generation & Safety Analysis', () => {
  it('generates 48 real simulation episodes and exports clean datasets/v2', () => {
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

      const ep = runner.runEpisode(seed, scClass, { routeMode: rMode, maxSteps: 3000 });
      ep.route_mode = rMode;

      generatedEpisodes.push(ep);

      // Write single JSONL file for this episode
      const res = exporter.exportEpisodeJSONL(ep);
      if (res.content) {
        fs.writeFileSync(path.join(episodesDir, `${ep.episode_id}.jsonl`), res.content, 'utf8');
      }
    }

    // Write batch export JSON file
    const batchFilename = `nav_test_bot_batch_${Date.now()}.json`;
    fs.writeFileSync(path.join(baseDir, batchFilename), JSON.stringify(generatedEpisodes, null, 2), 'utf8');

    console.log(`Successfully generated and exported ${generatedEpisodes.length} real episodes to ${baseDir}.`);

    // 3. Analyze generated dataset
    const analyzer = new DatasetAnalyzer();
    const loaded = analyzer.loadDirectory(baseDir);
    const statsResult = analyzer.computeStatistics(loaded);
    const summary = statsResult.datasetSummary;

    console.log('\n======================================================================');
    console.log('  REAL 48-EPISODE DATASET AGGREGATION & SAFETY ANALYSIS REPORT');
    console.log('======================================================================\n');
    console.log(`Total Episodes Loaded: ${summary.totalUniqueValidEpisodes}`);
    console.log(`Overall Success Rate: ${summary.overallSuccessRatePercent.toFixed(1)}%`);
    console.log(`Overall Collision Rate: ${summary.overallCollisionRatePercent.toFixed(1)}%`);
    console.log(`Total Collisions: ${summary.collisionClearanceSummary.collisionCount}`);
    console.log(`Avg Clearance at Collision: ${summary.collisionClearanceSummary.avgClearance} SU`);

    console.log('\n--- Scenario Class Breakdown ---');
    console.table(summary.scenarioClassStats);
  }, 120000);
});
