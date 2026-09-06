/**
 * POLARIS Nav-OS — Dataset Schema v2 & Data Quality Validator
 *
 * Defines canonical termination reasons, event labels, schema metadata,
 * and strict quality validation for autonomous navigation training episodes.
 */

export const SCHEMA_VERSION = "2.0";

/**
 * Note on COLLISION Semantics:
 * COLLISION status is triggered at safety-envelope violation (center distance <= hardR),
 * not at literal hull contact, providing a conservative safety-margin-based label for ML training.
 */
export const TerminationReason = Object.freeze({
  COLLISION: "COLLISION",
  DESTINATION_REACHED: "DESTINATION_REACHED",
  TIMEOUT: "TIMEOUT",
  INVALID_STATE: "INVALID_STATE",
  MANUAL_STOP: "MANUAL_STOP",
  MAX_EPISODE_LENGTH: "MAX_EPISODE_LENGTH"
});

export const EventLabel = Object.freeze({
  COLLISION: "COLLISION",
  SUCCESS: "SUCCESS",
  NEAR_MISS: "NEAR_MISS"
});

/**
 * Validates episode object integrity before exporting to dataset.
 * Returns { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateEpisodeData(episode) {
  const errors = [];
  const warnings = [];

  if (!episode) {
    return { valid: false, errors: ["Episode object is null or undefined"], warnings: [] };
  }

  if (episode.schema_version !== SCHEMA_VERSION) {
    errors.push(`Invalid schema_version: expected ${SCHEMA_VERSION}, got ${episode.schema_version}`);
  }

  if (!episode.episode_id) {
    errors.push("Missing episode_id");
  }

  if (episode.seed === undefined || episode.seed === null) {
    errors.push("Missing seed");
  }

  if (!episode.termination_reason || !Object.values(TerminationReason).includes(episode.termination_reason)) {
    errors.push(`Invalid or missing termination_reason: ${episode.termination_reason}`);
  }

  if (!episode.event_label || !Object.values(EventLabel).includes(episode.event_label)) {
    errors.push(`Invalid or missing event_label: ${episode.event_label}`);
  }

  const telemetry = episode.telemetry || [];
  if (telemetry.length === 0) {
    errors.push("Telemetry array is empty");
  } else {
    // Verify monotonic simulation time & absence of NaN / Infinity
    let prevSimTime = -Infinity;
    let hasTerminalSample = false;

    for (let i = 0; i < telemetry.length; i++) {
      const sample = telemetry[i];
      const st = sample.simulation_time;

      if (typeof st !== 'number' || isNaN(st) || !isFinite(st)) {
        errors.push(`Invalid simulation_time at index ${i}: ${st}`);
        break;
      }

      if (st < prevSimTime - 1e-9) {
        errors.push(`Non-monotonic simulation time at index ${i}: ${st} < ${prevSimTime}`);
        break;
      }
      prevSimTime = st;

      // Validate ship position
      const ship = sample.ship;
      if (!ship || isNaN(ship.x) || isNaN(ship.y) || isNaN(ship.heading) || isNaN(ship.speed)) {
        errors.push(`Invalid or NaN ship state at telemetry index ${i}`);
        break;
      }

      if (sample.terminal_sample) {
        hasTerminalSample = true;
      }
    }

    if (!hasTerminalSample) {
      warnings.push("No telemetry sample explicitly flagged as terminal_sample");
    }
  }

  // Consistency checks
  if (episode.termination_reason === TerminationReason.COLLISION) {
    if (episode.event_label !== EventLabel.COLLISION) {
      errors.push(`Termination reason is COLLISION but event_label is ${episode.event_label}`);
    }
    const hasCollisionEvent = (episode.collision_events && episode.collision_events.length > 0) ||
      (episode.events && episode.events.some(e => e.type === 'COLLISION'));
    if (!hasCollisionEvent) {
      errors.push("Termination reason is COLLISION but no collision event recorded");
    }
  }

  if (episode.termination_reason === TerminationReason.DESTINATION_REACHED) {
    if (episode.event_label === EventLabel.COLLISION) {
      errors.push("Termination reason is DESTINATION_REACHED but event_label is COLLISION");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * CR13: Data Quality Validator for full dataset.
 * Evaluates full collection of episodes and determines training readiness gate:
 * TRAINING_READY / READY_FOR_DATA_COLLECTION / NOT_READY
 */
export function validateDataset(episodes = []) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(episodes) || episodes.length === 0) {
    return {
      status: "NOT_READY",
      valid: false,
      errors: ["Dataset contains no episodes"],
      warnings: [],
      metrics: {}
    };
  }

  let totalSamples = 0;
  let totalSimHours = 0;
  let successCount = 0;
  let collisionCount = 0;
  let nearMissCount = 0;
  let timeoutCount = 0;
  let invalidCount = 0;
  const sampleIntervals = [];

  for (let idx = 0; idx < episodes.length; idx++) {
    const ep = episodes[idx];
    const epVal = validateEpisodeData(ep);
    if (!epVal.valid) {
      invalidCount++;
      errors.push(`Episode ${ep?.episode_id || idx} failed validation: ${epVal.errors.join('; ')}`);
    }

    if (ep.termination_reason === TerminationReason.DESTINATION_REACHED) successCount++;
    else if (ep.termination_reason === TerminationReason.COLLISION) collisionCount++;
    else if (ep.termination_reason === TerminationReason.TIMEOUT) timeoutCount++;

    if (ep.event_label === EventLabel.NEAR_MISS) nearMissCount++;

    const tel = ep.telemetry || [];
    totalSamples += tel.length;
    totalSimHours += ep.simulation_duration_hours || 0;

    for (let s = 1; s < tel.length; s++) {
      const dt = tel[s].simulation_time - tel[s-1].simulation_time;
      if (dt > 0) sampleIntervals.push(dt);
    }
  }

  sampleIntervals.sort((a, b) => a - b);
  let meanInterval = 0.1;
  let p95Interval = 0.1;
  let maxInterval = 0.1;

  if (sampleIntervals.length > 0) {
    const sum = sampleIntervals.reduce((a, b) => a + b, 0);
    meanInterval = parseFloat((sum / sampleIntervals.length).toFixed(4));
    p95Interval = parseFloat((sampleIntervals[Math.floor(sampleIntervals.length * 0.95)] || 0.1).toFixed(4));
    maxInterval = parseFloat((sampleIntervals[sampleIntervals.length - 1] || 0.1).toFixed(4));
  }

  if (invalidCount > 0) {
    errors.push(`${invalidCount} episodes failed validation`);
  }

  if (totalSamples < 100) {
    warnings.push("Dataset sample count is very low (< 100 samples)");
  }

  let status = "TRAINING_READY";
  if (invalidCount > 0 || totalSamples === 0) {
    status = "NOT_READY";
  } else if (episodes.length < 5 || collisionCount === episodes.length) {
    status = "READY_FOR_DATA_COLLECTION";
  }

  return {
    status,
    valid: invalidCount === 0 && errors.length === 0,
    errors,
    warnings,
    metrics: {
      episodeCount: episodes.length,
      sampleCount: totalSamples,
      simulationHours: parseFloat(totalSimHours.toFixed(2)),
      successCount,
      collisionCount,
      nearMissCount,
      timeoutCount,
      invalidCount,
      meanInterval,
      p95Interval,
      maxInterval
    }
  };
}
