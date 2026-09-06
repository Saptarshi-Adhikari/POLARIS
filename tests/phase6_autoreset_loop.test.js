import { describe, it, expect, vi } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import { TerminationReason, EventLabel } from '../src/js/dataset/datasetSchema.js';

describe('Phase 6 End-to-End Auto-Reset Loop & Toggle-Off Export', () => {

  it('1. Collision Auto-Reset Test — collision finalizes episode and begins new episode at exact start position', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    // Enable bot (Shift+F6 toggle on)
    bot.toggle(engine);

    expect(bot.enabled).toBe(true);
    expect(bot.stateMode).toBe('RUNNING');
    expect(bot.currentEpisode).not.toBeNull();
    const ep1Id = bot.currentEpisode.episode_id;
    const ep1Seed = bot.currentEpisode.seed;

    // Simulate frames leading to forced collision
    engine.ship.lastCollisionEvent = {
      collisionDetected: true,
      icebergId: 'test_iceberg',
      distanceAtCollision: 0,
      relativeVelocity: 12.0
    };

    bot.evaluateFrame(engine, {
      simulation_time: 0.1,
      ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
    });

    // Episode 1 should be completed and moved to completedEpisodes
    expect(bot.completedEpisodes.length).toBe(1);
    expect(bot.completedEpisodes[0].episode_id).toBe(ep1Id);
    expect(bot.completedEpisodes[0].termination_reason).toBe(TerminationReason.COLLISION);
    expect(bot.completedEpisodes[0].event_label).toBe(EventLabel.COLLISION);

    // Bot should automatically begin Episode 2 with new seed and reset ship state
    expect(bot.enabled).toBe(true);
    expect(bot.stateMode).toBe('RUNNING');
    expect(bot.currentEpisode.episode_id).not.toBe(ep1Id);
    expect(bot.currentEpisode.seed).not.toBe(ep1Seed);

    // Ship position & physics must be restored to canonical start state
    expect(engine.ship.x).toBe(bot.currentEpisode.start_state.x);
    expect(engine.ship.y).toBe(bot.currentEpisode.start_state.y);
    expect(engine.ship.heading).toBe(bot.currentEpisode.start_state.heading);
    expect(engine.ship.vx).toBe(0);
    expect(engine.ship.vy).toBe(0);
    expect(engine.ship.fuel).toBe(100.0);
    expect(engine.ship.lastCollisionEvent.collisionDetected).toBe(false);
  });

  it('2. Multi-Cycle Collision-Reset Test — 3 consecutive collisions reset cleanly without state leaks', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    bot.toggle(engine);

    const episodeIds = [];
    const seeds = [];

    for (let i = 0; i < 3; i++) {
      episodeIds.push(bot.currentEpisode.episode_id);
      seeds.push(bot.currentEpisode.seed);

      // Force collision
      engine.ship.lastCollisionEvent = {
        collisionDetected: true,
        icebergId: `iceberg_cycle_${i}`,
        distanceAtCollision: 0,
        relativeVelocity: 10.0 + i
      };

      bot.evaluateFrame(engine, {
        simulation_time: 0.1 * (i + 1),
        ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
      });

      expect(bot.stateMode).toBe('RUNNING');
      expect(engine.ship.lastCollisionEvent.collisionDetected).toBe(false);

      // Explicit per-field state-equality assertions for zero state leakage
      expect(engine.ship.x).toBe(bot.currentEpisode.start_state.x);
      expect(engine.ship.y).toBe(bot.currentEpisode.start_state.y);
      expect(engine.ship.heading).toBe(bot.currentEpisode.start_state.heading);
      expect(engine.ship.vx).toBe(0);
      expect(engine.ship.vy).toBe(0);
      expect(engine.ship.angularVelocity).toBe(0);
      expect(engine.ship.fuel).toBe(100.0);
      expect(engine.ship.throttle).toBe(65);
      expect(engine.ship.rudder).toBe(0);
    }

    expect(bot.completedEpisodes.length).toBe(3);
    expect(new Set(episodeIds).size).toBe(3);
    expect(new Set(seeds).size).toBe(3);

    bot.completedEpisodes.forEach((ep, idx) => {
      expect(ep.episode_id).toBe(episodeIds[idx]);
      expect(ep.seed).toBe(seeds[idx]);
      expect(ep.termination_reason).toBe(TerminationReason.COLLISION);
      expect(ep.result.status).toBe('COLLISION');
    });
  });

  it('3. Manual Click-to-Place Iceberg Collision Test — manual iceberg collision triggers exact same auto-reset loop', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    bot.toggle(engine);
    const initialEpId = bot.currentEpisode.episode_id;

    // Simulate manual click-to-place iceberg directly in vessel path
    const manualIce = new Iceberg({ id: 9999, name: 'MANUAL-ICE', x: engine.ship.x + 10, y: engine.ship.y, size: 500 });
    engine.icebergs.push(manualIce);

    // Simulate ship collision with manual iceberg via ship.lastCollisionEvent
    engine.ship.lastCollisionEvent = {
      collisionDetected: true,
      icebergId: manualIce.id,
      distanceAtCollision: 0,
      relativeVelocity: 15.0
    };

    bot.evaluateFrame(engine, {
      simulation_time: 0.5,
      ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 },
      icebergs: [{ id: manualIce.id, x: manualIce.x, y: manualIce.y }]
    });

    // Episode should finalize with COLLISION and auto-restart new episode
    expect(bot.completedEpisodes.length).toBe(1);
    expect(bot.completedEpisodes[0].episode_id).toBe(initialEpId);
    expect(bot.completedEpisodes[0].collision_events.length).toBeGreaterThan(0);
    expect(bot.completedEpisodes[0].collision_events[0].iceberg_id).toBe(9999);

    // Ship position reset cleanly
    expect(bot.currentEpisode.episode_id).not.toBe(initialEpId);
    expect(engine.ship.lastCollisionEvent.collisionDetected).toBe(false);
  });

  it('4. Toggle-Off Finalization & Auto-Download Test — MANUAL_STOP finalized and export triggered with all buffered episodes', () => {
    const engine = new SimulationEngine();
    const bot = new NavTestBot(engine, null, null, null, null, { baseDir: 'scratch/test_dataset' });

    const downloadSpy = vi.fn();
    bot.onDownload = downloadSpy;

    // Turn ON
    bot.toggle(engine);

    // Complete Episode 1 via destination reached
    bot.evaluateFrame(engine, {
      simulation_time: 1.0,
      ship: { x: engine.ship.x, y: engine.ship.y, heading: engine.ship.heading, speed: 12 }
    });
    // Manually trigger destination reached condition
    bot.endEpisode(TerminationReason.DESTINATION_REACHED, engine);

    // Now Episode 2 is RUNNING
    expect(bot.stateMode).toBe('RUNNING');
    const runningEpId = bot.currentEpisode.episode_id;

    // Sample a few frames in Episode 2
    bot.evaluateFrame(engine, {
      simulation_time: 0.1,
      ship: { x: engine.ship.x + 5, y: engine.ship.y - 5, heading: engine.ship.heading, speed: 12 }
    });

    // Turn OFF (Shift+F6 pressed again)
    bot.toggle(engine);

    // Bot disabled and stateMode IDLE
    expect(bot.enabled).toBe(false);
    expect(bot.stateMode).toBe('IDLE');

    // Download callback MUST have been called
    expect(downloadSpy).toHaveBeenCalledTimes(1);

    // Download content check
    const [downloadContent, filename] = downloadSpy.mock.calls[0];
    expect(filename).toMatch(/^nav_test_bot_batch_\d+\.json$/);

    const exportedEpisodes = JSON.parse(downloadContent);
    expect(exportedEpisodes.length).toBe(2);

    // Episode 1: DESTINATION_REACHED
    expect(exportedEpisodes[0].termination_reason).toBe(TerminationReason.DESTINATION_REACHED);

    // Episode 2 (in-progress): MANUAL_STOP
    expect(exportedEpisodes[1].episode_id).toBe(runningEpId);
    expect(exportedEpisodes[1].termination_reason).toBe(TerminationReason.MANUAL_STOP);
    expect(exportedEpisodes[1].result.status).toBe('MANUAL_STOP');

    // Memory buffer cleared after export
    expect(bot.completedEpisodes.length).toBe(0);
  });

});
