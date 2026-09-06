import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import { TerminationReason } from '../src/js/dataset/datasetSchema.js';

describe('NavTestBot — Fixed-Round Auto-Stop Mode', () => {

  it('1. Fixed-Round Auto-Stop (Target = 30): stops after exactly 30 episodes without starting 31st', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    // Set target episode count to 30
    bot.setTargetEpisodeCount(30);
    expect(bot.targetEpisodeCount).toBe(30);

    // Turn ON
    bot.toggle(engine);
    expect(bot.enabled).toBe(true);

    // Run 30 episode completions
    for (let i = 1; i <= 30; i++) {
      expect(bot.enabled).toBe(true);
      expect(bot.sessionEpisodeCount).toBe(i - 1);

      // Force collision to complete episode
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_cycle_${i}`,
        distanceAtCollision: 0,
        relativeVelocity: 10.0
      };

      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });
    }

    // After 30th episode, bot MUST auto-disable and enter COMPLETE state
    expect(bot.enabled).toBe(false);
    expect(bot.stateMode).toBe('COMPLETE');
    expect(bot.sessionEpisodeCount).toBe(30);

    // Further evaluateFrame calls must do nothing
    const currentEpId = bot.currentEpisode?.episode_id;
    bot.evaluateFrame(engine, {
      simulation_time: 0.2,
      ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
    });
    expect(bot.enabled).toBe(false);
    expect(bot.sessionEpisodeCount).toBe(30);
  });

  it('2. Export Batch Arithmetic Check (Target = 30): exports sum to exactly 30 episodes across 3 batch files', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    const exportedBatches = [];
    bot.onDownload = (contentStr, filename) => {
      if (filename.startsWith('nav_test_bot_batch_')) {
        exportedBatches.push(JSON.parse(contentStr));
      }
    };

    bot.setTargetEpisodeCount(30);
    bot.toggle(engine);

    for (let i = 1; i <= 30; i++) {
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_${i}`,
        distanceAtCollision: 0,
        relativeVelocity: 12.0
      };
      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });
    }

    // Must have 3 batch export files (10 + 10 + 10 = 30)
    expect(exportedBatches.length).toBe(3);
    expect(exportedBatches[0].length).toBe(10);
    expect(exportedBatches[1].length).toBe(10);
    expect(exportedBatches[2].length).toBe(10);

    const totalExportedEpisodes = exportedBatches.reduce((acc, b) => acc + b.length, 0);
    expect(totalExportedEpisodes).toBe(30);

    // Verify all episode IDs across batches are unique (no duplicates or missing episodes)
    const allIds = exportedBatches.flatMap(b => b.map(ep => ep.episode_id));
    expect(new Set(allIds).size).toBe(30);
  });

  it('3. Non-Multiple Target Arithmetic Check (Target = 25): exports sum to 25 (10 + 10 + 5)', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    const exportedBatches = [];
    bot.onDownload = (contentStr, filename) => {
      if (filename.startsWith('nav_test_bot_batch_')) {
        exportedBatches.push(JSON.parse(contentStr));
      }
    };

    bot.setTargetEpisodeCount(25);
    bot.toggle(engine);

    for (let i = 1; i <= 25; i++) {
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_${i}`,
        distanceAtCollision: 0,
        relativeVelocity: 12.0
      };
      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });
    }

    expect(bot.enabled).toBe(false);
    expect(bot.stateMode).toBe('COMPLETE');

    // Must have 3 batch export files (10 + 10 + 5 = 25)
    expect(exportedBatches.length).toBe(3);
    expect(exportedBatches[0].length).toBe(10);
    expect(exportedBatches[1].length).toBe(10);
    expect(exportedBatches[2].length).toBe(5);

    const totalExportedEpisodes = exportedBatches.reduce((acc, b) => acc + b.length, 0);
    expect(totalExportedEpisodes).toBe(25);
  });

  it('4. Indefinite-Run Regression Check (Target = null): runs past 30 episodes without auto-stop', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    // Keep target null (default)
    expect(bot.targetEpisodeCount).toBeNull();
    bot.toggle(engine);

    for (let i = 1; i <= 35; i++) {
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_${i}`,
        distanceAtCollision: 0,
        relativeVelocity: 12.0
      };
      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });

      expect(bot.enabled).toBe(true); // Must remain enabled indefinitely
    }

    expect(bot.sessionEpisodeCount).toBe(35);

    // Turn off manually
    bot.toggle(engine);
    expect(bot.enabled).toBe(false);
  });

  it('5. HUD Completion State Display Test', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    const mockStatusElement = { innerHTML: '', style: {} };
    bot.statusElement = mockStatusElement;

    bot.setTargetEpisodeCount(5);
    bot.toggle(engine);

    for (let i = 1; i <= 5; i++) {
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `ice_${i}`,
        distanceAtCollision: 0,
        relativeVelocity: 12.0
      };
      bot.evaluateFrame(engine, {
        simulation_time: 0.1,
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });
    }

    expect(bot.stateMode).toBe('COMPLETE');
    expect(bot.statusElement).not.toBeNull();
    expect(bot.statusElement.innerHTML).toContain('COMPLETE');
    expect(bot.statusElement.innerHTML).toContain('5/5 episodes');
  });
});
