/**
 * POLARIS — DATA MODE [DEMO | REAL] & Provider Abstraction Verification Suite
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { DemoDataProvider, RealReplayProvider } from '../src/js/providers/dataProvider.js';
import { DemoMapProvider, RealMapProvider } from '../src/js/providers/mapProvider.js';
import { geoToWorld, worldToGeo, validateGeoCoordinates, DEFAULT_ANTARCTIC_BBOX } from '../src/js/providers/geoTransform.js';
import { validateHazardSchema, createNormalizedHazard } from '../src/js/providers/schemas.js';

describe('DATA MODE [DEMO | REAL] Provider Verification', () => {
  let engine;

  beforeEach(() => {
    engine = new SimulationEngine();
  });

  it('1. Geographic coordinate transform maps lat/lon to world units and back', () => {
    // Center of Southern Ocean bounding box
    const testLat = -69.0;
    const testLon = -55.0;

    const worldPos = geoToWorld(testLat, testLon, DEFAULT_ANTARCTIC_BBOX);
    expect(worldPos.x).toBeGreaterThanOrEqual(0);
    expect(worldPos.x).toBeLessThanOrEqual(3600);
    expect(worldPos.y).toBeGreaterThanOrEqual(0);
    expect(worldPos.y).toBeLessThanOrEqual(2400);

    const backGeo = worldToGeo(worldPos.x, worldPos.y, DEFAULT_ANTARCTIC_BBOX);
    expect(backGeo.lat).toBeCloseTo(testLat, 4);
    expect(backGeo.lon).toBeCloseTo(testLon, 4);
  });

  it('2. Invalid geographic coordinates are rejected with descriptive validation errors', () => {
    expect(validateGeoCoordinates(100, 45).valid).toBe(false); // Lat > 90
    expect(validateGeoCoordinates(-70, -200).valid).toBe(false); // Lon < -180
    expect(validateGeoCoordinates(NaN, -50).valid).toBe(false);
    expect(validateGeoCoordinates(null, null).valid).toBe(false);

    expect(() => geoToWorld(999, 0)).toThrow();
  });

  it('3. DemoDataProvider produces normalized hazards matching schema', () => {
    const demoProvider = new DemoDataProvider(engine);
    const hazards = demoProvider.getHazards();

    expect(hazards.length).toBeGreaterThan(0);
    for (let h of hazards) {
      const val = validateHazardSchema(h);
      expect(val.valid).toBe(true);
      expect(h.source).toBe('DEMO_SYNTHETIC');
      expect(h.position.x).toBeGreaterThanOrEqual(0);
      expect(h.position.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('4. RealReplayProvider normalizes USNIC & Copernicus Marine datasets', () => {
    const realProvider = new RealReplayProvider(DEFAULT_ANTARCTIC_BBOX);
    const hazards = realProvider.getHazards(14.0);

    expect(hazards.length).toBeGreaterThan(0);
    for (let h of hazards) {
      const val = validateHazardSchema(h);
      expect(val.valid).toBe(true);
      expect(h.source).toContain('USNIC');
      expect(h.position.x).toBeGreaterThanOrEqual(0);
      expect(h.position.x).toBeLessThanOrEqual(3600);
    }

    const env = realProvider.getEnvironment();
    expect(env.source).toContain('Copernicus');
    expect(env.current.speed).toBeGreaterThan(0);
    expect(env.wind.speed).toBeGreaterThan(0);
  });

  it('5. DEMO ↔ REAL mode toggle correctly switches providers, map layer, and hazards', () => {
    expect(engine.dataMode).toBe('DEMO');
    expect(engine.activeDataProvider).toBeInstanceOf(DemoDataProvider);
    expect(engine.activeMapProvider).toBeInstanceOf(DemoMapProvider);

    // Switch to REAL
    engine.setDataMode('REAL');
    expect(engine.dataMode).toBe('REAL');
    expect(engine.activeDataProvider).toBeInstanceOf(RealReplayProvider);
    expect(engine.activeMapProvider).toBeInstanceOf(RealMapProvider);
    expect(engine.icebergs.length).toBeGreaterThan(0);
    expect(engine.icebergs[0].id).toContain('USNIC');

    // Switch back to DEMO
    engine.setDataMode('DEMO');
    expect(engine.dataMode).toBe('DEMO');
    expect(engine.activeDataProvider).toBeInstanceOf(DemoDataProvider);
    expect(engine.activeMapProvider).toBeInstanceOf(DemoMapProvider);
  });

  it('6. REAL mode hazard enters AINavigator and active route is generated', () => {
    engine.setDataMode('REAL');

    expect(engine.state.navigation.activeRoute).not.toBeNull();
    expect(engine.ship.routeWaypoints.length).toBeGreaterThan(0);

    // Destination update replans route on real hazards
    engine.state.navigation.destinationPoint = { x: 3000, y: 500 };
    engine.calculateRoute();

    expect(engine.state.navigation.routeCalculated).toBe(true);
    expect(engine.ship.routeWaypoints.length).toBeGreaterThan(0);
  });

  it('7. Clear route works properly in both DEMO and REAL modes', () => {
    engine.setDataMode('REAL');
    engine.clearRoute();
    expect(engine.ship.routeWaypoints.length).toBe(0);
    expect(engine.state.navigation.activeRoute).toBeNull();

    engine.setDataMode('DEMO');
    engine.clearRoute();
    expect(engine.ship.routeWaypoints.length).toBe(0);
    expect(engine.state.navigation.activeRoute).toBeNull();
  });

  it('8. REAL data failure sets ERROR status and does not silently convert to DEMO mode', () => {
    const realProvider = new RealReplayProvider(DEFAULT_ANTARCTIC_BBOX);
    const success = realProvider.setDataset(null, null);

    expect(success).toBe(false);
    expect(realProvider.status).toBe('ERROR');
    expect(realProvider.errorMessage).toContain('Invalid dataset');

    const meta = realProvider.getMetadata();
    expect(meta.status).toBe('ERROR');
  });
});
