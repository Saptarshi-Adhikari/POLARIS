import { describe, it, expect, vi } from 'vitest';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Worker Request Storm Prevention & Reason Tracking Suite', () => {
  it('prevents 60Hz replan storm when worker calculation is pending', () => {
    const nav = new AINavigator(3600, 2400);

    // Mock routeWorker to prevent real Web Worker creation in node/vitest environment
    nav.routeWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn()
    };

    const ship = new Ship({ x: 400, y: 1200, heading: 0, speed: 20 });
    const dest = { x: 3200, y: 1200 };

    const state = {
      navigation: {
        activeRoute: null,
        routeInvalid: false,
        isNavigating: true,
        destination: dest
      },
      vessel: { maxSpeed: 30 },
      simulation: { simTimeHours: 0 }
    };

    const vectorField = { getVelocityAt: () => ({ u: 0, v: 0 }) };

    // Set lastDest so first call evaluates to INITIAL_ROUTE rather than DESTINATION_CHANGED
    nav.lastDest = { x: 3200, y: 1200 };

    // Frame 1: evaluate() should trigger INITIAL_ROUTE request #1
    nav.evaluate(ship, [], vectorField, 0.001, state);
    expect(nav.workerRequestId).toBe(1);
    expect(nav.pendingWorkerRequestId).toBe(1);
    expect(nav.routeWorker.postMessage).toHaveBeenCalledTimes(1);
    expect(nav.triggerReasonCounts.INITIAL_ROUTE).toBe(1);

    // Simulate 60 subsequent animation frames (1 second of animation) while worker is calculating
    for (let frame = 2; frame <= 60; frame++) {
      nav.evaluate(ship, [], vectorField, frame * (1 / 3600), state);
    }

    // Verify that NO additional worker requests were dispatched!
    expect(nav.workerRequestId).toBe(1);
    expect(nav.pendingWorkerRequestId).toBe(1);
    expect(nav.routeWorker.postMessage).toHaveBeenCalledTimes(1);
    expect(nav.triggerReasonCounts.INITIAL_ROUTE).toBe(1);

    // Now simulate Worker posting back successful route response
    const mockWorkerResponse = {
      data: {
        requestId: 1,
        waypoints: [{ x: 400, y: 1200 }, { x: 3200, y: 1200 }],
        totalDistance: 2800,
        maxRisk: 0,
        estimatedDuration: 0.04,
        calcTimeMs: 15,
        dest
      }
    };

    nav.handleWorkerResponse(mockWorkerResponse);

    // Verify worker response was accepted and pending state cleared
    expect(nav.pendingWorkerRequestId).toBeNull();
    expect(state.navigation.activeRoute).not.toBeNull();
    expect(state.navigation.activeRoute.totalDistance).toBe(2800);

    // Frame 61: evaluate() runs with active route present -> no new request dispatched
    nav.evaluate(ship, [], vectorField, 61 * (1 / 3600), state);
    expect(nav.workerRequestId).toBe(1);
  });
});
