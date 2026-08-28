/**
 * POLARIS DIGITAL TWIN - Iceberg Physics & Trajectory Simulator
 */

export class Iceberg {
  constructor({
    id,
    name,
    x,
    y,
    lat = -64.382,
    lon = 72.821,
    mass = 4.8, // Mega-tonnes (Mt)
    size = 720, // meters
    currentResponse = 0.85,
    windResponse = 0.15,
    waveResponse = 0.05
  }) {
    this.id = id;
    this.name = name;
    this.x = x;
    this.y = y;
    this.lat = lat;
    this.lon = lon;
    this.mass = mass; // Mt
    this.size = size; // meters
    this.currentResponse = currentResponse;
    this.windResponse = windResponse;
    this.waveResponse = waveResponse;

    // Velocity state
    this.vx = 0;
    this.vy = 0;
    this.heading = Math.floor(Math.random() * 360);
    this.angularVelocity = (Math.random() - 0.5) * 0.2; // degrees per sec

    // Interactive state
    this.isDragging = false;
    this.isSelected = false;
    this.manualTarget = null; // { x, y } target override

    // AI Forecast trajectories (array of { hour, x, y, lat, lon })
    this.trajectoryForecast = [];
  }

  update(dt, vectorField, simTimeHours) {
    if (this.isDragging) return;

    if (this.manualTarget) {
      // Manual trajectory override towards target (e.g. ship position)
      const dx = this.manualTarget.x - this.x;
      const dy = this.manualTarget.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 10) {
        const speed = 25; // pixels per sec override speed
        this.vx = (dx / dist) * speed;
        this.vy = (dy / dist) * speed;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.heading = (Math.atan2(dy, dx) * 180) / Math.PI;
        this.updateLatLon();
        return;
      } else {
        this.manualTarget = null;
      }
    }

    // 1. Get local ocean current velocity
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours);

    // 2. Get local wind velocity
    const radWind = (vectorField.windDirection * Math.PI) / 180;
    const windMS = (vectorField.windSpeed * 1000) / 3600;
    const windVx = Math.cos(radWind) * windMS;
    const windVy = Math.sin(radWind) * windMS;

    // 3. Wave drift effect
    const waveDrift = vectorField.waveHeight * 0.1;

    // 4. Combine physics forces: V_iceberg = alpha * V_current + beta * V_wind + gamma * V_wave
    const targetVx = oceanVel.u * this.currentResponse * 12 + windVx * this.windResponse * 2 + waveDrift * this.waveResponse;
    const targetVy = oceanVel.v * this.currentResponse * 12 + windVy * this.windResponse * 2 + waveDrift * this.waveResponse;

    // Smooth inertia acceleration
    this.vx += (targetVx - this.vx) * Math.min(1, dt * 2);
    this.vy += (targetVy - this.vy) * Math.min(1, dt * 2);

    // Position update
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Heading rotation
    this.heading = (this.heading + this.angularVelocity * dt * 10 + 360) % 360;

    // Bound to world map edges (world = 3600 × 2400)
    const WW = 3600, WH = 2400;
    if (this.x < 20)      this.x = 20;
    if (this.x > WW - 20) this.x = WW - 20;
    if (this.y < 20)      this.y = 20;
    if (this.y > WH - 20) this.y = WH - 20;

    this.updateLatLon();
    this.generateTrajectoryForecast(vectorField, simTimeHours);
  }

  updateLatLon() {
    // Map pixels to simulated Lat/Lon in Antarctic region (around -64° S, 72° E)
    this.lat = -64.382 - (this.y / 1000) * 0.5;
    this.lon = 72.821 + (this.x / 1000) * 0.8;
  }

  generateTrajectoryForecast(vectorField, currentSimHours) {
    this.trajectoryForecast = [];
    const forecastHours = [2, 6, 12, 24];
    let simX = this.x;
    let simY = this.y;

    for (let h of forecastHours) {
      // Numerical integration step for forecast
      const timeStep = h / 4;
      for (let s = 0; s < 4; s++) {
        const futureTime = currentSimHours + (h * s) / 4;
        const oVel = vectorField.getVelocityAt(simX, simY, futureTime);
        const radW = (vectorField.windDirection * Math.PI) / 180;
        const wMS = (vectorField.windSpeed * 1000) / 3600;
        const fVx = oVel.u * this.currentResponse * 12 + Math.cos(radW) * wMS * this.windResponse * 2;
        const fVy = oVel.v * this.currentResponse * 12 + Math.sin(radW) * wMS * this.windResponse * 2;
        simX += fVx * timeStep * 1.5;
        simY += fVy * timeStep * 1.5;
      }

      this.trajectoryForecast.push({
        hour: h,
        x: simX,
        y: simY,
        lat: -64.382 - (simY / 1000) * 0.5,
        lon: 72.821 + (simX / 1000) * 0.8
      });
    }
  }

  setManualTarget(x, y) {
    this.manualTarget = { x, y };
  }
}
