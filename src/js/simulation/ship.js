/**
 * POLARIS DIGITAL TWIN - Vessel Dynamics & Steering Simulator
 */

export class Ship {
  constructor({ x = 200, y = 500, heading = 45 }) {
    this.name = 'V-ALPHA';
    this.x = x;
    this.y = y;
    this.lat = -64.35;
    this.lon = 72.5;

    // Controls
    this.throttle = 65; // % (0 - 100)
    this.rudder = 0; // degrees (-35 to +35)
    this.heading = heading; // degrees (0 to 360)
    this.maxSpeedKnots = 22.0; // knots max speed
    this.speedKnots = 12.4; // current speed in knots

    // Telemetry & Specs
    this.fuel = 78.4; // %
    this.enginePower = 64; // %
    this.fuelBurnRatePerDay = 14.2; // tonnes per day
    this.mode = 'AUTOPILOT'; // 'AUTOPILOT' or 'MANUAL'

    // Physics vectors
    this.vx = 0;
    this.vy = 0;
    this.targetWaypoint = null;
    this.waypointIndex = 0;
    this.routeWaypoints = [];
  }

  setRouteWaypoints(waypoints) {
    this.routeWaypoints = waypoints;
    this.waypointIndex = 0;
    if (waypoints.length > 0) {
      this.targetWaypoint = waypoints[0];
    }
  }

  setManualControls({ throttle, rudder, mode }) {
    if (throttle !== undefined) this.throttle = Math.max(0, Math.min(100, parseFloat(throttle)));
    if (rudder !== undefined) this.rudder = Math.max(-35, Math.min(35, parseFloat(rudder)));
    if (mode !== undefined) this.mode = mode;
  }

  update(dt, vectorField, simTimeHours) {
    if (this.mode === 'AUTOPILOT' && this.routeWaypoints.length > 0) {
      this.updateAutopilotSteering(dt);
    }

    // 1. Calculate Engine Thrust Speed
    const targetSpeedKnots = (this.throttle / 100) * this.maxSpeedKnots;
    this.speedKnots += (targetSpeedKnots - this.speedKnots) * Math.min(1, dt * 1.5);

    // Convert knots to screen pixels per sec (1 knot = ~1.2 px/s)
    const thrustSpeedPx = this.speedKnots * 1.8;
    const radHeading = (this.heading * Math.PI) / 180;
    const thrustVx = Math.cos(radHeading) * thrustSpeedPx;
    const thrustVy = Math.sin(radHeading) * thrustSpeedPx;

    // 2. Rudder turning effect
    const turnRate = (this.rudder / 35) * (this.speedKnots / this.maxSpeedKnots) * 45; // deg/sec
    this.heading = (this.heading + turnRate * dt + 360) % 360;

    // 3. Environmental Forces (Current + Wind drift)
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours);
    const currentVx = oceanVel.u * 8.0;
    const currentVy = oceanVel.v * 8.0;

    const radWind = (vectorField.windDirection * Math.PI) / 180;
    const windMS = (vectorField.windSpeed * 1000) / 3600;
    const windDriftVx = Math.cos(radWind) * windMS * 0.15;
    const windDriftVy = Math.sin(radWind) * windMS * 0.15;

    // 4. Combined Vessel Velocity
    this.vx = thrustVx + currentVx + windDriftVx;
    this.vy = thrustVy + currentVy + windDriftVy;

    // Position Update
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ── Boundary Clamping: keep ship inside world ocean ───────────────
    const WORLD_W = 3600;
    const WORLD_H = 2400;
    const MARGIN  = 30;
    this.x = Math.max(MARGIN, Math.min(WORLD_W - MARGIN, this.x));
    this.y = Math.max(MARGIN, Math.min(WORLD_H - MARGIN, this.y));
    // Absorb velocity so ship doesn't bounce against walls
    if (this.x <= MARGIN || this.x >= WORLD_W - MARGIN) this.vx = 0;
    if (this.y <= MARGIN || this.y >= WORLD_H - MARGIN) this.vy = 0;

    // Fuel Burn calculation
    const burnIncrement = (this.throttle / 100) * 0.00015 * dt * (vectorField.stormMode ? 1.4 : 1.0);
    this.fuel = Math.max(0, this.fuel - burnIncrement);
    this.fuelBurnRatePerDay = 8.0 + (this.throttle / 100) * 10.0 + (vectorField.stormMode ? 3.5 : 0);

    // Update Lat / Lon
    this.lat = -64.382 - (this.y / 1000) * 0.5;
    this.lon = 72.821 + (this.x / 1000) * 0.8;
  }

  updateAutopilotSteering(dt) {
    if (!this.targetWaypoint) return;

    const dx = this.targetWaypoint.x - this.x;
    const dy = this.targetWaypoint.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 25) {
      // Advance to next waypoint
      this.waypointIndex = (this.waypointIndex + 1) % this.routeWaypoints.length;
      this.targetWaypoint = this.routeWaypoints[this.waypointIndex];
    } else {
      const desiredAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      let angleDiff = desiredAngle - this.heading;

      // Normalize angle difference to [-180, 180]
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;

      // Adjust rudder towards desired heading
      this.rudder = Math.max(-35, Math.min(35, angleDiff * 1.2));
    }
  }
}
