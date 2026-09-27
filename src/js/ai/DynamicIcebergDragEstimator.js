/**
 * POLARIS Nav-OS — Dynamic Iceberg Effective Drag & Drift Parameter Estimator (Phase 2A)
 *
 * Infers an adaptive, vessel-independent effective drift/drag model parameter from
 * observed iceberg track displacements, environmental forcing (ocean current & windage),
 * and reference physics drift models.
 *
 * Terminology: EFFECTIVE DRIFT / DRAG PARAMETER (Cd_eff)
 * Scope: TRACK_ADAPTED -> GLOBAL_ADAPTED -> BASELINE
 */

export const ESTIMATOR_STATUS = Object.freeze({
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
  CALIBRATING: 'CALIBRATING',
  ADAPTED: 'ADAPTED',
  DEGRADED: 'DEGRADED'
});

export const ESTIMATOR_SCOPE = Object.freeze({
  TRACK_ADAPTED: 'TRACK_ADAPTED',
  GLOBAL_ADAPTED: 'GLOBAL_ADAPTED',
  BASELINE: 'BASELINE'
});

export const DEFAULT_ESTIMATOR_CONFIG = {
  priorParameter: 1.0,           // Initial Cd_eff baseline parameter multiplier
  lowerBound: 0.2,               // Hard physical lower bound
  upperBound: 3.5,               // Hard physical upper bound
  learningRateAlpha: 0.10,       // EWMA adaptation gain
  minObservationsForCalibrating: 3,
  minObservationsForAdapted: 8,
  maxHistoryPerTrack: 30,
  maxTimeDeltaSec: 3600 * 6,     // Max valid time delta between observations (6h)
  minTimeDeltaSec: 0.5,          // Min valid time delta (500ms)
  maxSpeedThresholdSU: 100.0,    // Rejects impossible velocity spikes
  staleEnvThresholdSec: 86400    // Rejects update if environmental data > 24h old
};

export class DynamicIcebergDragEstimator {
  constructor(config = {}) {
    this.config = { ...DEFAULT_ESTIMATOR_CONFIG, ...config };
    this.globalParameter = this.config.priorParameter;
    this.globalConfidence = 0.5;
    this.globalObservationCount = 0;

    // Per-iceberg bounded track histories & parameters
    // Map<icebergId, TrackState>
    this.trackStates = new Map();
  }

  /**
   * Returns or initializes the estimation state for a specific iceberg track.
   */
  getTrackState(icebergId) {
    if (!this.trackStates.has(icebergId)) {
      this.trackStates.set(icebergId, {
        icebergId,
        parameter: this.config.priorParameter,
        lowerBound: this.config.lowerBound,
        upperBound: this.config.upperBound,
        confidence: 0.3,
        observationCount: 0,
        residualVariance: 1.0,
        status: ESTIMATOR_STATUS.INSUFFICIENT_DATA,
        history: [],
        lastUpdateTimestamp: 0
      });
    }
    return this.trackStates.get(icebergId);
  }

