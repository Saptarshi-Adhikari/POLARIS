/**
 * POLARIS DIGITAL TWIN - Vessel Dynamics & Steering Simulator
 *
 * UNIT SYSTEM: Simulation Units (SU)
 * - Position: SU (world coords, 0..3600 x 0..2400)
 * - Velocity: SU/second
 * - Acceleration: SU/second²
 * - Mass: normalized (1.0 = standard vessel)
 * - Forces: normalized
 * - NO arbitrary SIMULATION_MASS_SCALE multipliers
 *
 * Physics balance:
 *   F_thrust_max = dragCoeff * maxSpeed^2
 *   => terminal velocity at full throttle = sqrt(maxThrust / dragCoeff) = maxSpeed
 */

export class Ship {
  constructor({ x = 400, y = 1800, heading = 330 }) {
    this.name = 'V-ALPHA';
    this.x = x;
    this.y = y;
    this.lat = -64.35;
    this.lon = 72.5;

    this.collisionRadius = 15;

    // Controls
    this.throttle = 65; // % (0 - 100)
    this.rudder = 0;    // degrees (-35 to +35)
    this.heading = heading; // degrees (0 to 360)

    // Telemetry
    this.speedKnots = 0;
    this.fuel = 78.4;
    this.fuelBurnRatePerDay = 14.2;
    this.mode = 'AUTOPILOT';

    // Physics state vectors
    this.vx = 0;
    this.vy = 0;
    this.angularVelocity = 0; // deg/sec

    // Navigation
    this.targetWaypoint = null;
    this.waypointIndex = 0;
    this.routeWaypoints = [];

    // Stuck & Progress Detection
    this.stuckCounter = 0;
    this.lastDistToWaypoint = Infinity;
    this.extraThrustMultiplier = 1.0;

    // Fuel System
    this.fuel = 100.0;
    this.maxFuel = 100.0;

    // Smooth Throttle & Speed Control
    this.desiredThrottle = 65;
    this.desiredSpeed = 0.0;
    this.hazards = [];

    // Drift Compensation & Autopilot Status
    this.crossTrackError = 0.0;
    this.crabAngle = 0.0;
    this.driftCorrection = 0.0;
    this.autopilotStatus = 'NORMAL_TRACKING';
    this.environmentalResistance = 0.0;
  }

  setRouteWaypoints(waypoints) {
    this.routeWaypoints = waypoints;
    this.waypointIndex = 0;
    this.targetWaypoint = waypoints.length > 0 ? waypoints[0] : null;
  }

  setManualControls({ throttle, rudder, mode }) {
    if (throttle !== undefined) this.throttle = Math.max(0, Math.min(100, parseFloat(throttle)));
    if (rudder !== undefined) this.rudder = Math.max(-35, Math.min(35, parseFloat(rudder)));
    if (mode !== undefined) this.mode = mode;
  }

