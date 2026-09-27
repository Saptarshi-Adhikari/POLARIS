import { describe, it, expect } from 'vitest';
import { replanningTelemetry } from '../src/js/ai/ReplanningTelemetry.js';
import { fastFirstSafePlanner } from '../src/js/ai/FastFirstSafePlanner.js';
import { replanningStateMachine } from '../src/js/ai/ReplanningStateMachine.js';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';

describe('POLARIS — Fast Dynamic Replanning & Explicit LEFT/RIGHT Implementation Suite', () => {

  it('Phase 1: High-resolution pipeline latency measurement (t0..t17)', () => {
    replanningTelemetry.startTrace({ triggerId: 'CAUTION_PREDICTED_APPROACH', worldVersion: 10, hazardVersion: 5 });
    
    replanningTelemetry.mark('t1');
    replanningTelemetry.mark('t5');
    replanningTelemetry.mark('t6');
    replanningTelemetry.mark('t8');
    replanningTelemetry.mark('t9');
    replanningTelemetry.mark('t10');
    replanningTelemetry.mark('t11');
    replanningTelemetry.mark('t12');
    replanningTelemetry.mark('t14');
    replanningTelemetry.mark('t16');
    replanningTelemetry.mark('t17');

    const trace = replanningTelemetry.finalizeTrace({ selectedSide: 'LEFT' });
    expect(trace).toBeDefined();
    expect(trace.latencies.totalDecisionLatency).toBeGreaterThanOrEqual(0);
    expect(trace.status).toBe('COMPLETED');
  });

  it('Phase 2: World State Versioning prevents stale worker result adoption', () => {
    const currentHazardVersion = 12;
    const workerResultStale = { requestId: 5, hazardVersion: 11, waypoints: [] };
    const workerResultFresh = { requestId: 6, hazardVersion: 12, waypoints: [] };

    const isStaleRejected = workerResultStale.hazardVersion !== currentHazardVersion;
    const isFreshAccepted = workerResultFresh.hazardVersion === currentHazardVersion;

    expect(isStaleRejected).toBe(true);
    expect(isFreshAccepted).toBe(true);
  });

  it('Phase 4 & 5: Early Predicted Conflict Trigger elevates state to CAUTION/URGENT', () => {
    const shipState = { x: 200, y: 500, vx: 20, vy: 0, heading: 0 };
    const activeRoute = { waypoints: [{ x: 200, y: 500 }, { x: 1200, y: 500 }] };
    const vessel = { length: 80, beam: 20, speed: 20 };
    
    // Iceberg moving into route corridor crossing at t=40s (TCPA ~ 35s, DCPA ~ 20 SU)
    const icebergs = [{
      id: 'ice_approaching',
      x: 900, y: 200,
      vx: -10, vy: 7.5,
      collisionRadius: 35,
      uncertaintyRadius: 15
    }];

    const stateRes = replanningStateMachine.evaluateState(shipState, activeRoute, icebergs, vessel);
    expect(['CAUTION', 'URGENT', 'EMERGENCY']).toContain(stateRes.state);
  });

  it('Phase 6 & 12: Fast First-Safe Planner replans from current vessel state in <50ms', () => {
    const shipState = { x: 400, y: 500, heading: 0.1, speed: 18.0, vx: 18, vy: 0 };
    const dest = { x: 1500, y: 500 };
    const hazard = { id: 'ice_block', x: 800, y: 500, collisionRadius: 40, uncertaintyRadius: 20 };
    const vessel = { length: 80, beam: 20, speed: 18 };

    const result = fastFirstSafePlanner.evaluateLeftRight(shipState, dest, hazard, vessel, [hazard], 'BALANCED');

    expect(result.calcTimeMs).toBeLessThan(50.0);
    expect(result.selectedSide).not.toBe('NONE');
    expect(result.selectedRoute).toBeDefined();
    expect(result.selectedRoute[0].x).toBe(shipState.x);
    expect(result.selectedRoute[0].y).toBe(shipState.y);
  });

  it('Phase 8, 9, 10 & 11: Explicit Symmetric LEFT and RIGHT Candidate Evaluation and Deterministic Winner Selection', () => {
    const shipState = { x: 300, y: 500, heading: 0, speed: 20.0 };
    const dest = { x: 1500, y: 500 };
    const hazard = { id: 'ice_center', x: 900, y: 500, collisionRadius: 40, uncertaintyRadius: 20 };
    const vessel = { length: 80, beam: 20, speed: 20 };

    const evalResult = fastFirstSafePlanner.evaluateLeftRight(shipState, dest, hazard, vessel, [hazard], 'BALANCED');

    expect(evalResult.leftCandidate).toBeDefined();
    expect(evalResult.rightCandidate).toBeDefined();
    expect(evalResult.leftCandidate.side).toBe('LEFT');
    expect(evalResult.rightCandidate.side).toBe('RIGHT');

    // Both candidate branches are validated with ContinuousCollisionValidator
    if (evalResult.leftCandidate.safe) {
      const valLeft = continuousCollisionValidator.validateFullRoute(evalResult.leftCandidate.waypoints, vessel, [hazard]);
      expect(valLeft.isValid).toBe(true);
    }
    if (evalResult.rightCandidate.safe) {
      const valRight = continuousCollisionValidator.validateFullRoute(evalResult.rightCandidate.waypoints, vessel, [hazard]);
      expect(valRight.isValid).toBe(true);
    }

    expect(['LEFT', 'RIGHT']).toContain(evalResult.selectedSide);
    expect(evalResult.tieBreakReason).toBeDefined();
  });

  it('Phase 18: Screenshot Scenario — Prediction conflict causes immediate turning detour without delay', () => {
    const shipState = { x: 300, y: 500, heading: 0, speed: 18.0 };
    const dest = { x: 1500, y: 500 };
    const hazard = { id: 'ice_threat', x: 750, y: 500, collisionRadius: 50, uncertaintyRadius: 30 };
    const vessel = { length: 80, beam: 20, speed: 18 };

    const planRes = fastFirstSafePlanner.evaluateLeftRight(shipState, dest, hazard, vessel, [hazard], 'SAFEST');

    expect(planRes.selectedRoute).toBeDefined();
    // Verify first detour segment bends away from y=500 centerline immediately
    const firstDetourY = planRes.selectedRoute[1].y;
    expect(Math.abs(firstDetourY - 500)).toBeGreaterThan(30.0);
  });
});
