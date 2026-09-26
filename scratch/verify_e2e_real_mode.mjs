import { test, expect } from '@playwright/test';

test('Verify POLARIS 2D Simulator DEMO & REAL Data Mode & Safety System', async ({ page }) => {
  // Navigate to local dev app
  await page.goto('http://localhost:5173/');

  // Wait for canvas to load
  await page.waitForSelector('#simCanvas', { timeout: 10000 });

  // Verify initial DEMO mode elements
  const demoBtn = page.locator('#data-mode-demo-btn');
  await expect(demoBtn).toBeVisible();

  // Verify SPAWN ICEBERG button is visible in DEMO mode
  const spawnBtn = page.locator('#bottom-spawn-iceberg-btn');
  await expect(spawnBtn).toBeVisible();

  // Switch to REAL mode
  const realBtn = page.locator('#data-mode-real-btn');
  await realBtn.click();

  // Verify REAL provenance HUD becomes visible
  const provenanceHud = page.locator('#real-data-provenance-hud');
  await expect(provenanceHud).toBeVisible();

  // Verify SPAWN ICEBERG button is hidden in REAL mode
  await expect(spawnBtn).toBeHidden();

  // Take screenshot of REAL mode simulation
  await page.screenshot({ path: 'scratch/real_mode_verified.png' });
});
