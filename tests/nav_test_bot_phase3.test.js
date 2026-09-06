import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SeededRandom } from '../src/js/utils/seededRandom.js';
import { ScenarioGenerator, SCENARIO_CLASSES } from '../src/js/debug/navTestScenarios.js';
import { NavTestBot, MAX_EPISODE_BUFFER } from '../src/js/debug/navTestBot.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';

describe('NavTestBot Phase 3 — Lifecycle, Scenarios, Sampling & Export', () => {

  it('1. Seed Determinism: Same seed produces 100% identical scenario layout across runs', () => {
    const generator = new ScenarioGenerator();
    const seed = 998877;
    const scenarioClass = 'CLASS_D_MULTI_ICEBERG_FIELD';

    const run1 = generator.generateScenario(seed, scenarioClass);
    const run2 = generator.generateScenario(seed, scenarioClass);

    expect(run1.start).toEqual(run2.start);
    expect(run1.destination).toEqual(run2.destination);
    expect(run1.icebergs.length).toBe(run2.icebergs.length);

    for (let i = 0; i < run1.icebergs.length; i++) {
      expect(run1.icebergs[i].x).toBe(run2.icebergs[i].x);
      expect(run1.icebergs[i].y).toBe(run2.icebergs[i].y);
      expect(run1.icebergs[i].vx).toBe(run2.icebergs[i].vx);
      expect(run1.icebergs[i].vy).toBe(run2.icebergs[i].vy);
      expect(run1.icebergs[i].size).toBe(run2.icebergs[i].size);
    }
  });

  it('2. 12 Scenario Classes produce expected qualitative hazard layouts', () => {
    const generator = new ScenarioGenerator();
    const seed = 123;

    SCENARIO_CLASSES.forEach(sClass => {
      const scenario = generator.generateScenario(seed, sClass);
      expect(scenario.seed).toBe(seed);
      expect(scenario.scenarioClass).toBe(sClass);
      expect(scenario.start).toBeDefined();
      expect(scenario.destination).toBeDefined();
      expect(Array.isArray(scenario.icebergs)).toBe(true);

      if (sClass === 'CLASS_A_CLEAR_SEAS') {
        expect(scenario.icebergs.length).toBeLessThanOrEqual(2);
      } else if (sClass === 'CLASS_D_MULTI_ICEBERG_FIELD') {
        expect(scenario.icebergs.length).toBeGreaterThanOrEqual(3);
      } else if (sClass === 'CLASS_K_WORLD_WRAP_CROSSING') {
        expect(scenario.start.x).toBeLessThan(300);
      }
    });
  });

  it('3. End-to-End Episode Run: Reset -> Scenario -> Route -> Navigation -> Result -> Auto-Reset', () => {
    const mockEngine = {
      ship: new Ship({ x: 400, y: 1800, heading: 330 }),
      icebergs: [],
      state: {
        navigation: { startPoint: { x: 400, y: 1800 }, destinationPoint: { x: 3000, y: 600 }, activeRoute: null },
        simulation: { simTimeHours: 0 }
      },
      calculateRoute: vi.fn(() => {
        mockEngine.state.navigation.activeRoute = { id: 'r_1', waypoints: [{ x: 400, y: 1800 }, { x: 3000, y: 600 }] };
      })
    };

    const navBot = new NavTestBot(mockEngine.ship, mockEngine.icebergs, null, mockEngine.state, null);
    navBot.engine = mockEngine;
    navBot.enabled = true;

    // Start episode
    navBot.startNextEpisode(mockEngine);
    expect(navBot.stateMode).toBe('RUNNING');
    expect(navBot.currentEpisode).toBeDefined();

    // Advance ship near destination
    mockEngine.ship.x = 2995;
    mockEngine.ship.y = 600;
    mockEngine.state.simulation.simTimeHours = 0.5;

    const mockSnapshot = {
      timestamp_ms: Date.now(),
      simulation_time: 0.5,
      ship: { ground_speed: 10, heading_deg: 90 },
      guidance: { cross_track_error: 0 }
    };

    navBot.evaluateFrame(mockEngine, mockSnapshot);

    // Should reach SUCCESS and auto-reset to next episode
    expect(navBot.completedEpisodes.length).toBe(1);
    expect(navBot.completedEpisodes[0].result.status).toBe('SUCCESS');
    expect(navBot.completedEpisodes[0].result.destinationReached).toBe(true);
  });

  it('4. Collision Episode: Forced collision populates full failure forensics', () => {
    const ship = new Ship({ x: 500, y: 500, heading: 90 });
    const ice = new Iceberg({ id: 'ice-hit-1', x: 520, y: 500, size: 60 });
    const mockEngine = {
      ship,
      icebergs: [ice],
      state: {
        navigation: { destinationPoint: { x: 3000, y: 600 } },
        simulation: { simTimeHours: 0.1 }
      },
      calculateRoute: vi.fn()
    };

    const navBot = new NavTestBot(ship, [ice], null, mockEngine.state, null);
    navBot.engine = mockEngine;
    navBot.enabled = true;
    navBot.startNextEpisode(mockEngine);

    // Simulate CCD collision trigger
    ship.lastCollisionEvent = {
      collisionDetected: true,
      icebergId: 'ice-hit-1',
      distanceAtCollision: 12.5,
      shipVelocity: { x: 20, y: 0 },
      icebergVelocity: { x: 0, y: 0 },
      relativeVelocity: { x: 20, y: 0 },
      routeHadPredictedCollision: true
    };

    navBot.evaluateFrame(mockEngine, { simulation_time: 0.1 });

    expect(navBot.completedEpisodes.length).toBe(1);
    const ep = navBot.completedEpisodes[0];
    expect(ep.result.status).toBe('COLLISION');
    expect(ep.result.collision).toBe(true);
    expect(ep.result.failureForensics).toEqual(expect.objectContaining({
      collisionDetected: true,
      icebergId: 'ice-hit-1',
      routeHadPredictedCollision: true
    }));
  });

  it('5. 10 Hz Telemetry Sampling Rate Gate Verification & Full Episode Count Math', () => {
    const navBot = new NavTestBot(null, [], null, { simulation: { simTimeHours: 0 } }, null);
    navBot.enabled = true;
    navBot.currentEpisode = {
      episodeId: 'ep_test_rate',
      simStartHours: 0,
      lastSampleSimTimeHours: -1,
      telemetry: [],
      events: []
    };
    navBot.stateMode = 'RUNNING';

    const mockEngine = { ship: new Ship({}), state: { navigation: {}, simulation: { simTimeHours: 0 } } };

    // Simulate 10 frames within a 0.05s sim time window (< 0.1s sim time gate)
    for (let f = 0; f < 10; f++) {
      const simTime = f * (0.005 / 3600); // 0.005s per frame
      mockEngine.state.simulation.simTimeHours = simTime;
      navBot.evaluateFrame(mockEngine, { simulation_time: simTime });
    }

    // Only 1 sample should be recorded at t=0 because 0.05s < 0.1s sampling gate
    expect(navBot.currentEpisode.telemetry.length).toBe(1);

    // Over a full episode of 0.35 sim hours (1260 sim seconds = 0.35 * 36000 steps at 10 Hz)
    const fullSimHours = 0.35;
    const numSteps = Math.floor(fullSimHours * 36000); // 12,600 intervals of 0.1s
    for (let step = 1; step <= numSteps; step++) {
      const simTime = step * (1 / 36000);
      mockEngine.state.simulation.simTimeHours = simTime;
      navBot.evaluateFrame(mockEngine, { simulation_time: simTime });
    }
    // Total count = 1 initial sample at t=0 + 12,600 interval samples = 12,601 samples
    expect(navBot.currentEpisode.telemetry.length).toBe(12601);
  });

  it('6. Bounded Memory Buffer: 15+ episodes auto-exports batch and keeps memory <= 10', () => {
    const mockEngine = {
      ship: new Ship({ x: 400, y: 1800 }),
      state: { navigation: { destinationPoint: { x: 3000, y: 600 } }, simulation: { simTimeHours: 0 } },
      calculateRoute: vi.fn()
    };

    const navBot = new NavTestBot(mockEngine.ship, [], null, mockEngine.state, null);
    navBot.engine = mockEngine;
    navBot.enabled = true;
    navBot.triggerDownload = vi.fn(); // Mock browser download

    // Run 15 episodes to completion
    for (let i = 0; i < 15; i++) {
      navBot.startNextEpisode(mockEngine);
      // Move ship to destination to complete episode
      mockEngine.ship.x = 2998;
      mockEngine.ship.y = 600;
      navBot.evaluateFrame(mockEngine, { simulation_time: 0.1 });
    }

    // Buffer auto-exported after 10 episodes, so triggerDownload called at least once
    expect(navBot.triggerDownload).toHaveBeenCalled();
    expect(navBot.completedEpisodes.length).toBeLessThan(MAX_EPISODE_BUFFER);
  });

  it('7. Event-driven planner verification: Planner does NOT run every frame during episodes', () => {
    const spyCalculateRoute = vi.fn();
    const mockEngine = {
      ship: new Ship({ x: 500, y: 500 }),
      state: { navigation: { destinationPoint: { x: 3000, y: 600 } }, simulation: { simTimeHours: 0 } },
      calculateRoute: spyCalculateRoute
    };

    const navBot = new NavTestBot(mockEngine.ship, [], null, mockEngine.state, null);
    navBot.engine = mockEngine;
    navBot.enabled = true;
    navBot.startNextEpisode(mockEngine);

    // Call calculateRoute was made once on startEpisode
    expect(spyCalculateRoute).toHaveBeenCalledTimes(1);

    // Run 20 physics frames while navigating
    for (let f = 0; f < 20; f++) {
      mockEngine.state.simulation.simTimeHours += 0.001;
      navBot.evaluateFrame(mockEngine, { simulation_time: mockEngine.state.simulation.simTimeHours });
    }

    // calculateRoute was NOT called per frame!
    expect(spyCalculateRoute).toHaveBeenCalledTimes(1);
  });

  it('8. Irregular frame timing & 15x timeWarp catch-up sampling robustness', () => {
    const navBot = new NavTestBot(null, [], null, { simulation: { simTimeHours: 0 } }, null);
    navBot.enabled = true;
    navBot.currentEpisode = {
      episodeId: 'ep_test_irregular',
      simStartHours: 0,
      lastSampleSimTimeHours: -1,
      telemetry: [],
      events: []
    };
    navBot.stateMode = 'RUNNING';

    const mockEngine = { ship: new Ship({}), state: { navigation: {}, simulation: { simTimeHours: 0 } } };

    // 1. Irregular frame timing at 1x timeWarp with pseudo-random deltas (between 0.01s and 0.05s sim time)
    const seededRng = new SeededRandom(42);
    let totalSimTimeSeconds = 0;

    for (let f = 0; f < 100; f++) {
      const dtSim = seededRng.range(0.01, 0.05); // irregular frame dt
      totalSimTimeSeconds += dtSim;
      const simHours = totalSimTimeSeconds / 3600;
      mockEngine.state.simulation.simTimeHours = simHours;
      navBot.evaluateFrame(mockEngine, { simulation_time: simHours });
    }

    // Expected sample count: 1 initial sample (t=0) + floor(totalSimTimeSeconds / 0.1)
    const expectedSamples1x = 1 + Math.floor(totalSimTimeSeconds / 0.1);
    expect(navBot.currentEpisode.telemetry.length).toBe(expectedSamples1x);

    // 2. High timeWarp jumps (15x timeWarp, dt = 0.05s * 15 = 0.75s per frame jump)
    for (let f = 0; f < 20; f++) {
      const dtSim = 0.05 * 15; // 0.75s per frame jump (spans 7.5 intervals!)
      totalSimTimeSeconds += dtSim;
      const simHours = totalSimTimeSeconds / 3600;
      mockEngine.state.simulation.simTimeHours = simHours;
      navBot.evaluateFrame(mockEngine, { simulation_time: simHours });
    }

    // Expected total sample count after 15x timeWarp jumps
    const expectedSamples15x = 1 + Math.floor(totalSimTimeSeconds / 0.1);
    expect(navBot.currentEpisode.telemetry.length).toBe(expectedSamples15x);

    // Verify all sampled timestamps are strictly monotonically increasing by exact 0.1s steps (1 / 36000 hours)
    for (let i = 1; i < navBot.currentEpisode.telemetry.length; i++) {
      const prevTime = navBot.currentEpisode.telemetry[i - 1].simulation_time;
      const currTime = navBot.currentEpisode.telemetry[i].simulation_time;
      expect(currTime - prevTime).toBeCloseTo(1 / 36000, 8);
    }
  });
});

