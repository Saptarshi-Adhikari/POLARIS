/**
 * POLARIS — Phase 5B Deterministic Radar Validation Harness Test Suite (Scenarios A - M)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RadarValidationHarness, RadarPerceptionEngine } from '../src/js/data/RadarPerceptionEngine.js';

describe('POLARIS Phase 5B — Deterministic Radar Validation Harness (Scenarios A through M)', () => {
  let harness;
  let engine;

  beforeEach(() => {
    harness = new RadarValidationHarness();
    engine = new RadarPerceptionEngine();
  });

  it('1. Scenario A — No Targets', () => {
    const res = harness.evaluateScenario('SCENARIO_A_NO_TARGETS', engine);
    expect(res.detectedTargets).toBe(0);
    expect(res.falseAlarmRate).toBe(0.0);
  });

  it('2. Scenario B — One Strong Target', () => {
    const res = harness.evaluateScenario('SCENARIO_B_ONE_STRONG_TARGET', engine);
    expect(res.detectedTargets).toBe(1);
    expect(res.detectionRate).toBe(1.0);
  });

  it('3. Scenario C — One Weak Target', () => {
    const res = harness.evaluateScenario('SCENARIO_C_ONE_WEAK_TARGET', engine);
    expect(res.detectedTargets).toBe(1);
  });

  it('4. Scenario D — Two Nearby Targets', () => {
    const res = harness.evaluateScenario('SCENARIO_D_TWO_NEARBY_TARGETS', engine);
    expect(res.detectedTargets).toBe(2);
  });

  it('5. Scenario E — Multiple Targets', () => {
    const res = harness.evaluateScenario('SCENARIO_E_MULTIPLE_TARGETS', engine);
    expect(res.detectedTargets).toBe(8);
  });

  it('6. Scenario F — Short Range Target', () => {
    const res = harness.evaluateScenario('SCENARIO_F_SHORT_RANGE', engine);
    expect(res.detectedTargets).toBe(1);
  });

  it('7. Scenario G — Medium Range Target', () => {
    const res = harness.evaluateScenario('SCENARIO_G_MEDIUM_RANGE', engine);
    expect(res.detectedTargets).toBe(1);
  });

  it('8. Scenario H — Long Range Target', () => {
    const res = harness.evaluateScenario('SCENARIO_H_LONG_RANGE', engine);
    expect(res.detectedTargets).toBe(1);
  });

  it('9. Scenario I — Clutter Heavy Scene', () => {
    const res = harness.evaluateScenario('SCENARIO_I_CLUTTER_HEAVY', engine);
    // Sub-threshold clutter targets (-25 dB) should be filtered out
    expect(res.detectedTargets).toBe(0);
  });

  it('10. Scenario J — Missed Scan', () => {
    const res = harness.evaluateScenario('SCENARIO_J_MISSED_SCAN', engine);
    expect(res.detectedTargets).toBe(0);
  });

  it('11. Scenario K — Noisy Scan', () => {
    const res = harness.evaluateScenario('SCENARIO_K_NOISY_SCAN', engine);
    expect(res.detectedTargets).toBe(1); // Strong target passes, noisy sub-threshold target filtered
  });

  it('12. Scenario M — Changing Radial Velocity', () => {
    const res = harness.evaluateScenario('SCENARIO_M_CHANGING_RADIAL_VELOCITY', engine);
    expect(res.detectedTargets).toBe(2);
  });
});
