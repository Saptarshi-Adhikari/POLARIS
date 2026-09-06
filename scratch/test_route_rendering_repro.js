import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { CanvasRenderer } from '../src/js/render/canvasRenderer.js';

// Mock Canvas Context to record all line drawing commands per frame
function createMockCanvasContext() {
  const drawCalls = [];
  return {
    drawCalls,
    reset() { drawCalls.length = 0; },
    save() {},
    restore() {},
    setTransform() {},
    clearRect() {},
    beginPath() { drawCalls.push({ type: 'beginPath' }); },
    moveTo(x, y) { drawCalls.push({ type: 'moveTo', x: Math.round(x), y: Math.round(y) }); },
    lineTo(x, y) { drawCalls.push({ type: 'lineTo', x: Math.round(x), y: Math.round(y) }); },
    stroke() { drawCalls.push({ type: 'stroke' }); },
    fill() {},
    fillRect() {},
    arc() {},
    strokeRect() {},
    setLineDash() {},
    createRadialGradient() {
      return { addColorStop() {} };
    },
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: '',
    lineJoin: ''
  };
}

console.log("=== ROUTE RENDERING REGRESSION REPRO TEST ===");

const engine = new SimulationEngine();
const mockCtx = createMockCanvasContext();

// Attach mock canvas & ctx to renderer
engine.renderer.ctx = mockCtx;
engine.renderer.width = 1200;
engine.renderer.height = 800;

// Set up active navigation scenario
engine.ship = new Ship({ x: 400, y: 1800, heading: 330 });
engine.state.navigation.startPoint = { x: 400, y: 1800 };
engine.state.navigation.destinationPoint = { x: 3000, y: 600 };
engine.calculateRoute();

console.log("Initial Active Route ID:", engine.state.navigation.activeRoute?.id);
console.log("Initial Active Route Status:", engine.state.navigation.activeRoute?.status);

// Step 1: Render initial frame
mockCtx.reset();
engine.renderer.render(engine.vectorField, engine.ship, engine.icebergs, engine.aiNavigator, 0, 0.016, engine.state);
console.log("Frame 1 navLineDrawCount:", engine.renderer.navLineDrawCount);

// Step 2: Manually spawn iceberg directly on route at (1200, 1400)
console.log("\n-> Spawning iceberg manually at (1200, 1400)...");
engine.spawnIcebergAt(1200, 1400, 4.0, 700);

console.log("Post-Spawn Active Route ID:", engine.state.navigation.activeRoute?.id);
console.log("Post-Spawn Active Route Status:", engine.state.navigation.activeRoute?.status);
console.log("Post-Spawn ship.routeWaypoints count:", engine.ship.routeWaypoints?.length);
console.log("Post-Spawn activeRoute.waypoints count:", engine.state.navigation.activeRoute?.waypoints?.length);

// Step 3: Render frame immediately after spawn
mockCtx.reset();
engine.renderer.render(engine.vectorField, engine.ship, engine.icebergs, engine.aiNavigator, 0.016, 0.016, engine.state);
console.log("Post-Spawn Frame navLineDrawCount:", engine.renderer.navLineDrawCount);

// Inspect all stroke lines in post-spawn frame
const strokes = [];
let currentLine = null;
for (let call of mockCtx.drawCalls) {
  if (call.type === 'moveTo') {
    currentLine = [{ x: call.x, y: call.y }];
  } else if (call.type === 'lineTo' && currentLine) {
    currentLine.push({ x: call.x, y: call.y });
  } else if (call.type === 'stroke' && currentLine) {
    if (currentLine.length >= 2) {
      strokes.push(currentLine);
    }
    currentLine = null;
  }
}

console.log(`\nTotal strokes drawn in frame: ${strokes.length}`);
strokes.forEach((s, idx) => {
  console.log(`Stroke ${idx + 1} (${s.length} pts): Start (${s[0].x}, ${s[0].y}) -> End (${s[s.length-1].x}, ${s[s.length-1].y})`);
});
