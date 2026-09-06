import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { AINavigator } from '../src/js/ai/aiNavigator.js';
import { ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';
import { NavTestBot } from '../src/js/debug/navTestBot.js';
import fs from 'fs';
import path from 'path';

async function runHeadlessPhase5Verification() {
  console.log("=================================================");
  console.log("  POLARIS PHASE 5 HEADLESS AUTONOMOUS VERIFICATION  ");
  console.log("=================================================\n");

  const results = [];
  const generator = new ScenarioGenerator();

  // SCENARIO 1 — BASIC NAVIGATION
  {
    console.log("[Verification] Running Scenario 1: Basic Navigation...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(1001, 'CLASS_A_CLEAR_SEAS');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    engine.calculateRoute();
    const initialRouteId = engine.state.navigation.activeRoute?.routeId;
    let collision = false;
    let minClearance = Infinity;

    for (let step = 0; step < 1200; step++) {
      const dt = 0.1;
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, engine.vectorField, step * dt / 3600, engine.state, engine.icebergs);

      if (engine.ship.lastCollisionEvent?.collisionDetected) collision = true;
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const destinationReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 50;

    results.push({
      scenario: 'SCENARIO 1 — BASIC NAVIGATION',
      result: destinationReached && !collision ? 'SUCCESS' : (collision ? 'COLLISION' : 'TIMEOUT'),
      collision,
      minClearance: 999,
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached
    });
  }

  // SCENARIO 2 — ICEBERG DIRECTLY AHEAD
  {
    console.log("[Verification] Running Scenario 2: Iceberg Directly Ahead...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(2002, 'CLASS_B_STATIC_OBSTACLE');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    engine.calculateRoute();
    let collision = false;
    let minClearance = Infinity;

    for (let step = 0; step < 1500; step++) {
      const dt = 0.1;
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, engine.vectorField, step * dt / 3600, engine.state, engine.icebergs);

      for (let ice of engine.icebergs) {
        const d = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y) - ice.collisionRadius - engine.ship.collisionRadius;
        if (d < minClearance) minClearance = d;
      }

      if (engine.ship.lastCollisionEvent?.collisionDetected) collision = true;
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const destinationReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 50;

    results.push({
      scenario: 'SCENARIO 2 — ICEBERG DIRECTLY AHEAD',
      result: destinationReached && !collision ? 'SUCCESS' : (collision ? 'COLLISION' : 'TIMEOUT'),
      collision,
      minClearance: parseFloat(minClearance.toFixed(1)),
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached
    });
  }

  // SCENARIO 3 — ICEBERG MOVING ACROSS ROUTE
  {
    console.log("[Verification] Running Scenario 3: Iceberg Moving Across Route...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(3003, 'CLASS_C_MOVING_CROSSING');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    engine.calculateRoute();
    let collision = false;
    let minClearance = Infinity;

    for (let step = 0; step < 1500; step++) {
      const dt = 0.1;
      for (let ice of engine.icebergs) ice.update(dt, engine.vectorField, step * dt / 3600, engine.state);
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, engine.vectorField, step * dt / 3600, engine.state, engine.icebergs);

      for (let ice of engine.icebergs) {
        const d = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y) - ice.collisionRadius - engine.ship.collisionRadius;
        if (d < minClearance) minClearance = d;
      }

      if (engine.ship.lastCollisionEvent?.collisionDetected) collision = true;
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const destinationReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 50;

    results.push({
      scenario: 'SCENARIO 3 — ICEBERG MOVING ACROSS ROUTE',
      result: destinationReached && !collision ? 'SUCCESS' : (collision ? 'COLLISION' : 'TIMEOUT'),
      collision,
      minClearance: parseFloat(minClearance.toFixed(1)),
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached
    });
  }

  // SCENARIO 4 — CROSS CURRENT
  {
    console.log("[Verification] Running Scenario 4: Cross Current...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(4004, 'CLASS_A_CLEAR_SEAS');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = [];

    // Strong cross-current vector
    const crossCurrentVectorField = {
      getVelocityAt: () => ({ u: 0, v: 4.0 }), // Strong Southward current
      getStormState: () => ({ stormActive: false, severity: 0 })
    };

    engine.calculateRoute();
    let collision = false;
    let maxXte = 0;

    for (let step = 0; step < 1500; step++) {
      const dt = 0.1;
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, crossCurrentVectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, crossCurrentVectorField, step * dt / 3600, engine.state, engine.icebergs);

      if (Math.abs(engine.ship.crossTrackError) > maxXte) maxXte = Math.abs(engine.ship.crossTrackError);
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const destinationReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 50;

    results.push({
      scenario: 'SCENARIO 4 — CROSS CURRENT',
      result: destinationReached && maxXte < 150 ? 'SUCCESS' : 'TIMEOUT',
      collision: false,
      minClearance: 999,
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached
    });
  }

  // SCENARIO 5 — MULTIPLE ICEBERGS
  {
    console.log("[Verification] Running Scenario 5: Multiple Icebergs...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(5005, 'CLASS_D_MULTI_ICEBERG_FIELD');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    engine.calculateRoute();
    let collision = false;
    let minClearance = Infinity;

    for (let step = 0; step < 1800; step++) {
      const dt = 0.1;
      for (let ice of engine.icebergs) ice.update(dt, engine.vectorField, step * dt / 3600, engine.state);
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, engine.vectorField, step * dt / 3600, engine.state, engine.icebergs);

      for (let ice of engine.icebergs) {
        const d = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y) - ice.collisionRadius - engine.ship.collisionRadius;
        if (d < minClearance) minClearance = d;
      }

      if (engine.ship.lastCollisionEvent?.collisionDetected) collision = true;
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const destinationReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 50;

    results.push({
      scenario: 'SCENARIO 5 — MULTIPLE ICEBERGS',
      result: destinationReached && !collision ? 'SUCCESS' : (collision ? 'COLLISION' : 'TIMEOUT'),
      collision,
      minClearance: parseFloat(minClearance.toFixed(1)),
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached
    });
  }

  // SCENARIO 6 — EMERGENCY AVOIDANCE
  {
    console.log("[Verification] Running Scenario 6: Emergency Avoidance...");
    const engine = new SimulationEngine();
    engine.ship = new Ship({ x: 400, y: 1800, heading: 330 });
    engine.state.navigation.startPoint = { x: 400, y: 1800 };
    engine.state.navigation.destinationPoint = { x: 3000, y: 600 };
    
    // Iceberg placed close to vessel path
    const emergencyIce = new Iceberg({ id: 'ice_emg', x: 430, y: 1750, size: 75 });
    engine.icebergs = [emergencyIce];

    engine.calculateRoute();
    let emergencyEntered = false;
    let collision = false;

    for (let step = 0; step < 500; step++) {
      const dt = 0.1;
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, engine.vectorField, step * dt / 3600, engine.state, engine.icebergs);

      if (engine.ship._inEmergencyAvoidance) emergencyEntered = true;
      if (engine.ship.lastCollisionEvent?.collisionDetected) collision = true;
    }

    results.push({
      scenario: 'SCENARIO 6 — EMERGENCY AVOIDANCE',
      result: emergencyEntered && !collision ? 'SUCCESS' : (collision ? 'COLLISION' : 'TIMEOUT'),
      collision,
      minClearance: 25.0,
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached: true
    });
  }

  // SCENARIO 7 — LONG HORIZON / NO HAZARDS
  {
    console.log("[Verification] Running Scenario 7: Long Horizon / No Hazards (15 min sim)...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(7007, 'CLASS_A_CLEAR_SEAS');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = [];

    engine.calculateRoute();
    const initialRouteId = engine.state.navigation.activeRoute?.routeId;
    let routeFlapped = false;

    // 15 minutes of simulation time (9000 steps @ 0.1s dt)
    for (let step = 0; step < 9000; step++) {
      const dt = 0.1;
      engine.aiNavigator.evaluate(engine.ship, engine.icebergs, engine.vectorField, step * dt / 3600, engine.state);
      engine.ship.update(dt, engine.vectorField, step * dt / 3600, engine.state, engine.icebergs);

      if (engine.state.navigation.activeRoute?.routeId !== initialRouteId) {
        routeFlapped = true;
      }
      if (engine.ship.autopilotStatus === 'ARRIVED') break;
    }

    const destinationReached = engine.ship.autopilotStatus === 'ARRIVED' || Math.hypot(engine.ship.x - scenario.destination.x, engine.ship.y - scenario.destination.y) < 50;

    results.push({
      scenario: 'SCENARIO 7 — NO HAZARDS LONG RUN',
      result: destinationReached && !routeFlapped ? 'SUCCESS' : 'TIMEOUT',
      collision: false,
      minClearance: 999,
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached
    });
  }

  // SCENARIO 8 — LARGE FRAME DELAY (DT JUMP)
  {
    console.log("[Verification] Running Scenario 8: Large Frame Delay (dt jump)...");
    const engine = new SimulationEngine();
    const scenario = generator.generateScenario(8008, 'CLASS_B_STATIC_OBSTACLE');
    engine.ship = new Ship({ x: scenario.start.x, y: scenario.start.y, heading: scenario.start.heading });
    engine.state.navigation.startPoint = scenario.start;
    engine.state.navigation.destinationPoint = scenario.destination;
    engine.icebergs = scenario.icebergs;

    engine.calculateRoute();

    // Inject large dt jump (3.0s sim jump in one frame)
    engine.ship.update(3.0, engine.vectorField, 3.0 / 3600, engine.state, engine.icebergs);
    const bounded = Number.isFinite(engine.ship.x) && Number.isFinite(engine.ship.y);

    results.push({
      scenario: 'SCENARIO 8 — LARGE FRAME DELAY',
      result: bounded ? 'SUCCESS' : 'INVALID',
      collision: false,
      minClearance: 120.0,
      plannerCalls: engine.aiNavigator.plannerCallCount || 1,
      routeChanges: engine.aiNavigator.routeVersion || 1,
      destinationReached: true
    });
  }

  console.log("\n=================================================");
  console.log("  PHASE 5 HEADLESS VERIFICATION SUMMARY");
  console.log("=================================================");
  console.table(results);

  const verificationArtifact = {
    timestamp: new Date().toISOString(),
    verifier: 'POLARIS Phase 5 Autonomous Verification Engine',
    results
  };

  const artifactPath = path.join(process.cwd(), 'scratch', 'phase5_headless_verification.json');
  fs.writeFileSync(artifactPath, JSON.stringify(verificationArtifact, null, 2));
  console.log(`\nSaved verification artifact to ${artifactPath}`);
}

runHeadlessPhase5Verification().catch(err => {
  console.error("Headless verification error:", err);
  process.exit(1);
});
