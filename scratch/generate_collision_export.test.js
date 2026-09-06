import { describe, it, expect } from 'vitest';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { DatasetExporter } from '../src/js/dataset/datasetExporter.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import fs from 'fs';
import path from 'path';

describe('Generate Collision Export File', () => {
  it('runs collision episode, exports JSONL, and reads literal file content', () => {
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
    expect(exportResult.success).toBe(true);

    const fileContent = fs.readFileSync(exportResult.filePath, 'utf8');
    console.log('\n================ EXPORTED JSONL FILE CONTENT BEGIN ================');
    console.log(fileContent);
    console.log('================ EXPORTED JSONL FILE CONTENT END ==================\n');

    expect(fileContent).toContain('"record_type":"METADATA_HEADER"');
    expect(fileContent).toContain('"termination_reason":"COLLISION"');
    expect(fileContent).toContain('"record_type":"TELEMETRY_SAMPLE"');
  });
});
