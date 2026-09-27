/**
 * POLARIS Nav-OS — Counterfactual Episode Engine (Phase 6B)
 *
 * Runs isolated, non-mutating counterfactual branch simulations across candidate actions
 * and evidence perturbation sweeps to evaluate episode-level decision robustness,
 * decision margins, explanation consistency, and decision stability.
 *
 * INVARIANT: Counterfactual execution operates in completely isolated state and NEVER:
 * - directly writes rudder to live ship
 * - mutates live ControlAuthority or live DecisionEngine state
 * - alters live sensor observations
 */

import { Ship } from './ship.js';
import { VesselManeuveringEngine } from '../ai/VesselManeuveringEngine.js';
import { ContinuousCollisionValidator } from '../ai/continuousCollisionValidator.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';
import { spatiotemporalRiskOccupancy } from '../data/SpatiotemporalRiskOccupancy.js';
import { DecisionEngine, ACTION_CLASS, ENCOUNTER_TYPE } from '../ai/decisionEngine.js';
import { SeededRandom } from '../utils/seededRandom.js';

export const DECISION_MARGIN_CLASS = Object.freeze({
  ROBUST_DECISION: 'ROBUST_DECISION',
  MODERATELY_SENSITIVE: 'MODERATELY_SENSITIVE',
  HIGHLY_SENSITIVE: 'HIGHLY_SENSITIVE',
  INDETERMINATE: 'INDETERMINATE'
});

export const EPISODE_OUTCOME = Object.freeze({
  SAFE_COMPLETED: 'SAFE_COMPLETED',
  SAFE_ABORTED: 'SAFE_ABORTED',
  EMERGENCY_AVOIDANCE: 'EMERGENCY_AVOIDANCE',
  COLLISION_RISK_UNRESOLVED: 'COLLISION_RISK_UNRESOLVED',
  GROUNDING_RISK_UNRESOLVED: 'GROUNDING_RISK_UNRESOLVED',
  VALIDATOR_REJECTION: 'VALIDATOR_REJECTION',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
});

export class CounterfactualEpisodeEngine {
  constructor(options = {}) {
    this.maneuveringEngine = new VesselManeuveringEngine();
    this.collisionValidator = new ContinuousCollisionValidator();
    this.isolatedDecisionEngine = new DecisionEngine();
  }

