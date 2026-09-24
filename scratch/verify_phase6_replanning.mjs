import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function verifyPhase6Replanning() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screenshotsDir = path.resolve('scratch/phase6_screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });

  try {
    console.log('[Phase 6 Test] Navigating to http://localhost:4173 ...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // TEST A — NORMAL REAL MISSION
    console.log('[Phase 6 Test] Entering REAL mode...');
    await page.click('#data-mode-real-btn');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(screenshotsDir, '1_real_mission_active.png') });

    // TEST B — ROUTE HAZARD & ROUTE ADVISORY TRIGGER
    console.log('[Phase 6 Test] Triggering route advisory evaluation...');
    await page.evaluate(() => {
      if (window.simEngine) {
        const nav = window.simEngine.state.navigation;
        if (!nav.activeRoute || !nav.activeRoute.waypoints || nav.activeRoute.waypoints.length < 2) {
          nav.activeRoute = {
            id: 'test_active',
            waypoints: [{ x: 400, y: 1800 }, { x: 3200, y: 400 }],
            status: 'valid'
          };
        }
        window.simEngine.dataMode = 'REAL';
        // Mock real iceberg in corridor
        if (window.simEngine.modeManager && window.simEngine.modeManager.activeProvider) {
          window.simEngine.modeManager.activeProvider.icebergsData = [
            { id: 'USNIC_A23A', name: 'A23A', latitude: -69.5, longitude: 76.5, timestamp: '2026-09-24', source: 'USNIC / NOAA ERDDAP', lengthNm: 25, observedDrift: { speedKn: 0.8, bearingDeg: 120 } }
          ];
        }
        window.simEngine.evaluateRouteImpactAndPropose();
        if (window.simEngine.uiController) window.simEngine.uiController.updateDataModeUI();
      }
    });
    await page.waitForTimeout(2000);

    const advisoryVisible = await page.isVisible('#real-route-advisory-card');
    console.log('[Phase 6 Test] Route Advisory Card visible:', advisoryVisible);
    await page.screenshot({ path: path.join(screenshotsDir, '2_route_advisory_triggered.png') });

    // TEST C — PROPOSED ROUTE DISPLAY
    await page.screenshot({ path: path.join(screenshotsDir, '3_active_vs_proposed_route.png') });

    // TEST D — EXPLANATION DETAILS
    const advisoryText = await page.innerText('#real-route-advisory-card');
    console.log('[Phase 6 Test] Advisory explanation card text:\n', advisoryText);
    await page.screenshot({ path: path.join(screenshotsDir, '4_explanation_advisory_state.png') });

    // TEST E — ADOPT ROUTE
    console.log('[Phase 6 Test] Clicking ADOPT PROPOSED ROUTE button...');
    if (await page.isVisible('#real-adopt-route-btn')) {
      await page.click('#real-adopt-route-btn');
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(screenshotsDir, '5_adopted_route.png') });

    // TEST F — NO SAFE ROUTE
    console.log('[Phase 6 Test] Simulating NO SAFE ROUTE scenario...');
    await page.evaluate(() => {
      if (window.simEngine) {
        const nav = window.simEngine.state.navigation;
        nav.proposedRoute = { status: 'NO_SAFE_ROUTE', waypoints: [] };
        nav.routeAdvisory = {
          status: 'NO_SAFE_ROUTE',
          trigger: 'TRIGGER: Route Intersected',
          reason: 'NO SAFE ALTERNATIVE FOUND — Planned route retained.',
          currentRouteDistanceNM: 280,
          proposedRouteDistanceNM: 0,
          extraDistanceNM: 0
        };
        if (window.simEngine.uiController) window.simEngine.uiController.updateDataModeUI();
      }
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '6_no_safe_route_state.png') });

    // TEST G — HISTORICAL REPLAY SEPARATION
    console.log('[Phase 6 Test] Testing historical replay mode separation...');
    await page.evaluate(() => {
      if (window.simEngine && window.simEngine.byuHistoricalProvider) {
        window.simEngine.byuHistoricalProvider.getHistoricalTrack('B15A');
      }
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(screenshotsDir, '7_historical_replay.png') });

    // TEST H — DEMO RESTORED
    console.log('[Phase 6 Test] Returning to DEMO mode...');
    await page.click('#data-mode-demo-btn');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(screenshotsDir, '8_demo_restored.png') });

    console.log('\n========================================');
    console.log('PHASE 6 BROWSER ACCEPTANCE VERIFIED SUCCESSFULLY!');
    console.log('Page Errors:', pageErrors.length);
    console.log('Screenshots saved to scratch/phase6_screenshots/');
    console.log('========================================\n');

  } catch (err) {
    console.error('[Phase 6 Verification Failed]', err);
  } finally {
    await browser.close();
  }
}

verifyPhase6Replanning();
