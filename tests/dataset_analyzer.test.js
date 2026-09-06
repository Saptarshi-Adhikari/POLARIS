import { describe, it, expect } from 'vitest';
import { DatasetAnalyzer } from '../src/js/dataset/datasetAnalyzer.js';
import { SCHEMA_VERSION, TerminationReason, EventLabel } from '../src/js/dataset/datasetSchema.js';
import fs from 'fs';
import path from 'path';

describe('DatasetAnalyzer & Statistical Profiler', () => {

  it('1. Parses, validates, and deduplicates batch JSON and individual JSONL files', () => {
    const testDir = path.join(process.cwd(), 'scratch', 'test_analyzer_fixtures');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });

    const ep1 = {
      schema_version: SCHEMA_VERSION,
      episode_id: "ep_1001",
      seed: 1001,
      scenario_class: "CLASS_A_CLEAR_SEAS",
      event_label: EventLabel.SUCCESS,
      termination_reason: TerminationReason.DESTINATION_REACHED,
      simulation_duration_seconds: 120,
      metrics: { plannerCalls: 2, routeChanges: 1, minPhysicalClearance: 85.0 },
      telemetry: [
        { simulation_time: 0.0, ship: { x: 400, y: 1800, heading: 330, speed: 12 } },
        { simulation_time: 12.0, ship: { x: 3000, y: 600, heading: 330, speed: 12 }, terminal_sample: true }
      ]
    };

    const ep2 = {
      schema_version: SCHEMA_VERSION,
      episode_id: "ep_1002",
      seed: 1002,
      scenario_class: "CLASS_B_STATIC_OBSTACLE",
      event_label: EventLabel.COLLISION,
      termination_reason: TerminationReason.COLLISION,
      simulation_duration_seconds: 45,
      collision_events: [{ sim_time: 4.5, physical_clearance: 15.0, iceberg_id: "ice_1" }],
      metrics: { plannerCalls: 5, routeChanges: 3, minPhysicalClearance: 15.0 },
      telemetry: [
        { simulation_time: 0.0, ship: { x: 500, y: 500, heading: 0, speed: 12 } },
        { simulation_time: 4.5, ship: { x: 500, y: 525, heading: 0, speed: 12 }, terminal_sample: true }
      ]
    };

    // Write batch JSON with ep1 and ep2
    const batchPath = path.join(testDir, 'batch_test.json');
    fs.writeFileSync(batchPath, JSON.stringify([ep1, ep2], null, 2), 'utf8');

    // Write individual JSONL with duplicate ep1
    const jsonlPath = path.join(testDir, 'ep_1001.jsonl');
    const { telemetry, ...metadata } = ep1;
    const headerLine = JSON.stringify({ record_type: 'METADATA_HEADER', ...metadata });
    const sampleLine = JSON.stringify({ record_type: 'TELEMETRY_SAMPLE', ...telemetry[0] });
    fs.writeFileSync(jsonlPath, `${headerLine}\n${sampleLine}\n`, 'utf8');

    // Write corrupt file that fails schema validation
    const corruptPath = path.join(testDir, 'corrupt.json');
    const corruptEp = {
      schema_version: "1.0", // Invalid schema version
      episode_id: "ep_corrupt"
    };
    fs.writeFileSync(corruptPath, JSON.stringify([corruptEp], null, 2), 'utf8');

    const analyzer = new DatasetAnalyzer({ minSampleThreshold: 5 });
    const loadResult = analyzer.loadDirectory(testDir);

    // Deduplication check: ep1 was in both batch JSON and JSONL, validEpisodesCount must be 2
    expect(loadResult.validEpisodesCount).toBe(2);

    // Rejected check: corrupt.json should be flagged in invalidEpisodes
    expect(loadResult.invalidEpisodesCount).toBe(1);
    expect(loadResult.invalidEpisodes[0].episode_id).toBe("ep_corrupt");

    // Compute stats
    const stats = analyzer.computeStatistics(loadResult);
    const s = stats.datasetSummary;

    expect(s.totalUniqueValidEpisodes).toBe(2);
    expect(s.terminationBreakdown.DESTINATION_REACHED).toBe(1);
    expect(s.terminationBreakdown.COLLISION).toBe(1);
    expect(s.overallSuccessRatePercent).toBe(50.0);
    expect(s.overallCollisionRatePercent).toBe(50.0);

    expect(s.scenarioClassStats["CLASS_A_CLEAR_SEAS"].totalEpisodes).toBe(1);
    expect(s.scenarioClassStats["CLASS_A_CLEAR_SEAS"].lowSampleWarning).toBe(true);

    expect(s.collisionClearanceSummary.exactEnvelopeCollisions).toBe(1);
    expect(s.collisionClearanceSummary.hullBreachCollisions).toBe(0);

    const report = analyzer.generateMarkdownReport(stats);
    expect(report).toContain("# POLARIS Nav-OS — Dataset Analysis & Profiling Report");
    expect(report).toContain("CLASS_A_CLEAR_SEAS");
  });

});
