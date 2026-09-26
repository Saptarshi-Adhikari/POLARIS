/**
 * POLARIS Antarctic Land / Water Mask Boundary
 *
 * Provides geographic land polygon definitions and intersection testing
 * to ensure ship positions, destinations, and routes remain in NAVIGABLE WATER.
 */

import { inverseProjection, REFERENCE_ORIGIN } from './projection.js';
import { antarcticaCoastlineData as coastlineData } from './antarcticaCoastlineData.js';

// Extract Antarctic continent / ice shelf land polygon coordinates [[lon, lat], ...]
let antarcticLandPolygon = [];
if (coastlineData && Array.isArray(coastlineData.features)) {
  const landFeature = coastlineData.features.find(f => f.geometry && f.geometry.type === 'Polygon');
  if (landFeature && Array.isArray(landFeature.geometry.coordinates) && landFeature.geometry.coordinates.length > 0) {
    antarcticLandPolygon = landFeature.geometry.coordinates[0];
  }
}

if (antarcticLandPolygon.length === 0) {
  // Fallback explicit Antarctic continent land polygon (East Antarctica Prydz Bay / Amery Ice Shelf sector)
  antarcticLandPolygon = [
    [70.0, -68.0], [72.0, -68.5], [74.0, -68.8], [76.0, -69.2], [78.0, -69.5], [80.0, -69.1],
    [82.0, -68.7], [85.0, -69.5], [88.0, -70.2], [90.0, -71.0], [85.0, -72.5], [80.0, -73.0],
    [75.0, -73.5], [70.0, -72.0], [68.0, -70.5], [70.0, -68.0]
  ];
}

/**
 * Standard Ray-Casting Point-in-Polygon check for Lat/Lon coordinates
 * Returns true if (lon, lat) lies inside the Antarctic Land / Ice Shelf polygon
 */
export function isPointInLandPolygon(lon, lat, polygon = antarcticLandPolygon) {
  if (typeof lon !== 'number' || typeof lat !== 'number' || isNaN(lon) || isNaN(lat)) {
    return false;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Check if a geographic coordinate (lat, lon) is in NAVIGABLE WATER
 * (South of -45°S and NOT inside Antarctic Land Polygon)
 */
export function isGeographicWater(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    return false;
  }
  if (lat > -45.0) return false; // Must be in Antarctic operating domain
  return !isPointInLandPolygon(lon, lat);
}

/**
 * Convert POLARIS World Coordinates (0..3600 x 0..2400) to Lat/Lon
 */
export function worldToLatLonCoords(wx, wy, origin = REFERENCE_ORIGIN) {
  if (typeof wx !== 'number' || typeof wy !== 'number' || isNaN(wx) || isNaN(wy)) {
    return null;
  }
  const x_nm = (wx - 1800) / 10;
  const y_nm = (1200 - wy) / 10;
  const proj = inverseProjection(x_nm, y_nm, origin);
  if (!proj || typeof proj.lon !== 'number' || typeof proj.lat !== 'number' || isNaN(proj.lon) || isNaN(proj.lat)) {
    return null;
  }
  return { lat: proj.lat, lon: proj.lon };
}

/**
 * Check if a world coordinate (wx, wy) is in NAVIGABLE WATER
 */
export function isWorldPointInWater(wx, wy) {
  const geo = worldToLatLonCoords(wx, wy);
  if (!geo) return false;
  return isGeographicWater(geo.lat, geo.lon);
}

/**
 * Check if a line segment between two world points (pA, pB) is 100% WATER-ONLY
 * Samples along the segment to detect land polygon crossings.
 */
export function isWorldSegmentWaterOnly(pA, pB, sampleDistance = 15) {
  if (!pA || !pB || typeof pA.x !== 'number' || typeof pA.y !== 'number' || typeof pB.x !== 'number' || typeof pB.y !== 'number') {
    return false;
  }

  const dx = pB.x - pA.x;
  const dy = pB.y - pA.y;
  const len = Math.hypot(dx, dy);

  const numSamples = Math.max(4, Math.ceil(len / sampleDistance));
  for (let k = 0; k <= numSamples; k++) {
    const ratio = k / numSamples;
    const sx = pA.x + ratio * dx;
    const sy = pA.y + ratio * dy;
    if (!isWorldPointInWater(sx, sy)) {
      return false; // Found land sample along segment
    }
  }

  return true; // Segment is 100% in water
}
