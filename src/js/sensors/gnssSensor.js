/**
 * ASTRALIS Nav-OS — GNSS (GPS) Sensor Simulator
 *
 * Provides: Latitude, Longitude, Speed Over Ground (SOG), Course Over Ground (COG)
 * Noise model: Gaussian position noise proportional to configured accuracy.
 * Failure mode: Falls back to last known position (dead reckoning by caller).
 */

export class GnssSensor {
  constructor(options = {}) {
    // Sensor characteristics
    this.updateRate = options.updateRate || 1;     // Hz — 1 update/sec typical marine GPS
    this.accuracy   = options.accuracy   || 5;     // meters (1-sigma Gaussian noise)
    this.lastUpdate = 0;

    // Output data (world-coordinate frame)
    this.latitude         = 0;
    this.longitude        = 0;
    this.speedOverGround  = 0;
    this.courseOverGround = 0;

    // Failure simulation
    this.isFailed = false;
    this.lastValidPosition = { lat: 0, lon: 0, sog: 0, cog: 0 };
  }

  // Box-Muller Gaussian random number generator
  _gaussian() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /**
   * Update the GNSS sensor reading.
   * @param {{ x: number, y: number }} shipPosition — world-coordinate ship position
   * @param {{ x: number, y: number }} shipVelocity — world-velocity components (SU/s)
   * @param {number} _deltaTime — unused (rate-limiting handled by wall-clock)
   * @returns {object|null} Latest position fix, or null if rate not met.
   */
  update(shipPosition, shipVelocity, _deltaTime) {
    if (this.isFailed) {
      return this.lastValidPosition;
    }

    const now = performance.now();
    if (now - this.lastUpdate < 1000 / this.updateRate) {
      return null;
    }

    // Gaussian position noise in world units
    const noiseX = this._gaussian() * this.accuracy;
    const noiseY = this._gaussian() * this.accuracy;

    // Map world coords → simulated Antarctic lat/lon
    const BASE_LAT = -68.5;
    const BASE_LON = 45.0;
    const METERS_PER_DEG = 111320;

    this.latitude  = BASE_LAT + (shipPosition.y + noiseY) / METERS_PER_DEG;
    this.longitude = BASE_LON + (shipPosition.x + noiseX) / METERS_PER_DEG;

    // Speed and course from velocity
    this.speedOverGround  = Math.hypot(shipVelocity.x, shipVelocity.y);
    this.courseOverGround = (Math.atan2(shipVelocity.y, shipVelocity.x) + 2 * Math.PI) % (2 * Math.PI);

    this.lastValidPosition = {
      lat: this.latitude,
      lon: this.longitude,
      sog: this.speedOverGround,
      cog: this.courseOverGround
    };

    this.lastUpdate = now;
    return this.lastValidPosition;
  }

  simulateFailure(failed) {
    this.isFailed = failed;
    console.warn(`[GNSS] Sensor ${failed ? 'FAILED' : 'RECOVERED'}`);
  }

  getData() {
    return {
      latitude:         this.latitude,
      longitude:        this.longitude,
      speedOverGround:  this.speedOverGround,
      courseOverGround: this.courseOverGround,
      accuracy:         this.accuracy,
      isFailed:         this.isFailed,
      updateRate:       this.updateRate
    };
  }
}

export const gnssSensor = new GnssSensor();
