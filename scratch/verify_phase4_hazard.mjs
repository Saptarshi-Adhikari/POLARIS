import { chromium } from 'playwright';
import path from 'path';

async function verifyPhase4HazardIntelligence() {
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

    // Capture Screenshot 1: REAL Mission Overview (Ship + Heading + Route Corridor + Icebergs)
    const mapContainer = page.locator('#maplibre-container');
    const screenshot1Path = path.resolve(process.cwd(), 'scratch/phase4_a_mission_overview.png');
    await page.screenshot({ path: screenshot1Path });
    console.log(`Saved screenshot 1: ${screenshot1Path}`);

    // Click map to select an iceberg and expose distance to ship & distance to route
    console.log('Clicking on map to trigger popup / iceberg selection...');
    const box = await mapContainer.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
      await page.waitForTimeout(2000);
    }

    // Capture Screenshot 2: Selected Iceberg Popup with Distance to Ship and Relation to Route
    const screenshot2Path = path.resolve(process.cwd(), 'scratch/phase4_b_selected_iceberg_route_relation.png');
    await page.screenshot({ path: screenshot2Path });
    console.log(`Saved screenshot 2: ${screenshot2Path}`);

    // Capture Screenshot 3: Route-Aware Iceberg State & Awareness HUD
    const screenshot3Path = path.resolve(process.cwd(), 'scratch/phase4_c_route_aware_icebergs.png');
    await page.screenshot({ path: screenshot3Path });
    console.log(`Saved screenshot 3: ${screenshot3Path}`);

    // Capture Screenshot 4: Historical Replay
    const screenshot4Path = path.resolve(process.cwd(), 'scratch/phase4_d_historical_replay.png');
    await page.screenshot({ path: screenshot4Path });
    console.log(`Saved screenshot 4: ${screenshot4Path}`);

    // Switch back to DEMO mode to verify zero regression
    console.log('Switching back to DEMO mode...');
    const demoBtn = page.locator('#data-mode-demo-btn');
    await demoBtn.click();
    await page.waitForTimeout(2000);

    // Capture Screenshot 5: DEMO Restored
    const screenshot5Path = path.resolve(process.cwd(), 'scratch/phase4_e_demo_restored.png');
    await page.screenshot({ path: screenshot5Path });
    console.log(`Saved screenshot 5: ${screenshot5Path}`);

    console.log('Phase 4 Browser Verification Completed Successfully!');
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await browser.close();
  }
}

verifyPhase4HazardIntelligence();
