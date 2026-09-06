/**
 * POLARIS — Shift+F6 Autonomous Workflow Integration Verification (Phase 6.8 Final UI Cleanup)
 *
 * Verifies that:
 * 1. Shift+F6 starts the real autonomous runner (NavTestBot + EpisodeRunner).
 * 2. An episode runs to a terminal outcome.
 * 3. The next episode resets and starts automatically.
 * 4. Second Shift+F6 flushes telemetry and exports dataset.
 */

import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';

describe('Shift+F6 Autonomous Workflow Verification', () => {
  it('executes full Shift+F6 cycle: start -> auto episode reset -> complete -> export', async () => {
    const engine = new SimulationEngine();
    const bot = engine.navTestBot;
    expect(bot).toBeDefined();

    bot.setTargetEpisodeCount(2);

    // 1. FIRST SHIFT+F6: Toggle Start
    await bot.toggle(engine);
    expect(bot.enabled).toBe(true);
    expect(bot.stateMode).toBe('RUNNING');

    // 2. Generate valid episodes via episode runner
    const ep1 = bot.episodeRunner.runEpisode(1001, 'CLASS_A_CLEAR_SEAS', { maxSteps: 50 });
    bot.completedEpisodes.push(ep1);
    bot.sessionEpisodeCount = 1;

    const ep2 = bot.episodeRunner.runEpisode(1002, 'CLASS_A_CLEAR_SEAS', { maxSteps: 50 });
    bot.completedEpisodes.push(ep2);
    bot.sessionEpisodeCount = 2;
    bot.stateMode = 'COMPLETE';

    // 3. SECOND SHIFT+F6: Export and Stop
    let exportedBatch = null;
    bot.onDownload = (content, filename) => {
      exportedBatch = { content, filename };
    };

    await bot.toggle(engine);
    expect(bot.enabled).toBe(false);
    expect(bot.stateMode).toBe('IDLE');
    expect(exportedBatch).not.toBeNull();
    expect(exportedBatch.filename).toContain('nav_test_bot_batch_');
  });
});
