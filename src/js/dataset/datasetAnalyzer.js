/**
 * POLARIS Nav-OS — Dataset Analyzer & Statistical Profiler (Phase 6)
 *
 * Reads exported batch JSON and per-episode JSONL files, validates each episode against
 * datasetSchema.js, deduplicates by episode_id, flags malformed records, and computes
 * comprehensive aggregate statistics (collision rates, clearance distributions, scenario breakdown,
 * uniformity/sample-size flags, and training readiness recommendations).
 */

import { SCHEMA_VERSION, TerminationReason, EventLabel, validateEpisodeData } from './datasetSchema.js';

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

export class DatasetAnalyzer {
  constructor(options = {}) {
    this.minSampleThreshold = options.minSampleThreshold || 5;
  }

  /**
   * Scans a directory recursively for .json and .jsonl files and parses them.
   */
  loadDirectory(dirPath) {
    const validEpisodesMap = new Map();
    const invalidEpisodes = [];
    const filesScanned = [];

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const findFiles = (currentDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          findFiles(fullPath);
        } else if (entry.isFile()) {
          const lower = entry.name.toLowerCase();
          // Skip manifest and summary files
          if (lower === 'manifest.json' || lower === 'dataset_summary.json') continue;
          if (lower.endsWith('.json') || lower.endsWith('.jsonl')) {
            filesScanned.push(fullPath);
            this.parseFile(fullPath, validEpisodesMap, invalidEpisodes);
          }
        }
      }
    };

    findFiles(dirPath);

    const validEpisodes = Array.from(validEpisodesMap.values());
    return {
      scannedFilesCount: filesScanned.length,
      filesScanned,
      validEpisodes,
      validEpisodesCount: validEpisodes.length,
      invalidEpisodes,
      invalidEpisodesCount: invalidEpisodes.length
    };
  }

  /**
   * Parses a single file (.json or .jsonl) and validates contained episodes.
   */
  parseFile(filePath, validMap, invalidList) {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trim();
      if (!content) return;

      if (filePath.endsWith('.jsonl')) {
        this.parseJSONLFile(filePath, content, validMap, invalidList);
      } else {
        this.parseJSONFile(filePath, content, validMap, invalidList);
      }
    } catch (err) {
      invalidList.push({
        filePath,
        episode_id: 'unknown',
        errors: [`File read/JSON parse error: ${err.message}`]
      });
    }
  }

  /**
   * Parses a .jsonl file containing METADATA_HEADER line and TELEMETRY_SAMPLE lines.
   */
  parseJSONLFile(filePath, content, validMap, invalidList) {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return;

    let headerObj = null;
    const telemetrySamples = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed.record_type === 'METADATA_HEADER') {
          headerObj = parsed;
        } else if (parsed.record_type === 'TELEMETRY_SAMPLE') {
          const { record_type, ...sample } = parsed;
          telemetrySamples.push(sample);
        } else if (!headerObj && i === 0 && parsed.episode_id) {
          headerObj = parsed;
        }
      } catch (e) {
        invalidList.push({
          filePath,
          line: i + 1,
          errors: [`JSONL syntax error at line ${i + 1}: ${e.message}`]
        });
      }
    }

    if (!headerObj) {
      invalidList.push({
        filePath,
        errors: ["Missing METADATA_HEADER in JSONL file"]
      });
      return;
    }

    const { record_type, ...episodeData } = headerObj;
    if (!episodeData.telemetry || episodeData.telemetry.length === 0) {
      episodeData.telemetry = telemetrySamples;
    }

    this.validateAndAddEpisode(filePath, episodeData, validMap, invalidList);
  }

  /**
   * Parses a .json file (array of episodes or single episode object).
   */
  parseJSONFile(filePath, content, validMap, invalidList) {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        this.validateAndAddEpisode(filePath, item, validMap, invalidList);
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      if (parsed.episode_id || parsed.schema_version) {
        this.validateAndAddEpisode(filePath, parsed, validMap, invalidList);
      }
    }
  }

  /**
   * Validates an episode object using validateEpisodeData and adds to validMap or invalidList.
   */
  validateAndAddEpisode(filePath, episode, validMap, invalidList) {
    const check = validateEpisodeData(episode);
    const epId = episode?.episode_id || 'unknown';

    if (check.valid) {
      if (!validMap.has(epId)) {
        validMap.set(epId, episode);
      }
    } else {
      invalidList.push({
        filePath,
        episode_id: epId,
        errors: check.errors,
        warnings: check.warnings
      });
    }
  }

  /**
   * Computes comprehensive aggregate statistics for a dataset of episodes.
   */
  computeStatistics(loadResult) {
    const episodes = loadResult.validEpisodes || [];
    const totalCount = episodes.length;

    // 1. Termination Reason Breakdown
    const terminationBreakdown = {
      COLLISION: 0,
      DESTINATION_REACHED: 0,
      TIMEOUT: 0,
      MANUAL_STOP: 0,
      INVALID_STATE: 0,
      MAX_EPISODE_LENGTH: 0,
      OTHER: 0
    };

    // 2. Per Scenario Class Breakdown
    const scenarioClassMap = new Map();

    // 3. Collision clearance distribution
    const collisionClearances = [];
    let exactEnvelopeCollisions = 0; // physical clearance ~ 10-20 SU (safety envelope)
    let hullBreachCollisions = 0;    // physical clearance < 0 SU (literal hull contact)

    // 4. Duration per termination reason
    const durationByTermination = {};

    for (const ep of episodes) {
      const term = ep.termination_reason || 'OTHER';
      if (terminationBreakdown[term] !== undefined) {
        terminationBreakdown[term] += 1;
      } else {
        terminationBreakdown.OTHER += 1;
      }

      // Scenario stats accumulation
      const scClass = ep.scenario_class || ep.scenarioClass || 'UNKNOWN_SCENARIO';
      if (!scenarioClassMap.has(scClass)) {
        scenarioClassMap.set(scClass, {
          scenarioClass: scClass,
          totalCount: 0,
          collisionCount: 0,
          successCount: 0,
          timeoutCount: 0,
          manualStopCount: 0,
          totalMinClearance: 0,
          totalPlannerCalls: 0,
          totalRouteChanges: 0,
          clearanceSampleCount: 0
        });
      }
      const scStats = scenarioClassMap.get(scClass);
      scStats.totalCount += 1;

      if (term === TerminationReason.COLLISION) scStats.collisionCount += 1;
      if (term === TerminationReason.DESTINATION_REACHED) scStats.successCount += 1;
      if (term === TerminationReason.TIMEOUT) scStats.timeoutCount += 1;
      if (term === TerminationReason.MANUAL_STOP) scStats.manualStopCount += 1;

      const metrics = ep.metrics || {};
      const minClearance = metrics.minPhysicalClearance !== undefined ? metrics.minPhysicalClearance : 9999;
      if (minClearance < 9900) {
        scStats.totalMinClearance += minClearance;
        scStats.clearanceSampleCount += 1;
      }
      scStats.totalPlannerCalls += (metrics.plannerCalls || 0);
      scStats.totalRouteChanges += (metrics.routeChanges || 0);

      // Collision clearance distribution
      if (term === TerminationReason.COLLISION) {
        let clearanceAtCollision = minClearance;
        if (ep.collision_events && ep.collision_events.length > 0 && ep.collision_events[0].physical_clearance !== undefined) {
          clearanceAtCollision = ep.collision_events[0].physical_clearance;
        }
        collisionClearances.push(clearanceAtCollision);

        if (clearanceAtCollision <= 0) {
          hullBreachCollisions += 1;
        } else if (clearanceAtCollision >= 5 && clearanceAtCollision <= 25) {
          exactEnvelopeCollisions += 1;
        }
      }

      // Duration tracking
      const durationSec = ep.simulation_duration_seconds !== undefined
        ? ep.simulation_duration_seconds
        : ((ep.telemetry ? ep.telemetry.length : 0) * 0.1);

      if (!durationByTermination[term]) {
        durationByTermination[term] = { totalSec: 0, count: 0 };
      }
      durationByTermination[term].totalSec += durationSec;
      durationByTermination[term].count += 1;
    }

    // Finalize Per-Scenario Statistics
    const scenarioClassStats = {};
    const suspiciousUniformScenarios = [];
    const lowSampleScenarios = [];

    for (const [scClass, stats] of scenarioClassMap.entries()) {
      const total = stats.totalCount;
      const collisionRate = total > 0 ? parseFloat(((stats.collisionCount / total) * 100).toFixed(1)) : 0;
      const successRate = total > 0 ? parseFloat(((stats.successCount / total) * 100).toFixed(1)) : 0;
      const avgClearance = stats.clearanceSampleCount > 0 ? parseFloat((stats.totalMinClearance / stats.clearanceSampleCount).toFixed(2)) : 0;
      const avgPlannerCalls = total > 0 ? parseFloat((stats.totalPlannerCalls / total).toFixed(1)) : 0;
      const avgRouteChanges = total > 0 ? parseFloat((stats.totalRouteChanges / total).toFixed(1)) : 0;

      const isLowSample = total < this.minSampleThreshold;
      const isUniform = total >= this.minSampleThreshold && (stats.collisionCount === total || stats.successCount === total || stats.timeoutCount === total);

      if (isLowSample) lowSampleScenarios.push(scClass);
      if (isUniform) suspiciousUniformScenarios.push(scClass);

      scenarioClassStats[scClass] = {
        scenarioClass: scClass,
        totalEpisodes: total,
        collisionCount: stats.collisionCount,
        successCount: stats.successCount,
        timeoutCount: stats.timeoutCount,
        manualStopCount: stats.manualStopCount,
        collisionRatePercent: collisionRate,
        successRatePercent: successRate,
        avgMinPhysicalClearance: avgClearance,
        avgPlannerCalls,
        avgRouteChanges,
        lowSampleWarning: isLowSample,
        suspiciousUniformOutcome: isUniform
      };
    }

    // Overall Rates
    const overallCollisionRate = totalCount > 0 ? parseFloat(((terminationBreakdown.COLLISION / totalCount) * 100).toFixed(1)) : 0;
    const overallSuccessRate = totalCount > 0 ? parseFloat(((terminationBreakdown.DESTINATION_REACHED / totalCount) * 100).toFixed(1)) : 0;
    const overallTimeoutRate = totalCount > 0 ? parseFloat(((terminationBreakdown.TIMEOUT / totalCount) * 100).toFixed(1)) : 0;
    const overallManualStopRate = totalCount > 0 ? parseFloat(((terminationBreakdown.MANUAL_STOP / totalCount) * 100).toFixed(1)) : 0;

    // Collision Clearance Summary
    let collisionClearanceSummary = {
      collisionCount: collisionClearances.length,
      minClearance: 0,
      maxClearance: 0,
      avgClearance: 0,
      exactEnvelopeCollisions,
      hullBreachCollisions
    };

    if (collisionClearances.length > 0) {
      const min = Math.min(...collisionClearances);
      const max = Math.max(...collisionClearances);
      const sum = collisionClearances.reduce((acc, v) => acc + v, 0);
      collisionClearanceSummary.minClearance = parseFloat(min.toFixed(2));
      collisionClearanceSummary.maxClearance = parseFloat(max.toFixed(2));
      collisionClearanceSummary.avgClearance = parseFloat((sum / collisionClearances.length).toFixed(2));
    }

    // Average Duration Summary
    const avgDurationByTermination = {};
    for (const [term, data] of Object.entries(durationByTermination)) {
      avgDurationByTermination[term] = {
        avgSeconds: parseFloat((data.totalSec / data.count).toFixed(2)),
        avgHours: parseFloat((data.totalSec / data.count / 3600).toFixed(4)),
        sampleCount: data.count
      };
    }

    // Data Sufficiency Assessment
    const scenarioCount = scenarioClassMap.size;
    const lowSampleCount = lowSampleScenarios.length;
    let dataSufficiencyAssessment = "SUFFICIENT_SIGNAL";
    let recommendation = "";

    if (totalCount < 20 || (scenarioCount > 0 && lowSampleCount / scenarioCount > 0.5)) {
      dataSufficiencyAssessment = "INSUFFICIENT_DATA";
      recommendation = "Collect more episodes first. The current dataset size is too small to draw statistically conclusive tuning or training decisions.";
    } else {
      recommendation = "There is sufficient signal across scenario classes to consider weight tuning and failure forensics analysis.";
    }

    return {
      timestamp: new Date().toISOString(),
      datasetSummary: {
        scannedFilesCount: loadResult.scannedFilesCount,
        totalUniqueValidEpisodes: totalCount,
        invalidEpisodesCount: loadResult.invalidEpisodesCount,
        overallCollisionRatePercent: overallCollisionRate,
        overallSuccessRatePercent: overallSuccessRate,
        overallTimeoutRatePercent: overallTimeoutRate,
        overallManualStopRatePercent: overallManualStopRate,
        terminationBreakdown,
        scenarioClassStats,
        collisionClearanceSummary,
        avgDurationByTermination,
        qualityAudit: {
          invalidEpisodes: loadResult.invalidEpisodes,
          suspiciousUniformScenarios,
          lowSampleScenarios,
          minSampleThreshold: this.minSampleThreshold
        },
        readinessAssessment: {
          assessment: dataSufficiencyAssessment,
          recommendation
        }
      }
    };
  }

  /**
   * Generates a clean human-readable Markdown summary report.
   */
  generateMarkdownReport(statsResult) {
    const s = statsResult.datasetSummary;
    const lines = [];

    lines.push("# POLARIS Nav-OS — Dataset Analysis & Profiling Report");
    lines.push(`*Generated At: ${s.timestamp || new Date().toISOString()}*\n`);

    lines.push("## 1. Executive Summary");
    lines.push(`- **Scanned Files**: ${s.scannedFilesCount}`);
    lines.push(`- **Total Valid Episodes (Deduplicated)**: ${s.totalUniqueValidEpisodes}`);
    lines.push(`- **Malformed / Rejected Episodes**: ${s.invalidEpisodesCount}`);
    lines.push(`- **Overall Success Rate**: **${s.overallSuccessRatePercent}%** (${s.terminationBreakdown.DESTINATION_REACHED} episodes)`);
    lines.push(`- **Overall Collision Rate**: **${s.overallCollisionRatePercent}%** (${s.terminationBreakdown.COLLISION} episodes)`);
    lines.push(`- **Overall Timeout Rate**: **${s.overallTimeoutRatePercent}%** (${s.terminationBreakdown.TIMEOUT} episodes)`);
    lines.push(`- **Overall Manual Stop Rate**: **${s.overallManualStopRatePercent}%** (${s.terminationBreakdown.MANUAL_STOP} episodes)\n`);

    lines.push("## 2. Readiness & Sufficiency Assessment");
    lines.push(`- **Assessment**: \`${s.readinessAssessment.assessment}\``);
    lines.push(`- **Recommendation**: ${s.readinessAssessment.recommendation}\n`);

    lines.push("## 3. Scenario Class Breakdown");
    lines.push("| Scenario Class | Episodes | Success % | Collision % | Avg Min Clearance (SU) | Avg Planner Calls | Avg Route Changes | Flags |");
    lines.push("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |");

    for (const [scName, sc] of Object.entries(s.scenarioClassStats)) {
      const flags = [];
      if (sc.lowSampleWarning) flags.push("Low Sample (<5)");
      if (sc.suspiciousUniformOutcome) flags.push("Uniform Outcome");
      const flagStr = flags.length > 0 ? flags.join(", ") : "OK";

      lines.push(`| \`${scName}\` | ${sc.totalEpisodes} | ${sc.successRatePercent}% | ${sc.collisionRatePercent}% | ${sc.avgMinPhysicalClearance} | ${sc.avgPlannerCalls} | ${sc.avgRouteChanges} | ${flagStr} |`);
    }
    lines.push("");

    lines.push("## 4. Collision Clearance & Safety Envelope Analysis");
    const cc = s.collisionClearanceSummary;
    lines.push(`- **Total Collisions**: ${cc.collisionCount}`);
    lines.push(`- **Min Clearance at Collision**: ${cc.minClearance} SU`);
    lines.push(`- **Max Clearance at Collision**: ${cc.maxClearance} SU`);
    lines.push(`- **Avg Clearance at Collision**: ${cc.avgClearance} SU`);
    lines.push(`- **Exact Safety Envelope Collisions (10-25 SU)**: ${cc.exactEnvelopeCollisions} *(matches hardR envelope termination semantics)*`);
    lines.push(`- **Hull Breach Collisions (< 0 SU)**: ${cc.hullBreachCollisions} *(literal physical contact)*\n`);

    lines.push("## 5. Average Duration by Termination Reason");
    for (const [term, d] of Object.entries(s.avgDurationByTermination)) {
      lines.push(`- **${term}**: ${d.avgSeconds}s (${d.avgHours} sim hrs) [n=${d.sampleCount}]`);
    }
    lines.push("");

    if (s.qualityAudit.invalidEpisodes.length > 0) {
      lines.push("## 6. Data Quality Audit — Rejected / Malformed Episodes");
      for (const inv of s.qualityAudit.invalidEpisodes) {
        lines.push(`- **File**: \`${path.basename(inv.filePath)}\` | **ID**: \`${inv.episode_id}\``);
        lines.push(`  - Errors: ${inv.errors.join("; ")}`);
      }
      lines.push("");
    }

    return lines.join('\n');
  }
}
