/**
 * POLARIS Equirectangular Projection & Geodetic Utility Module
 *
 * Reference Origin: Bharati Approach Corridor (lat0 = -69.4°, lon0 = 76.187°)
 * Units: Nautical Miles (NM)
 * Conversion: 1 degree latitude = 60 NM; 1 degree longitude = 60 * cos(lat0) NM
 */

export const REFERENCE_ORIGIN = {
  lat0: -69.4,
  lon0: 76.187
};

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/** Helper to validate numeric value */
function isNum(val) {
  return typeof val === 'number' && !isNaN(val) && isFinite(val);
}

/**
 * Forward Equirectangular Projection: Lat/Lon -> Nautical Miles (x_nm, y_nm) relative to origin
 */
export function forwardProjection(lat, lon, origin = REFERENCE_ORIGIN) {
  const safeLat = isNum(lat) ? lat : origin.lat0;
  const safeLon = isNum(lon) ? lon : origin.lon0;
  const safeOrigin = origin && isNum(origin.lat0) && isNum(origin.lon0) ? origin : REFERENCE_ORIGIN;

  const cosLat0 = Math.cos(safeOrigin.lat0 * RAD);
  const x_nm = (safeLon - safeOrigin.lon0) * 60 * cosLat0;
  const y_nm = (safeLat - safeOrigin.lat0) * 60;
  return { x_nm, y_nm };
}

/**
 * Inverse Equirectangular Projection: Nautical Miles (x_nm, y_nm) -> Lat/Lon
 */
export function inverseProjection(x_nm, y_nm, origin = REFERENCE_ORIGIN) {
  const safeX = isNum(x_nm) ? x_nm : 0;
  const safeY = isNum(y_nm) ? y_nm : 0;
  const safeOrigin = origin && isNum(origin.lat0) && isNum(origin.lon0) ? origin : REFERENCE_ORIGIN;

  const cosLat0 = Math.cos(safeOrigin.lat0 * RAD);
  const lat = safeOrigin.lat0 + (safeY / 60);
  const lon = safeOrigin.lon0 + (safeX / (60 * cosLat0));
  return { lat, lon };
}

/**
 * Compute Haversine distance between two lat/lon coordinates in Nautical Miles (NM)
 */
export function haversineDistanceNM(lat1, lon1, lat2, lon2) {
  if (!isNum(lat1) || !isNum(lon1) || !isNum(lat2) || !isNum(lon2)) {
    return 0;
  }
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const dPhi = (lat2 - lat1) * RAD;
  const dLambda = (lon2 - lon1) * RAD;

  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return 3440.065 * c;
}

/**
 * Compute initial bearing (forward azimuth) from point 1 to point 2 in degrees (0-360)
 */
export function calculateInitialBearing(lat1, lon1, lat2, lon2) {
  if (!isNum(lat1) || !isNum(lon1) || !isNum(lat2) || !isNum(lon2)) {
    return 0;
  }
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const dLambda = (lon2 - lon1) * RAD;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const theta = Math.atan2(y, x);

  return Math.round((theta * DEG + 360) % 360);
}

/**
 * Minimum distance in NM from a point (plat, plon) to a segment (lat1, lon1) -> (lat2, lon2)
 */
export function pointToSegmentDistanceNM(plat, plon, lat1, lon1, lat2, lon2) {
  if (!isNum(plat) || !isNum(plon) || !isNum(lat1) || !isNum(lon1) || !isNum(lat2) || !isNum(lon2)) {
    return 0;
  }
  const dSegmentSq = (lat2 - lat1) ** 2 + (lon2 - lon1) ** 2;
  if (dSegmentSq < 1e-9) {
    return haversineDistanceNM(plat, plon, lat1, lon1);
  }

  // Projection parameter t onto segment
  let t = ((plat - lat1) * (lat2 - lat1) + (plon - lon1) * (lon2 - lon1)) / dSegmentSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = lat1 + t * (lat2 - lat1);
  const projLon = lon1 + t * (lon2 - lon1);

  return haversineDistanceNM(plat, plon, projLat, projLon);
}

