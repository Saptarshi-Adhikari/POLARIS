import { describe, it, expect, beforeEach } from 'vitest';
import {
  CounterfactualEpisodeEngine,
  DECISION_MARGIN_CLASS,
  counterfactualEpisodeEngine
} from '../src/js/simulation/CounterfactualEpisodeEngine.js';
import { DecisionEngine, ACTION_CLASS, ENCOUNTER_TYPE } from '../src/js/ai/decisionEngine.js';
import { MARITIME_RULE_REGISTRY } from '../src/js/ai/semanticRuleMapper.js';

describe('Phase 6B — Adaptive Counterfactual Simulation & Decision Stability Verification', () => {
  let engine;

  beforeEach(() => {
    engine = new CounterfactualEpisodeEngine();
  });

  // STEP 1 INVARIANT: Counterfactual execution operates in isolated state and does not mutate live ship rudder
  it('INVARIANT 1: Counterfactual execution NEVER mutates live vessel rudder or live ControlAuthority', () => {
    const liveShip = { x: 400, y: 1800, heading: 0, speed: 15, rudder: 0 };
    const liveTargets = [{ id: 'TGT-1', x: 400, y: 1400, vx: 0, vy: 10 }];

    const branches = engine.simulateActionBranches(liveShip, liveTargets, { horizonSec: 30.0 });

    expect(branches.length).toBeGreaterThanOrEqual(7);
    // Live ship rudder MUST remain 0
    expect(liveShip.rudder).toBe(0);
  });

  // STEP 3: Action Branching Simulation
  it('Simulates action branches across candidate actions and computes branch clearances', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15, vx: 0, vy: -15 };
    const targets = [{ id: 'TGT-HEAD-ON', x: 400, y: 1200, vx: 0, vy: 15, collisionRadius: 20 }];

    const branches = engine.simulateActionBranches(ownShip, targets, { horizonSec: 40.0 });

    const stbdBranch = branches.find(b => b.actionClass === ACTION_CLASS.STARBOARD_ALTERATION_LARGE);
    const maintainBranch = branches.find(b => b.actionClass === ACTION_CLASS.MAINTAIN_COURSE_AND_SPEED);

    expect(stbdBranch).toBeDefined();
    expect(maintainBranch).toBeDefined();

    // Starboard alteration should offer greater or equal minimum clearance than maintaining head-on course
    expect(stbdBranch.minimumClearance).toBeGreaterThanOrEqual(maintainBranch.minimumClearance);
  });

  // STEP 4: Perturbation Robustness Evaluation
  it('Evaluates perturbation robustness under deterministic target position/velocity noise', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15, vx: 0, vy: -15 };
    const targets = [{ id: 'TGT-CROSSING', x: 700, y: 1400, vx: -10, vy: 0 }];

    const pertResult = engine.evaluatePerturbationRobustness(ownShip, targets, 12345, 30);

    expect(pertResult.totalPerturbations).toBe(30);
    expect(pertResult.dominanceRatio).toBeGreaterThan(0.50);
    expect(pertResult.topAction).toBeDefined();
    expect(pertResult.validatorPassRate).toBeGreaterThanOrEqual(0.80);
  });

  // STEP 5: Decision Margin Classification
  it('Computes decision margin and classifies ROBUST_DECISION vs SENSITIVE', () => {
    const branches = [
      { actionClass: ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM, minimumClearance: 120.0, validatorPassed: true },
      { actionClass: ACTION_CLASS.STARBOARD_ALTERATION_SMALL, minimumClearance: 80.0, validatorPassed: true },
      { actionClass: ACTION_CLASS.MAINTAIN_COURSE_AND_SPEED, minimumClearance: 5.0, validatorPassed: false }
    ];

    const margin = engine.calculateDecisionMargin(branches);

    expect(margin.marginClass).toBe(DECISION_MARGIN_CLASS.ROBUST_DECISION);
    expect(margin.bestAction).toBe(ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM);
    expect(margin.safetyMarginMeters).toBe(40.0);
  });

  // STEP 11: Explanation Consistency Validation
  it('Validates explanation consistency between decision records and counterfactual outcomes', () => {
    const decisionRecord = {
      selectedAction: { actionClass: ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM, accepted: true },
      primaryEncounter: { type: ENCOUNTER_TYPE.HEAD_ON },
      structuredExplanation: {
        safetyGate: { continuousCollisionValidatorPassed: true },
        summaryText: "STARBOARD alteration adopted. Associated with Rule 14."
      }
    };

    const branchResults = [
      { actionClass: ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM, validatorPassed: true },
      { actionClass: ACTION_CLASS.MAINTAIN_COURSE_AND_SPEED, validatorPassed: false }
    ];

    const consistency = engine.validateExplanationConsistency(decisionRecord, branchResults);
    expect(consistency.isConsistent).toBe(true);
    expect(consistency.reason).toBeNull();
  });
});
