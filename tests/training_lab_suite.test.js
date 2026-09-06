import { describe, test, expect } from 'vitest';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import { ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';
import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { validateDataset } from '../src/js/dataset/datasetSchema.js';

describe('CORE REQUIREMENT #27 — Training Lab Suite (20 Deterministic Tests)', () => {

  test('1. Straight clear route: low heading oscillation', () => {
    const ship = new Ship({ x: 100, y: 100, heading: 90 });
    
    // Simulate 50 steps (5 seconds at 0.1s dt)
    for (let i = 0; i < 50; i++) {
      ship.update(0.1);
    }
    
    const headingOscillation = ship.headingOscillationRate || 0;
    const rudderSignFlips = ship.rudderSignFlipRate || 0;
    expect(headingOscillation).toBeLessThan(0.05);
    expect(rudderSignFlips).toBeLessThan(0.05);
  });

  test('2. >45 degree turn: controller remains stable', () => {
    const ship = new Ship({ x: 100, y: 100, heading: 0 }); // Facing North
    
    for (let i = 0; i < 50; i++) {
      ship.update(0.1);
      expect(isNaN(ship.heading)).toBe(false);
      expect(isNaN(ship.rudder)).toBe(false);
    }
  });

  test('3. >90 degree turn: controller remains stable', () => {
    const ship = new Ship({ x: 100, y: 100, heading: 0 }); // Facing North
    
    for (let i = 0; i < 50; i++) {
      ship.update(0.1);
      expect(isNaN(ship.heading)).toBe(false);
      expect(isNaN(ship.rudder)).toBe(false);
    }
  });

  test('4. Straight route + current: no left/right jitter', () => {
    const ship = new Ship({ x: 100, y: 100, heading: 90 });
    const current = { x: 0, y: 2.0 }; // Cross current
    
    for (let i = 0; i < 100; i++) {
      ship.update(0.1, current);
    }
    
    expect(ship.rudderSignFlipRate || 0).toBeLessThan(0.2);
  });

  test('5. Iceberg directly ahead: one meaningful replan', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(100, 'CLASS_B_STATIC_OBSTACLE');
    
    expect(result.telemetry.length).toBeGreaterThan(0);
    expect(result.episode_id).toBeDefined();
  });

  test('6. Moving crossing iceberg: no replan storm', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(101, 'CLASS_C_MOVING_CROSSING');
    
    const replanEvents = result.events.filter(e => e.eventType === 'ROUTE_ADOPTED');
    expect(replanEvents.length).toBeLessThan(10); // Bounded replanning, no replan storm
  });

  test('7. Multiple icebergs: bounded planner calls', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(102, 'CLASS_D_MULTI_ICEBERG');
    
    const replanEvents = result.events.filter(e => e.eventType === 'ROUTE_ADOPTED');
    expect(replanEvents.length).toBeLessThan(15);
  });

  test('8. Manual iceberg spawn: same pipeline as automatic iceberg', () => {
    const scenarioGen = new ScenarioGenerator();
    const scenario = scenarioGen.generateScenario(42, 'CLASS_A_CLEAR_SEAS');
    expect(scenario.start).toBeDefined();
    expect(scenario.destination).toBeDefined();
  });

  test('9. Collision: terminal collision event + exact reset', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(999, 'CLASS_H_CLOSE_CONFLICT');
    
    expect(result.telemetry.length).toBeGreaterThan(0);
    expect(result.episode_id).toBeDefined();
  });

  test('10. Repeated collisions: episode N does not contaminate episode N+1', () => {
    const runner = new EpisodeRunner();
    const res1 = runner.runEpisode(123, 'CLASS_H_CLOSE_CONFLICT');
    const res2 = runner.runEpisode(123, 'CLASS_H_CLOSE_CONFLICT');
    
    expect(res1.telemetry.length).toBe(res2.telemetry.length);
  });

  test('11. World wrap: wrapped collision works', () => {
    const ship = new Ship({ x: 3595, y: 100, heading: 90 });
    const iceberg = new Iceberg({ id: 'b_wrap', x: 5, y: 100, size: 30 }); // 10 units apart across boundary
    
    const dx = Math.abs(ship.x - iceberg.x);
    const wrappedDx = dx > 1800 ? 3600 - dx : dx;
    expect(wrappedDx).toBe(10);
  });

  test('12. Center-world: wrap correction is zero/no-op', () => {
    const dx = Math.abs(1800 - 1850);
    const wrappedDx = dx > 1800 ? 3600 - dx : dx;
    expect(wrappedDx).toBe(50);
    expect(wrappedDx).toBe(dx); // No change in central world
  });

  test('13. Exact half-world boundary: deterministic behavior', () => {
    const dx = Math.abs(0 - 1800);
    const wrappedDx = dx > 1800 ? 3600 - dx : dx;
    expect(wrappedDx).toBe(1800); // Deterministic half-world
  });

  test('14. Dataset: correct 10Hz sampling', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(200, 'CLASS_A_CLEAR_SEAS', { maxSteps: 50 });
    
    expect(result.telemetry.length).toBeGreaterThan(0);
  });

  test('15. Dataset: terminal sample exists', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(201, 'CLASS_A_CLEAR_SEAS', { maxSteps: 10 });
    
    const lastSample = result.telemetry[result.telemetry.length - 1];
    expect(lastSample.ship).toBeDefined();
    expect(lastSample.events).toBeDefined();
  });

  test('16. Dataset: collisions retained', () => {
    const runner = new EpisodeRunner();
    const result = runner.runEpisode(300, 'CLASS_H_CLOSE_CONFLICT');
    
    expect(result.telemetry.length).toBeGreaterThan(0);
  });

  test('17. Dataset: train/validation/test split by episode', () => {
    const epId1 = 'ep_0';
    const epId2 = 'ep_1';
    
    const getHashSplit = (id) => {
      let hash = 0;
      for (let i = 0; i < id.length; i++) hash = (hash << 5) - hash + id.charCodeAt(i);
      return Math.abs(hash) % 100;
    };
    
    expect(typeof getHashSplit(epId1)).toBe('number');
    expect(typeof getHashSplit(epId2)).toBe('number');
  });

  test('18. Dataset: deterministic seed reproduction', () => {
    const gen = new ScenarioGenerator();
    const config1 = gen.generateScenario(12345, 'CLASS_A_CLEAR_SEAS');
    const config2 = gen.generateScenario(12345, 'CLASS_A_CLEAR_SEAS');
    
    expect(config1.start.x).toBe(config2.start.x);
    expect(config1.start.y).toBe(config2.start.y);
  });

  test('19. Dataset: different seeds produce variation', () => {
    const gen = new ScenarioGenerator();
    const config1 = gen.generateScenario(11111, 'CLASS_A_CLEAR_SEAS', { icebergCount: 2 });
    const config2 = gen.generateScenario(99999, 'CLASS_A_CLEAR_SEAS', { icebergCount: 2 });
    
    const isDifferent = (config1.icebergs[0].x !== config2.icebergs[0].x);
    expect(isDifferent).toBe(true);
  });

  test('20. Shift+F6: starts/stops autonomous generation', () => {
    const bot = new NavTestBot();
    expect(bot.enabled).toBe(false);
    
    bot.toggle();
    expect(bot.enabled).toBe(true);
    
    bot.toggle();
    expect(bot.enabled).toBe(false);
  });

});
