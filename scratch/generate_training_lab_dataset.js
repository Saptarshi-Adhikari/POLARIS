import fs from 'fs';
import path from 'path';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { SCENARIO_CLASSES, ROUTE_MODES } from '../src/js/debug/navTestScenarios.js';
import { validateDataset } from '../src/js/dataset/datasetSchema.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';

async function runBenchmark() {
  console.log('============================================================');
  console.log('POLARIS Autonomous Navigation Training Data Generation Lab');
  console.log('============================================================');
  console.log('Generating 120 episodes (12 Scenario Classes x 10 Seeds)...');

  const runner = new EpisodeRunner();
  const completedEpisodes = [];
  const startTime = Date.now();

  let episodeIdx = 0;
  for (let pass = 0; pass < 10; pass++) {
    for (let cIdx = 0; cIdx < SCENARIO_CLASSES.length; cIdx++) {
      const scenarioClass = SCENARIO_CLASSES[cIdx];
      const routeMode = ROUTE_MODES[(cIdx + pass) % ROUTE_MODES.length];
      const seed = 1000 + episodeIdx;

      console.log(`[Episode ${episodeIdx + 1}/120] Seed: ${seed} | Class: ${scenarioClass} | Mode: ${routeMode}`);

      const episodeResult = runner.runEpisode(seed, scenarioClass, { routeMode, maxSteps: 2500 });
      completedEpisodes.push(episodeResult);
      episodeIdx++;
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`\nBenchmark completed 120 episodes in ${(durationMs / 1000).toFixed(2)} seconds.`);

  const datasetDir = path.resolve('datasets/v3');
  fs.mkdirSync(datasetDir, { recursive: true });

  const exporter = new DatasetExporter(datasetDir);
  await exporter.exportEpisodeBatch(completedEpisodes, datasetDir);
  const validation = validateDataset(completedEpisodes);

  const m = validation.metrics || {};

  console.log('\n============================================================');
  console.log('POLARIS TRAINING DATASET GENERATION SUMMARY');
  console.log('============================================================');
  console.log(`Training Readiness Gate: ${validation.status}`);
  console.log(`Total Episodes: ${m.episodeCount}`);
  console.log(`Total Samples:  ${m.sampleCount}`);
  console.log(`Simulation Hours: ${m.simulationHours ? m.simulationHours.toFixed(2) : 0}`);
  console.log('------------------------------------------------------------');
  console.log(`SUCCESS:    ${m.successCount}`);
  console.log(`NEAR_MISS:  ${m.nearMissCount}`);
  console.log(`COLLISION:  ${m.collisionCount}`);
  console.log(`TIMEOUT:    ${m.timeoutCount}`);
  console.log(`INVALID:    ${m.invalidCount}`);
  console.log('------------------------------------------------------------');
  console.log(`Mean Sample Interval: ${m.meanInterval}s (p95: ${m.p95Interval}s, max: ${m.maxInterval}s)`);
  console.log('============================================================\n');

  fs.writeFileSync(path.join(datasetDir, 'benchmark_summary.json'), JSON.stringify(validation, null, 2));
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
