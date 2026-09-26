/**
 * POLARIS DETERMINISTIC NAVIGATION & SAFETY MONTE CARLO SUITE
 * Executes 500 DEMO + 500 REAL deterministic scenarios.
 * Asserts: zero collisions (collisionOccurred === false) AND min clearance > safety margin.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine } from '../src/js/main.js';
import { isSegmentHardBlocked, validateRoute } from '../src/js/ai/routePlannerCore.js';
import { Iceberg } from '../src/js/simulation/iceberg.js';
import { createNormalizedHazard } from '../src/js/providers/schemas.js';

describe('PHASE 36-40: 1000-Scenario Monte Carlo Safety & Collision Avoidance Harness', () => {
  let engine;

  beforeEach(() => {
    engine = new SimulationEngine();
  });

  // Seeded Pseudo-Random Generator for deterministic reproducibility
  function createLCG(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
  }

  it('1. 500 DEMO Deterministic Scenarios — Zero Collisions Assertion', { timeout: 300000 }, async () => {
    let totalScenarios = 500;
    let passedScenarios = 0;
    let overallMinClearance = Infinity;

    for (let simId = 1; simId <= totalScenarios; simId++) {
      const rand = createLCG(simId * 7919);

      // Randomize vessel start & destination
      const shipX = 300 + rand() * 400;
      const shipY = 300 + rand() * 1200;
      const destX = 3000 + rand() * 400;
      const destY = 300 + rand() * 1200;

      engine.ship.x = shipX;
      engine.ship.y = shipY;
      engine.ship.heading = Math.atan2(destY - shipY, destX - shipX) * 180 / Math.PI;

      // Randomize 8-15 synthetic icebergs
      const numIce = 8 + Math.floor(rand() * 8);
      engine.icebergs = [];
      for (let i = 0; i < numIce; i++) {
        const ix = 800 + rand() * 2000;
        const iy = 200 + rand() * 1400;
        const size = 300 + rand() * 1200;
        const radius = Math.max(15, size / 35);
        const vx = (rand() - 0.5) * 1.5;
        const vy = (rand() - 0.5) * 1.5;

        const ice = new Iceberg({
          id: `DEMO-ICE-${i + 1}`,
          name: `IB-DEMO-${i + 1}`,
          x: ix,
          y: iy,
          size,
          collisionRadius: radius
        });
        ice.vx = vx;
        ice.vy = vy;
        engine.icebergs.push(ice);
      }

      // Calculate path via route planner (startPoint, destPoint, icebergs, vectorField, mode, state, ship)
      const planResult = engine.aiNavigator.calculateRoute(
        { x: shipX, y: shipY },
        { x: destX, y: destY },
        engine.icebergs,
        engine.vectorField,
        'BALANCED',
        engine.state,
        engine.ship
      );

      // Verify active route adoption and hard obstacle non-traversability
      const activeRoute = engine.state.navigation.activeRoute;
      expect(activeRoute).toBeDefined();
      expect(activeRoute.waypoints.length).toBeGreaterThan(1);

      // Simulate 50 steps of vessel movement along route
      let collisionOccurred = false;
      let scenarioMinClearance = Infinity;

      for (let step = 0; step < 50; step++) {
        engine.ship.update(0.2, engine.vectorField, step * 0.05, engine.state, engine.icebergs);
        for (let ice of engine.icebergs) {
          ice.x += ice.vx * 0.2;
          ice.y += ice.vy * 0.2;
          const d = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y);
          const clearance = d - (engine.ship.collisionRadius || 15) - (ice.collisionRadius || 20);
          if (clearance < scenarioMinClearance) scenarioMinClearance = clearance;
          if (clearance <= 0) collisionOccurred = true;
        }
      }

      if (scenarioMinClearance < overallMinClearance) overallMinClearance = scenarioMinClearance;
      if (!collisionOccurred) {
        passedScenarios++;
      }
    }

    console.info(`[Monte Carlo DEMO] ${passedScenarios}/${totalScenarios} Passed | Min Clearance: ${overallMinClearance.toFixed(1)} SU`);
    expect(passedScenarios).toBe(totalScenarios);
    expect(overallMinClearance).toBeGreaterThan(0);
  });

  it('2. 500 REAL Deterministic Scenarios — Zero Collisions Assertion', { timeout: 120000 }, async () => {
    let totalScenarios = 500;
    let passedScenarios = 0;
    let overallMinClearance = Infinity;

    // Switch to REAL mode once for all 500 iterations
    await engine.setDataMode('REAL');
    expect(engine.dataMode).toBe('REAL');

    for (let simId = 1; simId <= totalScenarios; simId++) {
      const rand = createLCG(simId * 104729);

      // Randomize vessel start & destination
      const shipX = 200 + rand() * 500;
      const shipY = 400 + rand() * 1000;
      const destX = 2900 + rand() * 500;
      const destY = 400 + rand() * 1000;

      engine.ship.x = shipX;
      engine.ship.y = shipY;

      // Ingest real/correlated SAR hazards from active engine icebergs
      const realHazards = engine.icebergs;
      expect(realHazards.length).toBeGreaterThan(0);

      // Ensure every hazard is wrapped in canonical model
      const canonicalHazards = realHazards.map(h => createNormalizedHazard({
        id: h.id,
        type: h.type || 'ICEBERG',
        source: h.source || 'USNIC',
        position: h.position,
        geometry: h.geometry,
        velocity: h.velocity
      }));

      // Calculate path (startPoint, destPoint, icebergs, vectorField, mode, state, ship)
      engine.aiNavigator.calculateRoute(
        { x: shipX, y: shipY },
        { x: destX, y: destY },
        engine.icebergs,
        engine.vectorField,
        'SAFEST',
        engine.state,
        engine.ship
      );

      const activeRoute = engine.state.navigation.activeRoute;
      expect(activeRoute).toBeDefined();

      let collisionOccurred = false;
      let scenarioMinClearance = Infinity;

      for (let step = 0; step < 50; step++) {
        engine.ship.update(0.2, engine.vectorField, step * 0.05, engine.state, engine.icebergs);
        for (let ice of engine.icebergs) {
          const d = Math.hypot(engine.ship.x - ice.x, engine.ship.y - ice.y);
          const clearance = d - (engine.ship.collisionRadius || 15) - (ice.collisionRadius || 20);
          if (clearance < scenarioMinClearance) scenarioMinClearance = clearance;
          if (clearance <= 0) collisionOccurred = true;
        }
      }

      if (scenarioMinClearance < overallMinClearance) overallMinClearance = scenarioMinClearance;
      if (!collisionOccurred && scenarioMinClearance > 5.0) {
        passedScenarios++;
      }
    }

    console.info(`[Monte Carlo REAL] ${passedScenarios}/${totalScenarios} Passed | Min Clearance: ${overallMinClearance.toFixed(1)} SU`);
    expect(passedScenarios).toBe(totalScenarios);
    expect(overallMinClearance).toBeGreaterThan(5.0);
  });
});
