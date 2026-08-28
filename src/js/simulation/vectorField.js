/**
 * POLARIS DIGITAL TWIN - Vector Field Ocean & Tidal Simulator
 */

export class VectorField {
  constructor(width = 1200, height = 800, gridSpacing = 40) {
    this.width = width;
    this.height = height;
    this.gridSpacing = gridSpacing;
    this.cols = Math.ceil(width / gridSpacing);
    this.rows = Math.ceil(height / gridSpacing);

    // Ocean environmental parameters
    this.currentSpeed = 1.8; // m/s
    this.currentDirection = 127; // degrees (0 = East, 90 = South, 180 = West, 270 = North)
    this.tidalStrength = 0.8; // m/s
    this.tidalPeriod = 12.4; // hours
    this.waveHeight = 1.2; // meters

    // Wind environmental parameters
    this.windSpeed = 45.2; // km/h
    this.windDirection = 247; // degrees
    this.windGusts = false;
    this.stormMode = false;

    // Grid storage
    this.grid = [];
    this.particles = [];
    this.initParticles(350);
    this.updateGrid(0);
  }

  initParticles(count = 350) {
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        life: Math.random() * 100 + 50,
        maxLife: 150 + Math.random() * 100,
        speedMultiplier: 0.8 + Math.random() * 0.4
      });
    }
  }

  setParams({ currentSpeed, currentDirection, tidalStrength, tidalPeriod, waveHeight, windSpeed, windDirection, windGusts, stormMode }) {
    if (currentSpeed !== undefined) this.currentSpeed = parseFloat(currentSpeed);
    if (currentDirection !== undefined) this.currentDirection = parseFloat(currentDirection);
    if (tidalStrength !== undefined) this.tidalStrength = parseFloat(tidalStrength);
    if (tidalPeriod !== undefined) this.tidalPeriod = parseFloat(tidalPeriod);
    if (waveHeight !== undefined) this.waveHeight = parseFloat(waveHeight);
    if (windSpeed !== undefined) this.windSpeed = parseFloat(windSpeed);
    if (windDirection !== undefined) this.windDirection = parseFloat(windDirection);
    if (windGusts !== undefined) this.windGusts = !!windGusts;
    if (stormMode !== undefined) this.stormMode = !!stormMode;
  }

  // Calculate velocity vector (u, v) in m/s at any coordinate (x, y) at time simTimeHours
  getVelocityAt(x, y, simTimeHours = 0) {
    // 1. Base ocean current vector
    const radCurrent = (this.currentDirection * Math.PI) / 180;
    let baseU = Math.cos(radCurrent) * this.currentSpeed;
    let baseV = Math.sin(radCurrent) * this.currentSpeed;

    // 2. Tidal oscillation vector: T(t) rotates sinusoidally over period P
    const tidePhase = (2 * Math.PI * simTimeHours) / Math.max(0.1, this.tidalPeriod);
    const tideU = Math.cos(tidePhase) * this.tidalStrength;
    const tideV = Math.sin(tidePhase) * this.tidalStrength;

    // 3. Surface wind drift factor (~3% of wind speed in m/s)
    const windSpeedMS = (this.windSpeed * 1000) / 3600;
    const radWind = (this.windDirection * Math.PI) / 180;
    let gustFactor = 1.0;
    if (this.windGusts) {
      gustFactor = 1.0 + 0.3 * Math.sin(x * 0.01 + y * 0.01 + simTimeHours * 10);
    }
    const windU = Math.cos(radWind) * windSpeedMS * 0.03 * gustFactor;
    const windV = Math.sin(radWind) * windSpeedMS * 0.03 * gustFactor;

    // 4. Spatial turbulence noise (harmonic variation)
    const spatialFreq = 0.003;
    const spatialU = 0.3 * Math.sin(x * spatialFreq + simTimeHours) * Math.cos(y * spatialFreq);
    const spatialV = 0.3 * Math.cos(x * spatialFreq) * Math.sin(y * spatialFreq + simTimeHours);

    // 5. Storm surge modifier
    let stormMultiplier = 1.0;
    if (this.stormMode) {
      stormMultiplier = 1.8;
    }

    const u = (baseU + tideU + windU + spatialU) * stormMultiplier;
    const v = (baseV + tideV + windV + spatialV) * stormMultiplier;

    return { u, v, speed: Math.hypot(u, v) };
  }

  updateGrid(simTimeHours = 0) {
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        const x = c * this.gridSpacing + this.gridSpacing / 2;
        const y = r * this.gridSpacing + this.gridSpacing / 2;
        const vel = this.getVelocityAt(x, y, simTimeHours);
        row.push({ x, y, u: vel.u, v: vel.v, speed: vel.speed });
      }
      this.grid.push(row);
    }
  }

  updateParticles(dt, simTimeHours) {
    for (let p of this.particles) {
      const vel = this.getVelocityAt(p.x, p.y, simTimeHours);
      // Scale velocity to screen pixels
      p.x += vel.u * 15 * dt * p.speedMultiplier;
      p.y += vel.v * 15 * dt * p.speedMultiplier;
      p.life += dt * 60;

      // Respawn out of bounds or expired particles
      if (p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height || p.life > p.maxLife) {
        p.x = Math.random() * this.width;
        p.y = Math.random() * this.height;
        p.life = 0;
        p.maxLife = 100 + Math.random() * 100;
      }
    }
  }
}
