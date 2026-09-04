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
    this.lastValidX = x;
    this.lastValidY = y;
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
    this._activeRouteId = null;
  }

  setManualControls({ throttle, rudder, mode }) {
    if (throttle !== undefined) this.throttle = Math.max(0, Math.min(100, parseFloat(throttle)));
    if (rudder !== undefined) this.rudder = Math.max(-35, Math.min(35, parseFloat(rudder)));
    if (mode !== undefined) this.mode = mode;
  }

  update(dt, vectorField, simTimeHours, state, icebergs = []) {
    if (!state || dt <= 0) return;

    // Nomoto parameters
    const nomotoT = 15.0; // Time constant (seconds)
    const nomotoK = 0.5;  // Gain constant
    const maxTurnRateDeg = 3.0; // Max turn rate: 3 degrees/sec (approx 0.052 rad/sec)

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
    const accelRate = this.desiredThrottle > this.throttle ? 1.5 : 3.5;
    this.throttle += (this.desiredThrottle - this.throttle) * dt * accelRate;
    this.throttle = Math.max(0, Math.min(100, this.throttle));

    // Force 0 throttle if out of fuel
    if (this.fuel <= 0) {
      this.throttle = 0;
    }

    // --- 1. Nomoto Steering Dynamics ---
    // Convert rudder to normalized rudder command [-1, 1] (full port to full starboard)
    const rudderCommand = this.rudder / 35.0;

    // d²ψ/dt² = (K * δ - dψ/dt) / T
    // Positive rudder commands clockwise (+ heading rate) turn
    const angularAcceleration = (nomotoK * rudderCommand * maxTurnRateDeg - this.angularVelocity) / nomotoT;
    this.angularVelocity += angularAcceleration * dt;
    this.angularVelocity = Math.max(-maxTurnRateDeg, Math.min(maxTurnRateDeg, this.angularVelocity));
    this.heading = (this.heading + this.angularVelocity * dt + 360) % 360;

    // --- 2. Linear Physics Forces (Newtonian Thrust + Drag + Environment) ---
    const radHeading = (this.heading * Math.PI) / 180;
    const forwardX = Math.cos(radHeading);
    const forwardY = Math.sin(radHeading);

    // a) Engine Thrust
    const enginePowerMultiplier = state.vessel.enginePower || 1.0;
    const maxThrustForce = dragCoeff * maxSpeed * maxSpeed * enginePowerMultiplier;
    const thrustMag = this.fuel > 0 ? ((this.throttle / 100) * maxThrustForce * this.extraThrustMultiplier) : 0;
    let fx = forwardX * thrustMag;
    let fy = forwardY * thrustMag;

    // b) Hydrodynamic Drag
    const speedSq = this.vx * this.vx + this.vy * this.vy;
    if (speedSq > 0.001) {
      const spd = Math.sqrt(speedSq);
      const dragMag = dragCoeff * speedSq;
      fx -= (this.vx / spd) * dragMag;
      fy -= (this.vy / spd) * dragMag;
    }

    // c) Ocean Current Influence
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours, state);
    const currentInfluence = 0.8;
    // Current coupling: ocean velocity contributes directly to forces
    const currentCoupling = 4.0;
    fx += oceanVel.u * currentCoupling * currentInfluence;
    fy += oceanVel.v * currentCoupling * currentInfluence;

    // d) Wind Force
    if (state.environment.wind.enabled) {
      const radWind = (state.environment.wind.direction * Math.PI) / 180;
      const windMS = state.environment.wind.speed / 3.6;
      const windDrag = 0.1;
      const windCoupling = 0.25;
      fx += Math.cos(radWind) * windMS * windCoupling * windDrag;
      fy += Math.sin(radWind) * windMS * windCoupling * windDrag;
    }

    // e) Sea Ice Resistance
    let iceConcentration = 0.0;
    if (state.environment.seaIce.enabled && vectorField.getSeaIceConcentration) {
      iceConcentration = vectorField.getSeaIceConcentration(this.x, this.y);
      if (iceConcentration > 0.1 && speedSq > 0.001) {
        const spd = Math.sqrt(speedSq);
        const iceResist = dragCoeff * speedSq * iceConcentration * 1.5 * state.environment.seaIce.resistanceFactor;
        const iceDragMultiplier = 1.0 + (iceConcentration * 5.0);
        fx -= (this.vx / spd) * iceResist * iceDragMultiplier;
        fy -= (this.vy / spd) * iceResist * iceDragMultiplier;
      }
    }

    // --- 3. Integrate Equations of Motion (F = m*a with Added Mass) ---
    const addedMassMultiplier = 1.2;
    const effectiveMass = mass * addedMassMultiplier;
    const ax = fx / effectiveMass;
    const ay = fy / effectiveMass;

    this.vx += ax * dt;
    this.vy += ay * dt;

    // Dynamic speed limit clamping due to sea ice concentration
    const speedReductionFactor = 1.0 - (iceConcentration * 0.9);
    const maxSpeedInIce = maxSpeed * speedReductionFactor;
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed > maxSpeedInIce) {
      const scale = maxSpeedInIce / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    // NaN / State Integrity Protection
    if (!Number.isFinite(this.vx) || isNaN(this.vx)) this.vx = 0;
    if (!Number.isFinite(this.vy) || isNaN(this.vy)) this.vy = 0;
    if (!Number.isFinite(this.x) || isNaN(this.x)) this.x = this.lastValidX;
    if (!Number.isFinite(this.y) || isNaN(this.y)) this.y = this.lastValidY;
    if (!Number.isFinite(this.heading) || isNaN(this.heading)) this.heading = heading;
    if (!Number.isFinite(this.angularVelocity) || isNaN(this.angularVelocity)) this.angularVelocity = 0;

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

    if (Number.isFinite(proposedX) && Number.isFinite(proposedY)) {
      this.x = proposedX;
      this.y = proposedY;
      this.lastValidX = proposedX;
      this.lastValidY = proposedY;
    } else {
      console.warn("Invalid proposed position, falling back to last valid coordinates:", proposedX, proposedY);
      this.x = this.lastValidX;
      this.y = this.lastValidY;
    }

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
    const activeRoute = state?.navigation?.activeRoute;
    if (activeRoute && activeRoute.waypoints && activeRoute.waypoints.length > 0) {
      if (!this._activeRouteId || this._activeRouteId !== activeRoute.id) {
        this._activeRouteId = activeRoute.id;
        this.routeWaypoints = activeRoute.waypoints;
        this.waypointIndex = 0;
        this.targetWaypoint = this.routeWaypoints[0];
      }
    }

    if (!this.routeWaypoints || this.routeWaypoints.length === 0) return;

    const currentSpeed = Math.hypot(this.vx, this.vy);
    const lookAheadDist = Math.max(50, currentSpeed * 2.5);

    // Monotonic progress: advance waypointIndex along polyline
    while (this.waypointIndex < this.routeWaypoints.length - 1) {
      const wp = this.routeWaypoints[this.waypointIndex];
      const wpDist = Math.hypot(wp.x - this.x, wp.y - this.y);
      if (wpDist < lookAheadDist) {
        this.waypointIndex++;
        this.targetWaypoint = this.routeWaypoints[this.waypointIndex];
        this.lastDistToWaypoint = Infinity;
        this.stuckCounter = 0;
        this.extraThrustMultiplier = 1.0;
      } else {
        break;
      }
    }

    const targetDx = this.targetWaypoint.x - this.x;
    const targetDy = this.targetWaypoint.y - this.y;
    const distToTarget = Math.hypot(targetDx, targetDy);

    const arrivalRadius = Math.max(35, currentSpeed * 2);
    if (this.waypointIndex === this.routeWaypoints.length - 1 && distToTarget < arrivalRadius) {
      this.desiredThrottle = 0;
      state.vessel.throttle = 0;
      return;
    }

    let segmentStart = state.navigation.startPoint || { x: this.x, y: this.y };
    if (this.waypointIndex > 0 && this.routeWaypoints[this.waypointIndex - 1]) {
      segmentStart = this.routeWaypoints[this.waypointIndex - 1];
    }
    const segmentEnd = this.targetWaypoint;

    const dxSeg = segmentEnd.x - segmentStart.x;
    const dySeg = segmentEnd.y - segmentStart.y;
    const segLength = Math.hypot(dxSeg, dySeg);

    let ux = targetDx / (distToTarget || 1);
    let uy = targetDy / (distToTarget || 1);
    let xte = 0.0;

    if (segLength > 1.0) {
      ux = dxSeg / segLength;
      uy = dySeg / segLength;
      const dxShip = this.x - segmentStart.x;
      const dyShip = this.y - segmentStart.y;
      xte = dxShip * uy - dyShip * ux;
    }

    // Hysteresis mode management
    const absXte = Math.abs(xte);
    if (!this._inRecoveryMode) {
      if (absXte >= 80.0) {
        this._inRecoveryMode = true;
      }
    } else {
      if (absXte <= 45.0) {
        this._inRecoveryMode = false;
      }
    }

    const modeConfig = this._inRecoveryMode ? {
      xteGain: 0.08,
      maxXteCorrectionDeg: 20.0,
      lookAheadMultiplier: 0.75,
      speedMultiplier: 0.80
    } : {
      xteGain: 0.05,
      maxXteCorrectionDeg: 15.0,
      lookAheadMultiplier: 1.0,
      speedMultiplier: 1.0
    };

    // --- Vector-Based Guidance & Current Compensation ---
    // 1. Desired Ground Velocity Vector
    const requestedGroundSpeed = Math.max(10.0, maxSpeed * 0.75 * modeConfig.speedMultiplier);
    const groundDirX = distToTarget > 1e-6 ? targetDx / distToTarget : Math.cos((this.heading * Math.PI) / 180);
    const groundDirY = distToTarget > 1e-6 ? targetDy / distToTarget : Math.sin((this.heading * Math.PI) / 180);

    const desiredGroundVx = groundDirX * requestedGroundSpeed;
    const desiredGroundVy = groundDirY * requestedGroundSpeed;

    // 2. Ocean Current Vector (world units)
    const oceanVel = vectorField.getVelocityAt(this.x, this.y, simTimeHours, state);
    const currentCoupling = 4.0;
    const currentVx = oceanVel.u * currentCoupling;
    const currentVy = oceanVel.v * currentCoupling;

    // 3. Required Water Relative Velocity: v_water = v_ground - v_current
    let desiredWaterVx = desiredGroundVx - currentVx;
    let desiredWaterVy = desiredGroundVy - currentVy;

    let requiredWaterSpeed = Math.hypot(desiredWaterVx, desiredWaterVy);
    if (requiredWaterSpeed > maxSpeed && requiredWaterSpeed > 1e-6) {
      const scale = maxSpeed / requiredWaterSpeed;
      desiredWaterVx *= scale;
      desiredWaterVy *= scale;
      requiredWaterSpeed = maxSpeed;
      this.autopilotStatus = 'FIGHTING_CURRENT';
    } else {
      this.autopilotStatus = this._inRecoveryMode ? 'ROUTE_RECOVERY' : 'NORMAL_TRACKING';
    }

    // Desired Heading Through Water (radians -> degrees)
    let desiredHeadingRad = Math.atan2(desiredWaterVy, desiredWaterVx);
    let desiredHeadingDeg = (desiredHeadingRad * 180 / Math.PI + 360) % 360;

    // Apply Stanley Cross-Track Correction to heading
    let xteCorr = 0.0;
    if (absXte > 1.5) {
      const rawCorr = Math.atan((modeConfig.xteGain * xte) / Math.max(1.0, currentSpeed)) * 180 / Math.PI;
      xteCorr = Math.max(-modeConfig.maxXteCorrectionDeg, Math.min(modeConfig.maxXteCorrectionDeg, -rawCorr));
    }

    let targetAngleDeg = (desiredHeadingDeg + xteCorr + 360) % 360;
    this.targetHeading = targetAngleDeg;
    state.vessel.targetHeading = targetAngleDeg;

    let angleDiff = targetAngleDeg - this.heading;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    const steeringGain = 1.6;
    this.rudder = Math.max(-35, Math.min(35, angleDiff * steeringGain));
    state.vessel.rudder = this.rudder;

    this.guidanceBreakdown = {
      lookahead_target: { x: segmentEnd.x, y: segmentEnd.y },
      route_tangent_heading_deg: (Math.atan2(dySeg, dxSeg) * 180 / Math.PI + 360) % 360,
      desired_ground_heading_deg: (Math.atan2(desiredGroundVy, desiredGroundVx) * 180 / Math.PI + 360) % 360,
      desired_water_heading_deg: desiredHeadingDeg,
      xte_gain_used: modeConfig.xteGain,
      max_correction_used_deg: modeConfig.maxXteCorrectionDeg,
      lookahead_multiplier_used: modeConfig.lookAheadMultiplier,
      requested_speed_multiplier: modeConfig.speedMultiplier,
      raw_xte_correction_deg: xteCorr,
      bounded_xte_correction_deg: xteCorr,
      recovery_correction_deg: this._inRecoveryMode ? xteCorr : 0,
      final_target_heading_deg: targetAngleDeg,
      signed_heading_error_deg: angleDiff,
      rudder_before_clamp_deg: angleDiff * steeringGain,
      rudder_after_clamp_deg: this.rudder
    };

    this.crossTrackError = xte;
    this.crabAngle = (Math.atan2(-currentVy, maxSpeed) * 180 / Math.PI);
    this.driftCorrection = xteCorr;

    state.vessel.crossTrackError = this.crossTrackError;
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
    if (state.environment && state.environment.seaIce && state.environment.seaIce.enabled && vectorField.getSeaIceConcentration) {
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
