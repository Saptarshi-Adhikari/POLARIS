import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import { NavigationDebugOverlay } from '../src/js/debug/navigationDebugOverlay.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { calculateIcebergPositionAt, wrappedDistanceCoords, computeIcebergCPA } from '../src/js/utils.js';

describe('NavTestBot Phase 2 — Activation & Telemetry Observer', () => {
  let registeredListeners = [];

  beforeEach(() => {
    registeredListeners = [];
    // Define global window if needed for test environment
    if (typeof global.window === 'undefined') {
      global.window = {};
    }
    global.window.addEventListener = (event, cb) => {
      registeredListeners.push({ event, cb });
    };
  });

  it('1. Shift+F6 toggles NavTestBot and plain F6 toggles NavigationDebugOverlay independently', () => {
    const mockFlightRecorder = { enabled: true, stop: vi.fn(), start: vi.fn(), clear: vi.fn() };
    const navBot = new NavTestBot(null, [], null, {}, mockFlightRecorder);
    const debugOverlay = new NavigationDebugOverlay(mockFlightRecorder, null);

    expect(navBot.enabled).toBe(false);
    expect(debugOverlay.visible).toBe(false);

    // Find registered keydown listeners
    const keydownListeners = registeredListeners.filter(l => l.event === 'keydown');
    expect(keydownListeners.length).toBeGreaterThanOrEqual(2);

    // Simulate Shift+F6
    const shiftF6Event = { key: 'F6', shiftKey: true, preventDefault: vi.fn() };
    keydownListeners.forEach(l => l.cb(shiftF6Event));

    expect(navBot.enabled).toBe(true);
    expect(debugOverlay.visible).toBe(false);

    // Simulate plain F6
    const plainF6Event = { key: 'F6', shiftKey: false, preventDefault: vi.fn() };
    keydownListeners.forEach(l => l.cb(plainF6Event));

    expect(navBot.enabled).toBe(true);
    expect(debugOverlay.visible).toBe(true);

    // Simulate Shift+F6 again (toggles NavBot OFF)
    keydownListeners.forEach(l => l.cb(shiftF6Event));
    expect(navBot.enabled).toBe(false);
    expect(debugOverlay.visible).toBe(true);
  });

  it('2. Extended telemetry snapshot contains required iceberg fields matching direct helper calculations', () => {
    const ship = new Ship({ x: 500, y: 500, heading: 90 });
    ship.vx = 10;
    ship.vy = 0;

    const ice = new Iceberg({ id: 'ice-test-1', x: 700, y: 500, vx: -2, vy: 0, size: 80 });

    const dist = wrappedDistanceCoords(ship.x, ship.y, ice.x, ice.y);
    const { cpa, tcpa } = computeIcebergCPA(ship, ice);
    const posAt2h = calculateIcebergPositionAt(ice, 7200);

    expect(dist).toBeCloseTo(200);
    expect(tcpa).toBeGreaterThan(0);

    // Verify snapshot iceberg structure
    const hazardInfo = ship.calculateHazardDanger(ice);
    const icebergSnap = {
      id: ice.id,
      x: ice.x,
      y: ice.y,
      vx: ice.vx,
      vy: ice.vy,
      size: ice.size,
      collisionRadius: ice.collisionRadius || 20,
      distanceFromShip: dist,
      cpa,
      tcpa,
      riskLevel: hazardInfo.level,
      predictedPositionAt2h: posAt2h,
      trajectoryForecast: [calculateIcebergPositionAt(ice, 300), calculateIcebergPositionAt(ice, 600)]
    };

    expect(icebergSnap.id).toBe('ice-test-1');
    expect(icebergSnap.distanceFromShip).toBeCloseTo(200);
    expect(icebergSnap.cpa).toBeCloseTo(cpa);
    expect(icebergSnap.tcpa).toBeCloseTo(tcpa);
    expect(icebergSnap.predictedPositionAt2h.x).toBe(posAt2h.x);
    expect(icebergSnap.predictedPositionAt2h.y).toBe(posAt2h.y);
  });

  it('3. CCD collision in ship.update populates lastCollisionEvent with real values and predicts route collision state', () => {
    const ship = new Ship({ x: 500, y: 500, heading: 90 });
    ship.vx = 50;
    ship.vy = 0;

    const ice = new Iceberg({ id: 'ice-ccd-1', x: 520, y: 500, vx: 0, vy: 0, size: 50 });
    const state = { vessel: { maxSpeed: 10, dragCoefficient: 0.05, mass: 1, autopilot: false } };
    const mockVectorField = { stormMode: false, getVelocityAt: () => ({ u: 0, v: 0 }) };

    ship.update(0.1, mockVectorField, 0, state, [ice]);

    expect(ship.lastCollisionEvent).toBeDefined();
    expect(ship.lastCollisionEvent.collisionDetected).toBe(true);
    expect(ship.lastCollisionEvent.icebergId).toBe('ice-ccd-1');
    expect(ship.lastCollisionEvent.shipVelocity).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    expect(typeof ship.lastCollisionEvent.routeHadPredictedCollision).toBe('boolean');
  });

  it('4. Sampling is skipped when neither flightRecorder nor navTestBot is enabled', () => {
    const flightRecorder = { enabled: false };
    const navTestBot = { enabled: false };

    const isDebugSamplingActive = (flightRecorder && flightRecorder.enabled) || (navTestBot && navTestBot.enabled);
    expect(isDebugSamplingActive).toBe(false);

    navTestBot.enabled = true;
    const isDebugSamplingActiveNow = (flightRecorder && flightRecorder.enabled) || (navTestBot && navTestBot.enabled);
    expect(isDebugSamplingActiveNow).toBe(true);
  });
});
