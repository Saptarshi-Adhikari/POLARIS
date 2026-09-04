import routeCalibration from '../../data/routeCalibration.json';
import { createHierarchicalPlanner } from '../pathfinding/hierarchicalPlanner.js';
import { llmCopilot } from './llmCopilot.js';

const hierarchicalPlanner = createHierarchicalPlanner(3600, 2400, {
  globalResolution: 40,
  localResolution: 20,
  globalCooldown: 5000,
  localUpdateInterval: 100
});



/**
 * HARD COLLISION CHECK — returns true ONLY when a ship physically cannot occupy
 * this cell at the given ETA. Uses only the genuine physical collision boundary:
 *   ice.collisionRadius + 15 (ship radius)
 * NO soft margin, NO uncertainty inflation — those belong in getTraversalCost.
 * This is the ONLY function allowed to exclude a node from A*.
 */
/**
 * _MinHeap — self-contained binary min-heap for the A* open set.
 * Items must have an `.f` field (f-score). Push/pop are O(log n).
 * No external dependencies.
 */
class _MinHeap {
  constructor() { this._d = []; }
  get size()    { return this._d.length; }
  push(item) {
    this._d.push(item);
    this._up(this._d.length - 1);
  }
  pop() {
    const top  = this._d[0];
    const last = this._d.pop();
    if (this._d.length > 0) { this._d[0] = last; this._down(0); }
    return top;
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._d[p].f <= this._d[i].f) break;
      [this._d[p], this._d[i]] = [this._d[i], this._d[p]];
      i = p;
    }
  }
  _down(i) {
    const n = this._d.length;
    for (;;) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this._d[l].f < this._d[s].f) s = l;
      if (r < n && this._d[r].f < this._d[s].f) s = r;
      if (s === i) break;
      [this._d[s], this._d[i]] = [this._d[i], this._d[s]];
      i = s;
    }
  }
}

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
      ship.throttle = 0;
      state.vessel.throttle = 0;
      
      const dx = highestRiskIceberg.x - ship.x;
      const dy = highestRiskIceberg.y - ship.y;
      const bearing = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // Steer perpendicular (90 degrees away)
      const escapeHeading = (bearing + 90 + 360) % 360;
      ship.heading = escapeHeading;
      ship.angularVelocity = 0;
      isObstructed = true;
    }

    const timeSinceLastRoute = currentTime - (this.lastRouteTime || 0);

    let needsReroute = isNavigating && (
      state.navigation.routeInvalid || modeChanged || destChanged
      || (isObstructed && timeSinceLastRoute > 1500)
    );

    if (isNavigating && this.optimalRoute.length === 0) needsReroute = true;

    if (needsReroute && timeSinceLastRoute > 500) {
      const pm = window.simEngine && window.simEngine.perfMonitor;
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

    // ── A* STATE: (row, col, timeBucket) ────────────────────────────────────────
    //
    // shipSpeed is in SU/sec (simulation units per second, per ship.js documentation).
    // ETA formula: etaHours = distanceSU / (shipSpeed_SU_per_sec × 3600 sec/hr)
    // Dimensionally: SU / (SU/sec × sec/hr) = hr  ✓
    //
    // TIME_BUCKET_H discretises the time axis of the state space so that the same
    // spatial cell reached at meaningfully different times is treated as a distinct
    // A* state.  Cells entered within the same 0.1-hour window share a state key.
    // This prevents an early arrival from permanently closing a cell that may be
    // safe to enter later (after a moving iceberg has passed).
    //
    // ALL iceberg physics (isHardBlocked / getTraversalCost) use the NODE'S EXACT
    // etaH — never the rounded/bucketed value.  Bucketing is ONLY for state identity.
    const TIME_BUCKET_H = 0.1; // hours (6-minute temporal resolution)

    // nodeKey encodes the full time-aware A* state identity.
    const nodeKey = (r, c, etaH) => `${r},${c},${Math.floor(etaH / TIME_BUCKET_H)}`;

    // openHeap  — binary min-heap of {r, c, etaH, f}; O(log n) push/pop.
    // openMap   — Map<stateKey, bestF>; O(1) lookup for lazy stale-entry detection.
    //             An entry popped from the heap is STALE if openMap holds a strictly
    //             lower f for the same key (a better path was found after this push).
    // closedSet — permanently expanded (r, c, timeBucket) states.
    // cameFrom  — Map<stateKey, {r, c, etaH}>; full parent triple for path
    //             reconstruction.  The spatial coordinates come from .r/.c; the
    //             exact etaH is stored so the next reconstruction step can compute
    //             its own nodeKey correctly.
    // gScore    — Map<stateKey, cost>; best accumulated traversal cost to state.
    // gDistance — Map<stateKey, SU>;  accumulated world-unit distance, used to
    //             derive etaH for each neighbor.
    const openHeap  = new _MinHeap();
    const openMap   = new Map();
    const closedSet = new Set();
    const cameFrom  = new Map();
    const gScore    = new Map();
    const gDistance = new Map();

    const startEtaH = 0;
    const startKey  = nodeKey(startR, startC, startEtaH);
    gScore.set(startKey, 0);
    gDistance.set(startKey, 0);
    const h0 = Math.hypot(startC - endC, startR - endR) * (routeCalibration.heuristicWeight || 1.0);
    openHeap.push({ r: startR, c: startC, etaH: startEtaH, f: h0 });
    openMap.set(startKey, h0);

    let current = null;
    let found   = false;

    const dirs = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
      [-1, -1], [-1, 1], [1, -1], [1, 1]
    ];

    while (openHeap.size > 0) {
      current = openHeap.pop();
      const currKey = nodeKey(current.r, current.c, current.etaH);

      // ── Stale-entry detection (lazy deletion) ─────────────────────────────
      // Skip if already expanded, OR if openMap holds a strictly lower f for
      // this state (meaning a better push arrived after this one was queued).
      if (closedSet.has(currKey)) continue;
      const knownBestF = openMap.get(currKey);
      if (knownBestF !== undefined && current.f > knownBestF + 1e-9) continue;

      closedSet.add(currKey);
      openMap.delete(currKey);

      if (current.r === endR && current.c === endC) {
        found = true;
        break;
      }

      for (let dir of dirs) {
        const nr = current.r + dir[0];
        const nc = current.c + dir[1];
        if (nr < 0 || nr >= gridRows || nc < 0 || nc >= gridCols) continue;

        // World-space cell centre of the neighbor
        const ncx = nc * cellW + cellW / 2;
        const ncy = nr * cellH + cellH / 2;

        const stepDistSU    = Math.hypot((nc - current.c) * cellW, (nr - current.r) * cellH);
        const currentDist   = gDistance.get(currKey) || 0;
        const tentativeDist = currentDist + stepDistSU;
        // Exact ETA in hours — used for all iceberg physics below.
        // Formula: SU / (SU/sec × sec/hr) = hr  ✓
        const etaH = tentativeDist / (shipSpeed * 3600);

        // ── HARD BLOCK (physical collision only) — uses EXACT etaH ──────────
        if (isHardBlocked(ncx, ncy, etaH, icebergs)) continue;

        // Time-aware state key for the neighbor
        const neighborKey = nodeKey(nr, nc, etaH);

        // Skip if this (r, c, timeBucket) state is already permanently closed
        if (closedSet.has(neighborKey)) continue;

        // ── SOFT TRAVERSAL COST — uses EXACT etaH ────────────────────────────
        const cellCost = getTraversalCost(ncx, ncy, etaH, cellW, cellH, icebergCostMult, seaIceCostMult, state, vectorField, icebergs);

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

        const moveDist        = (dir[0] !== 0 && dir[1] !== 0) ? 1.414 : 1.0;
        const rawTraverseCost = moveDist * cellCost + envPenalty + turnPenalty;
        const traverseCost    = Math.max(0.2 * moveDist, rawTraverseCost);
        const tentativeG      = (gScore.get(currKey) || 0) + traverseCost;

        const existingG = gScore.get(neighborKey);
        if (existingG === undefined || tentativeG < existingG) {
          // Store the full parent triple so path reconstruction can walk the
          // time-aware chain without relying on spatial coordinates alone.
          cameFrom.set(neighborKey, { r: current.r, c: current.c, etaH: current.etaH });
          gScore.set(neighborKey, tentativeG);
          gDistance.set(neighborKey, tentativeDist);
          const h = Math.hypot(nc - endC, nr - endR) * (routeCalibration.heuristicWeight || 1.0);
          const f = tentativeG + h;
          // Push new heap entry.  Any previous entry for this key becomes stale:
          // when it is eventually popped, openMap will show a lower f → skip.
          openHeap.push({ r: nr, c: nc, etaH, f });
          openMap.set(neighborKey, f); // record best known f for stale detection
        }
      }
    }

    let waypoints = [];

    if (found) {
      // Reconstruct path by walking the time-aware parent chain.
      // cameFrom maps stateKey → {r, c, etaH}; output is WORLD coordinates only
      // (the time dimension is an internal search concern and not exported).
      let node = { r: current.r, c: current.c, etaH: current.etaH };
      while (node) {
        waypoints.push({
          x: node.c * cellW + cellW / 2,
          y: node.r * cellH + cellH / 2
        });
        const nk = nodeKey(node.r, node.c, node.etaH);
        node = cameFrom.get(nk);
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
        const lastRouteVal = this.validateRoute(this.lastValidRoute, icebergs, shipSpeed, state);
        if (lastRouteVal.valid) {
          console.warn("Using revalidated lastValidRoute as fallback.");
          finalPath = this.lastValidRoute;
        } else {
          console.warn("lastValidRoute is no longer safe (icebergs moved). Falling back to direct line.");
          finalPath = [
            { x: ship.x, y: ship.y },
            { x: dest.x, y: dest.y }
          ];
        }
      } else {
        console.warn("No valid route exists. Falling back to direct line");
        finalPath = [
          { x: ship.x, y: ship.y },
          { x: dest.x, y: dest.y }
        ];
      }
    }

    // ── STEP 2 & 4: TURNING-RADIUS-AWARE TURN CURVING & SAFETY CHECK ──
    if (finalPath.length >= 3) {
      const curvedPath = [];
      curvedPath.push(finalPath[0]);

      // Estimate turning radius based on ship physical limits:
      // rudder max 35deg gives 30deg/sec at max speed 30 SU/s.
      // turning speed = ~10 SU/s -> 10 deg/sec = 0.174 rad/sec
      // Radius = Speed / AngularSpeed = 10 / 0.174 ≈ 57 SU. Let's start with a safe, conservative 60-80 SU radius.
      let turnRadius = 80.0; 

      for (let i = 1; i < finalPath.length - 1; i++) {
        const ptPrev = finalPath[i - 1];
        const ptCurr = finalPath[i];
        const ptNext = finalPath[i + 1];

        // Directions and distances
        const dx1 = ptCurr.x - ptPrev.x;
        const dy1 = ptCurr.y - ptPrev.y;
        const len1 = Math.hypot(dx1, dy1);

        const dx2 = ptNext.x - ptCurr.x;
        const dy2 = ptNext.y - ptCurr.y;
        const len2 = Math.hypot(dx2, dy2);

        if (len1 < 5.0 || len2 < 5.0) {
          curvedPath.push(ptCurr);
          continue;
        }

        const ux1 = dx1 / len1;
        const uy1 = dy1 / len1;
        const ux2 = dx2 / len2;
        const uy2 = dy2 / len2;

        // Angle between incoming and outgoing segments
        const cosAngle = ux1 * ux2 + uy1 * uy2;
        const angle = Math.acos(Math.max(-1.0, Math.min(1.0, cosAngle)));

        // Skip curving for almost straight segments (less than 5 degrees change)
        if (angle < 0.08) {
          curvedPath.push(ptCurr);
          continue;
        }

        // Calculate fillet tangent distance: T = R * tan(theta / 2)
        // Since it's a corner transition, turn angle = 180 - angle. Half turn angle = (pi - angle)/2
        const halfTurnAngle = (Math.PI - angle) / 2;
        let tangentDist = turnRadius * Math.tan(halfTurnAngle);

        // Keep tangent distance within segment bounds to avoid overlaps
        const maxTangent = Math.min(len1 * 0.45, len2 * 0.45);
        let currentRadius = turnRadius;
        if (tangentDist > maxTangent) {
          tangentDist = maxTangent;
          currentRadius = tangentDist / Math.tan(halfTurnAngle);
        }

        // Tangency start and end points
        const tStart = {
          x: ptCurr.x - ux1 * tangentDist,
          y: ptCurr.y - uy1 * tangentDist
        };
        const tEnd = {
          x: ptCurr.x + ux2 * tangentDist,
          y: ptCurr.y + uy2 * tangentDist
        };

        // Generate quadratic Bezier curve samples as turn fillet
        const curveSamples = [];
        const numSamples = 6;
        for (let k = 0; k <= numSamples; k++) {
          const t = k / numSamples;
          const sx = (1 - t) * (1 - t) * tStart.x + 2 * (1 - t) * t * ptCurr.x + t * t * tEnd.x;
          const sy = (1 - t) * (1 - t) * tStart.y + 2 * (1 - t) * t * ptCurr.y + t * t * tEnd.y;
          curveSamples.push({ x: sx, y: sy });
        }

        // Step 4: Validate curve samples against collisions
        let curveSafe = true;
        let accumDist = 0;
        // Approximate time along route for validation
        for (let k = 0; k < curveSamples.length - 1; k++) {
          const cA = curveSamples[k];
          const cB = curveSamples[k + 1];
          const dS = Math.hypot(cB.x - cA.x, cB.y - cA.y);
          const etaSample = (accumDist + dS) / (3600 * shipSpeed);
          if (isHardBlocked(cB.x, cB.y, etaSample, icebergs)) {
            curveSafe = false;
            break;
          }
          accumDist += dS;
        }

        if (curveSafe) {
          curvedPath.push(tStart);
          for (let k = 1; k < curveSamples.length - 1; k++) {
            curvedPath.push(curveSamples[k]);
          }
          curvedPath.push(tEnd);
        } else {
          // If unsafe, fallback directly to the raw corner point
          curvedPath.push(ptCurr);
        }
      }
      curvedPath.push(finalPath[finalPath.length - 1]);
      finalPath = curvedPath;
    }

    this.optimalRoute = finalPath;
    if (realShip) {
      this.lastValidRoute = finalPath;
    }

    // Populate the Single Source of Truth navigation.activeRoute object in the state
    if (state && state.navigation) {
      // Risk scoring segments for coloring
      const segmentsWithRisk = [];
      let maxRisk = 0;
      
      for (let i = 0; i < finalPath.length - 1; i++) {
        const ptA = finalPath[i];
        const ptB = finalPath[i + 1];
        
        let minClearance = Infinity;
        for (const iceberg of icebergs) {
          const dx = ptB.x - ptA.x;
          const dy = ptB.y - ptA.y;
          const segLen2 = dx * dx + dy * dy;
          let t = 0;
          if (segLen2 > 0) {
            t = Math.max(0, Math.min(1, ((iceberg.x - ptA.x) * dx + (iceberg.y - ptA.y) * dy) / segLen2));
          }
          const cx = ptA.x + t * dx;
          const cy = ptA.y + t * dy;
          const dist = Math.hypot(iceberg.x - cx, iceberg.y - cy);
          const clearance = dist - iceberg.collisionRadius;
          minClearance = Math.min(minClearance, clearance);
        }
        
        // Normalize 0-1 risk score (under 50 world units = critical, 500 = caution, 1000 = safe)
        const riskScore = Math.max(0, Math.min(1.0, 1.0 - (minClearance / 1000.0)));
        let status = 'safe';
        if (riskScore > 0.75) status = 'critical';
        else if (riskScore > 0.50) status = 'danger';
        else if (riskScore > 0.25) status = 'caution';

        ptA.riskScore = riskScore;
        ptA.status = status;
        ptA.minClearance = minClearance;
        maxRisk = Math.max(maxRisk, riskScore);
      }

      let totalRouteDistance = 0;
      for (let i = 0; i < finalPath.length - 1; i++) {
        totalRouteDistance += Math.hypot(finalPath[i+1].x - finalPath[i].x, finalPath[i+1].y - finalPath[i].y);
      }

      const activeRoute = state.navigation.activeRoute;
      const isUrgentOrInvalid = !activeRoute || activeRoute.status !== 'valid' || state.navigation.routeInvalid === true;
      const timeSinceLastRoute = performance.now() - (this.lastRouteTime || 0);

      // Route similarity check: compute max distance deviation between paths
      let isGeometricallySimilar = false;
      if (activeRoute && activeRoute.waypoints && activeRoute.waypoints.length > 1) {
        const actPath = activeRoute.waypoints;
        if (actPath.length === finalPath.length) {
          let maxDiff = 0;
          for (let k = 0; k < finalPath.length; k++) {
            maxDiff = Math.max(maxDiff, Math.hypot(finalPath[k].x - actPath[k].x, finalPath[k].y - actPath[k].y));
          }
          if (maxDiff < 40.0) {
            isGeometricallySimilar = true;
          }
        }
      }

      // Adoption Gate
      let shouldAdopt = isUrgentOrInvalid;
      if (!shouldAdopt && timeSinceLastRoute >= 5000) {
        // Adopt if candidate is materially safer or significantly shorter, and not just jitter
        if (maxRisk < (activeRoute.maxRiskSegment || 1.0) - 0.15) {
          shouldAdopt = true;
        } else if (totalRouteDistance < (activeRoute.totalDistance || Infinity) - 100.0) {
          shouldAdopt = true;
        }
      }

      if (isGeometricallySimilar) {
        // Refresh metadata without generating new route ID or resetting progress
        activeRoute.expiresAt = performance.now() + 60000;
        activeRoute.maxRiskSegment = maxRisk;
        activeRoute.totalDistance = totalRouteDistance;
      } else if (shouldAdopt) {
        state.navigation.activeRoute = {
          id: `route_${Date.now()}`,
          waypoints: finalPath,
          rawPath: waypoints,
          smoothPath: finalPath,
          status: 'valid',
          createdAt: performance.now(),
          expiresAt: performance.now() + 60000,
          totalDistance: totalRouteDistance,
          estimatedDuration: totalRouteDistance / (shipSpeed * 3600),
          maxRiskSegment: maxRisk,
          destination: dest
        };

        if (realShip && realShip.setRouteWaypoints) {
          // Project current ship position onto new route to preserve progress
          realShip.setRouteWaypoints(finalPath);
        }
        this.lastRouteTime = performance.now();
      }
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
