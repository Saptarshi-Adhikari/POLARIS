import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import fs from 'fs';
import path from 'path';

const scratchDir = path.join(process.cwd(), 'scratch', 'collision_export_test');
if (fs.existsSync(scratchDir)) {
  fs.rmSync(scratchDir, { recursive: true, force: true });
}

const runner = new EpisodeRunner();
const exporter = new DatasetExporter(scratchDir);

const forcedCollisionScenario = {
  start: { x: 500, y: 500, heading: 0 },
  destination: { x: 500, y: 1500 },
  icebergs: [new Iceberg({ id: 'ice_block_1', x: 500, y: 525, size: 70 })]
};

const episode = runner.runEpisode(1002, 'CLASS_B_STATIC_OBSTACLE', {
  maxSteps: 50,
  customScenario: forcedCollisionScenario
});

const exportResult = exporter.exportEpisodeJSONL(episode);
console.log('Export Success:', exportResult.success);
console.log('Export File Path:', exportResult.filePath);

const fileContent = fs.readFileSync(exportResult.filePath, 'utf8');
console.log('\n--- LITERAL EXPORTED JSONL FILE CONTENT BEGIN ---');
console.log(fileContent);
console.log('--- LITERAL EXPORTED JSONL FILE CONTENT END ---');
