import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Web Worker Timeout & Late Response Guard', () => {
  it('1. Fast Worker response clears timeout and adopts route without triggering fallback', async () => {
    const aiNav = new AINavigator(4000, 3000);
    const ship = new Ship(400, 1800);
    const dest = { x: 3000, y: 600 };
    const state = {
      navigation: { mode: 'BALANCED', activeRoute: null, routeCalculated: false },
      vessel: { maxSpeed: 30, autopilotThrottle: 65 },
      environment: { seaIce: { enabled: false } },
      simulation: { simTimeHours: 0 }
    };

    // Mock routeWorker
    aiNav.routeWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn()
    };

    aiNav.generateOptimalRouteAStar(ship, [], null, dest, 'BALANCED', state, ship);

    expect(aiNav.workerTimeoutTimer).not.toBeNull();
    expect(aiNav.pendingWorkerRequestId).toBe(1);

    // Simulate fast worker response
    aiNav.handleWorkerResponse({
      data: {
        requestId: 1,
        waypoints: [ { x: 400, y: 1800 }, { x: 3000, y: 600 } ],
        totalDistance: 2800,
        maxRisk: 0,
        estimatedDuration: 0.1,
        calcTimeMs: 12,
        dest: dest
      }
    });

    expect(aiNav.workerTimeoutTimer).toBeNull();
    expect(state.navigation.activeRoute).not.toBeNull();
    expect(state.navigation.activeRoute.totalDistance).toBe(2800);
  });

  it('2. Worker timeout (2500ms) triggers synchronous fallback and adopts route', () => {
    vi.useFakeTimers();
    const aiNav = new AINavigator(4000, 3000);
    const ship = new Ship(400, 1800);
    const dest = { x: 3000, y: 600 };
    const state = {
      navigation: { mode: 'BALANCED', activeRoute: null, routeCalculated: false },
      vessel: { maxSpeed: 30, autopilotThrottle: 65 },
      environment: { seaIce: { enabled: false } },
      simulation: { simTimeHours: 0 }
    };

    aiNav.routeWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn()
    };

    aiNav.generateOptimalRouteAStar(ship, [], null, dest, 'BALANCED', state, ship);

    expect(state.navigation.activeRoute).toBeNull();

    // Advance timer past 2500ms
    vi.advanceTimersByTime(2600);

    // Synchronous fallback should have executed
    expect(state.navigation.activeRoute).not.toBeNull();
    expect(state.navigation.activeRoute.status).toBe('valid');
    // Sync fallback creates and adopts the route, clearing pendingWorkerRequestId to null
    expect(aiNav.pendingWorkerRequestId).toBeNull();

    vi.useRealTimers();
  });

  it('3. Late Worker response after timeout is safely discarded (no duplicate/overwriting route)', () => {
    vi.useFakeTimers();
    const aiNav = new AINavigator(4000, 3000);
    const ship = new Ship(400, 1800);
    const dest = { x: 3000, y: 600 };
    const state = {
      navigation: { mode: 'BALANCED', activeRoute: null, routeCalculated: false },
      vessel: { maxSpeed: 30, autopilotThrottle: 65 },
      environment: { seaIce: { enabled: false } },
      simulation: { simTimeHours: 0 }
    };

    aiNav.routeWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn()
    };

    aiNav.generateOptimalRouteAStar(ship, [], null, dest, 'BALANCED', state, ship);

    // Timeout fires -> sync route adopted
    vi.advanceTimersByTime(2600);
    const syncRouteId = state.navigation.activeRoute.routeId;

    // Late worker response arrives for request #1
    aiNav.handleWorkerResponse({
      data: {
        requestId: 1,
        waypoints: [ { x: 400, y: 1800 }, { x: 3000, y: 600 } ],
        totalDistance: 9999, // Distinguishable cost
        maxRisk: 0,
        estimatedDuration: 0.1,
        calcTimeMs: 3000,
        dest: dest
      }
    });

    // Active route must NOT have been overwritten by late response
    expect(state.navigation.activeRoute.routeId).toBe(syncRouteId);
    expect(state.navigation.activeRoute.plannerCost).not.toBe(9999);

    vi.useRealTimers();
  });
});
