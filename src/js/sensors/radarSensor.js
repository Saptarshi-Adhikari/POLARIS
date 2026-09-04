/**
 * ASTRALIS Nav-OS — Marine Radar Sensor Simulator
 *
 * Provides: Detected objects with range, bearing, and relative velocity.
 * Noise model: Gaussian range + bearing noise per detection.
 * Failure mode: Returns empty detection array.
 */

export class RadarSensor {
  constructor(options = {}) {
    this.updateRate = options.updateRate || 2;      // Hz — 2 Hz sweep rate
    this.maxRange   = options.maxRange   || 5000;   // world units — 5km
    this.minRange   = options.minRange   || 20;     // world units — minimum detectable range
    this.accuracy   = options.accuracy   || 10;     // world units — range accuracy (1-sigma)
    this.lastUpdate = 0;

    this.detections = [];

    // Failure simulation
    this.isFailed = false;
  }

  _gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Update radar detections.
   * @param {{ x: number, y: number }} shipPosition — world coords
   * @param {{ x: number, y: number }} shipVelocity — world velocity (SU/s)
   * @param {Array} icebergs — list of Iceberg objects with .x, .y, .vx, .vy, .collisionRadius
   * @param {number} _deltaTime — unused
   * @returns {Array} Array of detection objects.
   */
  update(shipPosition, shipVelocity, icebergs, _deltaTime) {
    if (this.isFailed) {
      return [];
    }

    const now = performance.now();
    if (now - this.lastUpdate < 1000 / this.updateRate) {
      return this.detections;
    }

    this.detections = [];

    for (const ice of icebergs) {
      const dx = ice.x - shipPosition.x;
      const dy = ice.y - shipPosition.y;
      const range = Math.hypot(dx, dy);

      if (range < this.minRange || range > this.maxRange) continue;

      const bearing = Math.atan2(dy, dx);

      const relVx = (ice.vx || 0) - (shipVelocity.x || 0);
      const relVy = (ice.vy || 0) - (shipVelocity.y || 0);
      const relativeSpeed = Math.hypot(relVx, relVy);

      // Gaussian noise on range and bearing
      const rangeNoise   = this._gaussian() * this.accuracy;
      const bearingNoise = this._gaussian() * 0.0087;  // ~0.5° in radians

      this.detections.push({
        id:              ice.id,
        range:           Math.max(this.minRange, range + rangeNoise),
        bearing:         (bearing + bearingNoise + 2 * Math.PI) % (2 * Math.PI),
        relativeSpeed:   relativeSpeed,
        confidence:      Math.min(0.99, 0.7 + (ice.collisionRadius / 50) * 0.25),
        type:            'iceberg',
        collisionRadius: ice.collisionRadius || 10
      });
    }

    // Closest targets first
    this.detections.sort((a, b) => a.range - b.range);

    this.lastUpdate = now;
    return this.detections;
  }

  simulateFailure(failed) {
    this.isFailed = failed;
    if (failed) this.detections = [];
    console.warn(`[Radar] Sensor ${failed ? 'FAILED' : 'RECOVERED'}`);
  }

  getData() {
    return {
      detections: this.detections,
      maxRange:   this.maxRange,
      isFailed:   this.isFailed,
      updateRate: this.updateRate
    };
  }
}

export const radarSensor = new RadarSensor();
