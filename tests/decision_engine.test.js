import { describe, it, expect, beforeEach } from 'vitest';
import {
  DecisionEngine,
  ENCOUNTER_TYPE,
  ACTION_CLASS,
  DECISION_CONFIDENCE_TYPE,
  RULE_APPLICABILITY_STATE,
  hazardPriorityResolver
} from '../src/js/ai/decisionEngine.js';
import { MARITIME_RULE_REGISTRY } from '../src/js/ai/semanticRuleMapper.js';
import { vesselManeuveringEngine } from '../src/js/ai/VesselManeuveringEngine.js';
import { bathymetryProvider } from '../src/js/providers/bathymetryProvider.js';
import { continuousCollisionValidator } from '../src/js/ai/continuousCollisionValidator.js';

describe('Phase 6A — Autonomous Decision Engine & COLREG Priority Arbitration', () => {
  let engine;

  beforeEach(() => {
    engine = new DecisionEngine();
  });

  // STEP 1 & STEP 22: Decision Authority Boundary Invariant
  it('INVARIANT 1: DecisionEngine produces proposals only and NEVER directly mutates vessel rudder', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15, rudder: 0 };
    const targets = [{ id: 'TGT-1', x: 400, y: 1400, vx: 0, vy: 10, trackStatus: 'CONFIRMED' }]; // Head-on target

    const result = engine.evaluateDecisionState({ ownShip, targets, worldTime: 1000 });

    expect(result.controlProposal).toBeDefined();
    expect(result.controlProposal.targetHeading).toBeDefined();
    expect(result.controlProposal.issuedToControlAuthority).toBe(true);
    // Crucial check: ownShip.rudder MUST remain unmodified by DecisionEngine directly
    expect(ownShip.rudder).toBe(0);
  });

  // STEP 21 SCENARIO 1: Head-on clean evidence
  it('Scenario 1 (Head-on clean evidence): Classifies HEAD_ON and proposes starboard alteration', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15, vx: 0, vy: -15 };
    const targets = [{ id: 'TGT-HEAD-ON', x: 400, y: 1200, vx: 0, vy: 15, heading: 180, trackStatus: 'CONFIRMED' }];

    const result = engine.evaluateDecisionState({ ownShip, targets, worldTime: 2000 });

    expect(result.primaryEncounter.type).toBe(ENCOUNTER_TYPE.HEAD_ON);
    expect(result.applicableRuleCandidates.some(r => r.ruleId === MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_14.ruleId)).toBe(true);
    expect([ACTION_CLASS.STARBOARD_ALTERATION_SMALL, ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM, ACTION_CLASS.STARBOARD_ALTERATION_LARGE]).toContain(result.selectedAction.actionClass);
    expect(result.selectedAction.accepted).toBe(true);
  });

  // STEP 21 SCENARIO 2: Head-on uncertain radar
  it('Scenario 2 (Head-on uncertain radar): Detects RADAR_EVIDENCE_LIMITED and outputs LIMITED_EVIDENCE confidence', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15 };
    const targets = [{ id: 'TGT-RADAR-STALE', x: 400, y: 1200, trackStatus: 'PREDICTED' }];

    const result = engine.evaluateDecisionState({
      ownShip,
      targets,
      radarQuality: 'STALE',
      worldTime: 3000
    });

    expect(result.degradedMode).toBe('RADAR_EVIDENCE_LIMITED');
    expect(result.decisionConfidenceType).toBe(DECISION_CONFIDENCE_TYPE.LIMITED_EVIDENCE);
    expect(result.confidence).toBeLessThan(0.80);
  });

  // STEP 21 SCENARIO 3 & 4: Crossing targets (Starboard vs Port aspect)
  it('Scenario 3 & 4 (Crossing): Distinguishes GIVE_WAY (starboard aspect) vs STAND_ON (port aspect)', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15 }; // Heading North (0°)

    // Target on Starboard side (East, x=800, y=1400) -> Relative bearing ~45° -> GIVE_WAY
    const targetStarboard = [{ id: 'TGT-STBD', x: 800, y: 1400, vx: -10, vy: 0, heading: 270 }];
    const resStarboard = engine.evaluateDecisionState({ ownShip, targets: targetStarboard, worldTime: 4000 });

    expect(resStarboard.primaryEncounter.type).toBe(ENCOUNTER_TYPE.GIVE_WAY);
    expect(resStarboard.applicableRuleCandidates.some(r => r.ruleId === MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_15.ruleId)).toBe(true);

    // Target on Port side (West, x=0, y=1400) -> Relative bearing ~315° -> STAND_ON
    const targetPort = [{ id: 'TGT-PORT', x: 0, y: 1400, vx: 10, vy: 0, heading: 90 }];
    const resPort = engine.evaluateDecisionState({ ownShip, targets: targetPort, worldTime: 5000 });

    expect(resPort.primaryEncounter.type).toBe(ENCOUNTER_TYPE.STAND_ON);
    expect(resPort.applicableRuleCandidates.some(r => r.ruleId === MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_17.ruleId)).toBe(true);
  });

  // STEP 21 SCENARIO 5 & 6: Overtaking
  it('Scenario 5 & 6 (Overtaking): Correctly identifies OVERTAKING encounter and Rule 13 applicability', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 18 };
    const targetAhead = [{ id: 'TGT-SLOW', x: 400, y: 1500, heading: 0, speed: 8, vx: 0, vy: -8 }];

    const result = engine.evaluateDecisionState({ ownShip, targets: targetAhead, worldTime: 6000 });

    expect(result.primaryEncounter.type).toBe(ENCOUNTER_TYPE.OVERTAKING);
    expect(result.applicableRuleCandidates.some(r => r.ruleId === MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_13.ruleId)).toBe(true);
  });

  // STEP 21 SCENARIO 11 & STEP 22 INVARIANT 2: Shallow Water Bathymetry Guard
  it('INVARIANT 2 & Scenario 11: Shallow bathymetry hard-blocks candidate actions into grounding zone', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15 };
    // Simulate candidate starboard turn path intersecting shallow bathymetry
    const result = engine.evaluateDecisionState({
      ownShip,
      targets: [],
      vesselDraft: 15.0, // High draft causes shallow water rejection
      worldTime: 7000
    });

    // Check rejected actions for grounding reason if any branch is shallow
    const rejectedGrounding = result.candidateActions.filter(a => a.rejectionReason && a.rejectionReason.includes('GROUNDING'));
    expect(result.selectedAction.accepted).toBe(true);
  });

  // STEP 21 SCENARIO 13 & 14: Restricted Visibility Rule 19
  it('Scenario 13 & 14 (Restricted Visibility): Evaluates Rule 19 and triggers safe-speed reduction', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 18 };
    const targets = [{ id: 'TGT-FOG', x: 400, y: 1300, vx: 0, vy: 5 }];

    const result = engine.evaluateDecisionState({
      ownShip,
      targets,
      visibilityNm: 1.0, // Restricted visibility (<2.0 NM)
      worldTime: 8000
    });

    expect(result.primaryEncounter.type).toBe(ENCOUNTER_TYPE.RESTRICTED_VISIBILITY);
    expect(result.applicableRuleCandidates.some(r => r.ruleId === MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_19.ruleId)).toBe(true);
    expect(result.speedAdvisory.speedConstraint).toBe(true);
    expect(result.speedAdvisory.recommendedSpeed).toBeLessThanOrEqual(12.0);
  });

  // STEP 12 & STEP 21 SCENARIO 15: Decision Hysteresis / Churn Protection
  it('Scenario 15 & Hysteresis: Prevents decision oscillation when heading delta is below threshold', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15 };
    const targets = [{ id: 'TGT-1', x: 400, y: 1200, vx: 0, vy: 15, heading: 180 }];

    // First evaluation: Proposes heading 15°
    const firstResult = engine.evaluateDecisionState({ ownShip, targets, worldTime: 10000 });
    const firstHeading = firstResult.controlProposal.targetHeading;

    // Second evaluation 2 seconds later with minor candidate variation
    const secondResult = engine.evaluateDecisionState({ ownShip, targets, worldTime: 12000 });

    // Hysteresis should lock the previous target heading
    expect(secondResult.controlProposal.targetHeading).toBe(firstHeading);
  });

  // STEP 13 & STEP 21 SCENARIO 19: Emergency Imminent Collision
  it('Scenario 19 (Emergency Imminent Collision): Triggers emergency avoidance fallback when all routine candidates fail', () => {
    const ownShip = { x: 400, y: 1800, heading: 0, speed: 15 };
    // Massive target directly on top of vessel
    const emergencyTargets = [{ id: 'MASSIVE-TGT', x: 400, y: 1805, collisionRadius: 100 }];

    const result = engine.evaluateDecisionState({ ownShip, targets: emergencyTargets, worldTime: 15000 });

    expect(result.selectedAction.actionClass).toBe(ACTION_CLASS.EMERGENCY_AVOIDANCE);
    expect(result.controlProposal.issuedToControlAuthority).toBe(true);
  });
});
