import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';

function createMockCanvasContext() {
  const drawCalls = [];
  return {
    drawCalls,
    reset() { drawCalls.length = 0; },
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
    transform() {},
    setTransform() {},
    clearRect() {},
    beginPath() { drawCalls.push({ type: 'beginPath' }); },
    closePath() { drawCalls.push({ type: 'closePath' }); },
    moveTo(x, y) { drawCalls.push({ type: 'moveTo', x: Math.round(x), y: Math.round(y), strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    lineTo(x, y) { drawCalls.push({ type: 'lineTo', x: Math.round(x), y: Math.round(y), strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    stroke() { drawCalls.push({ type: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }); },
    fill() {},
    fillRect() {},
    arc() {},
    strokeRect() {},
    setLineDash() {},
    measureText() { return { width: 10 }; },
    fillText() {},
    strokeText() {},
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: ''
  };
}

describe('Route Rendering Regression Verification Test', () => {
  it('Confirms navLineDrawCount <= 1 and only activeRoute is rendered during manual iceberg spawn', () => {
    const engine = new SimulationEngine();
    const mockCtx = createMockCanvasContext();

    engine.renderer.ctx = mockCtx;
    engine.renderer.width = 1200;
    engine.renderer.height = 800;

    engine.ship = new Ship({ x: 400, y: 1800, heading: 330 });
    engine.state.navigation.startPoint = { x: 400, y: 1800 };
    engine.state.navigation.destinationPoint = { x: 3000, y: 600 };
    engine.calculateRoute();

    expect(engine.state.navigation.activeRoute).toBeDefined();
    expect(engine.state.navigation.activeRoute.status).toBe('valid');

    // 1. Initial Frame Render
    mockCtx.reset();
    engine.renderer.render(engine.vectorField, engine.ship, engine.icebergs, engine.aiNavigator, 0, 0.016, engine.state);
    expect(engine.renderer.navLineDrawCount).toBe(1);

    // 2. Manually spawn iceberg directly on route path
    engine.spawnIcebergAt(1200, 1400, 4.0, 700);

    // Verify navLineDrawCount during frame immediately after spawn
    mockCtx.reset();
    engine.renderer.render(engine.vectorField, engine.ship, engine.icebergs, engine.aiNavigator, 0.016, 0.016, engine.state);
    expect(engine.renderer.navLineDrawCount).toBeLessThanOrEqual(1);

    // 3. Simulate 10 frames of active loop (physics + evaluate + render)
    for (let frame = 1; frame <= 10; frame++) {
      mockCtx.reset();
      const dt = 0.016;
      const simTimeHours = frame * (dt / 3600);
      
      engine.ship.update(dt, engine.vectorField, simTimeHours, engine.state, engine.icebergs);
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, simTimeHours, engine.state);
      engine.renderer.render(engine.vectorField, engine.ship, engine.icebergs, engine.aiNavigator, simTimeHours, dt, engine.state);
      
      expect(engine.renderer.navLineDrawCount).toBeLessThanOrEqual(1);
    }
  });

  it('Verifies ship.setRouteWaypoints immediately syncs ship route waypoints upon candidate adoption', () => {
    const ship = new Ship({ x: 400, y: 1800 });
    const newWaypoints = [
      { x: 400, y: 1800 },
      { x: 1000, y: 1500 },
      { x: 2000, y: 1000 },
      { x: 3000, y: 600 }
    ];

    expect(typeof ship.setRouteWaypoints).toBe('function');
    ship.setRouteWaypoints(newWaypoints);

    expect(ship.routeWaypoints).toBe(newWaypoints);
    expect(ship.waypointIndex).toBe(0);
    expect(ship.targetWaypoint).toBeDefined();
  });

  it('Verifies rejected candidate routes from CANDIDATE_REJECTED events are never drawn to canvas', () => {
    const engine = new SimulationEngine();
    const mockCtx = createMockCanvasContext();

    engine.renderer.ctx = mockCtx;
    engine.renderer.width = 1200;
    engine.renderer.height = 800;

    engine.ship = new Ship({ x: 400, y: 1800, heading: 330 });
    engine.state.navigation.startPoint = { x: 400, y: 1800 };
    engine.state.navigation.destinationPoint = { x: 3000, y: 600 };
    engine.calculateRoute();

    const initialRouteId = engine.state.navigation.activeRoute.id;

    // Simulate candidate rejection response
    const rejectedWaypoints = [
      { x: 400, y: 1800 },
      { x: 400, y: 400 }, // Wild deviation to north
      { x: 3000, y: 600 }
    ];

    engine.aiNavigator.handleWorkerResponse({
      data: {
        requestId: engine.aiNavigator.pendingWorkerRequestId,
        waypoints: rejectedWaypoints,
        totalDistance: 5000, // Insufficient cost improvement / excessive cost
        maxRisk: 0.1,
        estimatedDuration: 1.5,
        calcTimeMs: 5,
        dest: { x: 3000, y: 600 }
      }
    });

    expect(engine.aiNavigator.routeRejections).toBeGreaterThan(0);
    expect(engine.state.navigation.activeRoute.id).toBe(initialRouteId);

    // Render frame and verify drawn line waypoints
    mockCtx.reset();
    engine.renderer.render(engine.vectorField, engine.ship, engine.icebergs, engine.aiNavigator, 0.05, 0.016, engine.state);

    expect(engine.renderer.navLineDrawCount).toBe(1);

    // Verify none of the lineTo calls match the rejected north point (400, 400)
    const lineToPoints = mockCtx.drawCalls.filter(c => c.type === 'lineTo');
    const rejectedPointDrawn = lineToPoints.some(p => p.x === 400 && p.y === 400);
    expect(rejectedPointDrawn).toBe(false);
  });
});
