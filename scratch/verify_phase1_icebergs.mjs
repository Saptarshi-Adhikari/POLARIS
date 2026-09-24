import { chromium } from 'playwright';

async function runBrowserVerification() {
  console.log('[Playwright Verification] Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    console.log('[Playwright Verification] Navigating to http://localhost:4173...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });

    console.log('[Playwright Verification] Switching to REAL mode...');
    await page.click('#data-mode-real-btn');
    await page.waitForTimeout(5000); // Wait for ERDDAP fetch & render

    // 1. Inspect RealDataProvider Icebergs
    const providerData = await page.evaluate(() => {
      const activeProvider = window.simEngine?.modeManager?.activeProvider;
      if (!activeProvider || typeof activeProvider.getIcebergs !== 'function') return null;
      return activeProvider.getIcebergs();
    });

    console.log('[Playwright Verification] Provider Iceberg Count:', providerData?.data?.length);
    console.log('[Playwright Verification] Provider Provenance:', JSON.stringify(providerData?.provenance));

    if (!providerData || !Array.isArray(providerData.data) || providerData.data.length === 0) {
      throw new Error('VERIFICATION FAILED: Provider returned 0 icebergs!');
    }

    const sample = providerData.data[0];
    console.log('[Playwright Verification] Sample Real Iceberg:', JSON.stringify(sample));

    if (typeof sample.latitude !== 'number' || typeof sample.longitude !== 'number') {
      throw new Error('VERIFICATION FAILED: Iceberg missing valid latitude/longitude coordinates!');
    }

    if (sample.latitude > -45.0 || sample.latitude < -90.0 || sample.longitude < -180.0 || sample.longitude > 180.0) {
      throw new Error(`VERIFICATION FAILED: Iceberg coordinate [${sample.longitude}, ${sample.latitude}] outside Antarctic bounds!`);
    }

    // 2. Center map on sample iceberg and click directly on center pixel
    console.log('[Playwright Verification] Centering map on iceberg and clicking...');
    await page.evaluate((ice) => {
      const map = window.simEngine?.maplibreRenderer?.map;
      if (map) {
        map.jumpTo({ center: [ice.longitude, ice.latitude], zoom: 6 });
      }
    }, sample);
    await page.waitForTimeout(1000);

    const mapBox = await page.locator('#maplibre-container').boundingBox();
    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    await page.mouse.click(centerX, centerY);
    await page.waitForTimeout(500);

    const popupHtml = await page.evaluate(() => {
      const el = document.querySelector('.maplibregl-popup-content');
      return el ? el.innerText : null;
    });
    console.log('[Playwright Verification] Iceberg Popup Content:\n', popupHtml);

    // Capture Screenshot
    await page.screenshot({ path: 'scratch/real_map_usnic_icebergs.png' });
    console.log('[Playwright Verification] Screenshot saved to scratch/real_map_usnic_icebergs.png');

    // 3. Switch back to DEMO mode & verify intactness
    console.log('[Playwright Verification] Switching back to DEMO mode...');
    await page.click('#data-mode-demo-btn');
    await page.waitForTimeout(1000);

    const isDemoCanvasVisible = await page.evaluate(() => {
      const canvas = document.getElementById('map-canvas');
      return canvas && !canvas.classList.contains('hidden');
    });
    console.log('[Playwright Verification] DEMO Canvas Visible:', isDemoCanvasVisible);
    if (!isDemoCanvasVisible) {
      throw new Error('VERIFICATION FAILED: DEMO canvas not restored after returning to DEMO mode!');
    }

    console.log('\n🎉 ALL PHASE 1 BROWSER VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('[Playwright Verification] ERROR:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runBrowserVerification();
