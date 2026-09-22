/**
 * POLARIS Geographic Coordinate Transformation Boundary
 * Converts between Geographic (Latitude, Longitude) and POLARIS World Coordinates (0..3600 x 0..2400).
 *
 * WORLD BOUNDS:
 * X: 0 (West, lonMin) -> 3600 (East, lonMax)
 * Y: 0 (North, latMax) -> 2400 (South, latMin)
 */

export const DEFAULT_ANTARCTIC_BBOX = {
  latMin: -78.0, // South (Y = 2400)
  latMax: -60.0, // North (Y = 0)
  lonMin: -75.0, // West  (X = 0)
  lonMax: -35.0, // East  (X = 3600)
  worldWidth: 3600,
  worldHeight: 2400
};

export function validateGeoCoordinates(lat, lon) {
  if (lat === null || lat === undefined || isNaN(lat)) {
    return { valid: false, reason: 'Latitude must be a valid number' };
  }
  if (lon === null || lon === undefined || isNaN(lon)) {
    return { valid: false, reason: 'Longitude must be a valid number' };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, reason: `Latitude out of range [-90, 90]: ${lat}` };
  }
  if (lon < -180 || lon > 180) {
    return { valid: false, reason: `Longitude out of range [-180, 180]: ${lon}` };
  }
  return { valid: true };
}

export function geoToWorld(lat, lon, bbox = DEFAULT_ANTARCTIC_BBOX) {
  const check = validateGeoCoordinates(lat, lon);
  if (!check.valid) {
    throw new Error(`[geoToWorld] Invalid input: ${check.reason}`);
  }

  const { latMin, latMax, lonMin, lonMax, worldWidth, worldHeight } = bbox;

  // Clamp longitude & latitude to bounding box boundaries with smooth scaling
  const normX = (lon - lonMin) / (lonMax - lonMin);
  // Latitude decreases as Y increases (0 is North / latMax, 2400 is South / latMin)
  const normY = (latMax - lat) / (latMax - latMin);

  const x = Math.max(0, Math.min(worldWidth, normX * worldWidth));
  const y = Math.max(0, Math.min(worldHeight, normY * worldHeight));

  return { x, y };
}

export function worldToGeo(x, y, bbox = DEFAULT_ANTARCTIC_BBOX) {
  const { latMin, latMax, lonMin, lonMax, worldWidth, worldHeight } = bbox;

  const clampX = Math.max(0, Math.min(worldWidth, Number(x) || 0));
  const clampY = Math.max(0, Math.min(worldHeight, Number(y) || 0));

  const normX = clampX / worldWidth;
  const normY = clampY / worldHeight;

  const lon = lonMin + normX * (lonMax - lonMin);
  const lat = latMax - normY * (latMax - latMin);

  return { lat, lon };
}
