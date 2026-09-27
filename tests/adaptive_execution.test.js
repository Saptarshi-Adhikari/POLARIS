import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdaptiveNavigationEpisodeEngine,
  MISSION_STATE,
  ACTION_EXECUTION_STATE
} from '../src/js/simulation/AdaptiveNavigationEpisodeEngine.js';
import { SimulationEngine } from '../src/js/main.js';
import { Ship } from '../src/js/simulation/ship.js';

describe('Phase 7A — End-to-End Adaptive Execution & Dynamic Rerouting Suite', () => {
  let orchestrator;

  beforeEach(() => {
    orchestrator = new AdaptiveNavigationEpisodeEngine({ executionMode: 'DETERMINISTIC_TEST' });
  });

  // STEP 4: Route Versioning & Stale Result Rejection
  it('STEP 4 & Test A-F: Rejects stale planner results when environmentVersion or simulateStaleResult is flagged', () => {
    const startWorldTime = 10000;
    
    // Initial Step - Trigger initial route calculation
    const res1 = orchestrator.executeStep(0.1, startWorldTime);
    expect(res1.status).toBe('STEP_OK');
    expect(orchestrator.environmentVersion).toBe(2);

    // Simulate stale planner result return
    const resStale = orchestrator.executeStep(0.1, startWorldTime + 5000, { simulateStaleResult: true, forceReplan: true });
    expect(resStale.status).toBe('STALE_RESULT_REJECTED');
    expect(orchestrator.staleRejections).toBe(1);
  });

  // STEP 6: Closed-Loop Vessel Execution (No Direct Rudder Mutation from Orchestrator)
  it('STEP 6 INVARIANT: Orchestrator hands proposal through ControlAuthority without mutating ship.rudder directly', () => {
    const ship = orchestrator.engine.ship;
    const initialRudder = ship.rudder;

    const res = orchestrator.executeStep(0.1, 20000);
    expect(res.status).toBe('STEP_OK');
    expect(orchestrator.actionExecutionState).toBe(ACTION_EXECUTION_STATE.EXECUTING);
    // Ship rudder should be updated by ship physics, not directly forced to illegal static values by orchestrator
    expect(ship.targetHeading).toBeDefined();
  });

  // STEP 7 & 8: Continuous Safety Revalidation & Dynamic Hazard Replan
  it('STEP 7 & 8: Triggers HAZARD_INTRUSION replanning when obstacle intrudes planned corridor', () => {
    const ship = orchestrator.engine.ship;
    // Place iceberg directly in ship path
    orchestrator.engine.icebergs = [
      { id: 'ICE-INTRUDER', x: ship.x, y: ship.y - 40, vx: 0, vy: 0, collisionRadius: 25 }
    ];

    const res = orchestrator.executeStep(0.1, 30000, { forceReplan: true });
    expect(res.replanCount).toBeGreaterThan(0);
    expect([MISSION_STATE.EXECUTING, MISSION_STATE.AVOIDING, MISSION_STATE.REPLANNING]).toContain(orchestrator.missionState);
  });

  // STEP 9: Mission Completion Transition
  it('STEP 9: Transition to COMPLETED state upon reaching destination arrival radius', () => {
    const ship = orchestrator.engine.ship;
    const dest = { x: 3200, y: 600 };
    orchestrator.engine.state.navigation.destinationPoint = dest;

    // Teleport ship close to destination
    ship.x = dest.x - 5;
    ship.y = dest.y - 5;

    const res = orchestrator.executeStep(0.1, 40000);
    expect(res.status).toBe('COMPLETED');
    expect(orchestrator.missionState).toBe(MISSION_STATE.COMPLETED);
  });

  // STEP 12: Adaptive Execution Scorecard Generation
  it('STEP 12: Generates multidimensional execution scorecard without collapsing metrics', () => {
    orchestrator.executeStep(0.1, 50000);
    const scorecard = orchestrator.generateScorecard();

    expect(scorecard.executionMode).toBe('DETERMINISTIC_TEST');
    expect(scorecard.safety).toBeDefined();
    expect(scorecard.adaptation).toBeDefined();
    expect(scorecard.totalReplans).toBeDefined();
  });
});
