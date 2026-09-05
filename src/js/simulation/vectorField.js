/**
 * POLARIS DIGITAL TWIN - Vector Field Ocean & Tidal Simulator
 *
 * COORDINATE SYSTEM: World coordinates (0..WORLD_W x 0..WORLD_H = 3600 x 2400).
 * Velocity vectors (u, v) are in m/s (real ocean units).
 * Callers who need SU/sec must scale appropriately.
 */

export class VectorField {
  constructor(width = 3600, height = 2400, gridSpacing = 80) {
    this.width  = width;
    this.height = height;
    this.gridSpacing = gridSpacing;
    this.cols = Math.ceil(width  / gridSpacing);
    this.rows = Math.ceil(height / gridSpacing);

    // Ocean environmental parameters
    this.currentSpeed     = 1.8;  // m/s
    this.currentDirection = 127;  // degrees
    this.tidalStrength    = 0.8;  // m/s
    this.tidalPeriod      = 12.4; // hours
    this.waveHeight       = 1.2;  // meters

    // Wind parameters
    this.windSpeed     = 45.2; // km/h
    this.windDirection = 247;
    this.windGusts     = false;
    this.windEnabled   = true;
    this.stormMode     = false;
    this.turbulence    = 0.3;

    // State cache (for ice concentration etc.)
    this.lastState = null;

    // Grid storage & particles
    this.grid     = [];
    this.particles = [];
    this.initParticles(400);
    this.updateGrid(0);
  }

