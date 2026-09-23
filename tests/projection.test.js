import { describe, test, expect } from 'vitest';
import { forwardProjection, inverseProjection, haversineDistanceNM, formatLatLon, REFERENCE_ORIGIN } from '../src/js/geo/projection.js';

describe('POLARIS Geodetic Projection Unit Tests', () => {
  test('forward and inverse projection round-trip precision', () => {
    const lat = -69.407;
    const lon = 76.187;

    const proj = forwardProjection(lat, lon);
    const inv = inverseProjection(proj.x_nm, proj.y_nm);

    expect(inv.lat).toBeCloseTo(lat, 4);
    expect(inv.lon).toBeCloseTo(lon, 4);
  });

  test('1 degree latitude equals exactly 60 NM', () => {
    const p1 = forwardProjection(-69.0, 76.0);
    const p2 = forwardProjection(-70.0, 76.0);

    const deltaY = Math.abs(p2.y_nm - p1.y_nm);
    expect(deltaY).toBeCloseTo(60, 2);
  });

  test('Haversine distance calculation in Nautical Miles', () => {
    const dist = haversineDistanceNM(-69.407, 76.187, -70.767, 11.732);
    expect(dist).toBeGreaterThan(1000);
    expect(dist).toBeLessThan(1500);
  });

  test('formatLatLon produces standard maritime formatted string', () => {
    const formatted = formatLatLon(-69.407, 76.187);
    expect(formatted).toContain('69°24′S');
    expect(formatted).toContain('076°11′E');
  });
});
