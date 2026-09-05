/**
 * POLARIS DIGITAL TWIN — Iceberg Prediction Accuracy Tracker
 * Logs position forecasts at generation time and evaluates Euclidean error against actual position upon elapsed sim time.
 */

export class IcebergPredictionTracker {
  constructor(maxBufferSize = 50) {
    this.maxBufferSize = maxBufferSize;
    this.predictionBuffer = [];
    this.evaluatedErrors = [];
  }

  /**
   * Log a position prediction for an iceberg at a future sim time horizon.
   */
  recordPrediction(icebergId, currentSimTimeHours, forecastHorizonHours, predictedX, predictedY) {
    const targetSimTimeHours = currentSimTimeHours + forecastHorizonHours;
    
    // Prevent redundant predictions for the same iceberg & target time
    const existing = this.predictionBuffer.find(
      p => p.icebergId === icebergId && Math.abs(p.targetSimTimeHours - targetSimTimeHours) < 0.05
    );
    if (existing) return;

    this.predictionBuffer.push({
      icebergId,
      predictedAtSimTimeHours: currentSimTimeHours,
      forecastHorizonHours,
      targetSimTimeHours,
      predictedX,
      predictedY
    });

    if (this.predictionBuffer.length > this.maxBufferSize) {
      this.predictionBuffer.shift();
    }
  }

  /**
   * Evaluate predictions whose target sim time has arrived against actual current iceberg positions.
   */
  update(currentSimTimeHours, icebergs = []) {
    const remaining = [];
    const icebergMap = new Map(icebergs.map(ice => [ice.id, ice]));

    for (const pred of this.predictionBuffer) {
      if (currentSimTimeHours >= pred.targetSimTimeHours) {
        const ice = icebergMap.get(pred.icebergId);
        if (ice) {
          const errorSU = Math.hypot(ice.x - pred.predictedX, ice.y - pred.predictedY);
          this.evaluatedErrors.push({
            icebergId: pred.icebergId,
            forecastHorizonHours: pred.forecastHorizonHours,
            errorSU: parseFloat(errorSU.toFixed(2)),
            evaluatedAtSimTimeHours: currentSimTimeHours
          });
          if (this.evaluatedErrors.length > this.maxBufferSize) {
            this.evaluatedErrors.shift();
          }
        }
      } else {
        remaining.push(pred);
      }
    }
    this.predictionBuffer = remaining;
  }

  getAverageError() {
    if (this.evaluatedErrors.length === 0) return 0.0;
    const sum = this.evaluatedErrors.reduce((acc, e) => acc + e.errorSU, 0);
    return parseFloat((sum / this.evaluatedErrors.length).toFixed(1));
  }

  getLastError() {
    if (this.evaluatedErrors.length === 0) return null;
    return this.evaluatedErrors[this.evaluatedErrors.length - 1];
  }

  reset() {
    this.predictionBuffer = [];
    this.evaluatedErrors = [];
  }
}