  /**
   * Observe an iceberg displacement step and update the adaptive effective parameter.
   */
  observeDisplacement(icebergId, currentObs, previousObs, envData = {}) {
    const state = this.getTrackState(icebergId);

    if (!currentObs || !previousObs) {
      return { updated: false, reason: 'INVALID_OBSERVATION', state };
    }

    const t1 = typeof previousObs.timestamp === 'number' ? previousObs.timestamp : Date.parse(previousObs.timestamp);
    const t2 = typeof currentObs.timestamp === 'number' ? currentObs.timestamp : Date.parse(currentObs.timestamp);
    const dt = (t2 - t1) / 1000.0; // seconds

    // 1. Data Quality Gates
    if (isNaN(dt) || dt < this.config.minTimeDeltaSec || dt > this.config.maxTimeDeltaSec) {
      return { updated: false, reason: 'INVALID_TIME_DELTA', state };
    }

    const dx = currentObs.x - previousObs.x;
    const dy = currentObs.y - previousObs.y;
    const distSU = Math.hypot(dx, dy);
    const obsVx = dx / dt;
    const obsVy = dy / dt;
    const obsSpeed = Math.hypot(obsVx, obsVy);

    if (obsSpeed > this.config.maxSpeedThresholdSU) {
      return { updated: false, reason: 'UNREALISTIC_VELOCITY_SPIKE', state };
    }

    // Check environmental staleness
    const mainTs = envData.timestamp ? (typeof envData.timestamp === 'number' ? envData.timestamp : Date.parse(envData.timestamp)) : t2;
    const currentTs = envData.current?.timestamp ? (typeof envData.current.timestamp === 'number' ? envData.current.timestamp : Date.parse(envData.current.timestamp)) : mainTs;
    const windTs = envData.wind?.timestamp ? (typeof envData.wind.timestamp === 'number' ? envData.wind.timestamp : Date.parse(envData.wind.timestamp)) : mainTs;

    const currentAgeSec = (t2 - currentTs) / 1000.0;
    const windAgeSec = (t2 - windTs) / 1000.0;
    if (currentAgeSec > this.config.staleEnvThresholdSec || windAgeSec > this.config.staleEnvThresholdSec) {
      state.status = ESTIMATOR_STATUS.DEGRADED;
      return { updated: false, reason: 'ENVIRONMENT_STALE', state };
    }

    // 2. Compute Reference Physics Drift (Wagner / Polaris baseline)
    const currentVx = envData.current ? (envData.current.vx || envData.current.u || 0) : 0;
    const currentVy = envData.current ? (envData.current.vy || envData.current.v || 0) : 0;
    const windVx = envData.wind ? (envData.wind.vx || 0) : 0;
    const windVy = envData.wind ? (envData.wind.vy || 0) : 0;

    // Reference physics velocity model (uncorrected Cd=1.0)
    const refVx = currentVx * 0.85 * 12 + windVx * 0.15 * 2;
    const refVy = currentVy * 0.85 * 12 + windVy * 0.15 * 2;
    const refSpeed = Math.hypot(refVx, refVy);

    // 3. Model Residual Calculation
    const resVx = obsVx - refVx;
    const resVy = obsVy - refVy;
    const residualMagnitude = Math.hypot(resVx, resVy);

    // Provenance multiplier (weight live data higher than synthetic)
    const sourceType = currentObs.sourceType || 'SYNTHETIC';
    let sourceWeight = 1.0;
    if (sourceType === 'LIVE') sourceWeight = 1.0;
    else if (sourceType === 'CACHED') sourceWeight = 0.7;
    else if (sourceType === 'REPLAY') sourceWeight = 0.85;
    else if (sourceType === 'SYNTHETIC') sourceWeight = 0.5;

    // 4. Parameter Inference / Gain Calculation
    const effectiveGain = this.config.learningRateAlpha * sourceWeight * Math.min(1.0, dt / 10.0);
    const impliedMultiplier = refSpeed > 1e-3 ? Math.max(0.2, Math.min(4.0, obsSpeed / refSpeed)) : 1.0;

    // EWMA Parameter Update
    const prevParam = state.parameter;
    const rawNewParam = prevParam + effectiveGain * (impliedMultiplier - prevParam);
    const boundedParam = Math.max(state.lowerBound, Math.min(state.upperBound, rawNewParam));

    // Update Track State
    state.parameter = parseFloat(boundedParam.toFixed(3));
    state.observationCount++;
    state.lastUpdateTimestamp = t2;

    // Update Residual Variance & Confidence
    const deltaRes = residualMagnitude - state.residualVariance;
    state.residualVariance = parseFloat(Math.max(0.1, state.residualVariance + 0.1 * (deltaRes * deltaRes - state.residualVariance)).toFixed(3));

    if (state.observationCount < this.config.minObservationsForCalibrating) {
      state.status = ESTIMATOR_STATUS.INSUFFICIENT_DATA;
      state.confidence = parseFloat((0.3 + state.observationCount * 0.05).toFixed(2));
    } else if (state.observationCount < this.config.minObservationsForAdapted) {
      state.status = ESTIMATOR_STATUS.CALIBRATING;
      state.confidence = parseFloat((0.5 + state.observationCount * 0.04).toFixed(2));
    } else {
      state.status = ESTIMATOR_STATUS.ADAPTED;
      state.confidence = parseFloat(Math.min(0.95, 0.80 + Math.max(0, 0.15 - state.residualVariance * 0.02)).toFixed(2));
    }

    // Append to bounded track history
    state.history.push({
      timestamp: t2,
      obsVx: parseFloat(obsVx.toFixed(3)),
      obsVy: parseFloat(obsVy.toFixed(3)),
      refVx: parseFloat(refVx.toFixed(3)),
      refVy: parseFloat(refVy.toFixed(3)),
      residualMagnitude: parseFloat(residualMagnitude.toFixed(3)),
      parameter: state.parameter,
      sourceType
    });

    if (state.history.length > this.config.maxHistoryPerTrack) {
      state.history.shift();
    }

    // Update Global Fallback Parameter
    this.globalObservationCount++;
    this.globalParameter = parseFloat((this.globalParameter + 0.02 * (state.parameter - this.globalParameter)).toFixed(3));
    this.globalConfidence = parseFloat(Math.min(0.90, 0.5 + this.globalObservationCount * 0.01).toFixed(2));

    return {
      updated: true,
      parameter: state.parameter,
      status: state.status,
      confidence: state.confidence,
      residualVariance: state.residualVariance,
      state
    };
  }

  /**
   * Retrieve effective parameter with explicit fallback hierarchy:
   * TRACK_ADAPTED -> GLOBAL_ADAPTED -> BASELINE
   */
  getEffectiveParameter(icebergId) {
    if (icebergId && this.trackStates.has(icebergId)) {
      const state = this.trackStates.get(icebergId);
      if (state.status === ESTIMATOR_STATUS.ADAPTED || state.status === ESTIMATOR_STATUS.CALIBRATING) {
        return {
          parameter: state.parameter,
          lowerBound: state.lowerBound,
          upperBound: state.upperBound,
          confidence: state.confidence,
          observationCount: state.observationCount,
          residualVariance: state.residualVariance,
          status: state.status,
          scope: ESTIMATOR_SCOPE.TRACK_ADAPTED
        };
      }
    }

    if (this.globalObservationCount >= 5) {
      return {
        parameter: this.globalParameter,
        lowerBound: this.config.lowerBound,
        upperBound: this.config.upperBound,
        confidence: this.globalConfidence,
        observationCount: this.globalObservationCount,
        residualVariance: 1.5,
        status: ESTIMATOR_STATUS.CALIBRATING,
        scope: ESTIMATOR_SCOPE.GLOBAL_ADAPTED
      };
    }

    return {
      parameter: this.config.priorParameter,
      lowerBound: this.config.lowerBound,
      upperBound: this.config.upperBound,
      confidence: 0.3,
      observationCount: 0,
      residualVariance: 2.0,
      status: ESTIMATOR_STATUS.INSUFFICIENT_DATA,
      scope: ESTIMATOR_SCOPE.BASELINE
    };
  }

  reset() {
    this.globalParameter = this.config.priorParameter;
    this.globalConfidence = 0.5;
    this.globalObservationCount = 0;
    this.trackStates.clear();
  }
}

export const dynamicIcebergDragEstimator = new DynamicIcebergDragEstimator();
