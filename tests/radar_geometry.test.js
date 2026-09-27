/**
 * POLARIS — Phase 5B Radar Geometry Test Suite
 */

import { describe, it, expect } from 'vitest';
import {
  convertRadarPolarToWorld,
  convertWorldToRadarPolar,
  createCanonicalRadarObservation
} from '../src/js/data/RadarPerceptionEngine.js';

describe('POLARIS Phase 5B — Radar Geometry & Coordinate Transformation Hardening', () => {

  it('1. own-ship heading 0°, bearing 0° -> world (+range, 0)', () => {
    const shipState = { x: 500, y: 500, heading: 0 };
    const res = convertRadarPolarToWorld(100, 0, shipState);
    expect(res.worldX).toBeCloseTo(600.0, 2);
    expect(res.worldY).toBeCloseTo(500.0, 2);
  });

  it('2. own-ship heading 0°, bearing 90° -> world (0, +range)', () => {
    const shipState = { x: 500, y: 500, heading: 0 };
    const res = convertRadarPolarToWorld(100, 90, shipState);
    expect(res.worldX).toBeCloseTo(500.0, 2);
    expect(res.worldY).toBeCloseTo(600.0, 2);
  });

  it('3. own-ship heading 90°, bearing 0° -> world (0, +range)', () => {
    const shipState = { x: 500, y: 500, heading: 90 };
    const res = convertRadarPolarToWorld(100, 0, shipState);
    expect(res.worldX).toBeCloseTo(500.0, 2);
    expect(res.worldY).toBeCloseTo(600.0, 2);
  });

  it('4. own-ship heading 90°, bearing 90° -> world (-range, 0)', () => {
    const shipState = { x: 500, y: 500, heading: 90 };
    const res = convertRadarPolarToWorld(100, 90, shipState);
    expect(res.worldX).toBeCloseTo(400.0, 2);
    expect(res.worldY).toBeCloseTo(500.0, 2);
  });

  it('5. negative bearing wraparound (-90° == 270°)', () => {
    const shipState = { x: 500, y: 500, heading: 0 };
    const res1 = convertRadarPolarToWorld(100, -90, shipState);
    const res2 = convertRadarPolarToWorld(100, 270, shipState);
    expect(res1.worldX).toBeCloseTo(res2.worldX, 2);
    expect(res1.worldY).toBeCloseTo(res2.worldY, 2);
    expect(res1.worldY).toBeCloseTo(400.0, 2); // North (-Y)
  });

  it('6. bearing wraparound 359° / 0° discontinuity bounded', () => {
    const shipState = { x: 0, y: 0, heading: 0 };
    const res359 = convertRadarPolarToWorld(100, 359, shipState);
    const res0 = convertRadarPolarToWorld(100, 0, shipState);
    expect(Math.abs(res359.worldX - res0.worldX)).toBeLessThan(2.0);
    expect(Math.abs(res359.worldY - res0.worldY)).toBeLessThan(2.0);
  });

  it('7. range = 0 -> world position equals ship position', () => {
    const shipState = { x: 1234.5, y: 678.9, heading: 45.0 };
    const res = convertRadarPolarToWorld(0, 120, shipState);
    expect(res.worldX).toBeCloseTo(1234.5, 2);
    expect(res.worldY).toBeCloseTo(678.9, 2);
  });

  it('8. range > 0 (1500m at heading 225°, bearing 45° = 270° North)', () => {
    const shipState = { x: 1000, y: 1000, heading: 225 };
    const res = convertRadarPolarToWorld(1500, 45, shipState);
    // 225 + 45 = 270° -> North (-Y)
    expect(res.worldX).toBeCloseTo(1000.0, 2);
    expect(res.worldY).toBeCloseTo(-500.0, 2);
  });

  it('9. Round-Trip Invariant: World -> Radar Polar -> World with bounded error', () => {
    const shipState = { x: 1500.0, y: 2000.0, heading: 120.0 };
    const targetWorldX = 1850.0;
    const targetWorldY = 2300.0;

    const polar = convertWorldToRadarPolar(targetWorldX, targetWorldY, shipState);
    const reconstructedWorld = convertRadarPolarToWorld(polar.rangeMeters, polar.bearingDegrees, shipState);

    expect(reconstructedWorld.worldX).toBeCloseTo(targetWorldX, 2);
    expect(reconstructedWorld.worldY).toBeCloseTo(targetWorldY, 2);
  });
});