  initParticles(count = 400) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x:              Math.random() * this.width,
        y:              Math.random() * this.height,
        life:           Math.random() * 100 + 50,
        maxLife:        150 + Math.random() * 100,
        speedMultiplier: 0.8 + Math.random() * 0.4
      });
    }
  }

  setParams({ currentSpeed, currentDirection, tidalStrength, tidalPeriod, waveHeight, windSpeed, windDirection, windGusts, stormMode }) {
    if (currentSpeed     !== undefined) this.currentSpeed     = parseFloat(currentSpeed);
    if (currentDirection !== undefined) this.currentDirection = parseFloat(currentDirection);
    if (tidalStrength    !== undefined) this.tidalStrength    = parseFloat(tidalStrength);
    if (tidalPeriod      !== undefined) this.tidalPeriod      = parseFloat(tidalPeriod);
    if (waveHeight       !== undefined) this.waveHeight       = parseFloat(waveHeight);
    if (windSpeed        !== undefined) this.windSpeed        = parseFloat(windSpeed);
    if (windDirection    !== undefined) this.windDirection    = parseFloat(windDirection);
    if (windGusts        !== undefined) this.windGusts        = !!windGusts;
    if (stormMode        !== undefined) this.stormMode        = !!stormMode;
  }

  /**
   * Computes whether storm threshold is crossed (Wind > 60 kts OR Current > 25 kts OR Turbulence > 0.6 OR stormMode)
   * and calculates continuous storm severity [0..1].
   */
  getStormState(state) {
    let windSpd = this.windSpeed;
    let currentSpd = this.currentSpeed;
    let turb = this.turbulence;
    let isStormMode = this.stormMode;

    if (state && state.environment) {
      if (state.environment.wind) windSpd = state.environment.wind.speed;
      if (state.environment.ocean) {
        currentSpd = state.environment.ocean.currentSpeed;
        turb = state.environment.ocean.turbulence;
      }
    }

    const stormActive = windSpd > 60.0 || currentSpd > 25.0 || turb > 0.6 || isStormMode;

    const windSev = Math.max(0, (windSpd - 60.0) / 60.0);
    const currentSev = Math.max(0, (currentSpd - 25.0) / 25.0);
    const turbSev = Math.max(0, (turb - 0.6) / 0.4);
    const severity = Math.min(1.0, Math.max(windSev, currentSev, turbSev, isStormMode ? 1.0 : 0.0));

    return {
      stormActive,
      severity: stormActive ? Math.max(0.3, severity) : 0.0,
      windSpeed: windSpd,
      currentSpeed: currentSpd,
      turbulence: turb
    };
  }

  /**
   * Returns velocity vector {u, v, speed} in m/s at world position (x, y).
   */
  getVelocityAt(x, y, simTimeHours = 0, state) {
    if (state) {
      this.currentSpeed     = state.environment.ocean.currentSpeed;
      this.currentDirection = state.environment.ocean.currentDirection;
      this.turbulence       = state.environment.ocean.turbulence;
      this.windSpeed        = state.environment.wind.speed;
      this.windDirection    = state.environment.wind.direction;
      this.windEnabled      = state.environment.wind.enabled;
    }

    if (state && state.environment.mode === 'DATA-DRIVEN') {
      const adm = window.simEngine && window.simEngine.antarcticDataManager;
      if (adm && adm.active) {
        const datCurrent = adm.getCurrentAt(x, y, simTimeHours);
        const datWind = adm.getWindAt(x, y, simTimeHours);
        
        let baseU = 0, baseV = 0;
        if (datCurrent) {
          baseU = datCurrent.u;
          baseV = datCurrent.v;
        } else {
          // Revert current layer fallback
          const radCurrent = (this.currentDirection * Math.PI) / 180;
          baseU = Math.cos(radCurrent) * this.currentSpeed;
          baseV = Math.sin(radCurrent) * this.currentSpeed;
        }

        let windU = 0, windV = 0;
        if (this.windEnabled !== false && datWind) {
          windU = datWind.u * 0.03;
          windV = datWind.v * 0.03;
        } else if (this.windEnabled !== false) {
          // Revert wind layer fallback
          const windMS = (this.windSpeed * 1000) / 3600;
          const radWind = (this.windDirection * Math.PI) / 180;
          windU = Math.cos(radWind) * windMS * 0.03;
          windV = Math.sin(radWind) * windMS * 0.03;
        }

        const u = baseU + windU;
        const v = baseV + windV;
        return { u, v, speed: Math.hypot(u, v) };
      }
    }

    // 1. Base ocean current
    const radCurrent = (this.currentDirection * Math.PI) / 180;
    const baseU = Math.cos(radCurrent) * this.currentSpeed;
    const baseV = Math.sin(radCurrent) * this.currentSpeed;

    // 2. Tidal oscillation
    const tidePhase = (2 * Math.PI * simTimeHours) / Math.max(0.1, this.tidalPeriod);
    const tideU = Math.cos(tidePhase) * this.tidalStrength;
    const tideV = Math.sin(tidePhase) * this.tidalStrength;

    // 3. Wind surface drift (~3% of wind speed)
    let windU = 0, windV = 0;
    if (this.windEnabled !== false) {
      const windMS  = (this.windSpeed * 1000) / 3600;
      const radWind = (this.windDirection * Math.PI) / 180;
      let gustFactor = 1.0;
      if (this.windGusts) {
        gustFactor = 1.0 + 0.3 * Math.sin(x * 0.001 + y * 0.001 + simTimeHours * 10);
      }
      windU = Math.cos(radWind) * windMS * 0.03 * gustFactor;
      windV = Math.sin(radWind) * windMS * 0.03 * gustFactor;
    }

    // 4. Spatial turbulence (low-frequency harmonic noise)
    const turbulenceFactor = this.turbulence || 0.3;
    const spatialFreq = 0.0008; // lower freq for larger world
    const spatialU = turbulenceFactor * Math.sin(x * spatialFreq + simTimeHours) * Math.cos(y * spatialFreq);
    const spatialV = turbulenceFactor * Math.cos(x * spatialFreq) * Math.sin(y * spatialFreq + simTimeHours);

    // 5. Storm surge
    const stormMult = this.stormMode ? 1.8 : 1.0;

    const u = (baseU + tideU + windU + spatialU) * stormMult;
    const v = (baseV + tideV + windV + spatialV) * stormMult;

    return { u, v, speed: Math.hypot(u, v) };
  }

  /**
   * Sea Ice Concentration (0.0 to 1.0) at world position (x, y).
   */
  getSeaIceConcentration(x, y) {
    if (!this.lastState || !this.lastState.environment.seaIce.enabled) return 0;

    if (this.lastState && this.lastState.environment.mode === 'DATA-DRIVEN') {
      const adm = window.simEngine && window.simEngine.antarcticDataManager;
      if (adm && adm.active) {
        const ice = adm.getSeaIceAt(x, y, this.lastState.simulation.simTimeHours);
        if (ice !== null) return ice;
      }
    }

    const avgConc = this.lastState.environment.seaIce.averageConcentration;
    if (avgConc <= 0) return 0;

    // Deterministic low-frequency noise for ice patch patterns (larger world = lower freq)
    const sf1 = 0.0006;
    const sf2 = 0.0015;
    const noise1 = Math.sin(x * sf1) * Math.cos(y * sf1);
    const noise2 = Math.sin(x * sf2 + 100) * Math.cos(y * sf2 - 50);
    const combinedNoise = (noise1 + noise2 * 0.5 + 1.5) / 3.0;

    let localConc = combinedNoise + (avgConc - 0.5) * 1.5;
    return Math.max(0.0, Math.min(1.0, localConc));
  }

  /**
   * Sea-Ice Trend Forecast (linear regression extrapolation over recent simulation history).
   * EXPLICITLY NOT ML/AI — real linear trend math.
   */
  recordSeaIceSample(col, row, simTimeHours, conc) {
    if (!this.seaIceHistory) this.seaIceHistory = new Map();
    const key = `${col},${row}`;
    let history = this.seaIceHistory.get(key);
    if (!history) {
      history = [];
      this.seaIceHistory.set(key, history);
    }
    history.push({ tHours: simTimeHours, conc });
    if (history.length > 10) history.shift(); // Keep rolling window of last 10 samples
  }

  getSeaIceTrendForecast(x, y, horizonHours = 24) {
    const cCurrent = this.getSeaIceConcentration(x, y);
    const col = Math.floor(x / this.gridSpacing);
    const row = Math.floor(y / this.gridSpacing);
    const key = `${col},${row}`;

    const history = this.seaIceHistory ? this.seaIceHistory.get(key) : null;
    if (!history || history.length < 2) {
      return {
        current: cCurrent,
        slope: 0,
        predicted: cCurrent,
        horizonHours,
        label: 'Sea-Ice Trend Forecast'
      };
    }

    const N = history.length;
    let sumT = 0, sumC = 0, sumTC = 0, sumTT = 0;
    for (let p of history) {
      sumT += p.tHours;
      sumC += p.conc;
      sumTC += p.tHours * p.conc;
      sumTT += p.tHours * p.tHours;
    }

    const denom = (N * sumTT - sumT * sumT);
    let slope = 0;
    if (Math.abs(denom) > 1e-9) {
      slope = (N * sumTC - sumT * sumC) / denom;
    }

    const predicted = Math.max(0.0, Math.min(1.0, cCurrent + slope * horizonHours));

    return {
      current: cCurrent,
      slope,
      predicted,
      horizonHours,
      label: 'Sea-Ice Trend Forecast'
    };
  }

  updateGrid(simTimeHours = 0, state) {
    if (state) this.lastState = state;
    this.grid = [];
    
    // Throttled history sampling every ~0.05 sim hours (approx 3 min sim time)
    const shouldSampleHistory = !this.lastHistorySampleTime || (simTimeHours - this.lastHistorySampleTime) >= 0.02;
    if (shouldSampleHistory) this.lastHistorySampleTime = simTimeHours;

    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        const x = c * this.gridSpacing + this.gridSpacing / 2;
        const y = r * this.gridSpacing + this.gridSpacing / 2;
        const vel = this.getVelocityAt(x, y, simTimeHours, state);
        const conc = this.getSeaIceConcentration(x, y);
        if (shouldSampleHistory && conc > 0.01) {
          this.recordSeaIceSample(c, r, simTimeHours, conc);
        }
        row.push({ x, y, u: vel.u, v: vel.v, speed: vel.speed, seaIceConc: conc });
      }
      this.grid.push(row);
    }
  }

  updateParticles(dt, simTimeHours, state) {
    if (state) this.lastState = state;
    for (let p of this.particles) {
      const vel = this.getVelocityAt(p.x, p.y, simTimeHours, state);
      p.x += vel.u * 15 * dt * p.speedMultiplier;
      p.y += vel.v * 15 * dt * p.speedMultiplier;
      p.life += dt * 60;

      if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height || p.life > p.maxLife) {
        p.x = Math.random() * this.width;
        p.y = Math.random() * this.height;
        p.life = 0;
        p.maxLife = 100 + Math.random() * 100;
      }
    }
  }
}
