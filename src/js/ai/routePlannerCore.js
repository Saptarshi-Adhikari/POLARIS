import routeCalibration from '../../data/routeCalibration.json';

/**
 * Self-contained binary min-heap for A* open set.
 */
class MinHeap {
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

function getIcebergPositionAt(ice, etaHours) {
  if (ice && typeof ice.getPositionAt === 'function') {
    return ice.getPositionAt(etaHours);
  }
  if (!ice) return { x: 0, y: 0, uncertainty: 20 };

  const defaultX = Number.isFinite(ice.x) ? ice.x : 0;
  const defaultY = Number.isFinite(ice.y) ? ice.y : 0;
  const baseR = ice.collisionRadius || 20;
  const targetTime = Number.isFinite(etaHours) ? Math.max(0, etaHours) : 0;

  const points = [{ timeHours: 0, x: defaultX, y: defaultY, uncertainty: baseR }];

  if (ice.trajectoryForecast && ice.trajectoryForecast.length > 0) {
    for (let f of ice.trajectoryForecast) {
      if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
        const h = Number.isFinite(f.hour) ? f.hour : (Number.isFinite(f.time) ? f.time / 60 : 0);
        if (points.some(p => Math.abs(p.timeHours - h) < 0.05)) continue;
        points.push({ timeHours: h, x: f.x, y: f.y, uncertainty: baseR + h * 2.5 });
      }
    }
  }
  points.sort((a, b) => a.timeHours - b.timeHours);

  if (targetTime <= 0) return points[0];

  if (points.length === 1) {
    const dtSec = targetTime * 3600;
    return {
      x: defaultX + (ice.vx || 0) * dtSec,
      y: defaultY + (ice.vy || 0) * dtSec,
      uncertainty: baseR + (ice.uncertaintyGrowthRate || 0.5) * dtSec
    };
  }

  if (targetTime >= points[points.length - 1].timeHours) {
    const last = points[points.length - 1];
    const extraHours = targetTime - last.timeHours;
    const dtSec = extraHours * 3600;
    return {
      x: last.x + (ice.vx || 0) * dtSec,
      y: last.y + (ice.vy || 0) * dtSec,
      uncertainty: last.uncertainty + (ice.uncertaintyGrowthRate || 0.5) * dtSec
    };
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

export function isHardBlocked(cx, cy, etaHours, icebergs = []) {
  for (let ice of (icebergs || [])) {
    const icePos = getIcebergPositionAt(ice, etaHours);
    const dist = Math.hypot(cx - icePos.x, cy - icePos.y);
    // Safety envelope: iceberg radius + ship hull (15) + static buffer (30) + maneuvering margin (20: turning radius / rudder lag / current drift) = 65
    const hardR = (ice.collisionRadius || 20) + 15 + 30 + 20;
    if (dist < hardR) return true;
  }
  return false;
}

export function isSegmentHardBlocked(pA, pB, etaStart = 0, etaEnd = 0, icebergs = []) {
  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const segLen2 = dx * dx + dy * dy;
  const segLen = Math.hypot(dx, dy);

  const numSamples = Math.max(5, Math.ceil(segLen / 10));
  for (let k = 0; k <= numSamples; k++) {
    const ratio = k / numSamples;
    const sx = pA.x + ratio * dx;
    const sy = pA.y + ratio * dy;
    const etaSample = etaStart + ratio * (etaEnd - etaStart);

    for (let ice of (icebergs || [])) {
      const icePos = getIcebergPositionAt(ice, etaSample);
      // Safety envelope: iceberg radius + ship hull (15) + static buffer (30) + maneuvering margin (20) = 65
      const hardR = (ice.collisionRadius || 20) + 15 + 30 + 20;
      const dist = Math.hypot(sx - icePos.x, sy - icePos.y);
      if (dist < hardR) return true;
    }
  }
  return false;
}

export function getTraversalCost(cx, cy, etaHours, cellW, cellH, icebergCostMult, seaIceCostMult, state, vectorFieldData, icebergs) {
  let cost = 1.0;

  for (let ice of icebergs) {
    const icePos = getIcebergPositionAt(ice, etaHours);
    const dist = Math.hypot(cx - icePos.x, cy - icePos.y);
    const hardR = (ice.collisionRadius || 20) + 15;
    const uRadius = icePos.uncertainty || 0;
    const softInner = hardR + uRadius * 0.3;
    const softOuter = softInner + 200;

    if (dist < softOuter) {
      const t = Math.max(0, 1 - (dist - softInner) / (softOuter - softInner));
      cost += t * t * (routeCalibration.icebergWeight || 10.0) * 1.5 * icebergCostMult;
    }
  }

  if (state?.environment?.seaIce?.enabled && vectorFieldData?.seaIceGrid) {
    const grid = vectorFieldData.seaIceGrid;
    if (grid && grid.cols && grid.rows && grid.data) {
      const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(cx / (3600 / grid.cols))));
      const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(cy / (2400 / grid.rows))));
      const iceConc = grid.data[row * grid.cols + col] || 0;
      if (iceConc > 0.1) cost += iceConc * (routeCalibration.seaIceWeight || 5.0) * 2 * seaIceCostMult;
    }
  }

  return cost;
}

