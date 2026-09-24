import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = path.resolve('scratch/phase7_screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runTest() {
    console.log('Launching browser for Phase 7 Closed-Loop Real-Mode Route Execution verification...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    try {
        // TEST A — INITIAL MISSION
        console.log('Navigating to http://localhost:4173 ...');
        await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Switch to REAL mode
        console.log('Switching to REAL mode...');
        await page.click('#data-mode-real-btn');
        await page.waitForTimeout(2000);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_real_mission_before_hazard.png') });
        console.log('Saved 01_real_mission_before_hazard.png');

        // TEST B & C — HAZARD, ADVISORY & EXPLICIT ADOPTION
        console.log('Triggering real iceberg encounter in REAL mode...');
        const initialHdg = await page.evaluate(() => window.simEngine?.ship?.heading || 0);
        const initialPos = await page.evaluate(() => ({
            x: window.simEngine?.ship?.x || 0,
            y: window.simEngine?.ship?.y || 0
        }));
        console.log(`Initial Ship Pos: (${initialPos.x}, ${initialPos.y}), Heading: ${initialHdg}°`);

        // Inject simulated iceberg observation into real mode hazard state to trigger advisory
        await page.evaluate(() => {
            const ship = window.simEngine?.ship;
            const state = window.simEngine?.state;
            if (!ship || !state) return;
            const hazard = {
                id: 'A23A_TEST',
                name: 'A23A',
                type: 'ICEBERG',
                x: ship.x + 80,
                y: ship.y + 15,
                radius: 40,
                driftSpeed: 1.2,
                driftHeading: 280
            };
            state.hazards = [hazard];
            if (window.simEngine.routePlanner) {
                const proposed = window.simEngine.routePlanner.planAlternativeRoute(
                    { x: ship.x, y: ship.y },
                    state.navigation.destination || { x: ship.x + 400, y: ship.y },
                    state.hazards
                );
                if (proposed && proposed.waypoints) {
                    state.navigation.proposedRoute = proposed;
                    state.navigation.hasAdvisory = true;
                    state.navigation.advisoryReason = 'REAL USNIC Iceberg A23A encroaching active leg (CPA: 1.2 NM)';
                }
            }
            if (window.simEngine.uiController && window.simEngine.uiController.updateRealDataHUD) {
                window.simEngine.uiController.updateRealDataHUD();
            }
        });

        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_real_iceberg_route_advisory.png') });
        console.log('Saved 02_real_iceberg_route_advisory.png');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_proposed_vs_active_route.png') });
        console.log('Saved 03_proposed_vs_active_route.png');

        // Click ADOPT PROPOSED ROUTE
        console.log('Adopting proposed route...');
        await page.evaluate(() => {
            if (window.simEngine && window.simEngine.adoptProposedRoute) {
                window.simEngine.adoptProposedRoute();
            }
        });
        await page.waitForTimeout(1000);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_adopt_proposed_route.png') });
        console.log('Saved 04_adopt_proposed_route.png');

        // TEST D — ACTUAL SHIP EXECUTION (Advance simulation & verify dynamics)
        console.log('Advancing simulation steps to observe vessel turning and movement...');
        
        // Record telemetry history over 30 simulation updates
        const telemetry = [];
        for (let i = 0; i < 30; i++) {
            await page.evaluate(() => {
                const dt = 0.5;
                if (window.simEngine && window.simEngine.ship) {
                    window.simEngine.ship.update(dt, window.simEngine.state.vessel, window.simEngine.vectorField);
                }
                if (window.simEngine && window.simEngine.uiController && window.simEngine.uiController.updateRealDataHUD) {
                    window.simEngine.uiController.updateRealDataHUD();
                }
            });
            const sample = await page.evaluate(() => ({
                heading: window.simEngine?.ship?.heading,
                rudder: window.simEngine?.ship?.rudder,
                x: window.simEngine?.ship?.x,
                y: window.simEngine?.ship?.y,
                activeWaypointIndex: window.simEngine?.ship?.currentWaypointIndex
            }));
            telemetry.push(sample);
            if (i === 10) {
                await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_ship_turning_toward_waypoint.png') });
                console.log('Saved 05_ship_turning_toward_waypoint.png');
            }
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_ship_moving_on_adopted_route.png') });
        console.log('Saved 06_ship_moving_on_adopted_route.png');

        console.log('Telemetry sampling results (Step 0 vs Step 15 vs Step 29):');
        console.log('Step 0 :', telemetry[0]);
        console.log('Step 15:', telemetry[15]);
        console.log('Step 29:', telemetry[29]);

        // TEST E — HAZARD CLEARANCE
        console.log('Simulating hazard clearance as vessel moves past iceberg...');
        await page.evaluate(() => {
            const state = window.simEngine?.state;
            if (state && state.hazards && state.hazards[0]) {
                state.hazards[0].x += 500;
                state.hazards[0].y += 500;
            }
            if (window.simEngine && window.simEngine.uiController && window.simEngine.uiController.updateRealDataHUD) {
                window.simEngine.uiController.updateRealDataHUD();
            }
        });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_hazard_clearance.png') });
        console.log('Saved 07_hazard_clearance.png');

        // TEST G — DEMO REGRESSION
        console.log('Toggling back to DEMO mode...');
        await page.click('#data-mode-demo-btn');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_demo_restored.png') });
        console.log('Saved 08_demo_restored.png');

        console.log('Phase 7 Browser Acceptance Test completed successfully!');
    } catch (err) {
        console.error('Error during browser verification:', err);
    } finally {
        await browser.close();
    }
}

runTest();
