import { chromium } from 'playwright';

async function testAcceptanceCriteria() {
  console.log('[Playwright Acceptance Test] Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  try {
    console.log('[Playwright Acceptance Test] Navigating to http://localhost:4173...');
    await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });

    console.log('[Playwright Acceptance Test] Switching to REAL mode...');
    await page.click('#mode-toggle');
    await page.waitForTimeout(2000);

    const initial = await page.evaluate(() => {
      const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
      if (!map) return null;
      const c = map.getCenter();
      const b = map.getBounds();
      return {
        center: [c.lng, c.lat],
        bounds: [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]]
      };
    });
    console.log('[TEST INIT] Initial Map State:', JSON.stringify(initial));

    const mapBox = await page.locator('#maplibre-container').boundingBox();
    const centerX = mapBox.x + mapBox.width / 2;
    const centerY = mapBox.y + mapBox.height / 2;

    // TEST A — NORTH DRAG (Mouse drag DOWN repeatedly)
    console.log('\n--- TEST A: NORTH DRAG ---');
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX, centerY + 300, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => {
        const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
        const c = map.getCenter();
        const b = map.getBounds();
        return {
          center: [c.lng, c.lat],
          north: b.getNorth(),
          south: b.getSouth(),
          west: b.getWest(),
          east: b.getEast()
        };
      });
      console.log(`[TEST A - Gesture ${i}] Center: [${state.center[0].toFixed(3)}, ${state.center[1].toFixed(3)}], North: ${state.north.toFixed(3)}°`);
      if (state.north > -45.0) {
        throw new Error(`TEST A FAILED: North boundary exceeded! north = ${state.north}° > -45.0°`);
      }
    }
    console.log('✅ TEST A PASSED: Repeated NORTH drags kept viewport north <= -45.0°');
    await page.screenshot({ path: 'scratch/test_a_north_drag.png' });

    // TEST B — SOUTH DRAG (Mouse drag UP repeatedly)
    console.log('\n--- TEST B: SOUTH DRAG ---');
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX, centerY - 300, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => {
        const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
        const b = map.getBounds();
        return { north: b.getNorth(), south: b.getSouth() };
      });
      console.log(`[TEST B - Gesture ${i}] North: ${state.north.toFixed(3)}°, South: ${state.south.toFixed(3)}°`);
      if (state.north > -45.0) {
        throw new Error(`TEST B FAILED: North boundary exceeded during south drag! north = ${state.north}°`);
      }
    }
    console.log('✅ TEST B PASSED: Repeated SOUTH drags kept viewport within Antarctic bounds');
    await page.screenshot({ path: 'scratch/test_b_south_drag.png' });

    // TEST C — EAST/WEST DRAG
    console.log('\n--- TEST C: EAST/WEST DRAG ---');
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(centerX, centerY);
      await page.mouse.down();
      await page.mouse.move(centerX + (i % 2 === 0 ? 400 : -400), centerY, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);

      const state = await page.evaluate(() => {
        const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
        const b = map.getBounds();
        return { north: b.getNorth(), south: b.getSouth(), west: b.getWest(), east: b.getEast() };
      });
      console.log(`[TEST C - Gesture ${i}] West: ${state.west.toFixed(3)}°, East: ${state.east.toFixed(3)}°, North: ${state.north.toFixed(3)}°`);
      if (state.north > -45.0) {
        throw new Error(`TEST C FAILED: North boundary exceeded! north = ${state.north}°`);
      }
    }
    console.log('✅ TEST C PASSED: Repeated EAST/WEST drags stayed within bounds');

    // TEST D — WHEEL ZOOM OUT
    console.log('\n--- TEST D: WHEEL ZOOM OUT ---');
    await page.mouse.move(centerX, centerY);
    for (let i = 1; i <= 5; i++) {
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => {
        const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
        const b = map.getBounds();
        const z = map.getZoom();
        return { zoom: z, north: b.getNorth() };
      });
      console.log(`[TEST D - Zoom ${i}] Zoom: ${state.zoom.toFixed(2)}, North: ${state.north.toFixed(3)}°`);
      if (state.north > -45.0) {
        throw new Error(`TEST D FAILED: North boundary exceeded during zoom out! north = ${state.north}°`);
      }
    }
    console.log('✅ TEST D PASSED: Wheel zoom out kept viewport north <= -45.0°');

    // TEST E — RESIZE
    console.log('\n--- TEST E: RESIZE ---');
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(500);
    const resizeState = await page.evaluate(() => {
      const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
      const b = map.getBounds();
      return { north: b.getNorth() };
    });
    console.log(`[TEST E - After Resize] Viewport size 1600x900. North: ${resizeState.north.toFixed(3)}°`);
    if (resizeState.north > -45.0) {
      throw new Error(`TEST E FAILED: North boundary exceeded after browser resize! north = ${resizeState.north}°`);
    }

    // Drag up again on resized window
    const newBox = await page.locator('#maplibre-container').boundingBox();
    await page.mouse.move(newBox.x + newBox.width / 2, newBox.y + newBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(newBox.x + newBox.width / 2, newBox.y + newBox.height / 2 + 400, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const postDragState = await page.evaluate(() => {
      const map = window.polarisApp?.modeManager?.maplibreRenderer?.map;
      const b = map.getBounds();
      return { north: b.getNorth() };
    });
    console.log(`[TEST E - Post-Resize North Drag] North: ${postDragState.north.toFixed(3)}°`);
    if (postDragState.north > -45.0) {
      throw new Error(`TEST E FAILED: North boundary exceeded after post-resize drag! north = ${postDragState.north}°`);
    }
    console.log('✅ TEST E PASSED: Resize recalculation properly enforced bounds');

    console.log('\n🎉 ALL ACCEPTANCE TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('[Playwright Acceptance Test] ERROR:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

testAcceptanceCriteria();
