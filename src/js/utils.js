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
