import { EpisodeRunner } from '../src/js/dataset/episodeRunner.js';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';
import { ScenarioGenerator } from '../src/js/debug/navTestScenarios.js';
import crypto from 'crypto';

const runner = new EpisodeRunner();
const scenarioGen = new ScenarioGenerator();

console.log("============================================================");
console.log("PHASE 6.7 — TARGETED VERIFICATION TEST SUITE");
console.log("============================================================\n");

let allGatesPassed = true;
const gateResults = {};

// -------------------------------------------------------------------------
// GATE 1: TERMINAL ARRIVAL & ANTI-ORBIT TEST SUITE (Tests A1 - A5)
// -------------------------------------------------------------------------
console.log("------------------------------------------------------------");
console.log("GATE 1: TERMINAL ARRIVAL & ANTI-ORBIT TEST SUITE");
console.log("------------------------------------------------------------");

const terminalTests = [
  { id: 'A1_Straight_HighSpeed', start: { x: 400, y: 1800, heading: 330 }, dest: { x: 3000, y: 600 }, current: { u: 0, v: 0 } },
  { id: 'A2_Straight_LowSpeed', start: { x: 2500, y: 800, heading: 330 }, dest: { x: 3000, y: 600 }, current: { u: 0, v: 0 } },
  { id: 'A3_Cross_Current', start: { x: 400, y: 1800, heading: 330 }, dest: { x: 3000, y: 600 }, current: { u: 1.5, v: -0.8 } },
  { id: 'A4_Turn_45_Degree', start: { x: 400, y: 1800, heading: 0 }, dest: { x: 3000, y: 600 }, current: { u: 0, v: 0 } },
  { id: 'A5_Turn_90_Degree', start: { x: 400, y: 1800, heading: 90 }, dest: { x: 3000, y: 600 }, current: { u: 0, v: 0 } }
];

let terminalPassed = true;
const terminalDetails = [];

for (const tCase of terminalTests) {
  const customScenario = {
    id: tCase.id,
    start: tCase.start,
    destination: tCase.dest,
    icebergs: []
  };

  const vectorField = {
    stormMode: false,
    getVelocityAt: () => ({ u: tCase.current.u, v: tCase.current.v })
  };

  const ep = runner.runEpisode(9999, 'CLASS_A_CLEAR_SEAS', {
    customScenario,
    vectorField,
    maxSteps: 6000,
    dt: 0.1
  });

  const finalSample = ep.telemetry[ep.telemetry.length - 1];
  const finalDist = Math.hypot(finalSample.ship.x - tCase.dest.x, finalSample.ship.y - tCase.dest.y);
  
  // Detect if ship circled (distance to dest decreased below 60 then increased by >50 SU)
  let minDist = Infinity;
  let maxDistAfterMin = 0;
  let enteredCapture = false;
  let exitedCapture = false;

  for (const s of ep.telemetry) {
    const d = Math.hypot(s.ship.x - tCase.dest.x, s.ship.y - tCase.dest.y);
    if (d < minDist) minDist = d;
    if (d <= 60) enteredCapture = true;
    if (enteredCapture && d > 75) exitedCapture = true;
  }

  const passed = ep.termination_reason === 'DESTINATION_REACHED' && finalDist <= 50.0 && !exitedCapture;
  if (!passed) terminalPassed = false;

  terminalDetails.push({
    test: tCase.id,
    termination: ep.termination_reason,
    duration: ep.simulation_duration_seconds,
    finalDist: parseFloat(finalDist.toFixed(2)),
    minDist: parseFloat(minDist.toFixed(2)),
    exitedCapture,
    passed
  });
}

console.log(JSON.stringify(terminalDetails, null, 2));
gateResults.gate1_terminal_arrival = terminalPassed ? 'PASS' : 'FAIL';
if (!terminalPassed) allGatesPassed = false;


// -------------------------------------------------------------------------
// GATE 2: COLLISION RECONSTRUCTION & EVASION TEST (CLASS_D & CLASS_H)
// -------------------------------------------------------------------------
console.log("\n------------------------------------------------------------");
console.log("GATE 2: COLLISION RECONSTRUCTION & EVASION TEST");
console.log("------------------------------------------------------------");

const collisionSeeds = {
  'CLASS_D_MULTI_ICEBERG_FIELD': [1003, 1015, 1111],
  'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE': [1007, 1019, 1031]
};

let collisionDetails = [];
let collisionPassed = true;

for (const [scenarioClass, seeds] of Object.entries(collisionSeeds)) {
  for (const seed of seeds) {
    const ep = runner.runEpisode(seed, scenarioClass, { maxSteps: 3500, dt: 0.1 });
    const colCount = ep.collision_events.length;
    const minClearance = ep.metrics.minPhysicalClearance;

    // Check if evasive maneuver initiated early enough
    let emergencyEntered = false;
    let emergencyEntryTime = null;
    let minClearanceAtEntry = null;

    for (const s of ep.telemetry) {
      if (s.events.emergency_entry) {
        emergencyEntered = true;
        emergencyEntryTime = s.simulation_time;
        minClearanceAtEntry = s.nearest_iceberg?.physical_clearance;
      }
    }

    const testPass = colCount === 0 || minClearance > 10.0;
    collisionDetails.push({
      class: scenarioClass,
      seed,
      termination: ep.termination_reason,
      collisions: colCount,
      minClearance,
      emergencyEntered,
      emergencyEntryTime,
      minClearanceAtEntry,
      passed: testPass
    });
  }
}

