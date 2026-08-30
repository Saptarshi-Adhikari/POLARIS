import routeCalibration from '../../data/routeCalibration.json';

/**
 * HARD COLLISION CHECK — returns true ONLY when a ship physically cannot occupy
 * this cell at the given ETA. Uses only the genuine physical collision boundary:
 *   ice.collisionRadius + 15 (ship radius)
 * NO soft margin, NO uncertainty inflation — those belong in getTraversalCost.
 * This is the ONLY function allowed to exclude a node from A*.
 */
function isHardBlocked(cx, cy, etaHours, icebergs) {
  for (let ice of icebergs) {
    const icePos = ice.getPositionAt(etaHours);
    const dist = Math.hypot(cx - icePos.x, cy - icePos.y);
    const hardR = ice.collisionRadius + 15;  // physical ship radius only
    if (dist < hardR) return true;
  }
  return false;
}

/**
 * TRAVERSAL COST — finite proximity penalty for A* optimization.
 * MUST NEVER return a value >= 100000 (that is isHardBlocked's job).
 * Soft buffer zone: distance from hardR to hardR+200, cost gradient 0→icebergWeight.
 * Uncertainty adds to the inner soft-buffer width (not to the hard-block threshold).
 */
function getTraversalCost(cx, cy, etaHours, cellW, cellH, icebergCostMult, seaIceCostMult, state, vectorField, icebergs) {
  let cost = 1.0;

  for (let ice of icebergs) {
    const icePos = ice.getPositionAt(etaHours);
    const dist = Math.hypot(cx - icePos.x, cy - icePos.y);
    const hardR  = ice.collisionRadius + 15;          // physical boundary
    const uRadius = icePos.uncertainty || 0;
    // Soft buffer: extends hardR + uncertainty*0.3 + 200 world-units
    const softInner = hardR + uRadius * 0.3;          // uncertainty widens inner penalty
    const softOuter = softInner + 200;                // gradient fade distance

    if (dist < softOuter) {
      const t = Math.max(0, 1 - (dist - softInner) / (softOuter - softInner));
      // Max soft cost = icebergWeight * 1.5 (not *10) — keeps gap cells affordable
      cost += t * t * (routeCalibration.icebergWeight || 10.0) * 1.5 * icebergCostMult;
    }
  }

  if (state?.environment?.seaIce?.enabled && vectorField?.getSeaIceConcentration) {
    let iceConc = vectorField.getSeaIceConcentration(cx, cy);
    const client = window.simEngine && window.simEngine.aiClient;
    if (client && client.status === 'ONLINE' && client.seaIceForecast) {
      const forecast = client.seaIceForecast;
      const maxForecasted = Math.max(forecast.ice_6h, forecast.ice_12h, forecast.ice_24h);
      if (maxForecasted > iceConc) iceConc = maxForecasted;
    }
    if (iceConc > 0.1) cost += iceConc * (routeCalibration.seaIceWeight || 5.0) * 2 * seaIceCostMult;
  }

  if (window.simEngine && window.simEngine.riskIntelligenceEngine) {
    const cellRiskObj = window.simEngine.riskIntelligenceEngine.getRiskAt(cx, cy);
    if (cellRiskObj) {
      cost += cellRiskObj.risk * (routeCalibration.riskWeight || 6.0) * icebergCostMult;
    }
  }

  return cost;
}

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

    this.initRiskGrid(20, 15);
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
    const dest = state.navigation.destination || { x: this.width - 400, y: 400 };
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
          
          // Use isHardBlocked (physical collision only) to trigger reroute.
          // Soft buffer zone checks should not force reroutes — only real collisions.
          if (isHardBlocked(sx, sy, etaSample, icebergs)) {
            isObstructed = true;
          }
          if (isObstructed) break;
        }
        if (isObstructed) break;
        accumulatedDistance += segLen;
      }
    }

    const timeSinceLastRoute = currentTime - (this.lastRouteTime || 0);

    let needsReroute = isNavigating && (
      state.navigation.routeInvalid || modeChanged || destChanged
      || (isObstructed && timeSinceLastRoute > 1500)
    );

    if (isNavigating && this.optimalRoute.length === 0) needsReroute = true;

    if (needsReroute && timeSinceLastRoute > 500) {
      this.generateOptimalRouteAStar(ship, icebergs, vectorField, dest, mode, state, ship);
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
   * Grid cells span the full 3600x2400 world space.
   * Waypoints are emitted as world-coordinate {x, y} objects.
   */
  generateOptimalRouteAStar(ship, icebergs, vectorField, dest, mode, state, realShip = null) {
    // INCREASED RESOLUTION: 72x48 gives 50x50 world-unit cells (was 75x75 at 48x32).
    // Smaller cells mean narrow gaps (down to ~50 units) have at least one traversable node.
    const gridCols = 72;
    const gridRows = 48;
    const cellW = this.width  / gridCols;  // 50.0 world units per cell
    const cellH = this.height / gridRows;  // 50.0 world units per cell

    // Convert world positions to grid indices
    const startC = Math.max(0, Math.min(gridCols - 1, Math.floor(ship.x / cellW)));
    const startR = Math.max(0, Math.min(gridRows - 1, Math.floor(ship.y / cellH)));
    const endC   = Math.max(0, Math.min(gridCols - 1, Math.floor(dest.x  / cellW)));
    const endR   = Math.max(0, Math.min(gridRows - 1, Math.floor(dest.y  / cellH)));

    // Cost multipliers based on mode
    let icebergCostMult = 1.0;
    let seaIceCostMult  = 1.0;
    if (mode === 'SHORTEST') {
      icebergCostMult = 0.5;
      seaIceCostMult  = 0.2;
    } else if (mode === 'SAFEST') {
      icebergCostMult = 3.0;   // was 5.0 — reduced to avoid excessive conservatism
      seaIceCostMult  = 2.0;
    }

    let shipSpeed = 20.0;
    if (realShip && typeof realShip.vx === 'number' && typeof realShip.vy === 'number') {
      const currentSpeed = Math.hypot(realShip.vx, realShip.vy);
      if (currentSpeed > 5.0) {
        shipSpeed = currentSpeed;
      } else {
        const throttle = realShip.throttle || 65;
        const maxSpd = (state && state.vessel && state.vessel.maxSpeed) || 30.0;
        shipSpeed = maxSpd * Math.sqrt(throttle / 100);
      }
    } else {
      const throttle = state?.vessel?.autopilotThrottle || 65;
      const maxSpd = state?.vessel?.maxSpeed || 30.0;
      shipSpeed = maxSpd * Math.sqrt(throttle / 100);
    }

    // A* Search using a proper min-heap via sorted insertion
    const openSet   = [];
    const closedSet = new Set();
    const cameFrom  = new Map();
    const gScore    = new Map();
    const gDistance = new Map();

    const nodeKey  = (r, c) => `${r},${c}`;
    const startKey = nodeKey(startR, startC);

    gScore.set(startKey, 0);
    gDistance.set(startKey, 0);
    const h0 = Math.hypot(startC - endC, startR - endR) * (routeCalibration.heuristicWeight || 1.0);
    openSet.push({ r: startR, c: startC, f: h0 });

    let current = null;
    let found   = false;

    const dirs = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    while (openSet.length > 0) {
      openSet.sort((a, b) => a.f - b.f);
      current = openSet.shift();

      const currKey = nodeKey(current.r, current.c);
      if (closedSet.has(currKey)) continue;
      closedSet.add(currKey);

      if (current.r === endR && current.c === endC) {
        found = true;
        break;
      }

      for (let dir of dirs) {
        const nr = current.r + dir[0];
        const nc = current.c + dir[1];
        if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;

        const neighborKey = nodeKey(nr, nc);
        if (closedSet.has(neighborKey)) continue;

        const moveDist = (dir[0] !== 0 && dir[1] !== 0) ? 1.414 : 1.0;

        // World-space cell centre of the neighbor
        const ncx = nc * cellW + cellW / 2;
        const ncy = nr * cellH + cellH / 2;

        const stepDistSU  = Math.hypot((nc - current.c) * cellW, (nr - current.r) * cellH);
        const currentDist = gDistance.get(currKey) || 0;
        const tentativeDist = currentDist + stepDistSU;
        const etaHours = tentativeDist / (3600 * shipSpeed);

        // ── HARD BLOCK (physical collision only) ─────────────────────────────
        if (isHardBlocked(ncx, ncy, etaHours, icebergs)) continue;

        // ── SOFT TRAVERSAL COST (proximity penalty, sea ice, risk) ───────────
        const cellCost = getTraversalCost(ncx, ncy, etaHours, cellW, cellH, icebergCostMult, seaIceCostMult, state, vectorField, icebergs);

        // Directional environmental penalty
        let envPenalty = 0.0;
        if (vectorField && vectorField.getVelocityAt) {
          const oceanTime = state?.simulation?.simTimeHours || 0;
          const oceanVel = vectorField.getVelocityAt(ncx, ncy, oceanTime, state);
          const angle = Math.atan2(dir[0] * cellH, dir[1] * cellW);
          const moveUnitX = Math.cos(angle);
          const moveUnitY = Math.sin(angle);
          const dot = oceanVel.u * moveUnitX + oceanVel.v * moveUnitY;
          const crossProduct = Math.abs(oceanVel.u * moveUnitY - oceanVel.v * moveUnitX);
          if (dot > 0) {
            envPenalty -= dot * (routeCalibration.currentWeight || 0.25);
          } else {
            envPenalty -= dot * (routeCalibration.currentWeight || 0.25) * 1.5;
          }
          envPenalty += crossProduct * (routeCalibration.crossCurrentWeight || 0.3);
        }

        // Turning penalty to discourage zig-zagging
        let turnPenalty = 0.0;
        const prevNode = cameFrom.get(currKey);
        if (prevNode) {
          const prevDirR = current.r - prevNode.r;
          const prevDirC = current.c - prevNode.c;
          if (prevDirR !== dir[0] || prevDirC !== dir[1]) {
            turnPenalty = (routeCalibration.turnPenalty || 0.15);
          }
        }

        const rawTraverseCost = moveDist * cellCost + envPenalty + turnPenalty;
        const traverseCost    = Math.max(0.2 * moveDist, rawTraverseCost);
        const tentativeG      = gScore.get(currKey) + traverseCost;

        if (!gScore.has(neighborKey) || tentativeG < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeG);
          gDistance.set(neighborKey, tentativeDist);
          const h = Math.hypot(nc - endC, nr - endR) * (routeCalibration.heuristicWeight || 1.0);
          const f = tentativeG + h;
          if (!openSet.some(n => n.r === nr && n.c === nc)) {
            openSet.push({ r: nr, c: nc, f });
          } else {
            const existing = openSet.find(n => n.r === nr && n.c === nc);
            if (existing) existing.f = Math.min(existing.f, f);
          }
        }
      }
    }

    let waypoints = [];

    if (found) {
      // Reconstruct path — emit WORLD coordinates (cell centre)
      let currNode = current;
      while (currNode) {
        waypoints.push({
          x: currNode.c * cellW + cellW / 2,
          y: currNode.r * cellH + cellH / 2
        });
        currNode = cameFrom.get(nodeKey(currNode.r, currNode.c));
      }
      waypoints.reverse();
    } else {
      // Fallback direct route
      waypoints = [
        { x: ship.x, y: ship.y },
        { x: dest.x, y: dest.y }
      ];
    }

    // Snap first waypoint exactly to ship position (no initial jump)
    if (waypoints.length > 0) {
      waypoints[0] = { x: ship.x, y: ship.y };
    }
    // Snap last waypoint exactly to destination
    if (waypoints.length > 1) {
      waypoints[waypoints.length - 1] = { x: dest.x, y: dest.y };
    }

    // Line-of-sight route smoothing (safely skip waypoints if clear).
    // Uses isHardBlocked (physical collision only) — not the soft avoid radius —
    // so a corridor that A* correctly navigated is not re-blocked during smoothing.
    const smoothed = [];
    if (waypoints.length > 0) {
      smoothed.push(waypoints[0]);
      let currentIdx = 0;
      let accumulatedDistanceToCurrentIdx = 0;
      while (currentIdx < waypoints.length - 1) {
        let furthestVisible = currentIdx + 1;
        for (let j = waypoints.length - 1; j > currentIdx + 1; j--) {
          const ptA = waypoints[currentIdx];
          const ptB = waypoints[j];
          let isClear = true;

          const dx = ptB.x - ptA.x;
          const dy = ptB.y - ptA.y;
          const segLen = Math.hypot(dx, dy);

          const numSamples = Math.max(3, Math.ceil(segLen / 40));
          for (let k = 0; k <= numSamples; k++) {
            const ratio = k / numSamples;
            const sx = ptA.x + ratio * dx;
            const sy = ptA.y + ratio * dy;
            const sampleDist = accumulatedDistanceToCurrentIdx + ratio * segLen;
            const etaSample  = sampleDist / (3600 * shipSpeed);

            // Hard collision check ONLY (no soft margin)
            if (isHardBlocked(sx, sy, etaSample, icebergs)) {
              isClear = false;
              break;
            }

            // Dense sea-ice is an additional hard barrier
            if (state?.environment?.seaIce?.enabled && vectorField?.getSeaIceConcentration) {
              if (vectorField.getSeaIceConcentration(sx, sy) > 0.85) {
                isClear = false;
                break;
              }
            }
          }
          if (isClear) {
            furthestVisible = j;
            break;
          }
        }
        smoothed.push(waypoints[furthestVisible]);
        const segmentLen = Math.hypot(
          waypoints[furthestVisible].x - waypoints[currentIdx].x,
          waypoints[furthestVisible].y - waypoints[currentIdx].y
        );
        accumulatedDistanceToCurrentIdx += segmentLen;
        currentIdx = furthestVisible;
      }
    }
    
    // Validate final waypoints path against loops and collisions
    const valResult = this.validateRoute(smoothed, icebergs, shipSpeed, state);
    let finalPath = waypoints;
    if (valResult.valid) {
      finalPath = smoothed;
    } else {
      console.warn("A* route smoothing rejected:", valResult.reason);
      const rawValResult = this.validateRoute(waypoints, icebergs, shipSpeed, state);
      if (rawValResult.valid) {
        finalPath = waypoints;
      } else if (this.lastValidRoute && this.lastValidRoute.length >= 2) {
        console.warn("Raw grid path is also invalid. Falling back to lastValidRoute");
        finalPath = this.lastValidRoute;
      } else {
        console.warn("No valid route exists. Falling back to direct line");
        finalPath = [
          { x: ship.x, y: ship.y },
          { x: dest.x, y: dest.y }
        ];
      }
    }

    this.optimalRoute = finalPath;
    // Only update lastValidRoute when this is a real navigation route (realShip provided),
    // not a strategy-comparison run from computeRouteStrategy.
    if (realShip) {
      this.lastValidRoute = finalPath;
    }

    // Only push waypoints to the actual vessel when an explicit realShip is provided.
    // When realShip is null (e.g. called from computeRouteStrategy for comparison purposes),
    // we must NOT overwrite ship.routeWaypoints — the first-arg `ship` is just a position object
    // but happens to be the real vessel, and calling setRouteWaypoints on it would reset
    // waypointIndex to 0 every second, destroying active navigation and erasing the route display.
    if (realShip && realShip.setRouteWaypoints) {
      realShip.setRouteWaypoints(this.optimalRoute);
    }
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
    // Generate the path using A* grid
    const backupRoute = this.optimalRoute;
    // Mock the state to prevent overwriting active route parameters
    const mockState = {
      navigation: { mode },
      environment: state?.environment
    };
    this.generateOptimalRouteAStar(ship, icebergs, vectorField, dest, mode, mockState);
    const route = [...this.optimalRoute];
    this.optimalRoute = backupRoute; // Restore active route

    // Calculate metrics
    let distance = 0;
    let totalIce = 0;
    let maxMLIcebergRisk = 0;

    const client = window.simEngine && window.simEngine.aiClient;
    
    for (let i = 0; i < route.length - 1; i++) {
      const ptA = route[i];
      const ptB = route[i+1];
      const dx = ptB.x - ptA.x;
      const dy = ptB.y - ptA.y;
      const segmentLen = Math.hypot(dx, dy);
      distance += segmentLen;

      if (vectorField.getSeaIceConcentration) {
        totalIce += vectorField.getSeaIceConcentration(ptA.x, ptA.y);
      }

      // Check ML predicted iceberg corridor crossings on this segment
      for (let ice of icebergs) {
        if (ice.mlTrajectory && ice.mlTrajectory.length > 0) {
          for (let pt of ice.mlTrajectory) {
            const dxSeg = ptB.x - ptA.x;
            const dySeg = ptB.y - ptA.y;
            const len2 = dxSeg*dxSeg + dySeg*dySeg;
            let t = 0;
            if (len2 > 0) t = Math.max(0, Math.min(1, ((pt.x - ptA.x)*dxSeg + (pt.y - ptA.y)*dySeg)/len2));
            const cx = ptA.x + t * dxSeg;
            const cy = ptA.y + t * dySeg;
            const corridorDist = Math.hypot(pt.x - cx, pt.y - cy);
            const safetyLimit = ice.collisionRadius + 45;
            if (corridorDist < safetyLimit) {
              const riskFactor = (pt.time === 10) ? 0.9 : ((pt.time === 30) ? 0.6 : 0.3);
              maxMLIcebergRisk = Math.max(maxMLIcebergRisk, riskFactor);
            }
          }
        }
      }
    }
    
    const km = distance * 0.8;
    const avgIce = route.length > 0 ? totalIce / route.length : 0;
    
    // Sea Ice ML blend
    let finalIceVal = avgIce;
    if (client && client.status === 'ONLINE' && client.seaIceForecast) {
      const forecast = client.seaIceForecast;
      const maxForecast = Math.max(forecast.ice_6h, forecast.ice_12h, forecast.ice_24h);
      if (maxForecast > finalIceVal) {
        finalIceVal = maxForecast;
      }
    }

    const iceResistanceMult = 1.0 + finalIceVal * 1.5;
    const baseSpeed = mode === 'SHORTEST' ? 24 : (mode === 'BALANCED' ? 20 : 16);
    
    // Current force assistant/resistance estimation
    let currentAssist = 0;
    if (route.length > 1 && vectorField.getVelocity) {
      const midIdx = Math.floor(route.length / 2);
      const midPt = route[midIdx];
      const vel = vectorField.getVelocity(midPt.x, midPt.y);
      if (vel) {
        const dx = route[route.length-1].x - route[0].x;
        const dy = route[route.length-1].y - route[0].y;
        const len = Math.hypot(dx, dy) || 1;
        currentAssist = (vel.u * dx + vel.v * dy) / len;
      }
    }

    const speed = Math.max(4.0, (baseSpeed + currentAssist * 0.2) / iceResistanceMult);
    const eta = km / speed;

    const baseFuelRate = mode === 'SHORTEST' ? 2.5 : (mode === 'BALANCED' ? 1.8 : 1.4);
    const fuel = km * baseFuelRate * iceResistanceMult;

    // Proximity Risk
    let minIceDist = Infinity;
    for (let ice of icebergs) {
      for (let i = 0; i < route.length - 1; i++) {
        const ptA = route[i];
        const ptB = route[i+1];
        const dx = ptB.x - ptA.x;
        const dy = ptB.y - ptA.y;
        const len2 = dx*dx + dy*dy;
        let t = 0;
        if (len2 > 0) t = Math.max(0, Math.min(1, ((ice.x - ptA.x)*dx + (ice.y - ptA.y)*dy)/len2));
        const cx = ptA.x + t * dx;
        const cy = ptA.y + t * dy;
        const d = Math.hypot(ice.x - cx, ice.y - cy) - ice.collisionRadius;
        if (d < minIceDist) minIceDist = d;
      }
    }

    // Normalized scores
    const icebergRisk = Math.max(maxMLIcebergRisk, minIceDist < 70 ? 0.9 : (minIceDist < 160 ? 0.5 : 0.1));
    const seaIceRisk = finalIceVal;
    const fuelCost = Math.min(1.0, fuel / 2500.0);
    const travelTime = Math.min(1.0, eta / 18.0);
    const overallSafety = Math.max(0.0, 1.0 - Math.max(icebergRisk, seaIceRisk));

    let risk = 'LOW';
    let riskScore = 1;
    if (icebergRisk > 0.7 || seaIceRisk > 0.6) {
      risk = 'HIGH';
      riskScore = 3;
    } else if (icebergRisk > 0.3 || seaIceRisk > 0.3) {
      risk = 'MEDIUM';
      riskScore = 2;
    }

    return {
      mode,
      route,
      distance: km,
      eta,
      fuel,
      risk,
      riskScore,
      minIceDist,
      icebergRisk,
      seaIceRisk,
      fuelCost,
      travelTime,
      overallSafety
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

    const shortest = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'SHORTEST', state);
    const balanced = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'BALANCED', state);
    const safest = this.computeRouteStrategy(ship, dest, icebergs, vectorField, 'SAFEST', state);

    this.routeComparisons = { shortest, balanced, safest };

    let recommendedMode = 'BALANCED';
    let status = 'SAFE TO PROCEED';
    let explanation = '';

    if (safest.overallSafety > balanced.overallSafety + 0.15 || balanced.risk === 'HIGH') {
      recommendedMode = 'SAFEST';
      status = 'REROUTE RECOMMENDED';
      explanation = `SAFEST strategy selected: lowest combined predicted sea-ice (${(safest.seaIceRisk*100).toFixed(0)}%) and iceberg risks.`;
    } else if (shortest.travelTime < balanced.travelTime - 0.2 && shortest.overallSafety > 0.6) {
      recommendedMode = 'SHORTEST';
      status = 'SAFE TO PROCEED';
      explanation = `FASTEST strategy selected: optimizes travel ETA (${shortest.eta.toFixed(1)}h) under acceptable risk thresholds.`;
    } else {
      recommendedMode = 'BALANCED';
      status = 'SAFE TO PROCEED';
      explanation = `BALANCED strategy selected: optimal blend of fuel cost (${balanced.fuel.toFixed(0)}L) and safety margins.`;
    }

    this.aiRecommendation = { status, explanation, recommendedMode };

    // Proximity overrides
    let maxDangerScore = 0;
    let closestHazard = null;
    for (let h of ship.hazards || []) {
      if (h.score > maxDangerScore) {
        maxDangerScore = h.score;
        closestHazard = h;
      }
    }

    if (maxDangerScore === 4) {
      status = 'CRITICAL COLLISION RISK';
      explanation = `CRITICAL: Immediate encounter risk with ${closestHazard.name} (${closestHazard.distance.toFixed(0)}m). Auto emergency braking active.`;
    } else if (maxDangerScore === 3) {
      status = 'REDUCE SPEED';
      explanation = `CAUTION: ${closestHazard.name} detected ahead on course. Reducing speed and recommended rerouting starboard.`;
    } else if (maxDangerScore === 2 && status === 'SAFE TO PROCEED') {
      status = 'REDUCE SPEED';
      explanation = `Moderate hazard proximity detected. Speed reduction recommended.`;
    }

    return {
      status,
      explanation,
      recommendedMode,
      comparisons: { shortest, balanced, safest }
    };
  }
}
