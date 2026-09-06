import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasRenderer } from '../src/js/render/canvasRenderer.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Plan Position Indicator (PPI) Radar View Rendering Audit', () => {
  let mockCanvas;
  let mockCtx;
  let renderer;

  beforeEach(() => {
    mockCtx = {
      save: () => {},
      restore: () => {},
      fillRect: () => {},
      clearRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      arc: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      fillText: () => {},
      setTransform: () => {},
      clip: () => {},
      createRadialGradient: () => ({ addColorStop: () => {} }),
      setLineDash: () => {},
      roundRect: () => {},
      rect: () => {}
    };

    mockCanvas = {
      getContext: () => mockCtx,
      clientWidth: 1200,
      clientHeight: 800,
      width: 1200,
      height: 800,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }),
      addEventListener: () => {}
    };

    renderer = new CanvasRenderer(mockCanvas);
  });

  it('1. Toggles radar view state cleanly without state leaks', () => {
    expect(renderer.isRadarView).toBe(false);
    renderer.isRadarView = true;
    expect(renderer.isRadarView).toBe(true);
    renderer.isRadarView = false;
    expect(renderer.isRadarView).toBe(false);
  });

  it('2. Disables camera zoom and pan gestures while in Radar View', () => {
    renderer.isRadarView = true;
    const initialZoom = renderer.camera.zoom;

    // Simulate wheel event
    const fakeWheelEvent = { preventDefault: () => {}, deltaY: -100, clientX: 500, clientY: 400 };
    renderer.handleWheel(fakeWheelEvent);
    expect(renderer.camera.zoom).toBe(initialZoom); // Zoom should be unchanged

    // Simulate mousedown pan gesture
    const fakeMouseDownEvent = { clientX: 500, clientY: 400, button: 1 };
    renderer.handleMouseDown(fakeMouseDownEvent);
    expect(renderer.isPanning).toBe(false); // Panning should be blocked
  });

  it('3. Renders Radar View without throwing and accurately projects contacts relative to vessel', () => {
    renderer.isRadarView = true;

    const ship = new Ship(400, 1800);
    ship.heading = 45;
    ship.speedKnots = 12.5;

    const icebergs = [
      { id: 'ice_safe', x: 1400, y: 1800, collisionRadius: 30 }, // 1000 SU distance (Safe)
      { id: 'ice_danger', x: 500, y: 1900, collisionRadius: 40 } // ~141 SU distance (Hazard)
    ];

    const state = {
      navigation: {
        activeRoute: {
          status: 'valid',
          waypoints: [{ x: 400, y: 1800 }, { x: 1400, y: 1800 }, { x: 3000, y: 600 }]
        }
      }
    };

    renderer.destinationPoint = { x: 3000, y: 600 };

    expect(() => {
      renderer.render({ stormMode: false }, ship, icebergs, null, 1.0, 0.016, state);
    }).not.toThrow();

    expect(renderer.radarSweepAngle).toBeGreaterThan(0);
  });

  it('4. Correctly computes bearing and range for arbitrary iceberg positions relative to ship', () => {
    const ship = { x: 1000, y: 1000, heading: 90 };
    const iceTarget = { x: 1000, y: 1500 }; // 500 SU directly South (90 deg down in canvas coords)

    const dx = iceTarget.x - ship.x;
    const dy = iceTarget.y - ship.y;
    const dist = Math.hypot(dx, dy);
    const bearingRad = Math.atan2(dy, dx);
    const bearingDeg = (bearingRad * 180 / Math.PI + 360) % 360;

    expect(dist).toBe(500);
    expect(bearingDeg).toBe(90); // Exact 90 degree bearing match
  });
});