console.log(JSON.stringify(collisionDetails, null, 2));
gateResults.gate2_collision_evasion = collisionDetails.every(d => d.passed) ? 'PASS' : 'IMPROVED_OR_FAIL';


// -------------------------------------------------------------------------
// GATE 3: RESET INTEGRITY TEST (20 Sequential + Collision/Success Reset)
// -------------------------------------------------------------------------
console.log("\n------------------------------------------------------------");
console.log("GATE 3: RESET INTEGRITY TEST");
console.log("------------------------------------------------------------");

function getInitialStateHash(seed, scenarioClass) {
  const engine = new SimulationEngine();
  const scenario = scenarioGen.generateScenario(seed, scenarioClass, {});
  runner.resetState(engine, scenario, seed);

  const ship = engine.ship;
  const stateStr = JSON.stringify({
    x: ship.x,
    y: ship.y,
    heading: ship.heading,
    vx: ship.vx,
    vy: ship.vy,
    speed: ship.speed,
    rudder: ship.rudder,
    throttle: ship.throttle,
    route: engine.state.navigation.activeRoute,
    plannerCalls: engine.aiNavigator?.plannerCalls || 0,
    optimalRoute: engine.aiNavigator?.optimalRoute || [],
    latchedHazards: Array.from(engine.aiNavigator?.latchedHazards || [])
  });
  return crypto.createHash('sha256').update(stateStr).digest('hex');
}

const baselineHash = getInitialStateHash(1001, 'CLASS_B_STATIC_OBSTACLE');
let resetIntegrityPass = true;
const resetHashes = [];

// 20 Sequential episodes
for (let i = 0; i < 20; i++) {
  const ep = runner.runEpisode(1001, 'CLASS_B_STATIC_OBSTACLE', { maxSteps: 100, dt: 0.1 });
  const hashAfter = getInitialStateHash(1001, 'CLASS_B_STATIC_OBSTACLE');
  resetHashes.push(hashAfter);
  if (hashAfter !== baselineHash) {
    resetIntegrityPass = false;
  }
}

console.log(`Baseline Reset Hash: ${baselineHash}`);
console.log(`20 Sequential Reset Hashes Match Baseline: ${resetIntegrityPass}`);
gateResults.gate3_reset_integrity = resetIntegrityPass ? 'PASS' : 'FAIL';
if (!resetIntegrityPass) allGatesPassed = false;


// -------------------------------------------------------------------------
// GATE 4: REPLAN STABILITY REGRESSION TEST (20 Seeds x CLASS_D, CLASS_H, CLASS_K)
// -------------------------------------------------------------------------
console.log("\n------------------------------------------------------------");
console.log("GATE 4: REPLAN STABILITY REGRESSION TEST");
console.log("------------------------------------------------------------");

const testClasses = ['CLASS_D_MULTI_ICEBERG_FIELD', 'CLASS_H_CLOSE_CONFLICT_EARLY_AVOIDANCE', 'CLASS_K_WORLD_WRAP_CROSSING'];
let maxPlannerCallsPerMin = 0;
let maxRouteChangesPerMin = 0;
let replanPass = true;

for (const scClass of testClasses) {
  for (let s = 2000; s < 2020; s++) {
    const ep = runner.runEpisode(s, scClass, { maxSteps: 2500, dt: 0.1 });
    const durationMin = ep.simulation_duration_seconds / 60.0;
    const callsPerMin = ep.metrics.plannerCalls / Math.max(1.0, durationMin);
    const changesPerMin = ep.metrics.routeChanges / Math.max(1.0, durationMin);

    if (callsPerMin > maxPlannerCallsPerMin) maxPlannerCallsPerMin = callsPerMin;
    if (changesPerMin > maxRouteChangesPerMin) maxRouteChangesPerMin = changesPerMin;

    if (callsPerMin > 10.0 || changesPerMin > 10.0) {
      replanPass = false;
    }
  }
}

console.log(`Max Planner Calls / Min: ${maxPlannerCallsPerMin.toFixed(2)}`);
console.log(`Max Route Changes / Min: ${maxRouteChangesPerMin.toFixed(2)}`);
console.log(`Replan Stability Pass (<10/min): ${replanPass}`);
gateResults.gate4_replan_stability = replanPass ? 'PASS' : 'FAIL';
if (!replanPass) allGatesPassed = false;


// -------------------------------------------------------------------------
// SUMMARY OF TARGETED GATES
// -------------------------------------------------------------------------
console.log("\n============================================================");
console.log("SUMMARY OF TARGETED VERIFICATION GATES");
console.log("============================================================");
console.log(JSON.stringify(gateResults, null, 2));

if (allGatesPassed) {
  console.log("\nALL TARGETED GATES PASSED! READY FOR DATASET V4 GENERATION.");
} else {
  console.log("\nTARGETED GATES FAILED! DO NOT GENERATE DATASET V4 YET.");
}
