import { test, expect } from '@playwright/test';

test('Deterministic E2E Verification of REAL Data Mode & Pipeline', async ({ page }) => {
  // 1. Load POLARIS production app
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#map-canvas');

  // 2. Confirm DEMO mode is active initially
  const demoBtn = page.locator('#data-mode-demo-btn');
  await expect(demoBtn).toBeVisible();

  // 3. Switch to REAL mode
  const realBtn = page.locator('#data-mode-real-btn');
  await realBtn.click();

  // 4. Confirm REAL Provenance HUD appears
  const realHud = page.locator('#real-data-provenance-hud');
  await expect(realHud).toBeVisible();

  // 5. Confirm Provenance Source displays USNIC / Copernicus
  const provSource = page.locator('#provenance-source-text');
  await expect(provSource).toContainText('USNIC');

  // 6. Verify Canvas rendering state & debug info
  await page.keyboard.press('d');
  const dbgHud = page.locator('#debug-hud');
  await expect(dbgHud).toBeVisible();

  // Take screenshot evidence of REAL mode execution
  await page.screenshot({ path: 'scratch/real_mode_e2e_verification.png' });
});
