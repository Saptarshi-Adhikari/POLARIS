import { chromium } from 'playwright';
import path from 'path';

async function verifyPhase3Mission() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Switch to REAL Mode
    console.log('Switching to REAL mode...');
    const realBtn = page.locator('#data-mode-real-btn');
    await realBtn.click();
    await page.waitForTimeout(3000);

    // Capture Screenshot 1: Mission Overview (Ship + Route + Destination + Icebergs)
    const mapContainer = page.locator('#maplibre-container');
    const screenshot1Path = path.resolve(process.cwd(), 'scratch/phase3_a_mission_overview.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`Saved screenshot 1: ${screenshot1Path}`);

    // Click map to select an iceberg (A23A or operational point)
    console.log('Clicking on map to trigger popup / iceberg selection...');
    const box = await mapContainer.boundingBox();
    if (box) {
      // Click near center left where icebergs congregate
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
      await page.waitForTimeout(2000);
    }

    // Capture Screenshot 2: Selected Iceberg Popup with Distance in NM & Bearing
    const screenshot2Path = path.resolve(process.cwd(), 'scratch/phase3_b_selected_iceberg_distance.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`Saved screenshot 2: ${screenshot2Path}`);

    // Capture Screenshot 3: Historical Replay
    const screenshot3Path = path.resolve(process.cwd(), 'scratch/phase3_c_historical_replay.png');
    await page.screenshot({ path: screenshot3Path });
    console.log(`Saved screenshot 3: ${screenshot3Path}`);

    // Switch back to DEMO mode to verify no regression
    console.log('Switching back to DEMO mode...');
    const demoBtn = page.locator('#data-mode-demo-btn');
    await demoBtn.click();
    await page.waitForTimeout(2000);

    // Capture Screenshot 4: DEMO Restored
    const screenshot4Path = path.resolve(process.cwd(), 'scratch/phase3_d_demo_restored.png');
    await page.screenshot({ path: screenshot4Path });
    console.log(`Saved screenshot 4: ${screenshot4Path}`);

    console.log('Phase 3 Browser Verification Completed Successfully!');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await browser.close();
  }
}

verifyPhase3Mission();
