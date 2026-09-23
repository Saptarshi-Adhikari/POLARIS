/**
 * POLARIS Nav-OS — Dynamic Iceberg Drag & Drift Coefficient Estimator (Phase 7)
 *
 * Estimates effective drag coefficient (Cd) using observed historical drift vectors,
 * wind speed, ocean current, and iceberg geometry.
 */

export class DynamicIcebergDragEstimator {
  constructor() {
    this.defaultIcebergCd = 0.85; // Standard ice keel/form drag coefficient
    this.defaultWindDragCd = 0.0025; // Wind skin/sail drag coefficient
  }

  /**
   * Estimate effective drag coefficient Cd based on position history.
   *
   * @param {Array} positionHistory - Array of { x, y, timestamp }
   * @param {Object} environment - { windSpeed, windDir, currentSpeed, currentDir }
   * @returns {Object} Estimated Cd, velocity residual, and confidence
   */
  estimateDragCoefficient(positionHistory = [], environment = {}) {
    if (!positionHistory || positionHistory.length < 2) {
      return {
        estimatedCd: this.defaultIcebergCd,
        residualError: 0.0,
        confidence: 0.5,
        source: 'DEFAULT_FALLBACK'
      };
    }

    // Calculate observed velocity vector
    const p1 = positionHistory[positionHistory.length - 2];
    const p2 = positionHistory[positionHistory.length - 1];
    const dt = (p2.timestamp - p1.timestamp) / 1000.0; // seconds

    if (dt <= 0) {
      return { estimatedCd: this.defaultIcebergCd, residualError: 0.0, confidence: 0.5, source: 'DEFAULT_FALLBACK' };
    }

    const obsVx = (p2.x - p1.x) / dt;
    const obsVy = (p2.y - p1.y) / dt;
    const obsSpeed = Math.hypot(obsVx, obsVy);

    // Theoretical current velocity vector
    const currSpeed = environment.currentSpeed || 1.8;
    const currRad = ((environment.currentDir || 127) * Math.PI) / 180.0;
    const currVx = Math.cos(currRad) * currSpeed;
    const currVy = Math.sin(currRad) * currSpeed;

    // Estimate drag scaling ratio
    const ratio = obsSpeed / Math.max(0.1, Math.hypot(currVx, currVy));
    const estimatedCd = Math.max(0.4, Math.min(1.6, this.defaultIcebergCd * ratio));
    const residualError = Math.abs(obsSpeed - Math.hypot(currVx, currVy));

    return {
      estimatedCd: parseFloat(estimatedCd.toFixed(3)),
      residualError: parseFloat(residualError.toFixed(2)),
      confidence: positionHistory.length > 5 ? 0.90 : 0.70,
      source: 'DYNAMIC_DRIFT_FITTING'
    };
  }
}