  /**
   * STEP 3 — Action Branching Simulation
   * Simulates candidate action branches in isolated state for a fixed horizon.
   */
  simulateActionBranches(initialOwnShip, initialTargets = [], options = {}) {
    const horizonSec = options.horizonSec || 60.0;
    const dt = options.dt || 1.0;
    const steps = Math.floor(horizonSec / dt);

    const actionClasses = [
      ACTION_CLASS.MAINTAIN_COURSE_AND_SPEED,
      ACTION_CLASS.STARBOARD_ALTERATION_SMALL,
      ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM,
      ACTION_CLASS.STARBOARD_ALTERATION_LARGE,
      ACTION_CLASS.PORT_ALTERATION_SMALL,
      ACTION_CLASS.PORT_ALTERATION_MEDIUM,
      ACTION_CLASS.REDUCE_SPEED_MODERATE,
      ACTION_CLASS.EMERGENCY_AVOIDANCE
    ];

    const branchResults = [];

    for (const actionClass of actionClasses) {
      // 1. Create isolated ship copy
      const simShip = new Ship({
        x: initialOwnShip.x,
        y: initialOwnShip.y,
        heading: initialOwnShip.heading || 0
      });
      simShip.speed = initialOwnShip.speed || 15.0;
      simShip.vx = initialOwnShip.vx || 0;
      simShip.vy = initialOwnShip.vy || -15.0;

      // Determine candidate target heading & speed based on action class
      let targetHeading = initialOwnShip.heading || 0;
      let targetSpeed = initialOwnShip.speed || 15.0;

      if (actionClass === ACTION_CLASS.STARBOARD_ALTERATION_SMALL) targetHeading = (targetHeading + 15) % 360;
      if (actionClass === ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM) targetHeading = (targetHeading + 30) % 360;
      if (actionClass === ACTION_CLASS.STARBOARD_ALTERATION_LARGE) targetHeading = (targetHeading + 45) % 360;
      if (actionClass === ACTION_CLASS.PORT_ALTERATION_SMALL) targetHeading = (targetHeading - 15 + 360) % 360;
      if (actionClass === ACTION_CLASS.PORT_ALTERATION_MEDIUM) targetHeading = (targetHeading - 30 + 360) % 360;
      if (actionClass === ACTION_CLASS.REDUCE_SPEED_MODERATE) targetSpeed = Math.max(5.0, targetSpeed * 0.7);
      if (actionClass === ACTION_CLASS.EMERGENCY_AVOIDANCE) {
        targetHeading = (targetHeading + 45) % 360;
        targetSpeed = 5.0;
      }

      // Create isolated targets copy
      const simTargets = initialTargets.map(t => ({
        ...t,
        x: t.x,
        y: t.y,
        vx: t.vx || 0,
        vy: t.vy || 0,
        collisionRadius: t.collisionRadius || 20.0
      }));

      let minPhysicalClearance = Infinity;
      let minCpa = Infinity;
      let groundingDetected = false;
      let validatorPassed = true;
      let totalDeviation = 0;

      // Simulate isolated step loop
      for (let s = 0; s < steps; s++) {
        // Simple kinematic update for targets
        for (const t of simTargets) {
          t.x += (t.vx || 0) * dt;
          t.y += (t.vy || 0) * dt;
        }

        // Steer isolated ship toward target heading
        const headingDiff = (targetHeading - simShip.heading + 540) % 360 - 180;
        simShip.rudder = Math.max(-35, Math.min(35, headingDiff * 2.0));
        simShip.desiredThrottle = (targetSpeed / (initialOwnShip.maxSpeed || 20.0)) * 100;

        const dummyVectorField = { stormMode: false, getVelocityAt: () => ({ u: 0, v: 0 }) };
        simShip.update(dt, dummyVectorField, s * dt / 3600, { vessel: { maxSpeed: 20 }, environment: { stormMode: false } }, simTargets);

        // Evaluate clearance & CPA
        for (const t of simTargets) {
          const dist = Math.hypot(simShip.x - t.x, simShip.y - t.y);
          const physClearance = dist - (simShip.collisionRadius || 15) - (t.collisionRadius || 20);
          if (physClearance < minPhysicalClearance) minPhysicalClearance = physClearance;
          if (dist < minCpa) minCpa = dist;
        }

        // Evaluate bathymetry clearance
        const depthM = bathymetryProvider.getDepthAt(simShip.x, simShip.y);
        const depthClass = bathymetryProvider.classifyDepth(depthM, options.vesselDraft || 10.0, 3.0);
        if (depthClass === 'GROUNDING_RISK') {
          groundingDetected = true;
          validatorPassed = false;
        }

        if (minPhysicalClearance <= 0) {
          validatorPassed = false;
        }
      }

      branchResults.push({
        actionClass,
        initialHeading: initialOwnShip.heading || 0,
        targetHeading,
        targetSpeed,
        minimumCPA: parseFloat(minCpa.toFixed(1)),
        minimumClearance: parseFloat(minPhysicalClearance.toFixed(1)),
        groundingDetected,
        validatorPassed,
        ruleCompatibility: actionClass.includes('STARBOARD') ? 'RULE_14_15_COMPATIBLE' : (actionClass.includes('PORT') ? 'DISCOURAGED_PORT_TURN' : 'NEUTRAL')
      });
    }

    return branchResults;
  }

