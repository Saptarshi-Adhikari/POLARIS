export class AutonomousController {
  constructor(engine) {
    this.engine = engine;
    this.isActive = false; // Toggle for AI Autonomous control
    this.lastEvaluationTime = 0;
    this.evaluationInterval = 2000; // Evaluate every 2 seconds
    
    // Command state
    this.currentCommand = {
      mode: "MAINTAIN_COURSE",
      targetHeading: 0,
      targetSpeed: 0,
      throttleLimit: 100,
      reroute: false,
      confidence: 1.0,
      reason: "System initializing. Awaiting active navigation."
    };
    
    // Smooth targets/Hysteresis
    this.lastTargetHeading = 0;
    this.lastTargetSpeed = 0;
    
    // History log (max 5)
    this.history = [];
  }

  toggleActive(forceState) {
    this.isActive = forceState !== undefined ? forceState : !this.isActive;
    this.logDecision(this.currentCommand.mode, "AI Autonomous Mode toggled " + (this.isActive ? "ACTIVE" : "STANDBY"));
  }

  evaluate(currentTime) {
    if (currentTime - this.lastEvaluationTime < this.evaluationInterval) return;
    this.lastEvaluationTime = currentTime;

    const ship = this.engine.ship;
    const state = this.engine.state;
    const env = state.environment;
    const aiNav = this.engine.aiNavigator;
    const client = this.engine.aiClient;

    if (!state.navigation.isNavigating || !state.navigation.destinationPoint) {
      this.currentCommand = {
        mode: "STANDBY",
        targetHeading: Math.round(ship.heading),
        targetSpeed: 0,
        throttleLimit: 0,
        reroute: false,
        confidence: client && client.status === "ONLINE" ? client.confidence : 1.0,
        reason: "Waiting for start and destination node selection."
      };
      return;
    }

    // Adopt AI recommended route strategy if autonomous controller is active
    if (this.isActive) {
      let preferredMode = aiNav && aiNav.aiRecommendation ? aiNav.aiRecommendation.recommendedMode : null;
      if (this.engine.missionPlan && this.engine.missionPlan.recommendedStrategy) {
        preferredMode = this.engine.missionPlan.recommendedStrategy;
      }
      if (preferredMode && state.navigation.mode !== preferredMode) {
        state.navigation.mode = preferredMode;
        state.navigation.routeInvalid = true; // Trigger reroute
      }
    }

    // Default cruise targets
    let mode = "SAFE_TO_PROCEED";
    let targetSpeed = 22; // knots
    let throttleLimit = 65; // %
    let reroute = false;
    let reason = "Navigation corridor is clear.";

    // Get current waypoint target direction
    let targetHdg = Math.round(ship.heading);
    if (ship.targetWaypoint) {
      const dx = ship.targetWaypoint.x - ship.x;
      const dy = ship.targetWaypoint.y - ship.y;
      targetHdg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360);
    }

    // 1. Analyze ML Forecast Corridor Intersections
    let maxMLDanger = 0;
    let mlIntersectCount = 0;
    let closestMLDist = Infinity;

    for (let ice of this.engine.icebergs) {
      if (ice.mlTrajectory && ice.mlTrajectory.length > 0) {
        // Evaluate ML points relative to ship and route waypoints
        for (let pt of ice.mlTrajectory) {
          const distToShip = Math.hypot(pt.x - ship.x, pt.y - ship.y);
          if (distToShip < closestMLDist) {
            closestMLDist = distToShip;
          }
          // Check corridor proximity
          if (ship.routeWaypoints && ship.routeWaypoints.length > ship.waypointIndex) {
            const remaining = [{ x: ship.x, y: ship.y }, ...ship.routeWaypoints.slice(ship.waypointIndex)];
            for (let i = 0; i < remaining.length - 1; i++) {
              const pA = remaining[i];
              const pB = remaining[i+1];
              const segX = pB.x - pA.x;
              const segY = pB.y - pA.y;
              const len2 = segX*segX + segY*segY;
              let t = 0;
              if (len2 > 0) t = Math.max(0, Math.min(1, ((pt.x - pA.x)*segX + (pt.y - pA.y)*segY)/len2));
              const cx = pA.x + t * segX;
              const cy = pA.y + t * segY;
              const corridorDist = Math.hypot(pt.x - cx, pt.y - cy);
              const limit = ice.collisionRadius + 15 + 30 + pt.uncertainty * 0.4;
              if (corridorDist < limit) {
                mlIntersectCount++;
                if (pt.time <= 10) maxMLDanger = Math.max(maxMLDanger, 3); // High immediate risk
                else if (pt.time <= 30) maxMLDanger = Math.max(maxMLDanger, 2); // Medium risk
                else maxMLDanger = Math.max(maxMLDanger, 1); // Low risk
              }
            }
          }
        }
      }
    }

    // 2. Autopilot turn assessments
    let upcomingTurnAngle = 0;
    if (ship.routeWaypoints && ship.routeWaypoints.length > ship.waypointIndex + 1) {
      const wp1 = ship.routeWaypoints[ship.waypointIndex];
      const wp2 = ship.routeWaypoints[ship.waypointIndex + 1];
      const heading1 = Math.atan2(wp1.y - ship.y, wp1.x - ship.x);
      const heading2 = Math.atan2(wp2.y - wp1.y, wp2.x - wp1.x);
      upcomingTurnAngle = Math.abs((heading2 - heading1) * 180 / Math.PI);
      if (upcomingTurnAngle > 180) upcomingTurnAngle = 360 - upcomingTurnAngle;
    }

    // 3. Proximity hazard evaluation
    let maxPhysicsDanger = 0;
    for (let h of ship.hazards || []) {
      maxPhysicsDanger = Math.max(maxPhysicsDanger, h.score);
    }

    // Assess sea-ice predicted concentrations
    let maxPredictedSeaIce = env.seaIce.enabled ? env.seaIce.averageConcentration : 0.0;
    if (client && client.status === 'ONLINE' && client.seaIceForecast) {
      maxPredictedSeaIce = Math.max(
        client.seaIceForecast.ice_6h,
        client.seaIceForecast.ice_12h,
        client.seaIceForecast.ice_24h
      );
    }

    // 4. Decision logic tree (Priority Ordered)
    const ri = this.engine.riskIntelligenceEngine;
    if (ri && ri.routeExposure.maximumRisk >= 0.75) {
      this.criticalRiskTicks = (this.criticalRiskTicks || 0) + 1;
      if (this.criticalRiskTicks > 3) {
        mode = "REROUTE";
        targetSpeed = 8;
        throttleLimit = 20;
        reroute = true;
        reason = "REROUTE: Probabilistic AI Risk grid indicates CRITICAL route exposure ahead.";
        this.criticalRiskTicks = 0;
      }
    } else {
      this.criticalRiskTicks = 0;
    }

    if (mode !== "REROUTE" && ri && ri.routeExposure.maximumRisk >= 0.50 && ri.routeExposure.maximumRisk < 0.75) {
      mode = "REDUCE_SPEED";
      targetSpeed = 11;
      throttleLimit = 28;
      reason = "REDUCE SPEED: Probabilistic AI Risk grid indicates HIGH route exposure ahead.";
    }

    if (mode === "REROUTE" || (maxPhysicsDanger === 4 || (maxMLDanger === 3 && closestMLDist < 120))) {
      mode = "EMERGENCY_STOP";
      targetSpeed = 0;
      throttleLimit = 0;
      reroute = true;
      reason = "CRITICAL: Imminent collision risk detected ahead.";
    } else if (maxMLDanger === 2 && mlIntersectCount > 0) {
      mode = "REROUTE";
      targetSpeed = 10;
      throttleLimit = 25;
      reroute = true;
      reason = "REROUTE: ML predicted iceberg trajectory crosses safety corridor corridor.";
    } else if (maxPredictedSeaIce > 0.6) {
      mode = "REDUCE_SPEED";
      targetSpeed = 10;
      throttleLimit = 35;
      reroute = true;
      reason = `ML forecasts high sea ice concentration (${(maxPredictedSeaIce * 100).toFixed(0)}%) ahead. Reducing speed and prompting reroute.`;
    } else if (maxPhysicsDanger === 3 || maxMLDanger === 1) {
      mode = "REDUCE_SPEED";
      targetSpeed = 12;
      throttleLimit = 30;
      reason = "CAUTION: Moderate hazard projections. Adjusting cruise speed.";
    } else if (upcomingTurnAngle > 30) {
      mode = "ALTER_COURSE";
      targetSpeed = 15;
      throttleLimit = 40;
      reason = `Approaching sharp turn (${upcomingTurnAngle.toFixed(0)}°). Decreasing speed to stabilize steering.`;
    } else if (maxPredictedSeaIce > 0.4) {
      mode = "REDUCE_SPEED";
      targetSpeed = 14;
      throttleLimit = 45;
      reason = `Friction resistance: Navigating moderate sea ice concentration (${(maxPredictedSeaIce * 100).toFixed(0)}%).`;
    } else if (env.wind.enabled && env.wind.speed > 70) {
      mode = "MAINTAIN_COURSE";
      targetSpeed = 18;
      throttleLimit = 80; // Increase engine threshold to combat high wind shear
      reason = "Winds exceed 70 km/h. Increasing engine power threshold to counteract leeway.";
    } else {
      mode = "SAFE_TO_PROCEED";
      targetSpeed = 22;
      throttleLimit = 65;
      reason = "Nominal course metrics. Proceeding along scheduled plan.";
    }

    // 5. Apply Hysteresis to prevent command oscillations
    if (Math.abs(targetSpeed - this.lastTargetSpeed) > 1) {
      this.lastTargetSpeed = targetSpeed;
    } else {
      targetSpeed = this.lastTargetSpeed;
    }

    let hdgDiff = Math.abs(targetHdg - this.lastTargetHeading);
    if (hdgDiff > 180) hdgDiff = 360 - hdgDiff;
    if (hdgDiff > 5 || (ship.targetWaypoint && Math.hypot(ship.targetWaypoint.x - ship.x, ship.targetWaypoint.y - ship.y) < 150)) {
      this.lastTargetHeading = targetHdg;
    } else {
      targetHdg = this.lastTargetHeading;
    }

    // 6. Output structured decision command
    const newCommand = {
      mode,
      targetHeading: targetHdg,
      targetSpeed,
      throttleLimit,
      reroute,
      confidence: client && client.status === "ONLINE" ? client.confidence : 1.0,
      reason
    };

    if (newCommand.mode !== this.currentCommand.mode || reroute) {
      this.logDecision(newCommand.mode, newCommand.reason);
    }

    this.currentCommand = newCommand;

    // Apply decisions to autopilot if autonomous mode is active
    if (this.isActive) {
      state.vessel.autopilotThrottle = throttleLimit;
      if (reroute) {
        // Trigger rerouting recalculations automatically
        state.navigation.routeInvalid = true;
      }
    }
  }

  logDecision(mode, reason) {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.history.unshift({ time: timeStr, mode, reason });
    if (this.history.length > 5) {
      this.history.pop();
    }
  }
}
