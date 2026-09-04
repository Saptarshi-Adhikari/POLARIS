/**
 * ASTRALIS Nav-OS — Data Recorder (Phase 6)
 *
 * Records iceberg + environment + ship state every timestep into a ring buffer.
 * Data schema v1.0.0 — compatible with Phase 7 ML training pipeline.
 *
 * Non-blocking: all writes go into an in-memory ring buffer; no I/O on the hot path.
 */

export class DataRecorder {
  constructor(options = {}) {
    this.buffer      = [];
    this.maxBufferSize = options.maxBufferSize || 1000;
    this.isRecording = false;
    this.sessionId   = this._generateSessionId();
    this.startTime   = null;
    this.schemaVersion = '1.0.0';

    // Throttle: don't record more than once per 500 ms per iceberg
    this._lastRecordTime = 0;
    this._recordIntervalMs = options.recordIntervalMs || 500;
  }

  startRecording() {
    this.isRecording = true;
    this.startTime   = performance.now();
    this.sessionId   = this._generateSessionId();
    console.info(`[DataRecorder] Recording started — session ${this.sessionId}`);
  }

  stopRecording() {
    this.isRecording = false;
    console.info(`[DataRecorder] Recording stopped — ${this.buffer.length} samples in buffer`);
  }

  /**
   * Record one snapshot of the world state.
   *
   * @param {Array}  icebergs    — Iceberg[] from simulation
   * @param {object} ship        — Ship instance
   * @param {object} environment — { windX, windY, currentX, currentY, seaIceConcentration, waterTemperature }
   * @param {number} timestamp   — performance.now() value
   */
  record(icebergs, ship, environment, timestamp) {
    if (!this.isRecording) return;

    const now = performance.now();
    if (now - this._lastRecordTime < this._recordIntervalMs) return;
    this._lastRecordTime = now;

    const wallTime = Date.now();

    for (const ice of icebergs) {
      const pt = ice.predictedTrajectory || [];

      /** @type {DataPoint} */
      const dataPoint = {
        // ── Metadata ──────────────────────────────────────────────
        timestamp:       wallTime,
        session_id:      this.sessionId,
        schema_version:  this.schemaVersion,
        iceberg_id:      ice.id,

        // ── Iceberg state ─────────────────────────────────────────
        x:               ice.x,
        y:               ice.y,
        velocity_x:      ice.vx   || 0,
        velocity_y:      ice.vy   || 0,
        acceleration_x:  (ice.acceleration && ice.acceleration.x) || 0,
        acceleration_y:  (ice.acceleration && ice.acceleration.y) || 0,
        collision_radius: ice.collisionRadius || 0,
        uncertainty_radius: ice.uncertaintyRadius || 0,
        size:            ice.size || 0,
        mass:            ice.mass || 0,
        heading:         ice.heading || 0,

        // ── Environmental forcing ─────────────────────────────────
        wind_x:                  environment.windX                || 0,
        wind_y:                  environment.windY                || 0,
        current_x:               environment.currentX            || 0,
        current_y:               environment.currentY            || 0,
        sea_ice_concentration:   environment.seaIceConcentration || 0,
        water_temperature:       environment.waterTemperature     || -1.8,

        // ── Predicted future positions ────────────────────────────
        // predictedTrajectory[0] = 10 min, [1] = 30 min, [2] = 60 min
        future_position_10m:  pt[0] ? { x: pt[0].x, y: pt[0].y, t: pt[0].t, uncertainty: pt[0].uncertainty } : null,
        future_position_30m:  pt[1] ? { x: pt[1].x, y: pt[1].y, t: pt[1].t, uncertainty: pt[1].uncertainty } : null,
        future_position_60m:  pt[2] ? { x: pt[2].x, y: pt[2].y, t: pt[2].t, uncertainty: pt[2].uncertainty } : null,

        // For compatibility with trajectoryForecast (2h, 6h, 12h, 24h)
        trajectory_forecast:  (ice.trajectoryForecast || []).map(f => ({
          hour: f.hour, x: f.x, y: f.y
        })),

        // ── Ship context ──────────────────────────────────────────
        ship_x:        ship.x        || 0,
        ship_y:        ship.y        || 0,
        ship_vx:       ship.vx       || 0,
        ship_vy:       ship.vy       || 0,
        ship_heading:  ship.heading  || 0,
        ship_speed:    ship.speedKnots || 0,
        ship_throttle: ship.throttle || 0,

        // ── Derived context ───────────────────────────────────────
        distance_to_ship: Math.hypot(ice.x - ship.x, ice.y - ship.y),
        season:           this._getSeason(wallTime),
        elapsed_s:        this.startTime !== null ? (now - this.startTime) / 1000 : 0
      };

      this.buffer.push(dataPoint);
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift();   // Drop oldest — ring buffer behaviour
      }
    }
  }

  getBuffer()   { return [...this.buffer]; }
  clearBuffer() { this.buffer = []; }

  getStats() {
    return {
      sessionId:    this.sessionId,
      isRecording:  this.isRecording,
      bufferSize:   this.buffer.length,
      maxBufferSize: this.maxBufferSize,
      startTime:    this.startTime,
      duration_s:   this.startTime !== null ? (performance.now() - this.startTime) / 1000 : 0
    };
  }

  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  _getSeason(wallTime) {
    const month = new Date(wallTime).getMonth(); // 0-indexed
    return (month >= 10 || month <= 2) ? 'austral_summer' : 'austral_winter';
  }
}

export const dataRecorder = new DataRecorder();
