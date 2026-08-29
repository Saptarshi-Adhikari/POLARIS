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

  updateGrid(simTimeHours = 0, state) {
    if (state) this.lastState = state;
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        const x = c * this.gridSpacing + this.gridSpacing / 2;
        const y = r * this.gridSpacing + this.gridSpacing / 2;
        const vel = this.getVelocityAt(x, y, simTimeHours, state);
        row.push({ x, y, u: vel.u, v: vel.v, speed: vel.speed });
      }
      this.grid.push(row);
    }
  }

  updateParticles(dt, simTimeHours, state) {
    if (state) this.lastState = state;
    for (let p of this.particles) {
      const vel = this.getVelocityAt(p.x, p.y, simTimeHours, state);
      // Scale ocean velocity (m/s) to visible particle movement in world pixels
      // ~15 world pixels per m/s looks good across the 3600px world
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
