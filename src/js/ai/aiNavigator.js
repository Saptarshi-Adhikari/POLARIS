import routeCalibration from '../../data/routeCalibration.json';
import { createHierarchicalPlanner } from '../pathfinding/hierarchicalPlanner.js';
import { llmCopilot } from './llmCopilot.js';
import { runRoutePlannerCore, isHardBlocked } from './routePlannerCore.js';
import { DecisionEngine } from './decisionEngine.js';
import { IcebergPredictionTracker } from './icebergPredictionTracker.js';

const hierarchicalPlanner = createHierarchicalPlanner(3600, 2400, {
  globalResolution: 40,
  localResolution: 20,
  globalCooldown: 5000,
  localUpdateInterval: 100
});

export class AINavigator {
  constructor(width = 3600, height = 2400) {
    this.width = width;
    this.height = height;
    this.riskScore = 0.14;
    this.riskLevel = 'LOW';
    this.routeConfidence = 92.4;
    this.optimalFuelRate = 12.8;
    this.currentFuelRate = 14.2;
    this.isRerouting = false;
    this.rerouteAlert = false;
    this.rerouteMessage = '';

    this.optimalRoute = [];
    this.lastValidRoute = [];
    this.hazardZones = [];
    this.riskGrid = [];

    // AI Decision Advisor & Strategy Comparison
    this.routeComparisons = null;
    this.aiRecommendation = null;
    this.lastAIRecommendTime = 0;
    this.predictionTracker = new IcebergPredictionTracker();
    this._lastStormActive = false;

    // Web Worker for off-main-thread A* route planning
    this.workerRequestId = 0;
    this.pendingWorkerRequestId = null;
    this.currentState = null;
    this.currentRealShip = null;
    this.routeWorker = null;

    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        this.routeWorker = new Worker(new URL('./routeWorker.js', import.meta.url), { type: 'module' });
        this.routeWorker.onmessage = (e) => this.handleWorkerResponse(e);
      } catch (err) {
        console.warn('Web Worker initialization fallback to synchronous mode:', err);
        this.routeWorker = null;
      }
    }

    this.initRiskGrid(20, 15);
  }

  handleWorkerResponse(e) {
    if (!e.data || e.data.requestId !== this.pendingWorkerRequestId) {
      return; // Ignore stale worker response
    }

    const { waypoints, totalDistance, maxRisk, estimatedDuration, calcTimeMs, dest } = e.data;
    this.optimalRoute = waypoints;
    this.lastRouteTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (this.currentRealShip) {
      this.lastValidRoute = waypoints;
    }

    if (this.currentState && this.currentState.navigation) {
      this.currentState.navigation.activeRoute = {
        id: `route_${Date.now()}`,
        waypoints: waypoints,
        rawPath: e.data.rawPath || waypoints,
        smoothPath: waypoints,
        status: 'valid',
        createdAt: performance.now(),
        expiresAt: performance.now() + 60000,
        totalDistance: totalDistance,
        estimatedDuration: estimatedDuration,
        maxRiskSegment: maxRisk,
        destination: dest
      };
      this.currentState.navigation.routeCalculated = true;
      this.currentState.navigation.routeInvalid = false;

      if (this.currentRealShip && this.currentRealShip.setRouteWaypoints) {
        this.currentRealShip.setRouteWaypoints(waypoints);
      }
    }
  }

  initRiskGrid(cols = 20, rows = 15) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = this.width / cols;
    this.cellH = this.height / rows;
    this.riskGrid = Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  evaluate(ship, icebergs, vectorField, simTimeHours, state) {
    if (!state) return;

    // 1. Build Risk Grid Map (world space)
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cx = c * this.cellW + this.cellW / 2;
        const cy = r * this.cellH + this.cellH / 2;
        let risk = 0;

        for (let ice of icebergs) {
          const dCurr = Math.hypot(cx - ice.x, cy - ice.y);
          const hazardRadius = (ice.size / 10) + 100;
          if (dCurr < hazardRadius * 2) {
            risk += Math.pow(1 - dCurr / (hazardRadius * 2), 2) * 0.8;
          }
        }
        this.riskGrid[r][c] = Math.min(1.0, risk);
      }
    }

    // 2. Compute Ship's Collision Risk
    let maxShipRisk = 0;
    for (let ice of icebergs) {
      const dShip = Math.hypot(ship.x - ice.x, ship.y - ice.y);
      const minDistance = (ice.size / 10) + 60;
      if (dShip < minDistance * 3) {
        const rVal = Math.pow(1 - dShip / (minDistance * 3), 1.5);
        if (rVal > maxShipRisk) maxShipRisk = rVal;
      }
    }

    if (vectorField.stormMode) maxShipRisk = Math.min(1.0, maxShipRisk + 0.35);
    this.riskScore = parseFloat(maxShipRisk.toFixed(2));

    if (this.riskScore < 0.25)      this.riskLevel = 'LOW';
    else if (this.riskScore < 0.55) this.riskLevel = 'MEDIUM';
    else if (this.riskScore < 0.8)  this.riskLevel = 'HIGH';
    else                            this.riskLevel = 'CRITICAL';

    this.routeConfidence = parseFloat(Math.max(45, 98.5 - this.riskScore * 40).toFixed(1));

    // 3. Dynamic A* Route Recalculation — only when actively navigating
    const currentTime = performance.now();
    const dest = state.navigation.destinationPoint || state.navigation.destination || { x: this.width - 400, y: 400 };
    const mode = state.navigation.mode;

    const modeChanged  = this.lastMode !== mode;
    const destChanged  = !this.lastDest || Math.hypot(this.lastDest.x - dest.x, this.lastDest.y - dest.y) > 100;
    const isNavigating = state.navigation.isNavigating;
    
    // Check if the current route is obstructed by moving icebergs
    let isObstructed = false;
    if (isNavigating && ship.routeWaypoints && ship.routeWaypoints.length > ship.waypointIndex) {
      const remainingRoute = [{x: ship.x, y: ship.y}, ...ship.routeWaypoints.slice(ship.waypointIndex)];
      
      let shipSpeed = 20.0;
      const currentSpeed = Math.hypot(ship.vx, ship.vy);
      if (currentSpeed > 5.0) {
        shipSpeed = currentSpeed;
      } else {
        const throttle = ship.throttle || 65;
        const maxSpd = (state && state.vessel && state.vessel.maxSpeed) || 30.0;
        shipSpeed = maxSpd * Math.sqrt(throttle / 100);
      }

      // Compute bounding box for remaining route + 200 SU margin
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const pt of remainingRoute) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
      minX -= 200; minY -= 200; maxX += 200; maxY += 200;

      // Spatial pre-filter: relevant icebergs whose current position or forecast falls within bounding box
      const relevantIcebergs = icebergs.filter(ice => {
        if (ice.x >= minX && ice.x <= maxX && ice.y >= minY && ice.y <= maxY) return true;
        // Check future positions if available
        if (ice.trajectoryForecast && ice.trajectoryForecast.length > 0) {
          for (const f of ice.trajectoryForecast) {
            if (f.x >= minX && f.x <= maxX && f.y >= minY && f.y <= maxY) return true;
          }
        }
        return false;
      });

      if (relevantIcebergs.length > 0) {
        let accumulatedDistance = 0;
        
        for (let i = 0; i < remainingRoute.length - 1; i++) {
          const ptA = remainingRoute[i];
          const ptB = remainingRoute[i+1];
          const dx = ptB.x - ptA.x;
          const dy = ptB.y - ptA.y;
          const segLen = Math.hypot(dx, dy);
          
          const numSamples = Math.max(3, Math.ceil(segLen / 40));
          for (let k = 0; k <= numSamples; k++) {
            const ratio = k / numSamples;
            const sx = ptA.x + ratio * dx;
            const sy = ptA.y + ratio * dy;
            const sampleDist = accumulatedDistance + ratio * segLen;
            const etaSample = sampleDist / (3600 * shipSpeed);
            
            // Use isHardBlocked with spatially pre-filtered icebergs
            if (isHardBlocked(sx, sy, etaSample, relevantIcebergs)) {
              isObstructed = true;
              if (sampleDist < 150 && state && state.navigation) {
                state.navigation.routeInvalid = true;
              }
            }
            if (isObstructed) break;
          }
          if (isObstructed) break;
          accumulatedDistance += segLen;
        }
      }
    }

    // Maintain obstruction persistence counter to prevent numerical noise flapping
    if (isObstructed) {
      this.obstructionCount = (this.obstructionCount || 0) + 1;
    } else {
      this.obstructionCount = 0;
    }

    // ── STEP 2 & 4: CALCULATE CPA AND PERFORM PREDICTIVE AVOIDANCE ──
    let imminentCollisionDetected = false;
    let highestRiskIceberg = null;
    let shortestT_CPA = Infinity;

    if (isNavigating) {
      for (const ice of icebergs) {
        // Relative position
        const rx = ice.x - ship.x;
        const ry = ice.y - ship.y;
        
        // Relative velocity
        const rvx = ice.vx - ship.vx;
        const rvy = ice.vy - ship.vy;
        
        const rvSq = rvx * rvx + rvy * rvy;
        let tCPA = 0;
        if (rvSq > 0.001) {
          tCPA = -(rx * rvx + ry * rvy) / rvSq;
        }
        if (tCPA < 0) tCPA = 0;

        // Distance at closest approach
        const futureRx = rx + rvx * tCPA;
        const futureRy = ry + rvy * tCPA;
        const dCPA = Math.sqrt(futureRx * futureRx + futureRy * futureRy);
        const safeMargin = ice.collisionRadius + ship.collisionRadius;

        // Emergency avoidance trigger check
        if (tCPA > 0 && tCPA < 30 && dCPA < safeMargin * 1.5) {
          imminentCollisionDetected = true;
          if (tCPA < shortestT_CPA) {
            shortestT_CPA = tCPA;
            highestRiskIceberg = ice;
          }
        }
      }
    }

    if (imminentCollisionDetected && highestRiskIceberg) {
      console.error('[Autopilot] Emergency collision avoidance override active!');
      isObstructed = true;
    }

    // Storm Detection & State Transition Check (Part 1)
    const stormState = vectorField.getStormState ? vectorField.getStormState(state) : { stormActive: false, severity: 0 };
    if (this._lastStormActive === undefined) this._lastStormActive = stormState.stormActive;
    if (this._lastStormActive !== stormState.stormActive) {
      this._lastStormActive = stormState.stormActive;
      if (state && state.navigation) state.navigation.routeInvalid = true;
    }

    // Scenario #5 Check: Forecasted Sea-Ice Concentration Trend Replanning
    if (vectorField.getSeaIceTrendForecast && isNavigating && state && state.navigation) {
      const forecast24h = vectorField.getSeaIceTrendForecast(ship.x, ship.y, 24);
      if (forecast24h && forecast24h.predicted > 0.75 && (mode === 'FASTEST' || mode === 'BALANCED')) {
        if (!this._lastIceTrendWarn) {
          this._lastIceTrendWarn = true;
          state.navigation.routeInvalid = true;
        }
      } else {
        this._lastIceTrendWarn = false;
      }
    }

    // Iceberg Prediction Accuracy Tracker Update (Part 2)
    if (this.predictionTracker) {
      const simTimeHours = state?.simulation?.simTimeHours || 0;
      for (const ice of icebergs) {
        if (ice.trajectoryForecast && ice.trajectoryForecast.length > 0) {
          for (const f of ice.trajectoryForecast) {
            const horizon = f.hour || 1;
            this.predictionTracker.recordPrediction(ice.id, simTimeHours, horizon, f.x, f.y);
          }
        }
      }
      this.predictionTracker.update(simTimeHours, icebergs);
    }

    const timeSinceLastRoute = currentTime - (this.lastRouteTime || 0);
    const persistentObstructed = isObstructed && (this.obstructionCount || 0) >= 3;

    let needsReroute = isNavigating && (
      state.navigation.routeInvalid || modeChanged || destChanged || persistentObstructed
    );

    if (isNavigating && this.optimalRoute.length === 0) needsReroute = true;

    if (needsReroute && (state.navigation.routeInvalid || persistentObstructed || timeSinceLastRoute > 1000)) {
      const pm = typeof window !== 'undefined' && window.simEngine && window.simEngine.perfMonitor;
      if (pm) {
        pm.timeFunction('routePlanning', () => {
          this.generateOptimalRouteAStar(ship, icebergs, vectorField, dest, mode, state, ship);
        });
      } else {
        this.generateOptimalRouteAStar(ship, icebergs, vectorField, dest, mode, state, ship);
      }
      this.lastRouteTime = currentTime;
      this.lastMode = mode;
      this.lastDest = { x: dest.x, y: dest.y };
      state.navigation.routeInvalid = false;
    }

    // Generate AI recommendation safely (throttled to once per second)
    if (!this.lastAIRecommendTime || currentTime - this.lastAIRecommendTime > 1000) {
      try {
        this.aiRecommendation = this.generateAIRecommendation(ship, dest, icebergs, vectorField, state);
      } catch (err) {
        console.error("AI Advisor evaluation failed:", err);
        this.aiRecommendation = {
          status: 'MAINTAIN COURSE',
          explanation: 'AI Decision Advisor temporarily unavailable. Proceeding with caution.',
          recommendedMode: state?.navigation?.mode || 'BALANCED'
        };
      }
      this.lastAIRecommendTime = currentTime;
    }
  }

  /**
   * Manual route calculation from explicit start → destination (world coords).
   * Called by UI "CALCULATE ROUTE" — never triggered by pan/zoom.
   */
  calculateRoute(startPoint, destPoint, icebergs, vectorField, mode, state, ship) {
    this.generateOptimalRouteAStar(
      { x: startPoint.x, y: startPoint.y },
      icebergs, vectorField, destPoint, mode, state, ship
    );
    this.lastRouteTime = performance.now();
    this.lastMode = mode;
    this.lastDest = { x: destPoint.x, y: destPoint.y };
  }

  /**
   * A* route generation in WORLD coordinates.
   * Dispatches calculation to Web Worker if available, or runs synchronously as fallback.
   */
  generateOptimalRouteAStar(ship, icebergs, vectorField, dest, mode, state, realShip = null) {
    this.currentState = state;
    this.currentRealShip = realShip || ship;

    if (this.routeWorker) {
      this.workerRequestId++;
      this.pendingWorkerRequestId = this.workerRequestId;

      const icebergSnapshots = icebergs.map(ice => ({
        id: ice.id,
        x: ice.x,
        y: ice.y,
        vx: ice.vx || 0,
        vy: ice.vy || 0,
        collisionRadius: ice.collisionRadius,
        size: ice.size,
        uncertaintyRadius: ice.uncertaintyRadius || ice.collisionRadius,
        uncertaintyGrowthRate: ice.uncertaintyGrowthRate || 0.5,
        trajectoryForecast: (ice.trajectoryForecast || []).map(f => ({ hour: f.hour || f.time || 0, x: f.x, y: f.y, uncertainty: f.uncertainty }))
      }));

      const payload = {
        requestId: this.workerRequestId,
        ship: {
          x: ship.x,
          y: ship.y,
          heading: ship.heading || 0,
          vx: ship.vx || 0,
          vy: ship.vy || 0,
          speed: Math.hypot(ship.vx || 0, ship.vy || 0),
          throttle: ship.throttle || 65
        },
        dest: { x: dest.x, y: dest.y },
        mode: mode,
        width: this.width,
        height: this.height,
        state: {
          vessel: { maxSpeed: state?.vessel?.maxSpeed || 30, autopilotThrottle: state?.vessel?.autopilotThrottle || 65 },
          environment: { seaIce: { enabled: !!state?.environment?.seaIce?.enabled } }
        },
        icebergs: icebergSnapshots
      };

      this.routeWorker.postMessage(payload);
      return;
    }

    this.generateOptimalRouteAStarSync(ship, icebergs, vectorField, dest, mode, state, realShip);
  }

  generateOptimalRouteAStarSync(ship, icebergs, vectorField, dest, mode, state, realShip = null) {
    this.currentState = state;
    this.currentRealShip = realShip || ship;

    const icebergSnapshots = icebergs.map(ice => ({
      id: ice.id,
      x: ice.x,
      y: ice.y,
      vx: ice.vx || 0,
      vy: ice.vy || 0,
      collisionRadius: ice.collisionRadius,
      size: ice.size,
      uncertaintyRadius: ice.uncertaintyRadius || ice.collisionRadius,
      uncertaintyGrowthRate: ice.uncertaintyGrowthRate || 0.5,
      trajectoryForecast: (ice.trajectoryForecast || []).map(f => ({ hour: f.hour || f.time || 0, x: f.x, y: f.y, uncertainty: f.uncertainty }))
    }));

    const payload = {
      requestId: ++this.workerRequestId,
      ship: {
        x: ship.x,
        y: ship.y,
        heading: ship.heading || 0,
        vx: ship.vx || 0,
        vy: ship.vy || 0,
        speed: Math.hypot(ship.vx || 0, ship.vy || 0),
        throttle: ship.throttle || 65
      },
      dest: { x: dest.x, y: dest.y },
      mode: mode,
      width: this.width,
      height: this.height,
      state: {
        vessel: { maxSpeed: state?.vessel?.maxSpeed || 30, autopilotThrottle: state?.vessel?.autopilotThrottle || 65 },
        environment: { seaIce: { enabled: !!state?.environment?.seaIce?.enabled } }
      },
      icebergs: icebergSnapshots
    };

    this.pendingWorkerRequestId = payload.requestId;
    const result = runRoutePlannerCore(payload);
    this.handleWorkerResponse({ data: result });
  }

  validateRoute(waypoints, icebergs, shipSpeed = 20.0, state = null) {
    if (!waypoints || waypoints.length < 2) return { valid: false, reason: "Insufficient points" };

    // Validate coordinates are finite and inside world bounds
    for (let pt of waypoints) {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        return { valid: false, reason: "Non-finite waypoint coordinate detected" };
      }
      if (pt.x < 0 || pt.x > this.width || pt.y < 0 || pt.y > this.height) {
        return { valid: false, reason: "Waypoint outside world bounds" };
      }
    }

    // 1. Check segment collision intersection — physical collision boundary only.
    let accumulatedDistance = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const ptA = waypoints[i];
      const ptB = waypoints[i+1];
      const dx = ptB.x - ptA.x;
      const dy = ptB.y - ptA.y;
      const segLen = Math.hypot(dx, dy);

      const numSamples = Math.max(3, Math.ceil(segLen / 40));
      for (let k = 0; k <= numSamples; k++) {
        const ratio     = k / numSamples;
        const sx        = ptA.x + ratio * dx;
        const sy        = ptA.y + ratio * dy;
        const sampleDist = accumulatedDistance + ratio * segLen;
        const etaSample  = sampleDist / (3600 * shipSpeed);

        if (isHardBlocked(sx, sy, etaSample, icebergs)) {
          return { valid: false, reason: `Segment crosses iceberg collision zone` };
        }
      }
      accumulatedDistance += segLen;
    }

    // 2. Check loops/self-intersections
    for (let i = 0; i < waypoints.length - 1; i++) {
      for (let j = i + 2; j < waypoints.length - 1; j++) {
        const p0 = waypoints[i], p1 = waypoints[i+1];
        const p2 = waypoints[j], p3 = waypoints[j+1];
        const s1_x = p1.x - p0.x, s1_y = p1.y - p0.y;
        const s2_x = p3.x - p2.x, s2_y = p3.y - p2.y;
        const s = (-s1_y * (p0.x - p2.x) + s1_x * (p0.y - p2.y)) / (-s2_x * s1_y + s1_x * s2_y);
        const t = ( s2_x * (p0.y - p2.y) - s2_y * (p0.x - p2.x)) / (-s2_x * s1_y + s1_x * s2_y);
        if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
          return { valid: false, reason: "Route contains self-intersecting loops" };
        }
      }
    }

    // 3. Length comparison
    let totalLen = 0;
    for (let i = 0; i < waypoints.length - 1; i++) {
      totalLen += Math.hypot(waypoints[i+1].x - waypoints[i].x, waypoints[i+1].y - waypoints[i].y);
    }
    const straightLine = Math.hypot(waypoints[waypoints.length-1].x - waypoints[0].x, waypoints[waypoints.length-1].y - waypoints[0].y);
    if (totalLen > straightLine * 2.8) {
      return { valid: false, reason: "Route length is excessively inefficient" };
    }

    return { valid: true };
  }

  computeRouteStrategy(ship, dest, icebergs, vectorField, mode, state) {
    const payload = {
      requestId: 0,
      ship: { x: ship.x, y: ship.y, speed: 20, throttle: ship.throttle || 65 },
      dest: { x: dest.x, y: dest.y },
      mode,
      state,
      width: this.width,
      height: this.height,
      vectorFieldData: { stormMode: vectorField.stormMode, seaIceGrid: vectorField ? vectorField.seaIceGrid : undefined }
    };
    const res = runRoutePlannerCore(payload);
    
    const km = parseFloat((res.totalDistance / 10).toFixed(1));
    const eta = res.eta !== undefined ? res.eta : (res.totalDistance / ((res.shipSpeed || 20) * 3600));
    const speedMult = mode === 'FASTEST' ? 1.35 : (mode === 'SAFEST' ? 0.85 : (mode === 'FUEL_EFFICIENT' ? 0.65 : 1.0));
    const rawFuel = res.estimatedFuelConsumption !== undefined ? res.estimatedFuelConsumption : parseFloat((km * 1.5).toFixed(1));
    const fuel = res.estimatedFuelConsumption !== undefined ? parseFloat(res.estimatedFuelConsumption.toFixed(1)) : parseFloat((rawFuel * speedMult).toFixed(1));
    
    let maxRisk = res.maxRisk !== undefined ? res.maxRisk : 0.0;
    const iceConc = vectorField && vectorField.seaIceGrid && vectorField.seaIceGrid.data ? vectorField.seaIceGrid.data[0] : 0;
    if (iceConc > 0.4) {
      if (mode === 'FASTEST') maxRisk = Math.max(maxRisk, parseFloat((iceConc * 0.70).toFixed(2)));
      else if (mode === 'BALANCED') maxRisk = Math.max(maxRisk, parseFloat((iceConc * 0.40).toFixed(2)));
      else if (mode === 'FUEL_EFFICIENT') maxRisk = Math.max(maxRisk, parseFloat((iceConc * 0.25).toFixed(2)));
      else if (mode === 'SAFEST') maxRisk = Math.max(maxRisk, parseFloat((iceConc * 0.10).toFixed(2)));
    }

    const weatherExpMap = { FASTEST: 0.90, BALANCED: 0.60, SAFEST: 0.25, FUEL_EFFICIENT: 0.35 };
    const weatherExposure = weatherExpMap[mode] || 0.4;
    
    return {
      mode,
      route: res.waypoints,
      waypoints: res.waypoints,
      totalDistance: res.totalDistance,
      distance: km,
      eta,
      estimatedDuration: eta,
      fuel,
      estimatedFuelConsumption: fuel,
      maxRisk,
      riskScore: maxRisk,
      weatherExposure,
      shipSpeed: res.shipSpeed,
      overallSafety: Math.max(0.0, 1.0 - maxRisk)
    };
  }

  generateAIRecommendation(ship, dest, icebergs, vectorField, state) {
    if (!dest) {
      return {
        status: 'MAINTAIN COURSE',
        explanation: 'System ready. Select a destination to initiate A* route analysis.',
        recommendedMode: 'BALANCED'
      };
    }

    const fastest = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'FASTEST', state);
    const balanced = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'BALANCED', state);
    const safest = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'SAFEST', state);
    const fuelEfficient = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'FUEL_EFFICIENT', state);

    this.routeComparisons = { shortest: fastest, balanced, safest, fuelEfficient };

    const candidateRoutes = {
      FASTEST: fastest,
      BALANCED: balanced,
      SAFEST: safest,
      FUEL_EFFICIENT: fuelEfficient
    };

    const seaIceTrend = vectorField.getSeaIceTrendForecast ? vectorField.getSeaIceTrendForecast(ship.x, ship.y, 24) : { slope: 0, horizonHours: 24, predicted: 0 };

    const context = {
      seaIceTrend,
      icebergTrajectories: icebergs.flatMap(i => i.trajectoryForecast || []),
      weather: {
        windSpeed: vectorField.windSpeed || 20,
        currentSpeed: vectorField.currentSpeed || 1.5,
        stormMode: !!vectorField.stormMode,
        severity: vectorField.stormMode ? 0.8 : 0.3
      },
      vesselState: {
        engineIssue: !!(state?.vessel?.engineIssue),
        reducedSpeedCap: state?.vessel?.reducedSpeedCap || 18.0,
        fuelRemaining: ship.fuel !== undefined ? ship.fuel : 75.0,
        lowFuelFlag: (ship.fuel !== undefined && ship.fuel < 25.0) || !!(state?.vessel?.lowFuel),
        sensorDegradedFlag: !!(state?.navigation?.sensorDegraded)
      }
    };

    if (!this.decisionEngine) {
      this.decisionEngine = new DecisionEngine();
    }

    const decResult = this.decisionEngine.evaluate(candidateRoutes, context);

    let status = 'SAFE TO PROCEED';
    if (decResult.recommendedMode === 'SAFEST') status = 'REROUTE RECOMMENDED';
    if (context.vesselState.sensorDegradedFlag) status = 'DEGRADED SENSORS';

    // Proximity overrides
    let maxDangerScore = 0;
    let closestHazard = null;
    for (let h of ship.hazards || []) {
      if (h.score > maxDangerScore) {
        maxDangerScore = h.score;
        closestHazard = h;
      }
    }

    let finalExplanation = decResult.explanation;

    if (maxDangerScore === 4) {
      status = 'CRITICAL COLLISION RISK';
      finalExplanation = `CRITICAL: Immediate encounter risk with ${closestHazard.name} (${closestHazard.distance.toFixed(0)}m). Auto emergency braking active.`;
    } else if (maxDangerScore === 3) {
      status = 'REDUCE SPEED';
      finalExplanation = `CAUTION: ${closestHazard.name} detected ahead on course. Reducing speed and recommended rerouting.`;
    }

    this.aiRecommendation = {
      status,
      explanation: finalExplanation,
      recommendedMode: decResult.recommendedMode,
      confidence: decResult.confidence,
      scores: decResult.scores
    };

    return {
      status,
      explanation: finalExplanation,
      recommendedMode: decResult.recommendedMode,
      confidence: decResult.confidence,
      scores: decResult.scores,
      comparisons: { shortest: fastest, balanced, safest, fuelEfficient }
    };
  }
}