  update(dt, vectorField, simTimeHours, state, icebergs = []) {
    if (!state || dt <= 0) return;

    // Sync controls from central state
    const maxSpeed    = state.vessel.maxSpeed;     // SU/sec
    const dragCoeff   = state.vessel.dragCoefficient;
    const mass        = state.vessel.mass;          // normalized (1.0)
    const isAutopilot = state.vessel.autopilot;

    // --- Update Proximity & Predictive Danger System ---
    this.hazards = [];
    for (let ice of icebergs) {
      const hazardInfo = this.calculateHazardDanger(ice);
      if (hazardInfo.score > 0) {
        this.hazards.push({
          id: ice.id,
          name: ice.name,
          level: hazardInfo.level,
          score: hazardInfo.score,
          distance: hazardInfo.distance,
          closingSpeed: hazardInfo.closingSpeed,
          size: ice.size >= 120 ? 'MASSIVE' : (ice.size >= 60 ? 'LARGE' : (ice.size >= 30 ? 'MEDIUM' : 'SMALL'))
        });
      }
    }
    this.hazards.sort((a, b) => b.score - a.score || a.distance - b.distance);

    // --- Autopilot Steering & Braking ---
    if (isAutopilot && this.routeWaypoints.length > 0) {
      this.updateAutopilotSteering(dt, state, icebergs, maxSpeed, vectorField, simTimeHours);
    } else {
      this.desiredThrottle = state.vessel.throttle;
      this.rudder = state.vessel.rudder;
    }

    // Smooth acceleration and deceleration
    const accelRate = this.desiredThrottle > this.throttle ? 1.5 : 3.5; // Decelerate faster for safety
    this.throttle += (this.desiredThrottle - this.throttle) * dt * accelRate;
    this.throttle = Math.max(0, Math.min(100, this.throttle));

    // Force 0 throttle if out of fuel
    if (this.fuel <= 0) {
      this.throttle = 0;
    }

    // --- 1. Angular Physics (smooth heading rotation) ---
    // Turning rate is proportional to rudder angle and forward speed
    const currentSpeed = Math.hypot(this.vx, this.vy);
    // At max speed, full rudder gives 30 deg/sec. At zero speed, minimal turning.
    const speedRatio = Math.min(1.0, currentSpeed / (maxSpeed * 0.3 + 1.0));
    const targetAngularVel = (this.rudder / 35) * 30 * Math.max(0.2, speedRatio);
    
    // Smooth angular velocity change (angular inertia)
    const angularAcceleration = (targetAngularVel - this.angularVelocity) * 3.0;
    this.angularVelocity += angularAcceleration * dt;
    this.angularVelocity *= 0.85; // angular damping
    
    this.heading = (this.heading + this.angularVelocity * dt + 360) % 360;

    // --- 2. Linear Physics Forces (Simulation Units) ---
    const radHeading = (this.heading * Math.PI) / 180;
    const forwardX = Math.cos(radHeading);
    const forwardY = Math.sin(radHeading);

    // a) Thrust Force — balanced so terminal velocity at full throttle = maxSpeed
    //    F_drag = dragCoeff * v^2  =>  F_thrust = dragCoeff * maxSpeed^2 for balance
    // a) Thrust Force — balanced so terminal velocity at full throttle = maxSpeed
    //    F_drag = dragCoeff * v^2  =>  F_thrust = dragCoeff * maxSpeed^2 for balance
    const enginePowerMultiplier = state.vessel.enginePower || 1.0;
    const maxThrustForce = dragCoeff * maxSpeed * maxSpeed * enginePowerMultiplier;
    // If fuel is empty, engine provides 0 thrust
    const thrustMag = this.fuel > 0 ? ((this.throttle / 100) * maxThrustForce * this.extraThrustMultiplier) : 0;
    let fx = forwardX * thrustMag;
    let fy = forwardY * thrustMag;

    // b) Drag Force (quadratic, opposing velocity direction)
    const speedSq = this.vx * this.vx + this.vy * this.vy;
    if (speedSq > 0.001) {
      const spd = Math.sqrt(speedSq);
      const dragMag = dragCoeff * speedSq;
      fx -= (this.vx / spd) * dragMag;
      fy -= (this.vy / spd) * dragMag;
    }

    // c) Ocean Current Influence
    // Currents exert a mild drift force on the vessel (not instant velocity override)
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours, state);
    // Scale: oceanVel is in m/s. Map to ~SU/sec where 1 m/s ocean ~ 8 SU/sec force coupling
    const currentCoupling = 4.0; // Reduced to 4.0 for controllability
    fx += oceanVel.u * currentCoupling;
    fy += oceanVel.v * currentCoupling;

    // d) Wind Force (much smaller than propulsion)
    if (state.environment.wind.enabled) {
      const radWind = (state.environment.wind.direction * Math.PI) / 180;
      // Wind: 45 km/h ~ 12.5 m/s, ~2% coupling to vessel
      const windMS = state.environment.wind.speed / 3.6;
      const windCoupling = 0.25; // Reduced for balance
      fx += Math.cos(radWind) * windMS * windCoupling;
      fy += Math.sin(radWind) * windMS * windCoupling;
    }

