/**
 * POLARIS Normalized Data Schemas
 * Standardized data models consumed by the navigation engine regardless of DATA MODE (DEMO vs REAL).
 */

export function createNormalizedHazard({
  id,
  type = 'ICEBERG',
  latitude,
  longitude,
  position = { x: 0, y: 0 },
  velocity = { vx: 0, vy: 0 },
  geometry = { size: 500, radius: 25, mass: 1.0 },
  timestamp = Date.now(),
  uncertainty = 0.05,
  confidence = 0.95,
  source = 'DEMO_SYNTHETIC',
  rawObserved = true
}) {
  return {
    id: String(id),
    type,
    latitude: Number(latitude),
    longitude: Number(longitude),
    position: { x: Number(position.x || 0), y: Number(position.y || 0) },
    velocity: { vx: Number(velocity.vx || 0), vy: Number(velocity.vy || 0) },
    geometry: {
      size: Number(geometry.size || 500),
      radius: Number(geometry.radius || geometry.collisionRadius || 25),
      mass: Number(geometry.mass || 1.0)
    },
    timestamp: Number(timestamp),
    uncertainty: Number(uncertainty),
    confidence: Number(confidence),
    source: String(source),
    rawObserved: Boolean(rawObserved)
  };
}

export function createNormalizedEnvironment({
  timestamp = Date.now(),
  current = { speed: 1.8, direction: 127, vx: 0.2, vy: 0.1 },
  wind = { speed: 45.2, direction: 247, vx: -0.5, vy: -0.2 },
  seaIce = { concentration: 0.2, resistanceFactor: 1.0 },
  visibility = 10.0,
  source = 'DEMO_SYNTHETIC'
}) {
  return {
    timestamp: Number(timestamp),
    current: {
      speed: Number(current.speed || 0),
      direction: Number(current.direction || 0),
      vx: Number(current.vx || 0),
      vy: Number(current.vy || 0)
    },
    wind: {
      speed: Number(wind.speed || 0),
      direction: Number(wind.direction || 0),
      vx: Number(wind.vx || 0),
      vy: Number(wind.vy || 0)
    },
    seaIce: {
      concentration: Number(seaIce.concentration || 0),
      resistanceFactor: Number(seaIce.resistanceFactor || 1.0)
    },
    visibility: Number(visibility),
    source: String(source)
  };
}

export function createNormalizedVesselObservation({
  id = 'POLARIS_01',
  timestamp = Date.now(),
  latitude = -65.0,
  longitude = -60.0,
  speed = 12.0,
  course = 330,
  heading = 330,
  source = 'AIS_NAV'
}) {
  return {
    id: String(id),
    timestamp: Number(timestamp),
    latitude: Number(latitude),
    longitude: Number(longitude),
    speed: Number(speed),
    course: Number(course),
    heading: Number(heading),
    source: String(source)
  };
}

export function validateHazardSchema(hazard) {
  if (!hazard || typeof hazard !== 'object') return { valid: false, reason: 'Hazard must be an object' };
  if (!hazard.id) return { valid: false, reason: 'Hazard missing id' };
  if (isNaN(hazard.latitude) || hazard.latitude < -90 || hazard.latitude > 90) {
    return { valid: false, reason: `Invalid latitude: ${hazard.latitude}` };
  }
  if (isNaN(hazard.longitude) || hazard.longitude < -180 || hazard.longitude > 180) {
    return { valid: false, reason: `Invalid longitude: ${hazard.longitude}` };
  }
  if (isNaN(hazard.position.x) || isNaN(hazard.position.y)) {
    return { valid: false, reason: 'Position coordinates must be finite numbers' };
  }
  return { valid: true };
}
