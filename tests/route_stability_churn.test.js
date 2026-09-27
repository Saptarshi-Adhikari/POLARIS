import { describe, it, expect } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';

describe('POLARIS — Route Stability & Replan Churn Audit Suite', () => {

  it('1. Audit Scenario 5 Multi-Iceberg Navigation for Churn & Oscillation Metrics', async () => {
    const engine = new SimulationEngine();
    const generator = new ScenarioGenerator();
    const scenario = generator.generateScenario(5005, 'CLASS_D_MULTI_ICEBERG_FIELD');

    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    engine.calculateRoute();

    let collision = false;
    let minClearance = Infinity;

    // Simulate multi-iceberg scenario step-by-step
    for (let step = 0; step < 4500; step++) {
      const dt = 0.1;
      const simTimeHours = step * dt / 3600;

      for (let ice of engine.icebergs) ice.update(dt, engine.vectorField, simTimeHours, engine.state);
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, simTimeHours, engine.state);
      engine.ship.update(dt, engine.vectorField, simTimeHours, engine.state, engine.icebergs);

      for (let ice of engine.icebergs) {
        const d = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y) - ice.collisionRadius - engine.ship.collisionRadius;
        if (d < minClearance) minClearance = d;
      }

      if (engine.ship.lastCollisionEvent?.collisionDetected) collision = true;
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const nav = engine.aiNavigator;
    const destReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 100;

    expect(collision).toBe(false);
    expect(destReached).toBe(true);

    // Compute route lifetime statistics
    const routeDurations = nav.routeHistory
      .map(r => r.durationSimSec)
      .filter(d => typeof d === 'number' && Number.isFinite(d));

    const avgRouteLifetimeSec = routeDurations.length > 0 
      ? routeDurations.reduce((a, b) => a + b, 0) / routeDurations.length 
      : 0;
    const minRouteLifetimeSec = routeDurations.length > 0 ? Math.min(...routeDurations) : 0;

    console.log("=================================================");
    console.log("  POLARIS ROUTE STABILITY AUDIT RESULTS  ");
    console.log("=================================================");
    console.log(`Accepted:                     ${nav.accepted}`);
    console.log(`Rejected:                     ${nav.rejected}`);
    console.log(`Errors/Cancelled:             ${nav.errorsCancelled}`);
    console.log(`Avg Route Lifetime (sim sec): ${avgRouteLifetimeSec.toFixed(1)}s`);
    console.log(`Min Route Lifetime (sim sec): ${minRouteLifetimeSec.toFixed(1)}s`);
    console.log(`LEFT Selections:              ${nav.leftSelections}`);
    console.log(`RIGHT Selections:             ${nav.rightSelections}`);
    console.log(`LEFT <-> RIGHT Switches:      ${nav.leftToRightSwitches + nav.rightToLeftSwitches}`);
    console.log(`Oscillation Events:           ${nav.oscillationEvents.length}`);

    // Exact Canonical Terminal Event Accounting Invariant Assertion
    expect(nav.plannerCalls).toBe(nav.accepted + nav.rejected + nav.errorsCancelled);
    expect(nav.accepted).toBe(nav.routeAdoptions);
    expect(nav.rejected).toBe(nav.routeRejections);
    expect(nav.oscillationEvents.length).toBe(0);
  }, 120000);

  it('2. Verify Multi-Iceberg Determinism Across Identical Seeds', async () => {
    const runSimulation = (seed) => {
      const engine = new SimulationEngine();
      const generator = new ScenarioGenerator();
      const scenario = generator.generateScenario(seed, 'CLASS_D_MULTI_ICEBERG_FIELD');

      engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
      engine.state.navigation.startPoint = scenario.start;
      engine.state.navigation.destinationPoint = scenario.destination;
      engine.icebergs = scenario.icebergs;

      // Fix worldTime timestamp to static seed time to avoid Date.now() drift across runs
      engine.state.worldTime = 1700000000000;

      engine.calculateRoute();

      for (let step = 0; step < 2000; step++) {
        const dt = 0.1;
        const simTimeHours = step * dt / 3600;
        for (let ice of engine.icebergs) ice.update(dt, engine.vectorField, simTimeHours, engine.state);
        engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, simTimeHours, engine.state);
        engine.ship.update(dt, engine.vectorField, simTimeHours, engine.state, engine.icebergs);
        if (engine.ship.autopilotStatus === 'ARRIVED') break;
      }

      return {
        shipX: engine.ship.x.toFixed(3),
        shipY: engine.ship.y.toFixed(3),
        heading: engine.ship.heading.toFixed(3),
        plannerCalls: engine.aiNavigator.plannerCalls,
        routeAdoptions: engine.aiNavigator.routeAdoptions
      };
    };

    const run1 = runSimulation(5005);
    const run2 = runSimulation(5005);

    expect(run1.shipX).toBe(run2.shipX);
    expect(run1.shipY).toBe(run2.shipY);
    expect(run1.heading).toBe(run2.heading);
    expect(run1.plannerCalls).toBe(run2.plannerCalls);
    expect(run1.routeAdoptions).toBe(run2.routeAdoptions);
  }, 120000);
});