    // e) Sea Ice Resistance (additional drag in ice)
    if (state.environment.seaIce.enabled && vectorField.getSeaIceConcentration) {
      const iceConc = vectorField.getSeaIceConcentration(this.x, this.y);
      if (iceConc > 0.1 && speedSq > 0.001) {
        const spd = Math.sqrt(speedSq);
        const iceResist = dragCoeff * speedSq * iceConc * 1.5 * state.environment.seaIce.resistanceFactor;
        fx -= (this.vx / spd) * iceResist;
        fy -= (this.vy / spd) * iceResist;
      }
    }

    // --- 3. Integrate (Semi-Implicit Euler) ---
    // F = m*a => a = F/m  (mass = 1.0 normalized)
    const ax = fx / mass;
    const ay = fy / mass;

    this.vx += ax * dt;
    this.vy += ay * dt;

    // Safety clamp: prevent runaway velocity (cap at 2x maxSpeed)
    const velMag = Math.hypot(this.vx, this.vy);
    if (velMag > maxSpeed * 2) {
      this.vx = (this.vx / velMag) * maxSpeed * 2;
      this.vy = (this.vy / velMag) * maxSpeed * 2;
    }

    // NaN/Infinity guard
    if (!Number.isFinite(this.vx)) this.vx = 0;
    if (!Number.isFinite(this.vy)) this.vy = 0;

    // --- 4. Integrate Position with Continuous Collision Detection ---
    let proposedX = this.x + this.vx * dt;
    let proposedY = this.y + this.vy * dt;
    let collisionOccurred = false;

    for (let ice of icebergs) {
      // Find closest point on segment to iceberg center
      const dx = proposedX - this.x;
      const dy = proposedY - this.y;
      const segLen2 = dx * dx + dy * dy;
      let t = 0;
      if (segLen2 > 0) {
        t = Math.max(0, Math.min(1, ((ice.x - this.x) * dx + (ice.y - this.y) * dy) / segLen2));
      }
      const closestX = this.x + t * dx;
      const closestY = this.y + t * dy;
      
      const distToIce = Math.hypot(ice.x - closestX, ice.y - closestY);
      const safeDist = ice.collisionRadius + this.collisionRadius;

      if (distToIce < safeDist) {
        // Collision! Slide along collision boundary normal
        collisionOccurred = true;
        let nx = closestX - ice.x;
        let ny = closestY - ice.y;
        const nLen = Math.hypot(nx, ny);
        if (nLen > 0) {
          nx /= nLen;
          ny /= nLen;
        } else {
          nx = 1;
          ny = 0;
        }
        
        // Reposition ship to safety (slightly outside boundary)
        proposedX = ice.x + nx * (safeDist + 0.5);
        proposedY = ice.y + ny * (safeDist + 0.5);
        
        // Deflect velocity: Remove only velocity component pointing directly into the iceberg
        const vDotN = this.vx * nx + this.vy * ny;
        if (vDotN < 0) {
          this.vx = this.vx - vDotN * nx;
          this.vy = this.vy - vDotN * ny;
        }
        break; 
      }
    }

    this.x = proposedX;
    this.y = proposedY;

    if (!Number.isFinite(this.x)) this.x = 400;
    if (!Number.isFinite(this.y)) this.y = 1800;

    // Update display speed (convert SU/sec to approximate knots: 1.8 SU/sec ≈ 1 knot)
    this.speedKnots = Math.hypot(this.vx, this.vy) / 1.8;

    // Boundary Clamping (WORLD coordinates)
    const WORLD_W = 3600;
    const WORLD_H = 2400;
    const MARGIN  = 50;
    if (this.x < MARGIN)           { this.x = MARGIN;           this.vx *= -0.3; }
    if (this.x > WORLD_W - MARGIN) { this.x = WORLD_W - MARGIN; this.vx *= -0.3; }
    if (this.y < MARGIN)           { this.y = MARGIN;           this.vy *= -0.3; }
    if (this.y > WORLD_H - MARGIN) { this.y = WORLD_H - MARGIN; this.vy *= -0.3; }

