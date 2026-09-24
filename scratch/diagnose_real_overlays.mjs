import { chromium } from 'playwright';
import path from 'path';

async function diagnose() {
    console.log('=====================================================');
    console.log(' PHASE 7.5B REAL MAP OVERLAY RUNTIME DIAGNOSTIC');
    console.log('=====================================================');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    page.on('console', msg => console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`));

    try {
        await page.goto('http://localhost:4173', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        console.log('\n--- Switching to REAL mode ---');
        await page.click('#data-mode-real-btn');
        await page.waitForTimeout(6000);

        // Capture initial diagnostic screenshot
        const screenshotPath = path.resolve('scratch/phase7_5b_initial_real.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`Saved screenshot: ${screenshotPath}`);

        // Inspect MapLibre Instance State
        const mapState = await page.evaluate(() => {
            const renderer = window.simEngine?.modeManager?.maplibreRenderer;
            const map = renderer?.map;
            if (!map) return { mapExists: false };

            const isStyleLoaded = map.isStyleLoaded();
            const style = map.getStyle();
            const layers = style ? style.layers.map(l => ({ id: l.id, type: l.type, source: l.source, layout: l.layout, paint: l.paint })) : [];
            const sources = style ? Object.keys(style.sources) : [];
            const bounds = map.getBounds();
            const center = map.getCenter();
            const zoom = map.getZoom();

            const checkSourceData = (sourceId) => {
                const src = map.getSource(sourceId);
                if (!src) return { exists: false };
                let featureCount = 0;
                let firstCoord = null;
                if (src._data) {
                    if (src._data.type === 'FeatureCollection') {
                        featureCount = src._data.features ? src._data.features.length : 0;
                        if (featureCount > 0) {
                            firstCoord = src._data.features[0].geometry?.coordinates;
                        }
                    } else if (src._data.type === 'Feature') {
                        featureCount = 1;
                        firstCoord = src._data.geometry?.coordinates;
                    }
                }
                return { exists: true, featureCount, firstCoord };
            };

            const targetSources = [
                'vessel-ship',
                'vessel-heading-vector',
                'iceberg-points',
                'iceberg-points-near-halo',
                'active-route',
                'active-route-corridor',
                'dest-point',
                'byu-historical-track',
                'byu-historical-replay-point'
            ];

            const targetLayers = [
                'vessel-ship-circle',
                'vessel-heading-vector-line',
                'iceberg-points-circle',
                'iceberg-points-near-halo-circle',
                'active-route-line',
                'active-route-corridor',
                'dest-point-circle',
                'byu-historical-track-line',
                'byu-historical-replay-point-circle'
            ];

            const sourceDetails = {};
            targetSources.forEach(s => {
                sourceDetails[s] = checkSourceData(s);
            });

            const layerDetails = {};
            targetLayers.forEach(l => {
                const layer = map.getLayer(l);
                if (layer) {
                    const visibility = map.getLayoutProperty(l, 'visibility') || 'visible';
                    layerDetails[l] = { exists: true, visibility };
                } else {
                    layerDetails[l] = { exists: false };
                }
            });

            return {
                mapExists: true,
                isInitialized: renderer.isInitialized,
                isStyleLoaded,
                center: { lng: center.lng, lat: center.lat },
                zoom,
                bounds: bounds ? {
                    sw: [bounds.getWest(), bounds.getSouth()],
                    ne: [bounds.getEast(), bounds.getNorth()]
                } : null,
                sources,
                layersCount: layers.length,
                allLayerIds: layers.map(l => l.id),
                sourceDetails,
                layerDetails
            };
        });

        console.log('\n--- MAPLIBRE DIAGNOSTIC SNAPSHOT ---');
        console.dir(mapState, { depth: null });

        // Check ship position & coordinate conversion in browser
        const coordConversionCheck = await page.evaluate(() => {
            const ship = window.simEngine?.ship;
            const state = window.simEngine?.state;
            const geoProj = window.simEngine?.modeManager?.maplibreRenderer;
            
            if (!ship || !state) return null;

            // Compute geographic coords from ship x, y
            let shipLonLat = null;
            if (geoProj && geoProj.worldToLatLon) {
                shipLonLat = geoProj.worldToLatLon(ship.x, ship.y);
            }

            // Check active route waypoints
            const waypoints = state.navigation?.activeRoute?.waypoints || [];
            const convertedWaypoints = waypoints.map(wp => {
                if (wp.lat !== undefined && wp.lon !== undefined) {
                    return [wp.lon, wp.lat];
                }
                if (geoProj && geoProj.worldToLatLon) {
                    return geoProj.worldToLatLon(wp.x, wp.y);
                }
                return null;
            });

            // Check hazards
            const hazards = state.hazards || [];

            return {
                shipX: ship.x,
                shipY: ship.y,
                shipLonLat,
                destination: state.navigation?.destination,
                waypointsCount: waypoints.length,
                firstWaypoint: waypoints[0],
                convertedWaypoints,
                hazardsCount: hazards.length,
                firstHazard: hazards[0]
            };
        });

        console.log('\n--- COORDINATE CONVERSION DIAGNOSTIC ---');
        console.dir(coordConversionCheck, { depth: null });

    } catch (err) {
        console.error('Diagnostic error:', err);
    } finally {
        await browser.close();
    }
}

diagnose();
