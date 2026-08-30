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

    this.collisionRadius = Math.max(10, this.size / 35);

    // Interactive state
    this.isDragging = false;
    this.isSelected = false;
    this.manualTarget = null; // { x, y } target override

    // AI Forecast trajectories (array of { hour, x, y, lat, lon })
    this.trajectoryForecast = [];
  }

  update(dt, vectorField, simTimeHours, state) {
    if (this.isDragging) return;
    if (!state || !state.icebergs.enabled) return;

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
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours, state);

    // 2. Get local wind velocity
    let windVx = 0;
    let windVy = 0;
    if (state.environment.wind.enabled) {
        const radWind = (state.environment.wind.direction * Math.PI) / 180;
        const windMS = (state.environment.wind.speed * 1000) / 3600;
        windVx = Math.cos(radWind) * windMS;
        windVy = Math.sin(radWind) * windMS;
    }

    // 3. Wave drift effect
    const waveDrift = 1.2 * 0.1; // fallback if waveHeight moved

    // 4. Combine physics forces: V_iceberg = alpha * V_current + beta * V_wind + gamma * V_wave
    const driftMultiplier = state.icebergs.driftStrength || 1.0;
    
    const targetVx = (oceanVel.u * this.currentResponse * 12 + windVx * this.windResponse * 2 + waveDrift * this.waveResponse) * driftMultiplier;
    const targetVy = (oceanVel.v * this.currentResponse * 12 + windVy * this.windResponse * 2 + waveDrift * this.waveResponse) * driftMultiplier;

    // Smooth inertia acceleration
    this.vx += (targetVx - this.vx) * Math.min(1, dt * 2);
    this.vy += (targetVy - this.vy) * Math.min(1, dt * 2);

    // Position update
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Heading rotation
    this.heading = (this.heading + this.angularVelocity * dt * 10 + 360) % 360;

    // Wrap around continuous 2D world edges (world = 3600 × 2400)
    const WW = 3600, WH = 2400;
    if (this.x < 0)  this.x += WW;
    if (this.x > WW) this.x -= WW;
    if (this.y < 0)  this.y += WH;
    if (this.y > WH) this.y -= WH;

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
        const oVel = vectorField.getVelocityAt(simX, simY, futureTime, vectorField.lastState); // state is cached in vectorField
        
        let windVx = 0;
        let windVy = 0;
        if (vectorField.lastState && vectorField.lastState.environment.wind.enabled) {
            const radW = (vectorField.lastState.environment.wind.direction * Math.PI) / 180;
            const wMS = (vectorField.lastState.environment.wind.speed * 1000) / 3600;
            windVx = Math.cos(radW) * wMS;
            windVy = Math.sin(radW) * wMS;
        }
        
        const fVx = oVel.u * this.currentResponse * 12 + windVx * this.windResponse * 2;
        const fVy = oVel.v * this.currentResponse * 12 + windVy * this.windResponse * 2;
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

  getPositionAt(futureTimeHours) {
    const defaultX = Number.isFinite(this.x) ? this.x : 0;
    const defaultY = Number.isFinite(this.y) ? this.y : 0;
    const points = [{ timeHours: 0, x: defaultX, y: defaultY, uncertainty: 0 }];
    
    if (this.mlTrajectory && this.mlTrajectory.length > 0) {
      for (let f of this.mlTrajectory) {
        if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
          const t = Number.isFinite(f.time) ? f.time : 0;
          points.push({ timeHours: t / 60, x: f.x, y: f.y, uncertainty: f.uncertainty || (t * 0.1) });
        }
      }
    }
    if (this.trajectoryForecast && this.trajectoryForecast.length > 0) {
      for (let f of this.trajectoryForecast) {
        if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
          const h = Number.isFinite(f.hour) ? f.hour : 0;
          if (points.some(p => Math.abs(p.timeHours - h) < 0.05)) continue;
          points.push({ timeHours: h, x: f.x, y: f.y, uncertainty: h * 2.5 });
        }
      }
    }
    points.sort((a, b) => a.timeHours - b.timeHours);

    const targetTime = Number.isFinite(futureTimeHours) ? Math.max(0, futureTimeHours) : 0;

    if (points.length === 1 || targetTime <= 0) return points[0];
    if (targetTime >= points[points.length - 1].timeHours) {
      return points[points.length - 1];
    }

    for (let i = 0; i < points.length - 1; i++) {
      const pA = points[i];
      const pB = points[i + 1];
      if (targetTime >= pA.timeHours && targetTime <= pB.timeHours) {
        const timeDiff = pB.timeHours - pA.timeHours;
        const t = timeDiff > 0.0001 ? (targetTime - pA.timeHours) / timeDiff : 0;
        return {
          x: pA.x + t * (pB.x - pA.x),
          y: pA.y + t * (pB.y - pA.y),
          uncertainty: pA.uncertainty + t * (pB.uncertainty - pA.uncertainty)
        };
      }
    }
    return points[points.length - 1];
  }
}