    // Fuel burn system - consumption scales with engine throttle & power multiplier
    const baseConsumption = 0.005; // Base idle burn rate
    const throttleBurn = 0.045 * (this.throttle / 100) * enginePowerMultiplier;
    const totalBurnRate = (baseConsumption + throttleBurn) * dt * (vectorField.stormMode ? 1.3 : 1.0);
    this.fuel = Math.max(0, this.fuel - totalBurnRate);
    this.fuelBurnRatePerDay = (baseConsumption + throttleBurn) * 12.0; // Scaled for display

    // Lat/Lon mapping from world position
    this.lat = -64.382 - (this.y / 1000) * 0.5;
    this.lon =  72.821 + (this.x / 1000) * 0.8;

    // Write heading back to state for UI
    state.vessel.heading = this.heading;
  }

  updateAutopilotSteering(dt, state, icebergs, maxSpeed, vectorField, simTimeHours) {
    if (!this.targetWaypoint) return;

    const dx = this.targetWaypoint.x - this.x;
    const dy = this.targetWaypoint.y - this.y;
    const dist = Math.hypot(dx, dy);

    // Stuck / Progress Detection
    if (this.lastDistToWaypoint === Infinity) {
      this.lastDistToWaypoint = dist;
    }
    if (dist < this.lastDistToWaypoint - 1.0) {
      this.lastDistToWaypoint = dist;
      this.stuckCounter = 0;
      this.extraThrustMultiplier = 1.0;
    } else {
      this.stuckCounter += dt;
      if (this.stuckCounter > 6.0) {
        this.extraThrustMultiplier = Math.min(3.0, this.extraThrustMultiplier + 0.15 * dt);
        if (this.stuckCounter > 12.0) {
          state.navigation.routeInvalid = true;
          this.stuckCounter = 0;
        }
      }
    }

    // Arrival radius: larger when moving fast to prevent overshoot
    const currentSpeed = Math.hypot(this.vx, this.vy);
    const arrivalRadius = Math.max(40, currentSpeed * 3);

    if (dist < arrivalRadius) {
      if (this.waypointIndex < this.routeWaypoints.length - 1) {
        this.waypointIndex++;
        this.targetWaypoint = this.routeWaypoints[this.waypointIndex];
        this.lastDistToWaypoint = Infinity;
        this.stuckCounter = 0;
        this.extraThrustMultiplier = 1.0;
      } else {
        // Destination reached
        this.desiredThrottle = 0;
        state.vessel.throttle = 0;
      }
      return;
    }

    // Segment tracking calculation
    let segmentStart = state.navigation.startPoint || { x: this.x, y: this.y };
    if (this.waypointIndex > 0 && this.routeWaypoints[this.waypointIndex - 1]) {
      segmentStart = this.routeWaypoints[this.waypointIndex - 1];
    }
    const segmentEnd = this.targetWaypoint;

    const dxSeg = segmentEnd.x - segmentStart.x;
    const dySeg = segmentEnd.y - segmentStart.y;
    const segLength = Math.hypot(dxSeg, dySeg);

    let routeAngleRad = Math.atan2(dy, dx);
    let ux = dx / dist;
    let uy = dy / dist;
    let xte = 0.0;

    if (segLength > 1.0) {
      ux = dxSeg / segLength;
      uy = dySeg / segLength;
      routeAngleRad = Math.atan2(dySeg, dxSeg);
      
      // Vector from segment start to ship
      const dxShip = this.x - segmentStart.x;
      const dyShip = this.y - segmentStart.y;
      
      // Cross-track error (perpendicular distance to route segment line)
      xte = dxShip * uy - dyShip * ux;
    }

    // Heading error
    const routeHdgDeg = (routeAngleRad * 180 / Math.PI + 360) % 360;
    let headingError = routeHdgDeg - this.heading;
    while (headingError > 180) headingError -= 360;
    while (headingError < -180) headingError += 360;

    // Get environmental velocities to calculate drift compensation (crabbing)
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours, state);
    const currentCoupling = 4.0;
    let driftX = oceanVel.u * currentCoupling;
    let driftY = oceanVel.v * currentCoupling;
    if (state.environment.wind.enabled) {
      const radWind = (state.environment.wind.direction * Math.PI) / 180;
      const windMS = state.environment.wind.speed / 3.6;
      driftX += Math.cos(radWind) * windMS * 0.25;
      driftY += Math.sin(radWind) * windMS * 0.25;
    }

    const driftMag = Math.hypot(driftX, driftY);
    this.environmentalResistance = driftMag;

    // Calculate lateral environmental component relative to route direction
    const driftLateral = driftX * uy - driftY * ux;

    // Closed-loop Cross-track steering correction (Stanley-like controller)
    let xteCorr = 0.0;
    if (Math.abs(xte) > 1.5) {
      const xteGain = 0.18; 
      xteCorr = Math.atan(xte * xteGain) * 180 / Math.PI;
      xteCorr = Math.max(-45, Math.min(45, xteCorr));
    }

    // Crab angle calculation to offset lateral drift
    const vShip = Math.max(2.0, Math.hypot(this.vx, this.vy));
    let crabAngleDeg = 0.0;
    if (driftMag > 1.5 && Math.abs(driftLateral) < vShip) {
      const crabRad = Math.asin(-driftLateral / vShip);
      crabAngleDeg = (crabRad * 180) / Math.PI;
      crabAngleDeg = Math.max(-30, Math.min(30, crabAngleDeg));
    }

    // Combine desired segment angle, XTE correction, and crab angle
    let targetAngle = routeHdgDeg + xteCorr + crabAngleDeg;
    let angleDiff = targetAngle - this.heading;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    // Proportional rudder control
    const steeringGain = 1.6;
    this.rudder = Math.max(-35, Math.min(35, angleDiff * steeringGain));
    state.vessel.rudder = this.rudder;

    // Track metrics
    this.crossTrackError = xte;
    this.crabAngle = crabAngleDeg;
    this.driftCorrection = xteCorr;

    // Autopilot state detection & transitions
    if (Math.abs(xte) > 15.0) {
      this.highXteTicks = (this.highXteTicks || 0) + 1;
    } else {
      this.highXteTicks = 0;
    }

    if (Math.abs(xte) > 40.0) {
      this.autopilotStatus = 'ROUTE_RECOVERY';
    } else if (this.highXteTicks > 4 && driftMag > 4.5) {
      this.autopilotStatus = 'FIGHTING_CURRENT';
    } else if (driftMag > 1.5 || Math.abs(crabAngleDeg) > 2.0) {
      this.autopilotStatus = 'COMPENSATING_DRIFT';
    } else {
      this.autopilotStatus = 'NORMAL_TRACKING';
    }

    // Write all telemetry properties to central state for rendering/UI
    state.vessel.crossTrackError = this.crossTrackError;
    state.vessel.crabAngle = this.crabAngle;
    state.vessel.driftCorrection = this.driftCorrection;
    state.vessel.autopilotStatus = this.autopilotStatus;
    state.vessel.environmentalResistance = this.environmentalResistance;

    // Autopilot cruise throttle - starts with set autopilotThrottle
    let targetThrottle = state.vessel.autopilotThrottle || 65;

    // Adaptive speed/throttle: increase propulsion if Fighting Current or recovering
    if (this.autopilotStatus === 'FIGHTING_CURRENT' || this.autopilotStatus === 'ROUTE_RECOVERY') {
      this.extraThrustMultiplier = Math.min(2.0, this.extraThrustMultiplier + 0.15 * dt);
      targetThrottle = Math.min(95, targetThrottle * this.extraThrustMultiplier);
    }

    // 1. Slow down for sharp turns to avoid overshoot
    if (Math.abs(angleDiff) > 45) {
      targetThrottle = Math.max(20, targetThrottle * 0.35);
    } else if (Math.abs(angleDiff) > 20) {
      targetThrottle = Math.max(30, targetThrottle * 0.65);
    }

    // 2. Slow down based on proximity hazard system
    let maxDangerScore = 0;
    for (let h of this.hazards) {
      if (h.score > maxDangerScore) {
        maxDangerScore = h.score;
      }
    }
    if (maxDangerScore === 4) { // CRITICAL
      targetThrottle = 0; // Emergency slowdown
    } else if (maxDangerScore === 3) { // HIGH
      targetThrottle = Math.min(targetThrottle, 15);
    } else if (maxDangerScore === 2) { // MEDIUM
      targetThrottle = Math.min(targetThrottle, 30);
    } else if (maxDangerScore === 1) { // LOW
      targetThrottle = Math.min(targetThrottle, 45);
    }

    // 3. Slow down in high sea ice concentration
    if (state.environment.seaIce.enabled && vectorField.getSeaIceConcentration) {
      const iceConc = vectorField.getSeaIceConcentration(this.x, this.y);
      if (iceConc > 0.2) {
        targetThrottle = Math.min(targetThrottle, (1 - iceConc) * 50 + 10);
      }
    }

    // Never reverse due to autopilot controls
    this.desiredThrottle = Math.max(0, targetThrottle);
    this.desiredSpeed = (this.desiredThrottle / 100) * maxSpeed;
  }

  calculateHazardDanger(ice) {
    const dist = Math.hypot(this.x - ice.x, this.y - ice.y);
    const effectiveDistance = dist - ice.collisionRadius - this.collisionRadius;
    
    // Predictive collision check
    const rvx = this.vx - ice.vx;
    const rvy = this.vy - ice.vy;
    const rvSpeed = Math.hypot(rvx, rvy);
    
    let isClosing = false;
    let timeToCollision = Infinity;
    if (rvSpeed > 0.05) {
      const dx = ice.x - this.x;
      const dy = ice.y - this.y;
      const dot = rvx * dx + rvy * dy;
      if (dot > 0) {
        isClosing = true;
        timeToCollision = (dx * dx + dy * dy) / dot;
      }
    }
    
    // Check if hazard is ahead of the ship
    const radHeading = (this.heading * Math.PI) / 180;
    const forwardX = Math.cos(radHeading);
    const forwardY = Math.sin(radHeading);
    const dx = ice.x - this.x;
    const dy = ice.y - this.y;
    const distToIce = Math.hypot(dx, dy);
    let isAhead = false;
    if (distToIce > 0.1) {
      const dotAhead = (dx / distToIce) * forwardX + (dy / distToIce) * forwardY;
      if (dotAhead > 0.4) {
        isAhead = true;
      }
    }

    let dangerScore = 0;
    if (effectiveDistance < 40) {
      dangerScore = 4; // CRITICAL
    } else if (effectiveDistance < 100) {
      dangerScore = 3; // HIGH
    } else if (effectiveDistance < 200) {
      dangerScore = 2; // MEDIUM
    } else if (effectiveDistance < 320) {
      dangerScore = 1; // LOW
    }
    
    if (isAhead && isClosing) {
      if (timeToCollision < 8) {
        dangerScore = Math.max(dangerScore, 4);
      } else if (timeToCollision < 15) {
        dangerScore = Math.max(dangerScore, 3);
      } else if (timeToCollision < 25) {
        dangerScore = Math.max(dangerScore, 2);
      }
    }
    
    const levels = ['SAFE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return {
      level: levels[dangerScore],
      score: dangerScore,
      distance: effectiveDistance,
      closingSpeed: isClosing ? rvSpeed : 0
    };
  }
}
