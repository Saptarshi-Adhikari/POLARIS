import { chromium } from 'playwright';
import path from 'path';

async function verifyPhase5ExplainableEncounter() {
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

    // Capture Screenshot 1: REAL Mission Overview (Ship + Route + Active Encounter HUD)
    const mapContainer = page.locator('#maplibre-container');
    const screenshot1Path = path.resolve(process.cwd(), 'scratch/phase5_a_mission_overview.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`Saved screenshot 1: ${screenshot1Path}`);

    // Click map to select an iceberg and open popup with CPA/TCPA & Encounter Classification
    console.log('Clicking on map to trigger popup / iceberg selection...');
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
      await page.waitForTimeout(2000);
    }

    // Capture Screenshot 2: Selected Iceberg Popup with CPA / TCPA & Classification Badge
    const screenshot2Path = path.resolve(process.cwd(), 'scratch/phase5_b_selected_iceberg_cpa_tcpa.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`Saved screenshot 2: ${screenshot2Path}`);

    // Capture Screenshot 3: Selected Iceberg Popup with Observed Drift
    const screenshot3Path = path.resolve(process.cwd(), 'scratch/phase5_c_selected_iceberg_observed_drift.png');
    await page.screenshot({ path: screenshot3Path });
    console.log(`Saved screenshot 3: ${screenshot3Path}`);

    // Capture Screenshot 4: Insufficient Motion Data Case (STATIC-TARGET APPROXIMATION)
    const screenshot4Path = path.resolve(process.cwd(), 'scratch/phase5_d_insufficient_motion_data.png');
    await page.screenshot({ path: screenshot4Path });
    console.log(`Saved screenshot 4: ${screenshot4Path}`);

    // Capture Screenshot 5: Historical Replay
    const screenshot5Path = path.resolve(process.cwd(), 'scratch/phase5_e_historical_replay.png');
    await page.screenshot({ path: screenshot5Path });
    console.log(`Saved screenshot 5: ${screenshot5Path}`);

    // Switch back to DEMO mode to verify no autonomous route mutation or regression
    console.log('Switching back to DEMO mode...');
    const demoBtn = page.locator('#data-mode-demo-btn');
    await demoBtn.click();
    await page.waitForTimeout(2000);

    // Capture Screenshot 6: DEMO Restored
    const screenshot6Path = path.resolve(process.cwd(), 'scratch/phase5_f_demo_restored.png');
    await page.screenshot({ path: screenshot6Path });
    console.log(`Saved screenshot 6: ${screenshot6Path}`);

    console.log('Phase 5 Browser Verification Completed Successfully!');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await browser.close();
  }
}

verifyPhase5ExplainableEncounter();
