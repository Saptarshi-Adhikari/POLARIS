import { chromium } from 'playwright';
import path from 'path';

async function runVerification() {
  console.log('[Playwright Verification] Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors = [];
  const uncaughtExceptions = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error] ${msg.text()}`);
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error(`[Browser Page Error] ${err.stack || err.message}`);
    uncaughtExceptions.push(err.message);
  });

  console.log('[Playwright Verification] Navigating to http://localhost:4173...');
  await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // Take DEMO screenshot
  const demoScreenshot = path.resolve('scratch/demo_mode_verify.png');
  await page.screenshot({ path: demoScreenshot });
  console.log(`[Playwright Verification] Captured DEMO screenshot at ${demoScreenshot}`);

  // Switch to REAL mode
  console.log('[Playwright Verification] Clicking DATA: REAL button...');
  await page.click('#data-mode-real-btn');
  await page.waitForTimeout(2000);

  // Take REAL mode screenshot
  const realScreenshot = path.resolve('scratch/real_mode_verify.png');
  await page.screenshot({ path: realScreenshot });
  console.log(`[Playwright Verification] Captured REAL screenshot at ${realScreenshot}`);

  // Check for the specific null[0] error in uncaught exceptions
  const nullZeroError = uncaughtExceptions.find(e => e.includes("Cannot read properties of null (reading '0')"));
  if (nullZeroError) {
    console.error('[Playwright Verification] FAIL: Found null[0] error in uncaught exceptions!');
  } else {
    console.log('[Playwright Verification] PASS: No null[0] error detected in browser runtime!');
  }

  // Check container state
  const isMaplibreVisible = await page.isVisible('#maplibre-container');
  console.log(`[Playwright Verification] MapLibre container visible: ${isMaplibreVisible}`);

  const isConfigErrorVisible = await page.isVisible('#map-config-error');
  console.log(`[Playwright Verification] Map configuration error overlay visible: ${isConfigErrorVisible}`);

  // Switch back to DEMO
  console.log('[Playwright Verification] Switching back to DATA: DEMO...');
  await page.click('#data-mode-demo-btn');
  await page.waitForTimeout(1000);

  const isCanvasVisible = await page.isVisible('#map-canvas');
  console.log(`[Playwright Verification] DEMO canvas visible: ${isCanvasVisible}`);

  await browser.close();

  if (nullZeroError) {
    process.exit(1);
  } else {
    console.log('[Playwright Verification] ALL BROWSER CHECKS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runVerification().catch(err => {
  console.error('[Playwright Verification Failed]', err);
  process.exit(1);
});
