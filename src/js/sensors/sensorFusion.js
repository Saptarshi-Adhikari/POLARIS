/**
 * ASTRALIS Nav-OS — Sensor Fusion Module
 *
 * Combines GNSS + Gyrocompass + Radar into a single fused state estimate.
 *
 * Architecture: Environment → Sensors → State Estimation (this module) → Decision
 *
 * Degradation hierarchy:
 *   GNSS OK          → use GNSS position
 *   GNSS FAILED      → dead reckoning from last known position + physics velocity
 *   Gyro OK          → use gyro heading
 *   Gyro FAILED      → use physics heading from ship state
 */

export class SensorFusion {
  constructor() {
    this.gnss  = null;
    this.gyro  = null;
    this.radar = null;

    // Fused best estimates (world coordinate frame)
    this.fusedPosition = { x: 0, y: 0 };
    this.fusedHeading  = 0;    // degrees
    this.fusedVelocity = { x: 0, y: 0 };

    // Dead reckoning (DR) state — maintained independently of GNSS
    this._drPosition  = { x: 0, y: 0 };
    this._drLastTime  = 0;
    this._drActive    = false;

    this._lastStatusLog = 0;

    // Base coordinate reference for lat/lon ↔ world-units conversion
    this._BASE_LAT = -68.5;
    this._BASE_LON = 45.0;
    this._METERS_PER_DEG = 111320;
  }

  /**
   * Attach sensor instances. Must be called before the first update().
   */
  initialize(gnss, gyro, radar) {
    this.gnss  = gnss;
    this.gyro  = gyro;
    this.radar = radar;
    console.info('[SensorFusion] Initialized with GNSS, Gyro, Radar');
  }

  /**
   * Run one sensor-fusion cycle.
   *
   * @param {object} shipState — current ship state from physics simulation
   *   { x, y, vx, vy, heading (deg), angularVelocity (rad/s) }
   * @param {Array}  icebergs  — current iceberg list (for radar)
   * @param {number} deltaTime — physics step in seconds
   * @returns {object} fusedState
   */
  update(shipState, icebergs, deltaTime) {
    const now = performance.now();
    const dt  = Math.min(deltaTime || 0.016, 0.5);

    const shipPosition = { x: shipState.x, y: shipState.y };
    const shipVelocity = { x: shipState.vx || 0, y: shipState.vy || 0 };

    // ── Position fusion: GNSS with DR fallback ─────────────────────────────
    let gnssAvailable = false;

    if (this.gnss) {
      const gnssData = this.gnss.update(shipPosition, shipVelocity, dt);

      if (gnssData && !this.gnss.isFailed) {
        gnssAvailable = true;
        this._drActive = false;

        // Convert noisy lat/lon back to world units
        this.fusedPosition.x = (gnssData.lon - this._BASE_LON) * this._METERS_PER_DEG;
        this.fusedPosition.y = (gnssData.lat - this._BASE_LAT) * this._METERS_PER_DEG;

        // Sync DR origin to GNSS whenever available
        this._drPosition.x = this.fusedPosition.x;
        this._drPosition.y = this.fusedPosition.y;
      } else {
        // GNSS failed → dead reckoning
        if (!this._drActive) {
          this._drActive   = true;
          this._drLastTime = now;
        }

        const elapsed = (now - this._drLastTime) / 1000;
        this._drPosition.x += shipVelocity.x * elapsed;
        this._drPosition.y += shipVelocity.y * elapsed;
        this._drLastTime    = now;

        this.fusedPosition.x = this._drPosition.x;
        this.fusedPosition.y = this._drPosition.y;
      }
    } else {
      // No GNSS module — use physics ground truth
      this.fusedPosition.x = shipPosition.x;
      this.fusedPosition.y = shipPosition.y;
    }

    // ── Heading fusion: Gyro with physics fallback ─────────────────────────
    let gyroAvailable = false;

    if (this.gyro) {
      const gyroData = this.gyro.update(shipState.heading, shipState.angularVelocity || 0, dt);

      if (gyroData !== null && !this.gyro.isFailed) {
        gyroAvailable = true;
        // Gyro returns radians; convert to degrees for fusion output
        this.fusedHeading = (gyroData * 180 / Math.PI + 360) % 360;
      } else {
        this.fusedHeading = shipState.heading;
      }
    } else {
      this.fusedHeading = shipState.heading;
    }

    // ── Velocity: physics model is most reliable ───────────────────────────
    this.fusedVelocity.x = shipVelocity.x;
    this.fusedVelocity.y = shipVelocity.y;

    // ── Radar update (detections stored on sensor object) ─────────────────
    if (this.radar) {
      this.radar.update(shipPosition, shipVelocity, icebergs || [], dt);
    }

    // ── Periodic diagnostic log (every 5 s) ───────────────────────────────
    if (now - this._lastStatusLog > 5000) {
      this._lastStatusLog = now;
      const gnssStr  = gnssAvailable ? `OK (${this.gnss.getData().latitude.toFixed(4)}°, ${this.gnss.getData().longitude.toFixed(4)}°)` : 'DR MODE';
      const gyroStr  = gyroAvailable ? `OK ${(this.fusedHeading).toFixed(1)}°` : 'PHYSICS FALLBACK';
      const radarStr = this.radar    ? `${this.radar.getData().detections.length} tgt` : 'n/a';
      console.log(`[SensorFusion] GNSS:${gnssStr} | Gyro:${gyroStr} | Radar:${radarStr}`);
    }

    return {
      position:      { ...this.fusedPosition },
      heading:       this.fusedHeading,
      velocity:      { ...this.fusedVelocity },
      gnssAvailable,
      gyroAvailable,
      drActive:      this._drActive
    };
  }

  getFusedState() {
    return {
      position: { ...this.fusedPosition },
      heading:  this.fusedHeading,
      velocity: { ...this.fusedVelocity }
    };
  }
}

export const sensorFusion = new SensorFusion();