/**
 * Calculate minimum distance in NM from an iceberg (plat, plon) to an array of route waypoints [[lon, lat], ...]
 */
export function minDistanceToRouteNM(plat, plon, routeCoords) {
  if (!isNum(plat) || !isNum(plon) || !Array.isArray(routeCoords) || routeCoords.length === 0) {
    return Infinity;
  }
  if (routeCoords.length === 1) {
    return haversineDistanceNM(plat, plon, routeCoords[0][1], routeCoords[0][0]);
  }

  let minDist = Infinity;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const p1 = routeCoords[i];
    const p2 = routeCoords[i + 1];
    if (Array.isArray(p1) && Array.isArray(p2) && p1.length >= 2 && p2.length >= 2) {
      const dist = pointToSegmentDistanceNM(plat, plon, p1[1], p1[0], p2[1], p2[0]);
      if (dist < minDist) {
        minDist = dist;
      }
    }
  }

  return minDist;
}

/**
 * Format lat/lon into standard maritime representation: e.g., 69°24′S 076°11′E
 */
export function formatLatLon(lat, lon) {
  if (!isNum(lat) || !isNum(lon)) {
    return '00°00′S 000°00′E';
  }
  const latAbs = Math.abs(lat);
  const latDeg = Math.floor(latAbs);
  const latMin = Math.round((latAbs - latDeg) * 60);
  const latHemi = lat >= 0 ? 'N' : 'S';

  const lonAbs = Math.abs(lon);
  const lonDeg = Math.floor(lonAbs);
  const lonMin = Math.round((lonAbs - lonDeg) * 60);
  const lonHemi = lon >= 0 ? 'E' : 'W';

  const latStr = `${String(latDeg).padStart(2, '0')}°${String(latMin).padStart(2, '0')}′${latHemi}`;
  const lonStr = `${String(lonDeg).padStart(3, '0')}°${String(lonMin).padStart(2, '0')}′${lonHemi}`;

  return `${latStr} ${lonStr}`;
}

/**
 * Compute CPA (Closest Point of Approach) & TCPA for ship and target iceberg.
 * Tangent-plane relative velocity projection in NM and hours/minutes.
 *
 * Heading convention: 0° = East (+X), 90° = South (+Y), 180° = West (-X), 270° = North (-Y).
 */
