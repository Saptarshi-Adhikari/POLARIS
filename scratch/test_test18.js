import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';

const engine = new SimulationEngine();
engine.ship = new Ship({ x: 500, y: 500, heading: 0, throttle: 80 });
engine.state.navigation.destinationPoint = { x: 2500, y: 500 };

const ice = new Iceberg({ id: 'ice_ahead', x: 800, y: 500, collisionRadius: 50 });
engine.icebergs = [ice];
engine.calculateRoute();

let maxHeadingDev = 0;
let minIceDist = Infinity;
let enteredAvoidance = false;

for (let step = 0; step < 1500; step++) {
  engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * 0.1, engine.state);
  engine.ship.update(0.1, engine.vectorField, step * 0.1, engine.state, engine.icebergs);

  const iceDist = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y);
  if (iceDist < minIceDist) minIceDist = iceDist;
  if (iceDist < 250) enteredAvoidance = true;

  let dev = Math.abs((engine.ship.heading + 180) % 360 - 180);
  if (dev > maxHeadingDev) {
    maxHeadingDev = dev;
    console.log(`Step ${step}: simTime=${(step*0.1).toFixed(1)}s, x=${engine.ship.x.toFixed(1)}, y=${engine.ship.y.toFixed(1)}, heading=${engine.ship.heading.toFixed(1)}, desiredHeading=${engine.ship.desiredHeading?.toFixed(1)}, rudder=${engine.ship.rudder.toFixed(1)}, emergency=${engine.ship._inEmergencyAvoidance}`);
  }

  if (engine.ship.x > 1500) break;
}

console.log(`\nFinal x=${engine.ship.x.toFixed(1)}, minIceDist=${minIceDist.toFixed(1)}, maxHeadingDev=${maxHeadingDev.toFixed(1)}`);
