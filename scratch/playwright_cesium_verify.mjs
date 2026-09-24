/**
 * ASTRALIS Nav-OS — Playwright Headless Cesium Runtime Verification
 * 
 * This script:
 * 1. Opens http://localhost:5173 in real headless Chromium
 * 2. Clicks DATA → REAL
 * 3. Captures ALL console errors, network failures, and exceptions
 * 4. Records exact failing URLs, HTTP status codes, content-types
 * 5. Checks for the InvalidStateError: The source image could not be decoded
 * 6. Reports exact source file + line from stack traces
 */

import { chromium } from 'playwright';

const RESULTS = {
  consoleErrors: [],
  networkFailures: [],
  pageErrors: [],
  renderStopped: false,
  cesiumInitialized: false,
  sceneRendering: false,
  tilesRequested: [],
  htmlResponsesForImages: [],
  entityCount: 0,
};

async function run() {
  console.log('=== ASTRALIS Cesium Headless Runtime Verification ===');
  console.log('Launching headless Chromium...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--disable-web-security',
      '--enable-webgl',
      '--use-gl=swiftshader',          // Software WebGL renderer — works headlessly
      '--enable-unsafe-webgpu',
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  // --- Intercept ALL network requests for image tiles ---
  const networkLog = [];
  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('tile.openstreetmap.org') ||
      url.includes('cesium') ||
      url.includes('.png') ||
      url.includes('.jpg') ||
      url.includes('.jpeg') ||
      url.includes('.glb') ||
      url.includes('.terrain') ||
      url.includes('ion.cesium.com') ||
      url.includes('gibs') ||
      url.includes('carto')
    ) {
      networkLog.push({ type: 'request', url, method: req.method() });
    }
  });

  page.on('response', async (resp) => {
    const url = resp.url();
    const status = resp.status();
    const ct = resp.headers()['content-type'] || 'unknown';
    
    if (
      url.includes('tile.openstreetmap.org') ||
      url.includes('.png') ||
      url.includes('.jpg') ||
      url.includes('.glb') ||
      url.includes('.terrain') ||
      url.includes('ion.cesium.com') ||
      url.includes('cesium')
    ) {
      const entry = { url, status, contentType: ct };
      RESULTS.tilesRequested.push(entry);
      
      // Flag if an image URL returned HTML (the decode error trigger)
      if ((url.endsWith('.png') || url.endsWith('.jpg') || url.endsWith('.jpeg')) &&
           ct.includes('text/html')) {
        RESULTS.htmlResponsesForImages.push(entry);
        console.error(`[CRITICAL] IMAGE URL RETURNED HTML: ${url} → status=${status} ct=${ct}`);
      }

      if (status >= 400) {
        RESULTS.networkFailures.push(entry);
        console.error(`[NET FAIL] ${status} ${url} | ${ct}`);
      }
    }
  });

  // --- Capture ALL console output ---
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') {
      RESULTS.consoleErrors.push(text);
      console.error(`[BROWSER CONSOLE ERROR] ${text}`);
    } else if (type === 'warning') {
      console.warn(`[BROWSER WARN] ${text}`);
    } else {
      console.log(`[BROWSER LOG] ${text}`);
    }
  });

  // --- Capture uncaught page exceptions ---
  page.on('pageerror', (err) => {
    RESULTS.pageErrors.push({
      message: err.message,
      stack: err.stack
    });
    console.error(`[PAGE ERROR] ${err.message}`);
    console.error(`[STACK] ${err.stack}`);
    
    if (err.message.includes('InvalidStateError') || 
        err.message.includes('source image could not be decoded') ||
        err.message.includes('Rendering has stopped')) {
      RESULTS.renderStopped = true;
      console.error('[CONFIRMED] CESIUM RENDER STOP ERROR DETECTED');
    }
  });

  // --- Navigate to app ---
  console.log('Navigating to http://localhost:5173 ...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('[OK] App loaded');
  } catch (err) {
    console.error(`[FAIL] Navigation error: ${err.message}`);
    await browser.close();
    return;
  }

  // --- Wait for page to be stable ---
  await page.waitForTimeout(2000);

  // --- Screenshot: initial DEMO state ---
  await page.screenshot({ path: 'scratch/screenshot_01_demo_state.png' });
  console.log('[SCREENSHOT] scratch/screenshot_01_demo_state.png saved');

  // --- Click DATA → REAL ---
  console.log('Clicking DATA → REAL button...');
  try {
    const realBtn = await page.$('#data-mode-real-btn');
    if (!realBtn) {
      console.error('[FAIL] Could not find #data-mode-real-btn');
    } else {
      await realBtn.click();
      console.log('[OK] Clicked REAL button');
    }
  } catch (err) {
    console.error(`[FAIL] Click error: ${err.message}`);
  }

  // --- Wait for Cesium to initialize and tiles to start loading ---
  console.log('Waiting 8 seconds for Cesium to initialize...');
  await page.waitForTimeout(8000);

  // --- Screenshot: after REAL mode ---
  await page.screenshot({ path: 'scratch/screenshot_02_real_mode.png' });
  console.log('[SCREENSHOT] scratch/screenshot_02_real_mode.png saved');

  // --- Check if Cesium container is visible ---
  const cesiumContainerVisible = await page.isVisible('#cesium-container');
  console.log(`[CESIUM CONTAINER VISIBLE] ${cesiumContainerVisible}`);

  // --- Check if error modal is displayed ---
  const errorModalText = await page.evaluate(() => {
    const modals = document.querySelectorAll('.cesium-widget-errorPanel, [class*="errorPanel"]');
    const results = [];
    for (const modal of modals) {
      if (modal.offsetParent !== null) {
        results.push(modal.textContent.trim().substring(0, 200));
      }
    }
    return results;
  });

  if (errorModalText.length > 0) {
    RESULTS.renderStopped = true;
    console.error('[CESIUM ERROR MODAL VISIBLE]:');
    for (const text of errorModalText) {
      console.error(`  ${text}`);
    }
  } else {
    console.log('[OK] No Cesium error modal visible');
  }

  // --- Inspect Cesium scene state from JS ---
  const cesiumState = await page.evaluate(() => {
    try {
      const widgets = document.querySelectorAll('.cesium-widget');
      const canvas = document.querySelector('#cesium-container canvas');
      const errorPanel = document.querySelector('.cesium-widget-errorPanel');
      return {
        widgetCount: widgets.length,
        hasCanvas: !!canvas,
        canvasWidth: canvas ? canvas.width : 0,
        canvasHeight: canvas ? canvas.height : 0,
        errorPanelVisible: errorPanel ? errorPanel.offsetParent !== null : false,
        errorPanelText: errorPanel ? errorPanel.textContent.trim().substring(0, 300) : null,
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  console.log('[CESIUM STATE]:', JSON.stringify(cesiumState, null, 2));

  if (cesiumState.errorPanelVisible) {
    RESULTS.renderStopped = true;
    console.error('[CONFIRMED] Cesium error panel is VISIBLE — render loop stopped');
    console.error('[ERROR PANEL TEXT]:', cesiumState.errorPanelText);
  }

  // --- Check provenance source text ---
  const provenanceSourceText = await page.$eval('#provenance-source-text', el => el.innerText).catch(() => 'NOT FOUND');
  console.log(`[PROVENANCE SOURCE] "${provenanceSourceText}"`);

  // --- Check SPAWN ICEBERG button visibility in REAL mode ---
  const spawnBtnHidden = await page.evaluate(() => {
    const btn = document.getElementById('add-iceberg-btn');
    if (!btn) return 'NOT_FOUND';
    return btn.classList.contains('hidden') ? 'HIDDEN' : 'VISIBLE';
  });
  console.log(`[SPAWN ICEBERG BUTTON in REAL mode] ${spawnBtnHidden}`);

  // --- Check distance unit in telemetry ---
  const xteText = await page.$eval('#telemetry-xte', el => el.innerText).catch(() => 'NOT FOUND');
  console.log(`[TELEMETRY XTE] "${xteText}"`);

  // --- Toggle 2D ---
  console.log('Testing 2D/3D toggle...');
  const btn2d = await page.$('#map-view-2d-btn');
  if (btn2d) {
    await btn2d.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scratch/screenshot_03_2d_mode.png' });
    console.log('[SCREENSHOT] scratch/screenshot_03_2d_mode.png saved');
  }

  // --- Toggle 3D back ---
  const btn3d = await page.$('#map-view-3d-btn');
  if (btn3d) {
    await btn3d.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'scratch/screenshot_04_3d_mode.png' });
    console.log('[SCREENSHOT] scratch/screenshot_04_3d_mode.png saved');
  }

  // --- Final report ---
  console.log('\n======= FINAL VERIFICATION REPORT =======');
  console.log(`Total tile requests: ${RESULTS.tilesRequested.length}`);
  console.log(`Network failures (4xx/5xx): ${RESULTS.networkFailures.length}`);
  console.log(`Image URLs that returned HTML (decode error trigger): ${RESULTS.htmlResponsesForImages.length}`);
  console.log(`Console errors: ${RESULTS.consoleErrors.length}`);
  console.log(`Page errors: ${RESULTS.pageErrors.length}`);
  console.log(`Render stopped: ${RESULTS.renderStopped}`);

  if (RESULTS.networkFailures.length > 0) {
    console.log('\nFailed network requests:');
    for (const f of RESULTS.networkFailures) {
      console.log(`  ${f.status} ${f.url} | ${f.contentType}`);
    }
  }

  if (RESULTS.htmlResponsesForImages.length > 0) {
    console.log('\n[ROOT CAUSE CANDIDATE] Image URLs returning HTML:');
    for (const f of RESULTS.htmlResponsesForImages) {
      console.log(`  URL: ${f.url}`);
      console.log(`  Status: ${f.status}`);
      console.log(`  Content-Type: ${f.contentType}`);
    }
  }

  if (RESULTS.consoleErrors.length > 0) {
    console.log('\nBrowser console errors:');
    for (const e of RESULTS.consoleErrors) {
      console.log(`  ${e}`);
    }
  }

  if (RESULTS.pageErrors.length > 0) {
    console.log('\nPage (JS) errors:');
    for (const e of RESULTS.pageErrors) {
      console.log(`  Message: ${e.message}`);
      console.log(`  Stack: ${e.stack?.split('\n').slice(0, 5).join('\n  ')}`);
    }
  }

  console.log('\nCesium widget state:');
  console.log(JSON.stringify(cesiumState, null, 2));

  if (!RESULTS.renderStopped && RESULTS.pageErrors.length === 0 && cesiumState.hasCanvas) {
    console.log('\n[CESIUM HEADLESS RUNTIME PASS] — No InvalidStateError, canvas present, no error panel');
  } else {
    console.log('\n[CESIUM HEADLESS RUNTIME FAIL] — See errors above');
  }

  await browser.close();
}

run().catch(err => {
  console.error('[FATAL] Playwright script failed:', err);
  process.exit(1);
});
