/**
 * POLARIS DIGITAL TWIN — Adaptive Prediction Error Calibration Engine
 *
 * Implements Phase 9 / Capability #28:
 * Layer 1 (Online Calibration): Calculates real-time prediction error e(t) = ||actual - predicted||
 * and maintains an Exponentially Weighted Moving Average (EWMA) of error mean and variance.
 * Dynamically adjusts uncertainty envelope scaling factor.
 *
 * Layer 2 (Offline Model Retraining & Registry):
 * Provides data logging for retraining scripts (tools/train_iceberg_model.py) and tracks model versioning.
 * Safety Rule: Adaptive calibration modifies uncertainty safety margins dynamically; it NEVER overrides
 * deterministic safety guardrails.
 */

export class AdaptiveCalibrationEngine {
  constructor(options = {}) {
    this.alpha = options.alpha || 0.15; // EWMA smoothing factor
    this.errorMeanSU = 5.0;
    this.errorVarSU = 4.0;
    this.uncertaintyScaleFactor = 1.0;
    this.sampleCount = 0;
    this.history = [];
    this.maxHistory = 100;

    this.activeModelVersion = 'v1.0.0';
    this.modelRegistry = [
      { version: 'v1.0.0', datasetHash: 'a7f3b901', trainingMAE: 4.8, testMAE: 5.2, status: 'ACTIVE' },
      { version: 'v1.1.0-exp', datasetHash: 'c82d911e', trainingMAE: 4.2, testMAE: 4.6, status: 'EXPERIMENTAL' }
    ];
  }

  /**
   * Observe actual position versus predicted position at target time.
   */
  observePredictionError(predictedX, predictedY, actualX, actualY, horizonHours = 24) {
    const errorSU = Math.hypot(actualX - predictedX, actualY - predictedY);
    this.sampleCount++;

    // Update EWMA Mean and Variance
    const delta = errorSU - this.errorMeanSU;
    this.errorMeanSU += this.alpha * delta;
    this.errorVarSU += this.alpha * (delta * delta - this.errorVarSU);

    // Uncertainty scale factor adapts based on observed prediction bias
    // Scale factor increases if real error exceeds expected baseline
    this.uncertaintyScaleFactor = Math.max(0.8, Math.min(2.5, 1.0 + (this.errorMeanSU - 5.0) * 0.05));

    this.history.push({
      timestamp: Date.now(),
      horizonHours,
      errorSU: parseFloat(errorSU.toFixed(2)),
      ewmaMeanSU: parseFloat(this.errorMeanSU.toFixed(2)),
      uncertaintyScaleFactor: parseFloat(this.uncertaintyScaleFactor.toFixed(2))
    });

    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    return {
      errorSU,
      ewmaMeanSU: this.errorMeanSU,
      uncertaintyScaleFactor: this.uncertaintyScaleFactor
    };
  }

  getCalibrationSummary() {
    return {
      activeModelVersion: this.activeModelVersion,
      sampleCount: this.sampleCount,
      ewmaErrorMeanSU: parseFloat(this.errorMeanSU.toFixed(2)),
      ewmaErrorVarSU: parseFloat(this.errorVarSU.toFixed(2)),
      uncertaintyScaleFactor: parseFloat(this.uncertaintyScaleFactor.toFixed(2)),
      registry: this.modelRegistry
    };
  }

  reset() {
    this.errorMeanSU = 5.0;
    this.errorVarSU = 4.0;
    this.uncertaintyScaleFactor = 1.0;
    this.sampleCount = 0;
    this.history = [];
  }
}

export const adaptiveCalibrationEngine = new AdaptiveCalibrationEngine();
