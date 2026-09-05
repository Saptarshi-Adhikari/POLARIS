import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { Ship } from '../src/js/simulation/ship.js';

// Setup 25+ icebergs clustered in the middle of a 3600x2400 grid between ship (400, 1200) and dest (3200, 1200)
const ship = new Ship({ x: 400, y: 1200, heading: 0, speed: 20 });
const dest = { x: 3200, y: 1200 };

const icebergs = [];
let idCounter = 1;

// Dense wall / maze of 30 icebergs across x = 1200..2400, y = 600..1800
for (let col = 0; col < 6; col++) {
  for (let row = 0; row < 5; row++) {
    const x = 1200 + col * 200 + (row % 2 === 0 ? 30 : -30);
    const y = 700 + row * 220 + (col % 2 === 0 ? 20 : -20);
    const ice = new Iceberg({
      id: `ice_${idCounter++}`,
      name: `Iceberg ${idCounter}`,
      x: x,
      y: y,
      size: 1400, // collisionRadius = max(10, 1400/35) = 40
      currentResponse: 0,
      windResponse: 0
    });
    ice.vx = (Math.random() - 0.5) * 2;
    ice.vy = (Math.random() - 0.5) * 2;
    icebergs.push(ice);
  }
}

const mockVectorField = {
  getVelocityAt: () => ({ u: 0, v: 0 })
};

const state = {
  vessel: { maxSpeed: 30, autopilotThrottle: 65 },
  navigation: { activeRoute: null, routeInvalid: true, isNavigating: true, destination: dest },
  environment: { seaIce: { enabled: false } }
};

console.log(`Generated ${icebergs.length} icebergs in search space.`);

// 1. Run with CAPPED maxIterations (3000)
const navCapped = new AINavigator(3600, 2400);
// Hack to count iterations or measure capped result:
let capHit = false;

// Let's modify / inspect how capped behaves vs uncapped
// We can run generateOptimalRouteAStar with capped nav vs modified nav
const startTimeCapped = performance.now();
navCapped.generateOptimalRouteAStar(ship, icebergs, mockVectorField, dest, 'BALANCED', state, ship);
const endTimeCapped = performance.now();

console.log(`Capped A* result path length (waypoints):`, navCapped.optimalRoute.length);
console.log(`Capped total distance:`, state.navigation.activeRoute?.totalDistance);

// Let's check collision safety of capped route
let cappedHasCollision = false;
const waypoints = navCapped.optimalRoute;
for (let i = 0; i < waypoints.length - 1; i++) {
  const pA = waypoints[i];
  const pB = waypoints[i+1];
  const numS = 20;
  for (let k = 0; k <= numS; k++) {
    const sx = pA.x + (pB.x - pA.x) * (k / numS);
    const sy = pA.y + (pB.y - pA.y) * (k / numS);
    for (const ice of icebergs) {
      const dist = Math.hypot(sx - ice.x, sy - ice.y);
      if (dist < ice.collisionRadius + 15 + 25) { // physical boundary check
        cappedHasCollision = true;
        console.log(`Collision detected on capped route with ice ${ice.id} at (${sx.toFixed(1)}, ${sy.toFixed(1)}), dist=${dist.toFixed(1)}, threshold=${ice.collisionRadius + 40}`);
      }
    }
  }
}
console.log(`Capped route has hard collision:`, cappedHasCollision);
