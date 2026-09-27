/**
 * POLARIS Rendering Startup & Module Integration Regression Test Suite
 */

import { describe, it, expect } from 'vitest';
import { distance, distanceBetween } from '../src/js/utils.js';
import { CurvatureConstrainedSmoother, curvatureSmoother } from '../src/js/pathfinding/CurvatureConstrainedSmoother.js';
import { CanvasRenderer } from '../src/js/render/canvasRenderer.js';

describe('POLARIS Rendering Startup & Utility Integration', () => {
  it('1. utils export distance function exists and executes correctly', () => {
    expect(typeof distance).toBe('function');
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('2. CurvatureConstrainedSmoother imports distance without SyntaxError', () => {
    expect(CurvatureConstrainedSmoother).toBeDefined();
    expect(curvatureSmoother).toBeDefined();

    const waypoints = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 }
    ];
    const vessel = { speedKnots: 12, maxYawRate: 0.15 };
    const res = curvatureSmoother.smoothRoute(waypoints, vessel, []);
    expect(res).toBeDefined();
    expect(res.smoothedWaypoints.length).toBeGreaterThan(0);
  });

  it('3. CanvasRenderer module initializes cleanly without runtime exception', () => {
    expect(CanvasRenderer).toBeDefined();
  });
});
