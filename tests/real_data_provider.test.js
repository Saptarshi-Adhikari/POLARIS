import { describe, it, expect, beforeEach } from 'vitest';
import { RealDataProvider } from '../src/js/data/RealDataProvider.js';
import { RealDataNormalizer } from '../src/js/data/RealDataNormalizer.js';
import { RealDataStatus, FRESHNESS_STATES } from '../src/js/data/RealDataStatus.js';
import { geoToWorld, worldToGeo, DEFAULT_ANTARCTIC_BBOX } from '../src/js/providers/geoTransform.js';

describe('REAL Data Mode & Data Provider Unit Tests', () => {
  let normalizer;
  let provider;

  beforeEach(() => {
    normalizer = new RealDataNormalizer(DEFAULT_ANTARCTIC_BBOX);
    provider = new RealDataProvider();
  });

  it('1. Normalizes USNIC iceberg payload correctly without losing official names', () => {
    const raw = [
      {
        id: 'USNIC-D15D',
        name: 'D-15D',
        latitude: -66.30,
        longitude: -68.40,
        lengthMeters: 2400,
        source: 'USNIC'
      }
    ];

    const normalized = normalizer.normalizeIcebergs(raw, Date.now());
    expect(normalized.length).toBe(1);
    expect(normalized[0].name).toBe('D-15D');
    expect(normalized[0].latitude).toBe(-66.30);
    expect(normalized[0].longitude).toBe(-68.40);
    expect(normalized[0].position.x).toBeGreaterThan(0);
    expect(normalized[0].position.y).toBeGreaterThan(0);
  });

  it('2. Correctly projects Lat/Lon to World Coordinates (0..3600 x 0..2400)', () => {
    const world = geoToWorld(-69.0, -55.0, DEFAULT_ANTARCTIC_BBOX);
    expect(world.x).toBeGreaterThanOrEqual(0);
    expect(world.x).toBeLessThanOrEqual(3600);
    expect(world.y).toBeGreaterThanOrEqual(0);
    expect(world.y).toBeLessThanOrEqual(2400);

    const geo = worldToGeo(world.x, world.y, DEFAULT_ANTARCTIC_BBOX);
    expect(geo.lat).toBeCloseTo(-69.0, 1);
    expect(geo.lon).toBeCloseTo(-55.0, 1);
  });

  it('3. Classifies data freshness accurately', () => {
    const now = Date.now();
    expect(RealDataStatus.evaluateFreshness(now)).toBe(FRESHNESS_STATES.LIVE);
    expect(RealDataStatus.evaluateFreshness(now - 3600000 * 2)).toBe(FRESHNESS_STATES.FRESH);
    expect(RealDataStatus.evaluateFreshness(now - 3600000 * 24 * 15)).toBe(FRESHNESS_STATES.AGING);
    expect(RealDataStatus.evaluateFreshness(now - 3600000 * 24 * 50)).toBe(FRESHNESS_STATES.STALE);
  });

  it('4. RealDataProvider returns normalized snapshot structure', async () => {
    const snapshot = await provider.refresh();
    expect(snapshot).toBeDefined();
    expect(snapshot.mode).toBe('REAL');
    expect(Array.isArray(snapshot.icebergs)).toBe(true);
    expect(snapshot.icebergs.length).toBeGreaterThan(0);
    expect(snapshot.provenance).toBeDefined();
    expect(snapshot.provenance.providers.length).toBeGreaterThan(0);
  });

  it('5. RealDataProvider fails gracefully to cached snapshot on network error', async () => {
    // Save a valid cached snapshot
    const initialSnap = await provider.refresh();
    expect(initialSnap).toBeDefined();

    // Cause fetch failure
    provider.usnicProvider.erddapUrl = 'https://invalid-host-999.test/tabledap';
    provider.usnicProvider.fetchIcebergs = async () => { throw new Error('Network offline test'); };

    const fallbackSnap = await provider.refresh();
    expect(fallbackSnap).toBeDefined();
    expect(fallbackSnap.mode).toBe('REAL');
    expect(fallbackSnap.icebergs.length).toBeGreaterThan(0);
  });
});
