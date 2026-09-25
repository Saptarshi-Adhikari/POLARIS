import { chromium } from 'playwright';
import path from 'path';

async function diagnose() {
    console.log('=====================================================');
    console.log(' REAL OVERLAY FORENSICS & PIXEL PROOF DIAGNOSTIC');
    console.log('=====================================================');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    const consoleLogs = [];
    const pageErrors = [];

    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push({ type: msg.type(), text });
        console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${text}`);
    });

    page.on('pageerror', err => {
        pageErrors.push(err.message || err.toString());
        console.error(`[BROWSER UNCAUGHT EXCEPTION]`, err);
    });

    try {
        await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        console.log('\n--- Switching to REAL mode ---');
        await page.click('#data-mode-real-btn');
        
        // Wait for MapLibre instance and style to load fully
        await page.waitForFunction(() => {
            const map = window.simEngine?.modeManager?.maplibreRenderer?.map;
            return map && map.isStyleLoaded();
        }, { timeout: 15000 }).catch(err => console.warn('[Forensic] Timeout waiting for map.isStyleLoaded():', err.message));

        await page.waitForTimeout(2000);

        // Capture initial diagnostic screenshot
        const screenshotPath = path.resolve('scratch/real_overlay_before_fix.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`Saved forensic screenshot: ${screenshotPath}`);

        // Perform Comprehensive MapLibre Forensic Audit
        const forensics = await page.evaluate(() => {
            const renderer = window.simEngine?.modeManager?.maplibreRenderer;
            const map = renderer?.map;
            const container = document.querySelector('#maplibre-container');
            const containerRect = container ? container.getBoundingClientRect() : null;

            if (!map) {
                return {
                    mapExists: false,
                    containerRect: containerRect ? { width: containerRect.width, height: containerRect.height } : null
                };
            }

            const isStyleLoaded = map.isStyleLoaded();
            const center = map.getCenter();
            const zoom = map.getZoom();
            const bounds = map.getBounds();
            const style = map.getStyle();

            const queryRendered = (layerId) => {
                try {
                    return map.queryRenderedFeatures({ layers: [layerId] }).length;
                } catch (e) {
                    return 0;
                }
            };

            const checkSourceAndLayer = (sourceId, layerId) => {
                const src = map.getSource(sourceId);
                const layer = map.getLayer(layerId);
                let features = 0;
                let firstCoord = null;

                if (src && src._data) {
                    if (src._data.type === 'FeatureCollection') {
                        features = src._data.features ? src._data.features.length : 0;
                        if (features > 0) firstCoord = src._data.features[0].geometry?.coordinates;
                    } else if (src._data.type === 'Feature') {
                        features = 1;
                        firstCoord = src._data.geometry?.coordinates;
                    }
                }

                let insideViewport = false;
                if (firstCoord && Array.isArray(firstCoord) && bounds) {
                    let lon = firstCoord[0];
                    let lat = firstCoord[1];
                    if (Array.isArray(lon)) { // Handle LineString first coord
                        lon = lon[0];
                        lat = lon[1];
                    }
                    if (typeof lon === 'number' && typeof lat === 'number') {
                        insideViewport = lon >= bounds.getWest() && lon <= bounds.getEast() &&
                                         lat >= bounds.getSouth() && lat <= bounds.getNorth();
                    }
                }

                return {
                    sourceExists: !!src,
                    layerExists: !!layer,
                    visibility: layer ? (map.getLayoutProperty(layerId, 'visibility') || 'visible') : 'none',
                    features,
                    firstCoord,
                    insideViewport,
                    renderedPixelFeatures: layer ? queryRendered(layerId) : 0
                };
            };

            return {
                mapExists: true,
                isInitialized: renderer.isInitialized,
                isStyleLoaded,
                containerRect: containerRect ? { width: containerRect.width, height: containerRect.height } : null,
                center: center ? { lng: center.lng, lat: center.lat } : null,
                zoom,
                bounds: bounds ? {
                    sw: [bounds.getWest(), bounds.getSouth()],
                    ne: [bounds.getEast(), bounds.getNorth()]
                } : null,
                styleLayers: map.getStyle()?.layers?.map(l => l.id) || [],
                overlays: {
                    ship: checkSourceAndLayer('vessel-ship', 'vessel-ship-circle'),
                    headingVector: checkSourceAndLayer('vessel-heading-vector', 'vessel-heading-line'),
                    icebergs: checkSourceAndLayer('iceberg-points', 'iceberg-points-circle'),
                    icebergHalo: checkSourceAndLayer('iceberg-points', 'iceberg-points-near-halo'),
                    route: checkSourceAndLayer('active-route', 'active-route-line'),
                    routeCorridor: checkSourceAndLayer('active-route', 'active-route-corridor'),
                    destination: checkSourceAndLayer('dest-point', 'dest-point-circle'),
                    byuTrack: checkSourceAndLayer('byu-historical-track', 'byu-historical-track-line')
                }
            };
        });

        console.log('\nREAL OVERLAY FORENSICS');
        console.log('======================');
        console.dir(forensics, { depth: null });

    } catch (err) {
        console.error('Forensic Script Execution Error:', err);
    } finally {
        await browser.close();
    }
}

diagnose();
