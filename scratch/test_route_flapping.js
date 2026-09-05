/**
 * Isolated Route-Flapping Test Script
 * Verifies that route adoption does not oscillate/flap when candidate routes have near-identical scores.
 */
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Ship } from '../src/js/simulation/ship.js';
import { VectorField } from '../src/js/simulation/vectorField.js';

const nav = new AINavigator(3600, 2400);
const ship = new Ship(100, 100);
const vf = new VectorField(3600, 2400);
const icebergs = [
  { id: 1, x: 500, y: 500, vx: 0, vy: 0, collisionRadius: 40, size: 500 }
];

const state = {
  navigation: {
    mode: 'BALANCED',
    isNavigating: true,
    startPoint: { x: 100, y: 100 },
    destinationPoint: { x: 1000, y: 1000 },
    routeInvalid: true,
    activeRoute: null
  },
  vessel: { maxSpeed: 30, autopilotThrottle: 65 },
  environment: { seaIce: { enabled: false } }
};

ship.isNavigating = true;
ship.targetWaypoint = { x: 1000, y: 1000 };

console.log('=== ROUTE FLAPPING ISOLATION TEST ===');

let routeChangeCount = 0;
let previousRouteId = null;

// Run 100 evaluation ticks (simulating 100 animation frames)
for (let frame = 1; frame <= 100; frame++) {
  nav.evaluate(ship, icebergs, vf, frame * 0.016, state);
  
  const currentRoute = state.navigation.activeRoute;
  if (currentRoute) {
    if (previousRouteId && currentRoute.id !== previousRouteId) {
      routeChangeCount++;
    }
    previousRouteId = currentRoute.id;
  }
}

console.log(`Total Frames: 100`);
console.log(`Route Change / Flap Count: ${routeChangeCount}`);
console.log(`Flapping Vulnerability: ${routeChangeCount === 0 ? 'NONE (Stable)' : 'FLAPPING DETECTED'}`);
