import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { CanvasRenderer } from '../src/js/render/canvasRenderer.js';
import { VectorField } from '../src/js/simulation/vectorField.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Canonical Route Line Structural Guard & Route-Preserving Reset', () => {
  let engine;

  beforeEach(() => {
    engine = new SimulationEngine();
  });

  it('1. Structurally enforces max 1 route-line draw per frame under debug-overlay ON and OFF', () => {
    const createMockCtx = () => new Proxy({}, {
      get: (target, prop) => {
        if (prop === 'measureText') return () => ({ width: 10 });
        return () => {};
      }
    });

    const mockCanvas = {
      getContext: () => createMockCtx(),
      clientWidth: 1200,
      clientHeight: 800
    };

    const renderer = new CanvasRenderer(mockCanvas);
    const vectorField = new VectorField(3600, 2400);
    const ship = new Ship({ x: 400, y: 1800, heading: 330 });
    ship.routeWaypoints = [{ x: 400, y: 1800 }, { x: 1200, y: 1200 }];

    const state = {
      navigation: {
        activeRoute: { status: 'valid', waypoints: ship.routeWaypoints }
      },
      vessel: { autopilot: true, throttle: 65, heading: 330 },
      environment: { seaIce: { enabled: false } }
    };

    // Frame 1: Debug overlay OFF
    renderer.showDebugOverlay = false;
    renderer.render(vectorField, ship, [], {}, 14.0, 0.016, state);
    expect(renderer.navLineDrawCount).toBe(1);

    // Frame 2: Debug overlay ON
    renderer.showDebugOverlay = true;
    renderer.render(vectorField, ship, [], {}, 14.0, 0.016, state);
    expect(renderer.navLineDrawCount).toBe(1);

    // Frame 3: Explicit check that calling drawCanonicalRouteLine twice in one frame triggers structural guard
    renderer.navLineDrawCount = 0;
    renderer.drawCanonicalRouteLine(renderer.ctx, {}, ship);
    expect(renderer.navLineDrawCount).toBe(1);
    renderer.drawCanonicalRouteLine(renderer.ctx, {}, ship);
    expect(renderer.navLineDrawCount).toBe(2); // Blocked second draw
  });

  it('2. Resets ship state while preserving activeRoute and restarting from beginning of route', () => {
    const route = {
      id: 'test_route_123',
      status: 'valid',
      waypoints: [{ x: 400, y: 1800 }, { x: 1200, y: 1200 }, { x: 2400, y: 600 }],
      routeProgressFraction: 0.55
    };

    engine.state.navigation.activeRoute = route;
    engine.ship.routeWaypoints = route.waypoints;
    engine.ship.waypointIndex = 1;

    // Advance ship partway along route
    engine.ship.x = 1200;
    engine.ship.y = 1200;
    engine.ship.vx = 15.0;
    engine.ship.vy = -10.0;
    engine.ship.heading = 45;
    engine.ship.fuel = 65.0;
    engine.state.vessel.autopilot = true;

    // Trigger reset
    engine.resetShip();

    // Verification:
    // a. Ship position, velocity, heading, fuel reset to initial snapshot
    expect(engine.ship.x).toBe(400);
    expect(engine.ship.y).toBe(1800);
    expect(engine.ship.heading).toBe(330);
    expect(engine.ship.vx).toBe(0);
    expect(engine.ship.vy).toBe(0);
    expect(engine.ship.fuel).toBe(100.0);

    // b. Active route remains non-null and unchanged
    expect(engine.state.navigation.activeRoute).not.toBeNull();
    expect(engine.state.navigation.activeRoute.id).toBe('test_route_123');
    expect(engine.state.navigation.activeRoute.waypoints.length).toBe(3);

    // c. Route progress and waypoint index reset to beginning of route (0)
    expect(engine.ship.waypointIndex).toBe(0);
    expect(engine.state.navigation.activeRoute.routeProgressFraction).toBe(0.0);
    expect(engine.ship.targetWaypoint).toEqual(route.waypoints[0]);

    // d. Autopilot resumes navigating the persisted route
    expect(engine.state.vessel.autopilot).toBe(true);
    expect(engine.state.navigation.isNavigating).toBe(true);
  });
});
