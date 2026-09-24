import { chromium } from 'playwright';
import { byuHistoricalProvider } from '../src/js/data/ByuHistoricalProvider.js';

async function runPhase2BrowserVerification() {
  console.log('[Playwright Phase 2 Verification] Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    console.log('[Playwright Phase 2 Verification] Navigating to http://localhost:4173...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });

    console.log('[Playwright Phase 2 Verification] Switching to REAL mode...');
    await page.click('#data-mode-real-btn');
    await page.waitForTimeout(5000); // Allow full map load & style loaded

    // Screenshot A: REAL map with current USNIC iceberg markers
    await page.screenshot({ path: 'scratch/phase2_a_real_map_usnic.png' });
    console.log('[Playwright Phase 2 Verification] Saved Screenshot A: scratch/phase2_a_real_map_usnic.png');

    // Get historical track for A23A directly
    const track = await byuHistoricalProvider.getHistoricalTrack('A23A');
    console.log(`[Playwright Phase 2 Verification] Loaded BYU track for A23A: ${track?.observationCount} observations (${track?.startDate} to ${track?.endDate})`);

    // Render historical track on MapLibre map in page
    const trackData = await page.evaluate(async (tr) => {
      const renderer = window.simEngine?.maplibreRenderer;
      if (!renderer || !renderer.map) return null;

      // Ensure style loaded
      if (!renderer.map.isStyleLoaded()) {
        await new Promise(res => renderer.map.once('style.load', res));
      }

      renderer.selectedHistoricalTrack = tr;
      renderer.renderHistoricalTrack(tr);

      const trackSource = renderer.map.getSource('byu-historical-track');
      const replaySource = renderer.map.getSource('byu-historical-replay-point');

      const lineFeat = trackSource?._data?.features[0];
      const replayFeat = replaySource?._data?.features[0];

      return {
        lineCoordsCount: lineFeat?.geometry?.coordinates?.length || 0,
        sampleCoord: lineFeat?.geometry?.coordinates[0],
        replayCoord: replayFeat?.geometry?.coordinates,
        replayDate: replayFeat?.properties?.date
      };
    }, track);

    console.log('[Playwright Phase 2 Verification] Historical LineString Points Count:', trackData?.lineCoordsCount);
    console.log('[Playwright Phase 2 Verification] Sample Track Coordinate [lon, lat]:', JSON.stringify(trackData?.sampleCoord));
    console.log('[Playwright Phase 2 Verification] Replay Point [lon, lat]:', JSON.stringify(trackData?.replayCoord));

    if (!trackData || trackData.lineCoordsCount === 0) {
      throw new Error('VERIFICATION FAILED: 0 historical trajectory coordinates rendered on MapLibre!');
    }

    const [lon, lat] = trackData.sampleCoord;
    if (lat > -45.0 || lat < -90.0 || lon < -180.0 || lon > 180.0) {
      throw new Error(`VERIFICATION FAILED: Historical coordinate [${lon}, ${lat}] outside Antarctic bounds!`);
    }

    // Screenshot B: Selected iceberg with historical trajectory
    await page.screenshot({ path: 'scratch/phase2_b_historical_trajectory.png' });
    console.log('[Playwright Phase 2 Verification] Saved Screenshot B: scratch/phase2_b_historical_trajectory.png');

    // 2. Perform Historical Replay at intermediate date
    console.log('[Playwright Phase 2 Verification] Simulating historical time replay to 2013-05-15...');
    const replayResult = await page.evaluate((tr) => {
      const renderer = window.simEngine?.maplibreRenderer;
      if (!renderer) return null;

      renderer.renderHistoricalTrack(tr, '2013-05-15');
      const replaySource = renderer.map.getSource('byu-historical-replay-point');
      const feat = replaySource?._data?.features[0];

      return {
        date: feat?.properties?.date,
        progress: feat?.properties?.progress,
        coords: feat?.geometry?.coordinates
      };
    }, track);

    console.log('[Playwright Phase 2 Verification] Replay State at 2013-05-15:', JSON.stringify(replayResult));
    if (!replayResult || !replayResult.date) {
      throw new Error('VERIFICATION FAILED: Replay state update failed!');
    }

    // Screenshot C: Historical Replay State
    await page.screenshot({ path: 'scratch/phase2_c_replay_state.png' });
    console.log('[Playwright Phase 2 Verification] Saved Screenshot C: scratch/phase2_c_replay_state.png');

    // 3. Switch back to DEMO mode
    console.log('[Playwright Phase 2 Verification] Switching back to DEMO mode...');
    await page.click('#data-mode-demo-btn');
    await page.waitForTimeout(1000);

    const isDemoCanvasVisible = await page.evaluate(() => {
      const canvas = document.getElementById('map-canvas');
      return canvas && !canvas.classList.contains('hidden');
    });
    console.log('[Playwright Phase 2 Verification] DEMO Canvas Visible:', isDemoCanvasVisible);
    if (!isDemoCanvasVisible) {
      throw new Error('VERIFICATION FAILED: DEMO canvas not restored after returning to DEMO mode!');
    }

    // Screenshot D: DEMO Mode Restored
    await page.screenshot({ path: 'scratch/phase2_d_demo_restored.png' });
    console.log('[Playwright Phase 2 Verification] Saved Screenshot D: scratch/phase2_d_demo_restored.png');

    console.log('\n🎉 ALL PHASE 2 BROWSER VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('[Playwright Phase 2 Verification] ERROR:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runPhase2BrowserVerification();
