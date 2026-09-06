/**
 * POLARIS Nav-OS — CLI Dataset Analysis Tool (Phase 6)
 *
 * Usage:
 *   node scratch/analyzeDataset.js [folder-path]
 *
 * Default folder-path: datasets/v2
 */

import fs from 'fs';
import path from 'path';
import { DatasetAnalyzer } from '../src/js/dataset/datasetAnalyzer.js';

async function main() {
  const inputPath = process.argv[2] || path.join(process.cwd(), 'datasets', 'v2');
  const resolvedPath = path.isAbsolute(inputPath) ? inputPath : path.join(process.cwd(), inputPath);

  console.log(`\n=================================================`);
  console.log(`  POLARIS DATASET AGGREGATION & ANALYSIS TOOL   `);
  console.log(`=================================================`);
  console.log(`Target Dataset Directory: ${resolvedPath}\n`);

  if (!fs.existsSync(resolvedPath)) {
    console.error(`ERROR: Target directory does not exist: ${resolvedPath}`);
    process.exit(1);
  }

  const analyzer = new DatasetAnalyzer({ minSampleThreshold: 5 });
  const loadResult = analyzer.loadDirectory(resolvedPath);
  const stats = analyzer.computeStatistics(loadResult);
  const markdownReport = analyzer.generateMarkdownReport(stats);

  console.log(markdownReport);

  // Write machine-readable JSON summary
  const summaryJsonPath = path.join(resolvedPath, 'dataset_summary.json');
  fs.writeFileSync(summaryJsonPath, JSON.stringify(stats, null, 2), 'utf8');
  console.log(`\n[DatasetAnalyzer] Machine-readable summary exported to: ${summaryJsonPath}`);
}

main().catch(err => {
  console.error("Dataset analysis failed:", err);
  process.exit(1);
});