export function calculateEncounterCPA({
  shipLat, shipLon, shipSpeedKn, shipHeadingDeg,
  targetLat, targetLon, targetSpeedKn = null, targetHeadingDeg = null
}) {
  if (!isNum(shipLat) || !isNum(shipLon) || !isNum(shipSpeedKn) || !isNum(shipHeadingDeg) ||
      !isNum(targetLat) || !isNum(targetLon)) {
    return { cpaNm: null, tcpaMin: null, mode: 'UNAVAILABLE', reason: 'Invalid position inputs' };
  }

  // Ship velocity vector in local NM/hr (+X = East, +Y = North in geographic space)
  const shipHdgRad = shipHeadingDeg * RAD;
  const v_ship_x = shipSpeedKn * Math.cos(shipHdgRad);
  const v_ship_y = -shipSpeedKn * Math.sin(shipHdgRad); // 90° = South (-lat), 270° = North (+lat)

  // Initial relative position (Target - Ship) in NM
  const cosLat0 = Math.cos(shipLat * RAD);
  const r_x = (targetLon - shipLon) * 60 * cosLat0;
  const r_y = (targetLat - shipLat) * 60;
  const initialDistNm = Math.sqrt(r_x * r_x + r_y * r_y);

  const hasTargetMotion = isNum(targetSpeedKn) && isNum(targetHeadingDeg) && targetSpeedKn >= 0;
  let v_target_x = 0;
  let v_target_y = 0;
  let mode = 'STATIC-TARGET APPROXIMATION';

  if (hasTargetMotion && targetSpeedKn > 0) {
    const tgtHdgRad = targetHeadingDeg * RAD;
    v_target_x = targetSpeedKn * Math.cos(tgtHdgRad);
    v_target_y = -targetSpeedKn * Math.sin(tgtHdgRad);
    mode = 'OBSERVED-DRIFT CPA';
  }

  // Relative velocity vector (Target velocity relative to Ship)
  const v_rel_x = v_target_x - v_ship_x;
  const v_rel_y = v_target_y - v_ship_y;
  const v_rel_sq = v_rel_x * v_rel_x + v_rel_y * v_rel_y;

  if (v_rel_sq < 1e-4) {
    // Zero relative speed -> distance remains initial distance
    return {
      cpaNm: Math.round(initialDistNm * 10) / 10,
      tcpaMin: 0,
      mode,
      initialDistNm: Math.round(initialDistNm * 10) / 10,
      relativeSpeedKn: 0,
      reason: 'Zero relative speed'
    };
  }

  // Time of Closest Point of Approach (TCPA in hours)
  // t_cpa = - (r • v_rel) / |v_rel|²
  const r_dot_v = r_x * v_rel_x + r_y * v_rel_y;
  const tcpaHours = -r_dot_v / v_rel_sq;
  const tcpaMin = Math.round(tcpaHours * 60);

  // Position vector at TCPA: r(t) = r_0 + v_rel * t
  const r_cpa_x = r_x + v_rel_x * tcpaHours;
  const r_cpa_y = r_y + v_rel_y * tcpaHours;
  const cpaNm = Math.round(Math.sqrt(r_cpa_x * r_cpa_x + r_cpa_y * r_cpa_y) * 10) / 10;
  const relativeSpeedKn = Math.round(Math.sqrt(v_rel_sq) * 10) / 10;

  return {
    cpaNm: isFinite(cpaNm) ? cpaNm : null,
    tcpaMin: isFinite(tcpaMin) ? tcpaMin : null,
    tcpaHours: isFinite(tcpaHours) ? tcpaHours : null,
    initialDistNm: Math.round(initialDistNm * 10) / 10,
    relativeSpeedKn,
    mode,
    isOpening: tcpaHours < 0
  };
}

/** Explicit decision-support monitoring thresholds */
export const ENCOUNTER_THRESHOLDS_NM = {
  CLOSE_APPROACH_CPA_NM: 20.0,
  MONITORED_CPA_NM: 50.0,
  ROUTE_PROXIMITY_NM: 50.0
};

/**
 * Transparent encounter classification based on current distance, CPA, TCPA, and route proximity.
 */
export function classifyEncounter({ initialDistNm, cpaNm, tcpaMin, routeDistNm, isNearRoute }) {
  if (!isNum(cpaNm) && !isNum(initialDistNm)) {
    return { state: 'INFORMATIONAL', badgeColor: '#38bdf8', reason: 'Basic observation monitoring' };
  }

  const effectiveCpa = isNum(cpaNm) ? cpaNm : initialDistNm;

  if (effectiveCpa <= ENCOUNTER_THRESHOLDS_NM.CLOSE_APPROACH_CPA_NM || (isNearRoute && effectiveCpa <= 30.0)) {
    return {
      state: 'CLOSE APPROACH',
      badgeColor: '#ef4444',
      reason: `Computed CPA (${effectiveCpa} NM) is below close approach monitoring threshold (${ENCOUNTER_THRESHOLDS_NM.CLOSE_APPROACH_CPA_NM} NM)`
    };
  }

  if (effectiveCpa <= ENCOUNTER_THRESHOLDS_NM.MONITORED_CPA_NM || isNearRoute) {
    return {
      state: 'MONITORED',
      badgeColor: '#fbbf24',
      reason: isNearRoute ? `Iceberg is within route corridor threshold (${ENCOUNTER_THRESHOLDS_NM.ROUTE_PROXIMITY_NM} NM)` : `Computed CPA (${effectiveCpa} NM) is within monitoring threshold (${ENCOUNTER_THRESHOLDS_NM.MONITORED_CPA_NM} NM)`
    };
  }

  return {
    state: 'INFORMATIONAL',
    badgeColor: '#38bdf8',
    reason: 'Outside active monitoring thresholds'
  };
}

