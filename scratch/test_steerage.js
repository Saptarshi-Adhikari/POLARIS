import { Ship } from '../src/js/simulation/ship.js';

console.log("============================================================");
console.log("A/B STEERAGE-WAY EXPERIMENT (PHASE 6.7 STEP 2)");
console.log("============================================================\n");

// Case A: Hard Rudder (-35°), Throttle 0%
const shipA = new Ship({ x: 500, y: 500, heading: 0 });
shipA.vx = 12.0; shipA.vy = 0.0;
shipA.rudder = -35.0; shipA.desiredThrottle = 0; shipA.throttle = 0;

// Case B: Hard Rudder (-35°), Throttle 35%
const shipB = new Ship({ x: 500, y: 500, heading: 0 });
shipB.vx = 12.0; shipB.vy = 0.0;
shipB.rudder = -35.0; shipB.desiredThrottle = 35; shipB.throttle = 35;

const dt = 0.1;
const stateA = { vessel: { maxSpeed: 20, dragCoefficient: 0.05, mass: 1.0, autopilot: false, rudder: -35.0, throttle: 0 } };
const stateB = { vessel: { maxSpeed: 20, dragCoefficient: 0.05, mass: 1.0, autopilot: false, rudder: -35.0, throttle: 35 } };

for (let step = 0; step <= 50; step++) {
  const t = step * dt;
  shipA.rudder = -35.0; shipA.throttle = 0; shipA.desiredThrottle = 0;
  shipB.rudder = -35.0; shipB.throttle = 35; shipB.desiredThrottle = 35;
  if (step % 5 === 0) {
    console.log(
      `${t.toFixed(1).padStart(7)} | ` +
      `${shipA.heading.toFixed(1).padStart(10)} | ` +
      `${Math.hypot(shipA.vx, shipA.vy).toFixed(2).padStart(10)} | ` +
      `${shipA.angularVelocity.toFixed(2).padStart(13)} | ` +
      `${shipB.heading.toFixed(1).padStart(10)} | ` +
      `${Math.hypot(shipB.vx, shipB.vy).toFixed(2).padStart(10)} | ` +
      `${shipB.angularVelocity.toFixed(2).padStart(13)}`
    );
  }
  shipA.update(dt, { stormMode: false }, t / 3600, stateA, []);
  shipB.update(dt, { stormMode: false }, t / 3600, stateB, []);
}
