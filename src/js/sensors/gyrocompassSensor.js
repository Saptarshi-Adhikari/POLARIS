/**
 * ASTRALIS Nav-OS — Gyrocompass Sensor Simulator
 *
 * Provides: True Heading (radians), Angular Rate (rad/s)
 * Noise model: Gaussian heading noise + slow bias drift accumulation.
 * Failure mode: Returns last known heading; drift continues to accumulate.
 */

export class GyrocompassSensor {
  constructor(options = {}) {
    this.updateRate = options.updateRate || 10;   // Hz — 10 Hz typical marine gyro
    this.accuracy   = options.accuracy   || 0.5;  // degrees (1-sigma)
    this.lastUpdate = 0;

    // Output
    this.trueHeading = 0;   // radians
    this.angularRate = 0;   // rad/s

    // Noise model
    this._noiseStdRad = (this.accuracy * Math.PI) / 180;

    // Bias drift — gyros accumulate a slow heading error over time
    this._biasDriftRate = 0.0005;  // rad/s of random-walk bias per second
    this._currentBias   = 0;

    // Failure simulation
    this.isFailed = false;
    this.lastValidHeading = 0;
  }

  _gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Update the gyrocompass sensor reading.
   * @param {number} shipHeadingDeg — true heading from physics model (degrees)
   * @param {number} shipAngularVelRad — angular velocity (rad/s)
   * @param {number} deltaTime — simulation step in seconds
   * @returns {number|null} Measured true heading in radians, or null if rate not met.
   */
  update(shipHeadingDeg, shipAngularVelRad, deltaTime) {
    const now = performance.now();
    if (now - this.lastUpdate < 1000 / this.updateRate) {
      return null;
    }

    // Bias random-walk — drifts even when operational
    const dt = Math.min(deltaTime, 0.5);
    this._currentBias += this._gaussian() * this._biasDriftRate * Math.sqrt(dt);

    if (this.isFailed) {
      return this.lastValidHeading;
    }

    const shipHeadingRad = (shipHeadingDeg * Math.PI) / 180;
    const noise = this._gaussian() * this._noiseStdRad;

    this.trueHeading = (shipHeadingRad + this._currentBias + noise + 2 * Math.PI) % (2 * Math.PI);
    this.angularRate = (shipAngularVelRad || 0) + this._gaussian() * this._noiseStdRad * 10;

    this.lastValidHeading = this.trueHeading;
    this.lastUpdate = now;

    return this.trueHeading;
  }

  simulateFailure(failed) {
    this.isFailed = failed;
    console.warn(`[Gyro] Sensor ${failed ? 'FAILED' : 'RECOVERED'}`);
  }

  getData() {
    return {
      trueHeading:  this.trueHeading,
      angularRate:  this.angularRate,
      biasDeg:      (this._currentBias * 180) / Math.PI,
      accuracy:     this.accuracy,
      isFailed:     this.isFailed,
      updateRate:   this.updateRate
    };
  }
}

export const gyrocompassSensor = new GyrocompassSensor();
