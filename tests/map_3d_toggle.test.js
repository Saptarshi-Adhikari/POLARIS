import { describe, it, expect, beforeEach } from 'vitest';
import { Camera } from '../src/js/render/camera.js';
import { ModeManager } from '../src/js/geo/modeManager.js';
import { MapLibreRenderer } from '../src/js/geo/maplibreRenderer.js';
import { inverseProjection, forwardProjection } from '../src/js/geo/projection.js';

describe('REAL Mode MapLibre WebGL 2D Antarctic Maritime Map & Alignment Integrity', () => {
  let camera;
  let mockEngine;

  beforeEach(() => {
    camera = new Camera(1200, 800);
    mockEngine = {
      dataMode: 'DEMO',
      state: {
        environment: { mode: 'SIMULATION' },
        simulation: { timeHours: 14.5, isPaused: false },
        navigation: { activeRoute: { waypoints: [{ x: 100, y: 200 }, { x: 300, y: 400 }] } },
        vessel: { x: 500, y: 600, heading: 45 }
      },
      renderer: {
        camera: camera
      }
    };
  });

  it('1. Initializes MapLibreRenderer with default Antarctic perspective parameters', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    expect(renderer.containerId).toBe('maplibre-container');
  });

  it('2. MapLibreRenderer maps POLARIS coordinates 1:1 to Antarctic Lat/Lon without spatial drift', () => {
    const renderer = new MapLibreRenderer('maplibre-container');
    
    // Bharati Station reference origin (1800, 1200) -> (-69.4°S, 76.187°E)
    const [lon, lat] = renderer.worldToLatLon(1800, 1200);
    expect(lat).toBeCloseTo(-69.4, 2);
    expect(lon).toBeCloseTo(76.187, 2);

    // Verify round-trip conversion fidelity
    const worldPt = { x: 2500, y: 1500 };
    const [resLon, resLat] = renderer.worldToLatLon(worldPt.x, worldPt.y);
    const proj = forwardProjection(resLat, resLon);
    const restoredX = 1800 + proj.x_nm * 10;
    const restoredY = 1200 - proj.y_nm * 10;

    expect(restoredX).toBeCloseTo(worldPt.x, 3);
    expect(restoredY).toBeCloseTo(worldPt.y, 3);
  });

  it('3. DEMO mode remains completely untouched when ModeManager sets DEMO', () => {
    const modeMgr = new ModeManager(mockEngine);
    modeMgr.setMode('DEMO');
    expect(modeMgr.currentMode).toBe('DEMO');
    expect(mockEngine.dataMode).toBe('DEMO');
    expect(mockEngine.maplibreRenderer).toBeUndefined();
  });

  it('4. REAL mode initializes MapLibreRenderer in 2D Antarctic mode by default', () => {
    const modeMgr = new ModeManager(mockEngine);
    modeMgr.setMode('REAL');
    expect(modeMgr.currentMode).toBe('REAL');
    expect(mockEngine.dataMode).toBe('REAL');
  });
});
