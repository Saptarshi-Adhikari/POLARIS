/**
 * ASTRALIS Nav-OS — Canonical Angle & Vector Geometry Utilities
 *
 * WORLD COORDINATE CONVENTION:
 * - World X: +X is East / Right (0 .. 3600 SU)
 * - World Y: +Y is South / Down (0 .. 2400 SU), matching HTML Canvas coordinates.
 * - Heading: 0 degrees = East (+X). Clockwise rotation (90° = South/+Y, 180° = West/-X, 270° = North/-Y).
 * - Motion equation:
 *     vx = speed * cos(heading_rad)
 *     vy = speed * sin(heading_rad)
 */

export function normalizeAngle(angleRad) {
  if (!Number.isFinite(angleRad)) return 0;
  let a = angleRad % (2 * Math.PI);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

export function normalizeAngleDeg(angleDeg) {
  if (!Number.isFinite(angleDeg)) return 0;
  let a = angleDeg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

export function radiansToDegrees(rad) {
  return (rad * 180) / Math.PI;
}

export function degreesToRadians(deg) {
  return (deg * Math.PI) / 180;
}

export function normalizeDegrees(deg) {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function normalizeSignedDegrees(deg) {
  if (!Number.isFinite(deg)) return 0;
  let result = (((deg + 180) % 360) + 360) % 360 - 180;
  return result;
}

export function headingDegreesFromVector(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  return normalizeDegrees(radiansToDegrees(Math.atan2(dy, dx)));
}

export function headingFromVector(dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 0;
  return Math.atan2(dy, dx);
}

export function distanceBetween(a, b) {
  if (!a || !b) return 0;
  const dx = (b.x || 0) - (a.x || 0);
  const dy = (b.y || 0) - (a.y || 0);
  return Math.hypot(dx, dy);
}

export function wrappedDistance(a, b, w = 3600, h = 2400) {
  if (!a || !b) return 0;
  let dx = Math.abs((b.x || 0) - (a.x || 0));
  let dy = Math.abs((b.y || 0) - (a.y || 0));
  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;
  return Math.hypot(dx, dy);
}

export function dot(ax, ay, bx, by) {
  return (ax || 0) * (bx || 0) + (ay || 0) * (by || 0);
}

export function clamp(val, min, max) {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

export function wrappedDelta(x1, y1, x2, y2, w = 3600, h = 2400) {
  let dx = x2 - x1;
  let dy = y2 - y1;
  if (dx > w / 2) dx -= w;
  else if (dx < -w / 2) dx += w;
  if (dy > h / 2) dy -= h;
  else if (dy < -h / 2) dy += h;
  return { dx, dy, dist: Math.hypot(dx, dy) };
}

export function wrappedDistanceCoords(x1, y1, x2, y2, w = 3600, h = 2400) {
  let dx = Math.abs(x2 - x1);
  let dy = Math.abs(y2 - y1);
  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;
  return Math.hypot(dx, dy);
}

export function calculateIcebergPositionAt(ice, futureTimeHours) {
  if (!ice) return { x: 0, y: 0, uncertainty: 20 };
  const defaultX = Number.isFinite(ice.x) ? ice.x : 0;
  const defaultY = Number.isFinite(ice.y) ? ice.y : 0;
  const baseR = ice.collisionRadius || 20;
  const targetTime = Number.isFinite(futureTimeHours) ? Math.max(0, futureTimeHours) : 0;

  const points = [{ timeHours: 0, x: defaultX, y: defaultY, uncertainty: baseR }];

  if (ice.mlTrajectory && ice.mlTrajectory.length > 0) {
    for (let f of ice.mlTrajectory) {
      if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
        const t = Number.isFinite(f.time) ? f.time : 0;
        points.push({ timeHours: t / 60, x: f.x, y: f.y, uncertainty: f.uncertainty || (baseR + t * 0.1) });
      }
    }
  }
  if (ice.trajectoryForecast && ice.trajectoryForecast.length > 0) {
    for (let f of ice.trajectoryForecast) {
      if (f && Number.isFinite(f.x) && Number.isFinite(f.y)) {
        const h = Number.isFinite(f.hour) ? f.hour : (Number.isFinite(f.time) ? f.time / 60 : 0);
        if (points.some(p => Math.abs(p.timeHours - h) < 0.0001)) continue;
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

export function getSegmentSpeed(x, y, cruiseSpeed, icebergs = [], turnAngleDeg = 0, state = null) {
  let effectiveSpeed = cruiseSpeed;
  const maxSpd = state?.vessel?.maxSpeed || (cruiseSpeed > 0 ? cruiseSpeed / 0.75 : 30.0);

  // 1. Hazard-distance threshold check (from ship.js calculateHazardDanger)
  let minEffectiveDist = Infinity;
  for (const ice of (icebergs || [])) {
    const dist = wrappedDistanceCoords(x, y, ice.x, ice.y);
    const effDist = dist - (ice.collisionRadius || 20) - 15; // 15 = ship hull radius
    if (effDist < minEffectiveDist) {
      minEffectiveDist = effDist;
    }
  }

  if (minEffectiveDist < 40) {
    effectiveSpeed = Math.min(effectiveSpeed, maxSpd * 0.05);
  } else if (minEffectiveDist < 100) {
    effectiveSpeed = Math.min(effectiveSpeed, maxSpd * 0.15);
  } else if (minEffectiveDist < 200) {
    effectiveSpeed = Math.min(effectiveSpeed, maxSpd * 0.30);
  } else if (minEffectiveDist < 320) {
    effectiveSpeed = Math.min(effectiveSpeed, maxSpd * 0.45);
  }

  // 2. Turn angle deceleration check
  if (turnAngleDeg >= 90) {
    effectiveSpeed = Math.min(effectiveSpeed, maxSpd * 0.30);
  } else if (turnAngleDeg >= 45) {
    effectiveSpeed = Math.min(effectiveSpeed, maxSpd * 0.55);
  }

  return Math.max(0.5, effectiveSpeed);
}

