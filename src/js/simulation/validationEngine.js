export class ValidationEngine {
  constructor(engine) {
    this.engine = engine;
    this.snapshots = [];
    this.validatedCount = 0;
    this.totalError = 0;
    this.currentError = 0;
    this.averageError = 0;
    this.history = []; // Keep last 5 validations for visualization
    this.validationModeActive = false; // Toggle to render markers on canvas
  }

  logPrediction(icebergId, predictedX, predictedY, confidence, uncertainty, horizonMinutes) {
    const simTime = this.engine.state.simulation.simTimeHours;
    const targetTime = simTime + (horizonMinutes / 60.0);

    // Prevent duplicate entries for the same iceberg at the same target horizon
    const exists = this.snapshots.some(s => s.icebergId === icebergId && Math.abs(s.targetTime - targetTime) < 0.05);
    if (exists) return;

    this.snapshots.push({
      icebergId,
      targetTime,
      predictedX,
      predictedY,
      confidence,
      uncertainty,
      horizon: horizonMinutes,
      evaluated: false
    });
  }

  evaluate(simTimeHours) {
    for (let snapshot of this.snapshots) {
      if (snapshot.evaluated) continue;

      if (simTimeHours >= snapshot.targetTime) {
        snapshot.evaluated = true;
        
        // Find actual iceberg
        const actualIceberg = this.engine.icebergs.find(ice => ice.id === snapshot.icebergId);
        if (actualIceberg) {
          const error = Math.hypot(actualIceberg.x - snapshot.predictedX, actualIceberg.y - snapshot.predictedY);
          
          this.validatedCount++;
          this.totalError += error;
          this.currentError = error;
          this.averageError = this.totalError / this.validatedCount;

          this.history.push({
            icebergId: snapshot.icebergId,
            predictedX: snapshot.predictedX,
            predictedY: snapshot.predictedY,
            actualX: actualIceberg.x,
            actualY: actualIceberg.y,
            error: error,
            horizon: snapshot.horizon,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          });

          if (this.history.length > 5) {
            this.history.shift();
          }
        }
      }
    }
  }

  reset() {
    this.snapshots = [];
    this.validatedCount = 0;
    this.totalError = 0;
    this.currentError = 0;
    this.averageError = 0;
    this.history = [];
  }
}
