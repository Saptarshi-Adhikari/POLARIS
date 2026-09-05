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

function computeLookAheadTarget(shipPos, waypoints, lookAheadDist) {
  if (!waypoints || waypoints.length === 0) {
    return { x: shipPos.x, y: shipPos.y, segIdx: 0 };
  }
  if (waypoints.length === 1) {
    return { x: waypoints[0].x, y: waypoints[0].y, segIdx: 0 };
  }

  // 1. Find nearest point on the polyline to the ship (segment + t)
  let bestSegIdx = 0, bestT = 0, minDist = Infinity;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const A = waypoints[i], B = waypoints[i + 1];
    const AB = { x: B.x - A.x, y: B.y - A.y };
    const AP = { x: shipPos.x - A.x, y: shipPos.y - A.y };
    const segLenSq = AB.x * AB.x + AB.y * AB.y || 1e-6;
    const t = Math.max(0, Math.min(1, (AP.x * AB.x + AP.y * AB.y) / segLenSq));
    const proj = { x: A.x + t * AB.x, y: A.y + t * AB.y };
    const d = Math.hypot(shipPos.x - proj.x, shipPos.y - proj.y);
    if (d < minDist) { minDist = d; bestSegIdx = i; bestT = t; }
  }

  // 2. Walk forward along the polyline from that point by lookAheadDist
  let remaining = lookAheadDist;
  let segIdx = bestSegIdx;
  let curPoint = {
    x: waypoints[segIdx].x + bestT * (waypoints[segIdx + 1].x - waypoints[segIdx].x),
    y: waypoints[segIdx].y + bestT * (waypoints[segIdx + 1].y - waypoints[segIdx].y),
  };

  while (segIdx < waypoints.length - 1) {
    const A = curPoint, B = waypoints[segIdx + 1];
    const segDist = Math.hypot(B.x - A.x, B.y - A.y);
    if (segDist >= remaining) {
      const ratio = remaining / segDist;
      return {
        x: A.x + ratio * (B.x - A.x),
        y: A.y + ratio * (B.y - A.y),
        segIdx,
      };
    }
    remaining -= segDist;
    curPoint = B;
    segIdx++;
  }
  // Ran off the end of the path — target is the final waypoint
  return { x: waypoints[waypoints.length - 1].x, y: waypoints[waypoints.length - 1].y, segIdx: waypoints.length - 1 };
}

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

  // NOTE: setRouteWaypoints is defined once below (around line 359).
  // A duplicate was removed from here to avoid confusion.

  setManualControls({ throttle, rudder, mode }) {
    if (throttle !== undefined) this.throttle = Math.max(0, Math.min(100, parseFloat(throttle)));
    if (rudder !== undefined) this.rudder = Math.max(-35, Math.min(35, parseFloat(rudder)));
    if (mode !== undefined) this.mode = mode;
  }

  update(dt, vectorField, simTimeHours, state, icebergs = []) {
    if (!state || dt <= 0) return;

    // Nomoto parameters (tuned for realistic vessel maneuvering response)
    const nomotoT = 3.0; // Time constant (seconds)
    const nomotoK = 1.0;  // Gain constant
    const maxTurnRateDeg = 15.0; // Max turn rate: 15 degrees/sec

    // Sync controls from central state
    const maxSpeed    = state.vessel?.maxSpeed ?? 10;     // SU/sec
    const dragCoeff   = state.vessel?.dragCoefficient ?? 0.05;
    const mass        = state.vessel?.mass ?? 1.0;          // normalized (1.0)
    const isAutopilot = state.vessel?.autopilot ?? true;

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

    // --- Hard Runtime Safety & Predictive Emergency Avoidance Check ---
    if (isAutopilot && Array.isArray(icebergs) && icebergs.length > 0) {
      this.checkEmergencyAvoidance(dt, icebergs, state);
    }

    // --- Autopilot Steering & Braking ---
    if (isAutopilot && this.routeWaypoints.length > 0) {
      this.updateAutopilotSteering(dt, state, icebergs, maxSpeed, vectorField, simTimeHours);
    } else {
      this.desiredThrottle = state.vessel?.throttle ?? 0;
      this.rudder = state.vessel?.rudder ?? 0;
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
    const enginePowerMultiplier = state?.vessel?.enginePower || 1.0;
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
    const oceanVel = (vectorField && typeof vectorField.getVelocityAt === 'function')
      ? vectorField.getVelocityAt(this.x, this.y, simTimeHours, state)
      : { u: vectorField?.u || 0, v: vectorField?.v || 0 };
    const currentInfluence = 0.8;
    // Current coupling: ocean velocity contributes directly to forces
    const currentCoupling = 4.0;
    fx += oceanVel.u * currentCoupling * currentInfluence;
    fy += oceanVel.v * currentCoupling * currentInfluence;

    // d) Wind Force
    if (state?.environment?.wind?.enabled) {
      const radWind = (state.environment.wind.direction * Math.PI) / 180;
      const windMS = state.environment.wind.speed / 3.6;
      const windDrag = 0.1;
      const windCoupling = 0.25;
      fx += Math.cos(radWind) * windMS * windCoupling * windDrag;
      fy += Math.sin(radWind) * windMS * windCoupling * windDrag;
    }

    // e) Sea Ice Resistance
    let iceConcentration = 0.0;
    if (state?.environment?.seaIce?.enabled && typeof vectorField?.getSeaIceConcentration === 'function') {
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
    if (!Number.isFinite(this.heading) || isNaN(this.heading)) {
      this.heading = Number.isFinite(this.lastValidHeading) ? this.lastValidHeading : 0;
    }
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
      // Safety envelope: iceberg visual radius (1.25x) + ship hull (15) + margin (12)
      const safeDist = (ice.collisionRadius || 20) * 1.25 + this.collisionRadius + 12;

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

    // Continuous 2D World Wrapping (3600 x 2400)
    const WORLD_W = 3600;
    const WORLD_H = 2400;
    if (this.x < 0)       this.x += WORLD_W;
    if (this.x > WORLD_W) this.x -= WORLD_W;
    if (this.y < 0)       this.y += WORLD_H;
    if (this.y > WORLD_H) this.y -= WORLD_H;

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
    if (state?.vessel) state.vessel.heading = this.heading;
  }

  setRouteWaypoints(waypoints) {
    if (!waypoints || waypoints.length === 0) return;
    this.routeWaypoints = waypoints;
    this.waypointIndex = 0;
    this.targetWaypoint = waypoints[0];
    this._activeRouteId = null; // force resync check to re-validate on next frame
  }

  updateAutopilotSteering(dt, state, icebergs, maxSpeed, vectorField, simTimeHours) {
    const activeRoute = state?.navigation?.activeRoute;
    if (activeRoute && activeRoute.waypoints && activeRoute.waypoints.length > 0) {
      const routeChanged =
        !this._activeRouteId ||
        this._activeRouteId !== activeRoute.id ||
        this.routeWaypoints !== activeRoute.waypoints;

      if (routeChanged) {
        this._activeRouteId = activeRoute.id;
        this.routeWaypoints = activeRoute.waypoints;
        const initialLookAhead = Math.max(50, Math.hypot(this.vx, this.vy) * 2.5);
        const initTargetObj = computeLookAheadTarget({ x: this.x, y: this.y }, this.routeWaypoints, initialLookAhead);
        this.waypointIndex = initTargetObj.segIdx;
        this.targetWaypoint = { x: initTargetObj.x, y: initTargetObj.y };
      }
    }

    if (!this.routeWaypoints || this.routeWaypoints.length === 0) return;

    const currentSpeed = Math.hypot(this.vx, this.vy);
    const waypoints = this.routeWaypoints;
    const numWps = waypoints.length;

    // Look-Ahead adaptation: shrink look-ahead near destination and near obstacles
    const directDestinationDistance = Math.hypot(waypoints[numWps - 1].x - this.x, waypoints[numWps - 1].y - this.y);
    let baseLookAhead = Math.max(50, currentSpeed * 2.5);
    if (directDestinationDistance <= 250) {
      baseLookAhead = Math.min(baseLookAhead, Math.max(20, directDestinationDistance * 0.5));
    }
    
    // Obstacle proximity look-ahead clamping (prevent corner cutting around icebergs)
    let minIceDist = Infinity;
    if (Array.isArray(icebergs)) {
      for (const ice of icebergs) {
        const d = Math.hypot(this.x - ice.x, this.y - ice.y) - (ice.collisionRadius || 50);
        if (d < minIceDist) minIceDist = d;
      }
    }
    if (minIceDist < 200) {
      const hazardFactor = Math.max(0.35, minIceDist / 200.0);
      baseLookAhead = Math.max(25, baseLookAhead * hazardFactor);
    }
    const lookAheadDist = baseLookAhead;

    // Polyline projection look-ahead target selection
    const lookAheadTargetObj = computeLookAheadTarget({ x: this.x, y: this.y }, waypoints, lookAheadDist);
    this.targetWaypoint = { x: lookAheadTargetObj.x, y: lookAheadTargetObj.y };
    this.waypointIndex = lookAheadTargetObj.segIdx;

    // 1. Compute true route progress distance and remaining path distance
    let currentSegmentIndex = Math.min(this.waypointIndex, numWps - 2);
    if (currentSegmentIndex < 0) currentSegmentIndex = 0;

    let segmentStart = waypoints[currentSegmentIndex] || { x: this.x, y: this.y };
    let segmentEnd = waypoints[Math.min(currentSegmentIndex + 1, numWps - 1)] || segmentStart;

    const dxSeg = segmentEnd.x - segmentStart.x;
    const dySeg = segmentEnd.y - segmentStart.y;
    const segLength = Math.hypot(dxSeg, dySeg);

    let projectionT = 0.0;
    if (segLength > 1.0) {
      const dxShip = this.x - segmentStart.x;
      const dyShip = this.y - segmentStart.y;
      projectionT = Math.max(0.0, Math.min(1.0, (dxShip * dxSeg + dyShip * dySeg) / (segLength * segLength)));
    }

    let accumulatedBefore = 0.0;
    for (let i = 0; i < currentSegmentIndex; i++) {
      accumulatedBefore += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
    }

    let totalRouteLength = accumulatedBefore;
    for (let i = currentSegmentIndex; i < numWps - 1; i++) {
      totalRouteLength += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
    }

    const routeProgressDistance = accumulatedBefore + projectionT * segLength;

    let accumulatedAfter = 0.0;
    for (let i = currentSegmentIndex + 1; i < numWps - 1; i++) {
      accumulatedAfter += Math.hypot(waypoints[i + 1].x - waypoints[i].x, waypoints[i + 1].y - waypoints[i].y);
    }
    const remainingRouteDistance = (1.0 - projectionT) * segLength + accumulatedAfter;

    let routeProgressFraction = totalRouteLength > 1.0 ? Math.min(1.0, Math.max(0.0, routeProgressDistance / totalRouteLength)) : 0.0;

    // Direct destination distance arrival check
    const arrivalRadius = Math.max(35, currentSpeed * 1.5);
    const arrivalSpeedThreshold = 3.5;

    if (directDestinationDistance <= arrivalRadius && currentSpeed <= arrivalSpeedThreshold) {
      this.autopilotStatus = 'ARRIVED';
      this.desiredThrottle = 0;
      state.vessel.throttle = 0;
      state.vessel.rudder = 0;
      this.rudder = 0;
      if (activeRoute) {
        activeRoute.routeProgressFraction = 1.0;
      }
      return;
    }

    // Do not set progress fraction to 1.0 prematurely until ARRIVED condition is met
    if (directDestinationDistance > arrivalRadius) {
      routeProgressFraction = Math.min(0.94, routeProgressFraction);
    }
    if (activeRoute) {
      activeRoute.routeProgressFraction = routeProgressFraction;
      activeRoute.remainingRouteDistance = remainingRouteDistance;
      activeRoute.directDestinationDistance = directDestinationDistance;
    }

    const targetDx = this.targetWaypoint.x - this.x;
    const targetDy = this.targetWaypoint.y - this.y;
    const distToTarget = Math.hypot(targetDx, targetDy);

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

    const absXte = Math.abs(xte);

    // Hysteresis recovery flag maintenance
    if (!this._inRecoveryMode) {
      if (absXte >= 80.0) {
        this._inRecoveryMode = true;
      }
    } else {
      if (absXte <= 45.0) {
        this._inRecoveryMode = false;
      }
    }

    // Guidance mode state machine with hysteresis and explicit priority hierarchy
    const finalApproachDistThreshold = 250.0;
    const captureDistThreshold = 100.0;
    const arrivalRadiusThreshold = 35.0;
    const arrivalSpeedThresholdVal = 3.5;

    let targetMode = 'NORMAL_TRACKING';
    if (directDestinationDistance <= arrivalRadiusThreshold && currentSpeed <= arrivalSpeedThresholdVal) {
      targetMode = 'ARRIVED';
    } else if (directDestinationDistance <= captureDistThreshold || (remainingRouteDistance <= captureDistThreshold && directDestinationDistance <= 150.0)) {
      targetMode = 'DESTINATION_CAPTURE';
    } else if (directDestinationDistance <= finalApproachDistThreshold || remainingRouteDistance <= finalApproachDistThreshold) {
      targetMode = 'FINAL_APPROACH';
    } else if (this._inRecoveryMode || (this._currentGuidanceMode === 'ROUTE_RECOVERY' && absXte > 45.0)) {
      targetMode = 'ROUTE_RECOVERY';
    }

    this._currentGuidanceMode = targetMode;
    this.autopilotStatus = targetMode;

    if (targetMode === 'ARRIVED') {
      this.desiredThrottle = 0;
      this.throttle = 0;
      state.vessel.throttle = 0;
      state.vessel.rudder = 0;
      this.rudder = 0;
      if (activeRoute) {
        activeRoute.routeProgressFraction = 1.0;
      }
      return;
    }

    const modeConfig = {
      xteGain: targetMode === 'ROUTE_RECOVERY' ? 0.08 : 0.05,
      maxXteCorrectionDeg: targetMode === 'ROUTE_RECOVERY' ? 20.0 : 15.0,
      lookAheadMultiplier: targetMode === 'DESTINATION_CAPTURE' ? 0.4 : (targetMode === 'FINAL_APPROACH' ? 0.65 : (targetMode === 'ROUTE_RECOVERY' ? 0.75 : 1.0)),
      speedMultiplier: targetMode === 'DESTINATION_CAPTURE' ? 0.4 : (targetMode === 'FINAL_APPROACH' ? 0.65 : (targetMode === 'ROUTE_RECOVERY' ? 0.80 : 1.0))
    };

    // --- Vector-Based Guidance & Current Compensation ---
    // 1. Desired Ground Velocity Vector with Speed Profiling
    let baseGroundSpeed = maxSpeed * 0.75 * modeConfig.speedMultiplier;
    if (targetMode === 'FINAL_APPROACH') {
      const approachRatio = Math.max(0.3, directDestinationDistance / finalApproachDistThreshold);
      baseGroundSpeed = Math.max(8.0, baseGroundSpeed * approachRatio);
    } else if (targetMode === 'DESTINATION_CAPTURE') {
      const captureRatio = Math.max(0.15, directDestinationDistance / captureDistThreshold);
      baseGroundSpeed = Math.max(4.0, baseGroundSpeed * captureRatio);
    }

    const requestedGroundSpeed = Math.max(4.0, baseGroundSpeed);
    const groundDirX = distToTarget > 1e-6 ? targetDx / distToTarget : Math.cos((this.heading * Math.PI) / 180);
    const groundDirY = distToTarget > 1e-6 ? targetDy / distToTarget : Math.sin((this.heading * Math.PI) / 180);

    const desiredGroundVx = groundDirX * requestedGroundSpeed;
    const desiredGroundVy = groundDirY * requestedGroundSpeed;

    // 2. Ocean Current Vector (world units)
    // NOTE: The physics engine applies current as FORCE (coupling 4.0 × influence 0.8 = 3.2).
    // The actual terminal velocity contribution is much smaller than force × 4.0.
    // Guidance must compensate for the velocity effect, not the force magnitude.
    // A coupling of 1.0 approximates the steady-state velocity shift from the current force.
    const oceanVel = (vectorField && typeof vectorField.getVelocityAt === 'function')
      ? vectorField.getVelocityAt(this.x, this.y, simTimeHours, state)
      : { u: vectorField?.u || 0, v: vectorField?.v || 0 };
    const guidanceCurrentCoupling = 1.0;
    const currentVx = oceanVel.u * guidanceCurrentCoupling;
    const currentVy = oceanVel.v * guidanceCurrentCoupling;

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
    }

    // Desired Heading Through Water (radians -> degrees)
    let desiredHeadingRad = Math.atan2(desiredWaterVy, desiredWaterVx);
    let desiredHeadingDeg = (desiredHeadingRad * 180 / Math.PI + 360) % 360;

    // Apply Stanley Cross-Track Correction to heading
    // XTE sign convention (proven with numerical test):
    //   xte > 0 → ship is to the LEFT of route (north in Y-down when route goes east)
    //   xte < 0 → ship is to the RIGHT of route
    // rawCorr sign: atan(gain * xte / speed) has same sign as xte.
    // To correct LEFT-of-route (xte > 0), we need positive heading correction (turn CW/right).
    // Therefore xteCorr = +rawCorr (NOT -rawCorr which was the bug).
    let xteCorr = 0.0;
    if (absXte > 1.5 && !this._inEmergencyAvoidance && state?.navigation?.navigationMode !== 'AVOIDANCE' && minIceDist >= 150) {
      const rawCorr = Math.atan((modeConfig.xteGain * xte) / Math.max(1.0, currentSpeed)) * 180 / Math.PI;
      xteCorr = Math.max(-modeConfig.maxXteCorrectionDeg, Math.min(modeConfig.maxXteCorrectionDeg, rawCorr));
    }

    let targetAngleDeg = (desiredHeadingDeg + xteCorr + 360) % 360;
    this.targetHeading = targetAngleDeg;
    if (state.vessel) state.vessel.targetHeading = targetAngleDeg;

    let angleDiff = targetAngleDeg - this.heading;
    while (angleDiff > 180) angleDiff -= 360;
    while (angleDiff < -180) angleDiff += 360;

    const steeringGain = 1.6;
    if (!this._inEmergencyAvoidance) {
      this.rudder = Math.max(-35, Math.min(35, angleDiff * steeringGain));
    }
    if (state.vessel) state.vessel.rudder = this.rudder;

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
      recovery_correction_deg: targetMode === 'ROUTE_RECOVERY' ? xteCorr : 0,
      final_target_heading_deg: targetAngleDeg,
      signed_heading_error_deg: angleDiff,
      rudder_before_clamp_deg: angleDiff * steeringGain,
      rudder_after_clamp_deg: this.rudder,
      route_progress_distance: routeProgressDistance,
      remaining_route_distance: remainingRouteDistance,
      direct_destination_distance: directDestinationDistance
    };

    this.crossTrackError = xte;
    this.crabAngle = (Math.atan2(-currentVy, maxSpeed) * 180 / Math.PI);
    this.driftCorrection = xteCorr;

    // NAV_DEBUG telemetry — logs at ~500ms intervals when window.NAV_DEBUG is true
    if (typeof window !== 'undefined' && window.NAV_DEBUG) {
      if (!this._lastLoggedHeading) this._lastLoggedHeading = targetAngleDeg;
      const dHdgLog = Math.abs((targetAngleDeg - this._lastLoggedHeading + 180) % 360 - 180);
      if (dHdgLog > 25.0) {
        console.log(`[DESIRED_HEADING_CHANGE] prev=${this._lastLoggedHeading.toFixed(1)}° new=${targetAngleDeg.toFixed(1)}° reason=${this._inEmergencyAvoidance ? 'AVOIDANCE' : (targetMode === 'ROUTE_RECOVERY' ? 'RECOVERY' : 'TRACKING')}`);
        this._lastLoggedHeading = targetAngleDeg;
      }

      if (!this._lastNavDebugTime || performance.now() - this._lastNavDebugTime > 500) {
        this._lastNavDebugTime = performance.now();
        const wps = this.routeWaypoints;
        console.log(
          `NAV_DEBUG\n` +
          `  pos=(${this.x.toFixed(1)}, ${this.y.toFixed(1)}) hdg=${this.heading.toFixed(1)}°\n` +
          `  vel=(${this.vx.toFixed(2)}, ${this.vy.toFixed(2)}) spd=${currentSpeed.toFixed(1)}\n` +
          `  target=(${this.targetWaypoint.x.toFixed(1)}, ${this.targetWaypoint.y.toFixed(1)}) dist=${distToTarget.toFixed(1)}\n` +
          `  wpIdx=${this.waypointIndex} routeLen=${wps.length}\n` +
          `  wp[0]=(${wps[0]?.x?.toFixed(1)},${wps[0]?.y?.toFixed(1)}) wp[last]=(${wps[wps.length-1]?.x?.toFixed(1)},${wps[wps.length-1]?.y?.toFixed(1)})\n` +
          `  XTE=${xte.toFixed(2)} xteCorr=${xteCorr.toFixed(2)}°\n` +
          `  desiredHdg=${desiredHeadingDeg.toFixed(1)}° targetHdg=${targetAngleDeg.toFixed(1)}°\n` +
          `  hdgErr=${angleDiff.toFixed(1)}° rudder=${this.rudder.toFixed(1)}°\n` +
          `  current=(${currentVx.toFixed(2)}, ${currentVy.toFixed(2)})\n` +
          `  mode=${targetMode} progress=${(routeProgressFraction * 100).toFixed(1)}%`
        );
      }
    }

    if (state.vessel) {
      state.vessel.crossTrackError = this.crossTrackError;
      state.vessel.environmentalResistance = this.environmentalResistance;
    }

    // Single Authoritative Throttle Pipeline:
    let finalThrottle = state.vessel?.autopilotThrottle || 65;

    // 1. Turn-Anticipation Speed Reduction (Upcoming polyline segment turn angle)
    let upcomingTurnAngleDeg = 0.0;
    if (this.waypointIndex < numWps - 1 && currentSegmentIndex + 1 < numWps - 1) {
      const seg1A = waypoints[currentSegmentIndex];
      const seg1B = waypoints[currentSegmentIndex + 1];
      const seg2B = waypoints[currentSegmentIndex + 2];
      const h1 = Math.atan2(seg1B.y - seg1A.y, seg1B.x - seg1A.x) * 180 / Math.PI;
      const h2 = Math.atan2(seg2B.y - seg1B.y, seg2B.x - seg1B.x) * 180 / Math.PI;
      let dTurn = Math.abs((h2 - h1 + 180) % 360 - 180);
      upcomingTurnAngleDeg = dTurn;
    }
    const maxTurnAngle = Math.max(Math.abs(angleDiff), upcomingTurnAngleDeg);
    if (maxTurnAngle > 90) {
      finalThrottle = Math.min(finalThrottle, 30);
    } else if (maxTurnAngle > 45) {
      finalThrottle = Math.min(finalThrottle, 55);
    } else if (maxTurnAngle > 20) {
      finalThrottle = Math.min(finalThrottle, 65);
    }

    // 2. Mode-Specific Speed / Recovery Limits
    if (targetMode === 'FINAL_APPROACH') {
      finalThrottle = Math.min(45, finalThrottle * (directDestinationDistance / finalApproachDistThreshold));
    } else if (targetMode === 'DESTINATION_CAPTURE') {
      finalThrottle = Math.min(20, finalThrottle * (directDestinationDistance / captureDistThreshold));
    } else if (targetMode === 'ROUTE_RECOVERY' || this.autopilotStatus === 'FIGHTING_CURRENT') {
      this.extraThrustMultiplier = Math.min(2.0, this.extraThrustMultiplier + 0.15 * dt);
      finalThrottle = Math.min(95, finalThrottle * this.extraThrustMultiplier);
    }

    // 3. Proximity Hazard Limits & Current-Aware Throttle Floor
    let maxDangerScore = 0;
    for (let h of this.hazards) {
      if (h.score > maxDangerScore) maxDangerScore = h.score;
    }

    // Steerage Way Minimum Throttle: Minimum throttle needed to maintain hydrodynamic rudder authority (18%)
    const minSteerageWayThrottle = 18.0;

    // Current Compensation Throttle: Thrust needed to counteract opposing current component
    const radHdg = (this.heading * Math.PI) / 180;
    const hdgX = Math.cos(radHdg);
    const hdgY = Math.sin(radHdg);

    // Current velocity vector component along ship's heading (negative = opposing current)
    const currentAlongHeading = oceanVel.u * hdgX + oceanVel.v * hdgY;
    const opposingCurrentSpeed = Math.max(0, -currentAlongHeading);

    // Physics parameters matching force loop
    const dragCoeff = state?.vessel?.dragCoefficient || 0.04;
    const enginePowerMultiplier = state?.vessel?.enginePower || 1.0;
    const maxThrustForce = dragCoeff * maxSpeed * maxSpeed * enginePowerMultiplier; // e.g. 36.0

    // Opposing force from current: opposingCurrentSpeed * (currentCoupling 4.0 * currentInfluence 0.8)
    const opposingCurrentForce = opposingCurrentSpeed * 3.2;

    let minCurrentCompensationThrottle = 0.0;
    if (opposingCurrentSpeed > 0.05 && maxThrustForce > 0) {
      // Throttle % required to balance opposing current force plus a 5% margin for positive headway
      minCurrentCompensationThrottle = Math.min(85.0, (opposingCurrentForce / maxThrustForce) * 100.0 + 5.0);
    }

    // Effective Current & Steerage Throttle Floor for non-critical hazard levels
    const effectiveCurrentFloor = Math.max(minSteerageWayThrottle, minCurrentCompensationThrottle);

    if (maxDangerScore === 4) {
      // CRITICAL HAZARD: Imminent collision — safety/emergency stop overrides current compensation
      finalThrottle = 0;
    } else if (maxDangerScore === 3) {
      // HIGH HAZARD: Cap at 15% OR current-aware floor if current would push vessel backward
      const hazardCap = 15;
      finalThrottle = Math.min(finalThrottle, Math.max(hazardCap, effectiveCurrentFloor));
    } else if (maxDangerScore === 2) {
      // MEDIUM HAZARD: Cap at 30% OR current-aware floor
      const hazardCap = 30;
      finalThrottle = Math.min(finalThrottle, Math.max(hazardCap, effectiveCurrentFloor));
    } else if (maxDangerScore === 1) {
      // LOW HAZARD: Cap at 45% OR current-aware floor
      const hazardCap = 45;
      finalThrottle = Math.min(finalThrottle, Math.max(hazardCap, effectiveCurrentFloor));
    }

    // 4. Sea Ice Concentration Limits
    if (state?.environment?.seaIce?.enabled && typeof vectorField?.getSeaIceConcentration === 'function') {
      const iceConc = vectorField.getSeaIceConcentration(this.x, this.y);
      if (iceConc > 0.2) {
        finalThrottle = Math.min(finalThrottle, (1 - iceConc) * 50 + 10);
      }
    }

    // Single Authoritative Assignment
    this.desiredThrottle = Math.max(0, finalThrottle);
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

  checkEmergencyAvoidance(dt, icebergs, state) {
    const spd = Math.hypot(this.vx, this.vy);
    const lookAheadSec = 6.0;
    const radHeading = (this.heading * Math.PI) / 180;
    const fwdX = Math.cos(radHeading);
    const fwdY = Math.sin(radHeading);

    let closestUnsafeIce = null;
    let minUnsafeDist = Infinity;

    for (let ice of icebergs) {
      const safeRadius = (ice.collisionRadius || 20) + this.collisionRadius + 25.0;
      
      let unsafeDetected = false;
      const numSteps = 10;
      for (let s = 1; s <= numSteps; s++) {
        const t = (s / numSteps) * lookAheadSec;
        const px = this.x + (spd > 1 ? this.vx : fwdX * 20) * t;
        const py = this.y + (spd > 1 ? this.vy : fwdY * 20) * t;
        const icePx = ice.x + ice.vx * t;
        const icePy = ice.y + ice.vy * t;
        const dist = Math.hypot(px - icePx, py - icePy);

        if (dist < safeRadius) {
          unsafeDetected = true;
          if (dist < minUnsafeDist) {
            minUnsafeDist = dist;
            closestUnsafeIce = ice;
          }
          break;
        }
      }
    }

    if (closestUnsafeIce) {
      if (state && state.navigation) {
        state.navigation.routeInvalid = true;
        state.navigation.navigationMode = 'AVOIDANCE';
      }
      
      const dx = closestUnsafeIce.x - this.x;
      const dy = closestUnsafeIce.y - this.y;
      const cross = fwdX * dy - fwdY * dx;

      // Proportional avoidance turn angle (20° to 45° max)
      const avoidOffsetDeg = (cross > 0 ? -1 : 1) * Math.min(45, Math.max(20, (60.0 - minUnsafeDist) * 1.0));
      const targetAvoidHeading = (this.heading + avoidOffsetDeg + 360) % 360;

      let angleDiff = targetAvoidHeading - this.heading;
      while (angleDiff > 180) angleDiff -= 360;
      while (angleDiff < -180) angleDiff += 360;

      this.rudder = Math.max(-35, Math.min(35, angleDiff * 1.5));
      if (state && state.vessel) {
        state.vessel.rudder = this.rudder;
        state.vessel.targetHeading = targetAvoidHeading;
      }
      this._inEmergencyAvoidance = true;
      return;
    }

    this._inEmergencyAvoidance = false;
  }
}