  /**
   * STEP 4 — Deterministic Evidence Perturbation Experiment
   */
  evaluatePerturbationRobustness(initialOwnShip, initialTargets = [], seed = 42, numPerturbations = 50) {
    const rng = new SeededRandom(seed);
    const actionCounts = {};
    let validatorPasses = 0;

    for (let i = 0; i < numPerturbations; i++) {
      // Perturb target position within +/- 15m and velocity within +/- 1.0 m/s
      const perturbedTargets = initialTargets.map(t => ({
        ...t,
        x: t.x + (rng.next() * 30.0 - 15.0),
        y: t.y + (rng.next() * 30.0 - 15.0),
        vx: (t.vx || 0) + (rng.next() * 2.0 - 1.0),
        vy: (t.vy || 0) + (rng.next() * 2.0 - 1.0)
      }));

      const decResult = this.isolatedDecisionEngine.evaluateDecisionState({
        ownShip: initialOwnShip,
        targets: perturbedTargets,
        worldTime: Date.now() + i * 10
      });

      const chosenAction = decResult.selectedAction.actionClass;
      actionCounts[chosenAction] = (actionCounts[chosenAction] || 0) + 1;

      if (decResult.selectedAction.accepted) {
        validatorPasses++;
      }
    }

    // Determine dominating action ratio
    let topAction = null;
    let maxCount = 0;
    for (const [act, count] of Object.entries(actionCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topAction = act;
      }
    }

    const dominanceRatio = maxCount / numPerturbations;

    return {
      totalPerturbations: numPerturbations,
      actionDistribution: actionCounts,
      dominanceRatio: parseFloat(dominanceRatio.toFixed(2)),
      validatorPassRate: parseFloat((validatorPasses / numPerturbations).toFixed(2)),
      topAction
    };
  }

  /**
   * STEP 5 — Decision Margin Calculation
   */
  calculateDecisionMargin(branchResults = []) {
    const safeBranches = branchResults.filter(b => b.validatorPassed);
    if (safeBranches.length === 0) {
      return {
        marginClass: DECISION_MARGIN_CLASS.INDETERMINATE,
        safetyMarginMeters: 0,
        explanation: 'All candidate action branches resulted in collision or grounding rejection.'
      };
    }

    safeBranches.sort((a, b) => b.minimumClearance - a.minimumClearance);
    const bestClearance = safeBranches[0].minimumClearance;
    const secondClearance = safeBranches.length > 1 ? safeBranches[1].minimumClearance : 0;
    const safetyMarginMeters = parseFloat((bestClearance - secondClearance).toFixed(1));

    let marginClass = DECISION_MARGIN_CLASS.ROBUST_DECISION;
    if (safetyMarginMeters < 10.0) {
      marginClass = DECISION_MARGIN_CLASS.HIGHLY_SENSITIVE;
    } else if (safetyMarginMeters < 30.0) {
      marginClass = DECISION_MARGIN_CLASS.MODERATELY_SENSITIVE;
    }

    return {
      marginClass,
      bestAction: safeBranches[0].actionClass,
      bestClearance,
      secondClearance,
      safetyMarginMeters
    };
  }

  /**
   * STEP 11 — Explanation Consistency Validator
   */
  validateExplanationConsistency(decisionRecord = {}, branchResults = []) {
    if (!decisionRecord || !decisionRecord.selectedAction) {
      return { isConsistent: false, reason: 'MISSING_DECISION_RECORD' };
    }

    const selectedActionClass = decisionRecord.selectedAction.actionClass;
    const selectedBranch = branchResults.find(b => b.actionClass === selectedActionClass);

    // Rule: Selected action must not be validator-rejected if explanation claims PASS
    if (decisionRecord.structuredExplanation && decisionRecord.structuredExplanation.safetyGate?.continuousCollisionValidatorPassed) {
      if (selectedBranch && !selectedBranch.validatorPassed) {
        return {
          isConsistent: false,
          reason: `INCONSISTENCY_DETECTED: Explanation claims validator PASS but counterfactual branch for ${selectedActionClass} failed safety validation.`
        };
      }
    }

    // Rule: Discouraged PORT turn in head-on must contain explicit COLREG warning/rejection in explanation
    if (selectedActionClass.includes('PORT') && decisionRecord.primaryEncounter?.type === ENCOUNTER_TYPE.HEAD_ON) {
      const summary = decisionRecord.structuredExplanation?.summaryText || '';
      if (!summary.includes('Rule') && !summary.includes('discourage')) {
        return {
          isConsistent: false,
          reason: `INCONSISTENCY_DETECTED: Selected action is PORT turn in HEAD_ON encounter without COLREG disclaimer.`
        };
      }
    }

    return { isConsistent: true, reason: null };
  }
}

export const counterfactualEpisodeEngine = new CounterfactualEpisodeEngine();
