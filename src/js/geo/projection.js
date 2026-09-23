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

/**
 * Forward Equirectangular Projection: Lat/Lon -> Nautical Miles (x_nm, y_nm) relative to origin
 */
export function forwardProjection(lat, lon, origin = REFERENCE_ORIGIN) {
  const cosLat0 = Math.cos(origin.lat0 * RAD);
  const x_nm = (lon - origin.lon0) * 60 * cosLat0;
  const y_nm = (lat - origin.lat0) * 60;
  return { x_nm, y_nm };
}

/**
 * Inverse Equirectangular Projection: Nautical Miles (x_nm, y_nm) -> Lat/Lon
 */
export function inverseProjection(x_nm, y_nm, origin = REFERENCE_ORIGIN) {
  const cosLat0 = Math.cos(origin.lat0 * RAD);
  const lat = origin.lat0 + (y_nm / 60);
  const lon = origin.lon0 + (x_nm / (60 * cosLat0));
  return { lat, lon };
}

/**
 * Compute Haversine distance between two lat/lon coordinates in Nautical Miles (NM)
 */
export function haversineDistanceNM(lat1, lon1, lat2, lon2) {
  const phi1 = lat1 * RAD;
  const phi2 = lat2 * RAD;
  const dPhi = (lat2 - lat1) * RAD;
  const dLambda = (lon2 - lon1) * RAD;

  const a = Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  // Earth radius in NM = 3440.065 NM
  return 3440.065 * c;
}

/**
 * Format lat/lon into standard maritime representation: e.g., 69°24′S 076°11′E
 */
export function formatLatLon(lat, lon) {
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
