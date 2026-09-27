import { describe, it, expect } from 'vitest';
import { replanningTelemetry } from '../src/js/ai/ReplanningTelemetry.js';
import { fastFirstSafePlanner } from '../src/js/ai/FastFirstSafePlanner.js';
import { replanningStateMachine } from '../src/js/ai/ReplanningStateMachine.js';

describe('POLARIS — Replanning Performance Baseline & Telemetry Benchmark', () => {

  it('Phase 1: High-Resolution Timestamp Tracking (t0..t17) & Bottleneck Attribution', () => {
    const trace = replanningTelemetry.startTrace({
      triggerId: 'TEST_TRIGGER',
      worldVersion: 1,
      hazardVersion: 1,
      t0: performance.now()
    });

    replanningTelemetry.mark('t1', performance.now() + 0.5);
    replanningTelemetry.mark('t5', performance.now() + 1.2);
    replanningTelemetry.mark('t6', performance.now() + 1.5);
    replanningTelemetry.mark('t8', performance.now() + 2.0);
    replanningTelemetry.mark('t9', performance.now() + 5.5);
    replanningTelemetry.mark('t10', performance.now() + 6.0);
    replanningTelemetry.mark('t11', performance.now() + 6.5);
    replanningTelemetry.mark('t12', performance.now() + 7.0);
    replanningTelemetry.mark('t14', performance.now() + 7.5);
    replanningTelemetry.mark('t16', performance.now() + 8.0);
    replanningTelemetry.mark('t17', performance.now() + 8.5);

    const completed = replanningTelemetry.finalizeTrace({ selectedSide: 'LEFT' });
    expect(completed).toBeDefined();
    expect(completed.latencies.searchLatency).toBeGreaterThan(0);
    expect(completed.latencies.totalDecisionLatency).toBeGreaterThan(0);

    const summary = replanningTelemetry.getBottleneckSummary();
    expect(summary.totalEvents).toBeGreaterThan(0);
    expect(summary.averages).toBeDefined();
  });

  it('Phase 4: Tiered Trigger State Machine Transitions (NORMAL -> CAUTION -> URGENT -> EMERGENCY)', () => {
    const shipState = { x: 100, y: 500, vx: 20, vy: 0, heading: 0 };
    const activeRoute = { waypoints: [{ x: 100, y: 500 }, { x: 1000, y: 500 }] };
    const vessel = { length: 80, beam: 20, speed: 20 };

    // 1. Clear ocean -> NORMAL
    const resNormal = replanningStateMachine.evaluateState(shipState, activeRoute, [], vessel);
    expect(resNormal.state).toBe('NORMAL');
    expect(resNormal.bypassCooldown).toBe(false);

    // 2. Imminent collision -> EMERGENCY (bypass cooldown)
    const iceEmg = [{ id: 'ice_emg', x: 120, y: 500, collisionRadius: 30, vx: 0, vy: 0 }];
    const resEmg = replanningStateMachine.evaluateState(shipState, activeRoute, iceEmg, vessel);
    expect(resEmg.state).toBe('EMERGENCY');
    expect(resEmg.bypassCooldown).toBe(true);
  });

  it('Phase 8, 9 & 11: Explicit Symmetric LEFT and RIGHT Candidate Evaluation & Selection', () => {
    const shipState = { x: 100, y: 500, heading: 0, vx: 15, vy: 0 };
    const dest = { x: 1000, y: 500 };
    const hazard = { id: 'ice_mid', x: 500, y: 500, collisionRadius: 35, uncertaintyRadius: 15 };
    const vessel = { length: 80, beam: 20, speed: 15 };
    const icebergs = [hazard];

    const evalResult = fastFirstSafePlanner.evaluateLeftRight(shipState, dest, hazard, vessel, icebergs, 'BALANCED');

    expect(['LEFT', 'RIGHT']).toContain(evalResult.selectedSide);
    expect(evalResult.leftCandidate).toBeDefined();
    expect(evalResult.rightCandidate).toBeDefined();
    expect(evalResult.leftCandidate.side).toBe('LEFT');
    expect(evalResult.rightCandidate.side).toBe('RIGHT');
    expect(evalResult.calcTimeMs).toBeLessThan(50.0); // Fast first-safe constraint (< 50ms)
  });
});
