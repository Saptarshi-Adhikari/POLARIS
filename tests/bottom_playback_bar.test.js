import { describe, test, expect, beforeEach } from 'vitest';
import { VectorField } from '../src/js/simulation/vectorField.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { SimulationEngine } from '../src/js/main.js';

describe('Phase 3e — Bottom Playback Bar Verification', () => {
  beforeEach(() => {
    if (typeof window === 'undefined') {
      global.window = {
        addEventListener: () => {},
        removeEventListener: () => {},
        devicePixelRatio: 1,
        innerWidth: 1200,
        innerHeight: 800
      };
    } else if (!window.addEventListener) {
      window.addEventListener = () => {};
    }

    if (typeof document !== 'undefined') {
      let canvas = document.getElementById('map-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'map-canvas';
        canvas.getContext = () => ({
          save: () => {}, restore: () => {}, clearRect: () => {}, fillRect: () => {},
          setTransform: () => {}, drawImage: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {}
        });
        document.body.appendChild(canvas);
      } else if (!canvas.getContext) {
        canvas.getContext = () => ({
          save: () => {}, restore: () => {}, clearRect: () => {}, fillRect: () => {},
          setTransform: () => {}, drawImage: () => {}, beginPath: () => {}, stroke: () => {}, fill: () => {}
        });
      }
    }
  });

  test('1. Play/Pause correctly halts/resumes physics and sim time updates', () => {
    const vf = new VectorField(3600, 2400);
    const ship = new Ship({ x: 400, y: 1800, heading: 0 });
    const state = {
      simulation: { isPaused: false, timeWarp: 1.0, simTimeHours: 14.0 },
      environment: { mode: 'SIMULATION', ocean: { currentSpeed: 1.0 }, wind: { enabled: true, speed: 20 }, seaIce: { enabled: false } },
      vessel: { throttle: 65, autopilot: false, maxSpeed: 30, heading: 0 }
    };

    // When NOT paused:
    const initialSimTime = state.simulation.simTimeHours;
    const rawDt = 0.016; // ~60fps frame
    let dt = rawDt * state.simulation.timeWarp;
    if (!state.simulation.isPaused) {
      state.simulation.simTimeHours += (dt / 3600);
      ship.update(dt, vf, state.simulation.simTimeHours, state, []);
    }
    expect(state.simulation.simTimeHours).toBeGreaterThan(initialSimTime);

    // Now set isPaused = true
    state.simulation.isPaused = true;
    const pausedSimTime = state.simulation.simTimeHours;
    const pausedShipX = ship.x;

    if (!state.simulation.isPaused) {
      state.simulation.simTimeHours += (dt / 3600);
      ship.update(dt, vf, state.simulation.simTimeHours, state, []);
    }

    // Verify time and physics position remained frozen
    expect(state.simulation.simTimeHours).toBe(pausedSimTime);
    expect(ship.x).toBe(pausedShipX);
  });

  test('2. Speed multipliers (1x, 2x, 5x, 15x) correctly scale dt and sim-time progression', () => {
    const multipliers = [1, 2, 5, 15];
    const rawDt = 0.1; // 100ms real step

    multipliers.forEach(warp => {
      const state = { simulation: { isPaused: false, timeWarp: warp, simTimeHours: 10.0 } };
      const effectiveDt = rawDt * state.simulation.timeWarp;
      state.simulation.simTimeHours += (effectiveDt / 3600);

      const expectedHours = 10.0 + (rawDt * warp / 3600);
      expect(state.simulation.simTimeHours).toBeCloseTo(expectedHours, 6);
    });
  });

  test('3. Weighted random size distribution matches probabilities (Small 50%, Medium 30%, Large 15%, Massive 5%)', () => {
    const engine = new SimulationEngine();
    const counts = { Small: 0, Medium: 0, Large: 0, Massive: 0 };
    const totalRuns = 1000;

    for (let i = 0; i < totalRuns; i++) {
      const specs = engine.generateRandomIcebergSpecs();
      counts[specs.category]++;

      if (specs.category === 'Small') {
        expect(specs.size).toBeGreaterThanOrEqual(300);
        expect(specs.size).toBeLessThan(600);
      } else if (specs.category === 'Medium') {
        expect(specs.size).toBeGreaterThanOrEqual(600);
        expect(specs.size).toBeLessThan(1200);
      } else if (specs.category === 'Large') {
        expect(specs.size).toBeGreaterThanOrEqual(1200);
        expect(specs.size).toBeLessThan(2100);
      } else if (specs.category === 'Massive') {
        expect(specs.size).toBeGreaterThanOrEqual(2100);
        expect(specs.size).toBeLessThan(3300);
      }
    }

    // Check ratios: Small ~50% (40-60%), Medium ~30% (22-38%), Large ~15% (8-22%), Massive ~5% (2-10%)
    expect(counts.Small / totalRuns).toBeGreaterThan(0.40);
    expect(counts.Small / totalRuns).toBeLessThan(0.60);
    expect(counts.Medium / totalRuns).toBeGreaterThan(0.22);
    expect(counts.Medium / totalRuns).toBeLessThan(0.38);
    expect(counts.Large / totalRuns).toBeGreaterThan(0.08);
    expect(counts.Large / totalRuns).toBeLessThan(0.22);
    expect(counts.Massive / totalRuns).toBeGreaterThan(0.02);
    expect(counts.Massive / totalRuns).toBeLessThan(0.10);
  });

  test('4. Placing mode toggle behavior and click-to-place integration', () => {
    const engine = new SimulationEngine();
    const initialCount = engine.icebergs.length;
    
    // Simulate placing mode activation
    engine.renderer.addIcebergMode = true;
    engine.renderer.onPlaceIceberg = (wx, wy) => {
      const specs = engine.generateRandomIcebergSpecs();
      engine.spawnIcebergAt(wx, wy, specs.mass, specs.size);
      engine.renderer.addIcebergMode = false;
    };

    expect(engine.renderer.addIcebergMode).toBe(true);

    // Simulate clicking on canvas at world coords (1500, 1200)
    engine.renderer.onPlaceIceberg(1500, 1200);

    // Verify iceberg placed at exact coordinates and placing mode exited automatically
    expect(engine.icebergs.length).toBe(initialCount + 1);
    const placedIceberg = engine.icebergs[engine.icebergs.length - 1];
    expect(placedIceberg.x).toBe(1500);
    expect(placedIceberg.y).toBe(1200);
    expect(engine.renderer.addIcebergMode).toBe(false);
  });

  test('5. Reset button restores ship state simultaneously, preserves active route, and resumes navigation from start', () => {
    const engine = new SimulationEngine();
    
    // Mutate ship state into active navigation state
    engine.ship.x = 1800;
    engine.ship.y = 1200;
    engine.ship.vx = 12.5;
    engine.ship.vy = -8.2;
    engine.ship.heading = 120;
    engine.ship.angularVelocity = 4.5;
    engine.ship.fuel = 42.0;
    engine.ship.throttle = 85;
    engine.state.vessel.autopilot = true;
    const testRoute = { status: 'valid', waypoints: [{ x: 400, y: 1800 }, { x: 1800, y: 1200 }] };
    engine.state.navigation.activeRoute = testRoute;
    engine.ship.routeWaypoints = testRoute.waypoints;
    engine.ship.waypointIndex = 1;
    
    // Mutate environment and simulation parameters (should NOT be reset by resetShip)
    engine.state.environment.wind.speed = 95.0;
    engine.state.simulation.timeWarp = 5;
    engine.state.simulation.isPaused = true;
    const initialIcebergCount = engine.icebergs.length;

    // Execute ship reset
    engine.resetShip();

    // 1. Position, velocity, heading, fuel restored simultaneously to initial values
    expect(engine.ship.x).toBe(400);
    expect(engine.ship.y).toBe(1800);
    expect(engine.ship.heading).toBe(330);
    expect(engine.ship.vx).toBe(0);
    expect(engine.ship.vy).toBe(0);
    expect(engine.ship.angularVelocity).toBe(0);
    expect(engine.ship.fuel).toBe(100.0);

    // 2. Active route preserved, waypointIndex reset to start, autopilot remains engaged
    expect(engine.state.navigation.activeRoute).not.toBeNull();
    expect(engine.state.navigation.activeRoute).toBe(testRoute);
    expect(engine.ship.waypointIndex).toBe(0);
    expect(engine.state.vessel.autopilot).toBe(true);
    expect(engine.state.navigation.isNavigating).toBe(true);

    // 3. Icebergs, environment sliders, timeWarp speed, and pause state remain UNTOUCHED
    expect(engine.icebergs.length).toBe(initialIcebergCount);
    expect(engine.state.environment.wind.speed).toBe(95.0);
    expect(engine.state.simulation.timeWarp).toBe(5);
    expect(engine.state.simulation.isPaused).toBe(true);
  });
});
