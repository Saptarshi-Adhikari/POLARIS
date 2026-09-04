/**
 * ASTRALIS Nav-OS — Synthetic Iceberg Data Generator (Phase 6)
 *
 * Produces realistic iceberg trajectory datasets for initial ML training
 * using the Wagner (2017) 2% wind-rule drift model with stochastic forcing.
 *
 * Entirely client-side — exports via Blob download, no server required.
 */

export class SyntheticDataGenerator {
  constructor() {
    this.schemaVersion = '1.0.0';
    this._BASE_LAT     = -68.5;
    this._BASE_LON     = 45.0;
    this._METERS_PER_DEG = 111320;
  }

  /**
   * Generate synthetic trajectories for `numIcebergs` icebergs,
   * each simulated for `durationHours` at 1-minute resolution.
   *
   * @param {number} numIcebergs
   * @param {number} durationHours
   * @returns {Array<object>} Flat array of DataPoint records.
   */
  generateDataset(numIcebergs = 100, durationHours = 24) {
    console.info(`[SyntheticData] Generating ${numIcebergs} × ${durationHours}h trajectories…`);
    const flat = [];
    for (let i = 0; i < numIcebergs; i++) {
      const traj = this._generateSingleTrajectory(i, durationHours);
      for (const pt of traj) flat.push(pt);
    }
    console.info(`[SyntheticData] Generated ${flat.length} samples`);
    return flat;
  }

  /**
   * Generate and immediately download the dataset as JSON.
   */
  exportSyntheticDataset(
    numIcebergs = 100,
    durationHours = 24,
    filename = 'synthetic_iceberg_data.json'
  ) {
    const data    = this.generateDataset(numIcebergs, durationHours);
    const content = JSON.stringify(data, null, 2);
    const blob    = new Blob([content], { type: 'application/json' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.info(`[SyntheticData] Downloaded → ${filename}`);
    return data;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _generateSingleTrajectory(icebergIdx, durationHours) {
    const trajectory = [];

    // Random initial position within simulation world bounds
    let x = 400  + Math.random() * 2800;   // world units
    let y = 400  + Math.random() * 1600;

    // Random initial drift velocity
    let vx = (Math.random() - 0.5) * 0.4;
    let vy = (Math.random() - 0.5) * 0.4;

    // Random, steady environmental forcing for this iceberg
    const windX     = (Math.random() - 0.5) * 12;
    const windY     = (Math.random() - 0.5) * 12;
    const currentX  = (Math.random() - 0.5) * 0.3;
    const currentY  = (Math.random() - 0.5) * 0.3;
    const seaIce    = Math.random() * 0.7;
    const radius    = 8 + Math.random() * 40;

    const WIND_FACTOR = 0.02;
    const DT_S        = 60;    // 1-minute time steps
    const numSteps    = durationHours * 60;

    const sessionId = `synthetic_${icebergIdx}_${Date.now()}`;
    const startWall = Date.now();

    for (let t = 0; t < numSteps; t++) {
      const wallTime = startWall + t * DT_S * 1000;

      // Wagner drift model: v += (0.1 * current) + (0.02 * 0.1 * wind) + noise
      vx += currentX  * 0.1 + windX * WIND_FACTOR * 0.1 + (Math.random() - 0.5) * 0.008;
      vy += currentY  * 0.1 + windY * WIND_FACTOR * 0.1 + (Math.random() - 0.5) * 0.008;

      // Soft speed cap — icebergs rarely exceed ~0.5 SU/s
      const speed = Math.hypot(vx, vy);
      if (speed > 0.5) { vx *= 0.5 / speed; vy *= 0.5 / speed; }

      x += vx * DT_S;
      y += vy * DT_S;

      // Clamp to world bounds to avoid runaway positions
      x = Math.max(0, Math.min(3600, x));
      y = Math.max(0, Math.min(2400, y));

      // Future position predictions (linear extrapolation)
      const future10m  = { t: 600,  x: x + vx * 600,   y: y + vy * 600,   uncertainty: radius + 0.5 * 600  };
      const future30m  = { t: 1800, x: x + vx * 1800,  y: y + vy * 1800,  uncertainty: radius + 0.5 * 1800 };
      const future60m  = { t: 3600, x: x + vx * 3600,  y: y + vy * 3600,  uncertainty: radius + 0.5 * 3600 };
      const future2h   = { hour: 2,  x: x + vx * 7200,  y: y + vy * 7200  };
      const future6h   = { hour: 6,  x: x + vx * 21600, y: y + vy * 21600 };
      const future24h  = { hour: 24, x: x + vx * 86400, y: y + vy * 86400 };

      trajectory.push({
        timestamp:            wallTime,
        session_id:           sessionId,
        schema_version:       this.schemaVersion,
        iceberg_id:           `SYN-${String(icebergIdx).padStart(3, '0')}`,

        x,  y,
        velocity_x:           vx,
        velocity_y:           vy,
        acceleration_x:       currentX * 0.1 + windX * WIND_FACTOR * 0.1,
        acceleration_y:       currentY * 0.1 + windY * WIND_FACTOR * 0.1,
        collision_radius:     radius,
        uncertainty_radius:   radius,
        size:                 radius * 35,
        mass:                 radius * 0.05,
        heading:              (Math.atan2(vy, vx) * 180 / Math.PI + 360) % 360,

        wind_x:               windX,
        wind_y:               windY,
        current_x:            currentX,
        current_y:            currentY,
        sea_ice_concentration: seaIce,
        water_temperature:    -1.8,

        future_position_10m:  future10m,
        future_position_30m:  future30m,
        future_position_60m:  future60m,
        trajectory_forecast:  [future2h, future6h, future24h],

        // No real ship in synthetic data
        ship_x: 0, ship_y: 0,
        ship_vx: 0, ship_vy: 0,
        ship_heading: 0, ship_speed: 0, ship_throttle: 0,

        distance_to_ship: Math.hypot(x, y),
        season:           this._getSeason(wallTime),
        elapsed_s:        t * DT_S
      });
    }

    return trajectory;
  }

  _getSeason(wallTime) {
    const month = new Date(wallTime).getMonth();
    return (month >= 10 || month <= 2) ? 'austral_summer' : 'austral_winter';
  }
}

export const syntheticDataGenerator = new SyntheticDataGenerator();