export function validateRoute(waypoints, icebergs, shipSpeed = 20.0, width = 3600, height = 2400) {
  if (!waypoints || waypoints.length < 2) return { valid: false, reason: "Insufficient points" };

  for (let pt of waypoints) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
      return { valid: false, reason: "Non-finite waypoint coordinate detected" };
    }
    if (pt.x < 0 || pt.x > width || pt.y < 0 || pt.y > height) {
      return { valid: false, reason: "Waypoint outside world bounds" };
    }
  }

  let accumulatedDistance = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const ptA = waypoints[i];
    const ptB = waypoints[i+1];
    const dx = ptB.x - ptA.x;
    const dy = ptB.y - ptA.y;
    const segLen = Math.hypot(dx, dy);

    const etaStart = accumulatedDistance / (3600 * shipSpeed);
    const etaEnd = (accumulatedDistance + segLen) / (3600 * shipSpeed);

    if (isSegmentHardBlocked(ptA, ptB, etaStart, etaEnd, icebergs)) {
      return { valid: false, reason: "Segment crosses iceberg collision zone" };
    }
    accumulatedDistance += segLen;
  }

  // Check self-intersection loops
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

export function runRoutePlannerCore(payload) {
  const startTime = performance.now();
  const { requestId, ship, icebergs, dest, mode, state, width = 3600, height = 2400, vectorFieldData = {} } = payload;

  const gridCols = 72;
  const gridRows = 48;
  const cellW = width / gridCols;
  const cellH = height / gridRows;

  const startC = Math.max(0, Math.min(gridCols - 1, Math.floor(ship.x / cellW)));
  const startR = Math.max(0, Math.min(gridRows - 1, Math.floor(ship.y / cellH)));
  const endC   = Math.max(0, Math.min(gridCols - 1, Math.floor(dest.x  / cellW)));
  const endR   = Math.max(0, Math.min(gridRows - 1, Math.floor(dest.y  / cellH)));

  let icebergCostMult = 1.0;
  let seaIceCostMult  = 1.0;
  if (mode === 'SHORTEST' || mode === 'FASTEST') {
    icebergCostMult = 0.5;
    seaIceCostMult  = 0.2;
  } else if (mode === 'SAFEST') {
    icebergCostMult = 3.0;
    seaIceCostMult  = 2.0;
  } else if (mode === 'FUEL_EFFICIENT') {
    icebergCostMult = 1.8;
    seaIceCostMult  = 2.5;
  }

  let shipSpeed = 20.0;
  const maxSpd = state?.vessel?.maxSpeed || 30.0;
  if (mode === 'FASTEST' || mode === 'SHORTEST') {
    shipSpeed = maxSpd * 0.95;
  } else if (mode === 'BALANCED') {
    shipSpeed = maxSpd * 0.75;
  } else if (mode === 'SAFEST') {
    shipSpeed = maxSpd * 0.65;
  } else if (mode === 'FUEL_EFFICIENT') {
    shipSpeed = maxSpd * 0.55;
  } else if (ship && ship.speed && ship.speed > 5.0) {
    shipSpeed = ship.speed;
  } else {
    const throttle = ship ? (ship.throttle || 65) : 65;
    shipSpeed = maxSpd * Math.sqrt(throttle / 100);
  }

  // ── FAST-PATH: Direct straight line check ──────────────────────────────
  const dxDirect = dest.x - ship.x;
  const dyDirect = dest.y - ship.y;
  const distDirect = Math.hypot(dxDirect, dyDirect);
  let directClear = true;

  if (distDirect > 1.0) {
    if (isSegmentHardBlocked({ x: ship.x, y: ship.y }, { x: dest.x, y: dest.y }, 0, distDirect / (3600 * shipSpeed), icebergs)) {
      directClear = false;
    }
  }

  if (directClear) {
    const directWaypoints = [
      { x: ship.x, y: ship.y },
      { x: dest.x, y: dest.y }
    ];
    return {
      requestId,
      waypoints: directWaypoints,
      totalDistance: distDirect,
      maxRisk: 0,
      calcTimeMs: performance.now() - startTime,
      shipSpeed,
      dest
    };
  }

  // ── A* SEARCH ────────────────────────────────────────────────────────
  const TIME_BUCKET_H = 0.1;
  const nodeKey = (r, c, etaH) => `${r},${c},${Math.floor(etaH / TIME_BUCKET_H)}`;

  const openHeap  = new MinHeap();
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

  let maxIterations = 3000;
  while (openHeap.size > 0 && maxIterations-- > 0) {
    current = openHeap.pop();
    const currKey = nodeKey(current.r, current.c, current.etaH);

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

      const ncx = nc * cellW + cellW / 2;
      const ncy = nr * cellH + cellH / 2;

      const stepDistSU    = Math.hypot((nc - current.c) * cellW, (nr - current.r) * cellH);
      const currentDist   = gDistance.get(currKey) || 0;
      const tentativeDist = currentDist + stepDistSU;
      const etaH          = tentativeDist / (shipSpeed * 3600);

      const pA = { x: current.c * cellW + cellW / 2, y: current.r * cellH + cellH / 2 };
      const pB = { x: ncx, y: ncy };
      const startEtaH = currentDist / (shipSpeed * 3600);
      if (isSegmentHardBlocked(pA, pB, startEtaH, etaH, icebergs)) continue;

      const neighborKey = nodeKey(nr, nc, etaH);
      if (closedSet.has(neighborKey)) continue;

      const cellCost = getTraversalCost(ncx, ncy, etaH, cellW, cellH, icebergCostMult, seaIceCostMult, state, vectorFieldData, icebergs);

      let turnPenalty = 0.0;
      const prevNode = cameFrom.get(currKey);
      if (prevNode) {
        const prevDirR = current.r - prevNode.r;
        const prevDirC = current.c - prevNode.c;
        if (prevDirR !== dir[0] || prevDirC !== dir[1]) {
          turnPenalty = (routeCalibration.turnPenalty || 0.15);
        }
      } else if (ship && Number.isFinite(ship.heading)) {
        const stepAngleDeg = (Math.atan2(ncy - ship.y, ncx - ship.x) * 180 / Math.PI + 360) % 360;
        let dAngle = Math.abs((stepAngleDeg - ship.heading + 180) % 360 - 180);
        if (dAngle > 45) {
          turnPenalty = (dAngle / 90.0) * 1.5;
        }
      }

      const moveDist        = (dir[0] !== 0 && dir[1] !== 0) ? 1.414 : 1.0;
      const rawTraverseCost = moveDist * cellCost + turnPenalty;
      const traverseCost    = Math.max(0.2 * moveDist, rawTraverseCost);
      const tentativeG      = (gScore.get(currKey) || 0) + traverseCost;

      const existingG = gScore.get(neighborKey);
      if (existingG === undefined || tentativeG < existingG) {
        cameFrom.set(neighborKey, { r: current.r, c: current.c, etaH: current.etaH });
        gScore.set(neighborKey, tentativeG);
        gDistance.set(neighborKey, tentativeDist);
        const h = Math.hypot(nc - endC, nr - endR) * (routeCalibration.heuristicWeight || 1.0);
        const f = tentativeG + h;
        openHeap.push({ r: nr, c: nc, etaH, f });
        openMap.set(neighborKey, f);
      }
    }
  }

  let waypoints = [];
  if (found) {
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
    waypoints = [
      { x: ship.x, y: ship.y },
      { x: dest.x, y: dest.y }
    ];
  }

  if (waypoints.length > 0) waypoints[0] = { x: ship.x, y: ship.y };
  if (waypoints.length > 1) waypoints[waypoints.length - 1] = { x: dest.x, y: dest.y };

  // Smoothing
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

        const etaA = accumulatedDistanceToCurrentIdx / (3600 * shipSpeed);
        const etaB = (accumulatedDistanceToCurrentIdx + segLen) / (3600 * shipSpeed);
        if (isSegmentHardBlocked(ptA, ptB, etaA, etaB, icebergs)) {
          isClear = false;
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

  const valResult = validateRoute(smoothed, icebergs, shipSpeed, width, height);
  let finalPath = waypoints;
  if (valResult.valid) {
    finalPath = smoothed;
  } else {
    const rawValResult = validateRoute(waypoints, icebergs, shipSpeed, width, height);
    if (rawValResult.valid) {
      finalPath = waypoints;
    } else {
      finalPath = [
        { x: ship.x, y: ship.y },
        { x: dest.x, y: dest.y }
      ];
    }
  }

  // Turn curving pass
  if (finalPath.length >= 3) {
    const curvedPath = [];
    curvedPath.push(finalPath[0]);
    let turnRadius = 80.0;

    for (let i = 1; i < finalPath.length - 1; i++) {
      const ptPrev = finalPath[i - 1];
      const ptCurr = finalPath[i];
      const ptNext = finalPath[i + 1];

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

      const cosAngle = ux1 * ux2 + uy1 * uy2;
      const angle = Math.acos(Math.max(-1.0, Math.min(1.0, cosAngle)));

      if (angle < 0.08) {
        curvedPath.push(ptCurr);
        continue;
      }

      const halfTurnAngle = (Math.PI - angle) / 2;
      let tangentDist = turnRadius * Math.tan(halfTurnAngle);
      const maxTangent = Math.min(len1 * 0.45, len2 * 0.45);
      if (tangentDist > maxTangent) {
        tangentDist = maxTangent;
      }

      const tStart = {
        x: ptCurr.x - ux1 * tangentDist,
        y: ptCurr.y - uy1 * tangentDist
      };
      const tEnd = {
        x: ptCurr.x + ux2 * tangentDist,
        y: ptCurr.y + uy2 * tangentDist
      };

      const curveSamples = [];
      const numSamples = 6;
      for (let k = 0; k <= numSamples; k++) {
        const t = k / numSamples;
        const sx = (1 - t) * (1 - t) * tStart.x + 2 * (1 - t) * t * ptCurr.x + t * t * tEnd.x;
        const sy = (1 - t) * (1 - t) * tStart.y + 2 * (1 - t) * t * ptCurr.y + t * t * tEnd.y;
        curveSamples.push({ x: sx, y: sy });
      }

      let curveSafe = true;
      let accumDist = 0;
      for (let k = 0; k < curveSamples.length - 1; k++) {
        const cA = curveSamples[k];
        const cB = curveSamples[k + 1];
        const dS = Math.hypot(cB.x - cA.x, cB.y - cA.y);
        const etaSample = (accumDist + dS) / (3600 * shipSpeed);
        if (isSegmentHardBlocked(cA, cB, accumDist / (3600 * shipSpeed), (accumDist + dS) / (3600 * shipSpeed), icebergs)) {
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
        curvedPath.push(ptCurr);
      }
    }
    curvedPath.push(finalPath[finalPath.length - 1]);
    const curvedValResult = validateRoute(curvedPath, icebergs, shipSpeed, width, height);
    if (curvedValResult.valid) {
      finalPath = curvedPath;
    }
  }

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
      const clearance = dist - (iceberg.collisionRadius || 20);
      minClearance = Math.min(minClearance, clearance);
    }

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

  // Calculate average sea ice concentration along final path
  let totalIceConc = 0;
  let sampleCount = 0;
  for (let pt of finalPath) {
    if (state?.environment?.seaIce?.enabled && vectorFieldData?.seaIceGrid) {
      const grid = vectorFieldData.seaIceGrid;
      if (grid && grid.cols && grid.rows && grid.data) {
        const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(pt.x / (width / grid.cols))));
        const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(pt.y / (height / grid.rows))));
        totalIceConc += (grid.data[row * grid.cols + col] || 0);
        sampleCount++;
      }
    }
  }
  const avgIceConc = sampleCount > 0 ? (totalIceConc / sampleCount) : 0.05;

  // Compute fuel burn rate using physics constants from ship.js (quadratic drag: power ~ v^2)
  const speedRatio = Math.max(0.1, Math.min(1.0, shipSpeed / maxSpd));
  const throttleRatio = Math.pow(speedRatio, 2);
  const enginePowerMultiplier = state?.vessel?.enginePower || 1.0;
  const weatherMult = vectorFieldData.stormMode ? 1.3 : 1.0;
  const baseConsumption = 0.005;
  const throttleBurn = 0.045 * throttleRatio * enginePowerMultiplier;
  const durationSec = totalRouteDistance / (shipSpeed || 20.0);
  const iceDragFactor = 1.0 + (avgIceConc * 1.5);
  const estimatedFuelConsumption = parseFloat(((baseConsumption + throttleBurn) * durationSec * weatherMult * iceDragFactor).toFixed(1));
  const estimatedDurationHours = parseFloat((durationSec / 3600).toFixed(2));

  return {
    requestId,
    waypoints: finalPath,
    rawPath: waypoints,
    totalDistance: totalRouteDistance,
    maxRisk,
    estimatedDuration: estimatedDurationHours,
    eta: estimatedDurationHours,
    estimatedFuelConsumption,
    calcTimeMs: performance.now() - startTime,
    shipSpeed,
    dest
  };
}
