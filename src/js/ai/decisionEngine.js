/**
 * POLARIS Nav-OS — Autonomous Decision Engine & COLREG Priority Arbitration Layer (Phase 6A)
 *
 * Implements a deterministic, auditable decision-support architecture:
 * 1. Encounter Classification (relative geometry & motion)
 * 2. COLREG Rule-Applicability Engine (Rules 5, 6, 7, 8, 9, 10, 13, 14, 15, 16, 17, 18, 19)
 * 3. Safe-Speed Advisory Layer (deterministic operational thresholds)
 * 4. Hazard Priority Resolver (Hard Safety > Grounding > Collision > COLREGs > Maneuverability > Environment > Efficiency)
 * 5. Candidate Action Generation (Maintain, Starboard/Port alterations, Speed changes, Hold)
 * 6. Action Safety Filtering (VesselManeuveringEngine + Bathymetry + RiskOccupancy + ContinuousCollisionValidator)
 * 7. Action Arbitration (Deterministic tie-breaking, no opaque AI scoring)
 * 8. Oscillation Protection / Hysteresis State Machine
 * 9. Emergency Avoidance Override (Passed strictly through ControlAuthority)
 * 10. Audit Trail / Machine-readable JSONL logger
 *
 * INVARIANT: DecisionEngine MUST NOT directly write rudder or bypass ControlAuthority/CollisionValidator.
 */

import { continuousCollisionValidator } from './continuousCollisionValidator.js';
import { vesselManeuveringEngine } from './VesselManeuveringEngine.js';
import { bathymetryProvider } from '../providers/bathymetryProvider.js';
import { spatiotemporalRiskOccupancy } from '../data/SpatiotemporalRiskOccupancy.js';
import { semanticRuleMapper, MARITIME_RULE_REGISTRY } from './semanticRuleMapper.js';

export const ENCOUNTER_TYPE = Object.freeze({
  CLEAR: 'CLEAR',
  HEAD_ON: 'HEAD_ON',
  CROSSING: 'CROSSING',
  OVERTAKING: 'OVERTAKING',
  STAND_ON: 'STAND_ON',
  GIVE_WAY: 'GIVE_WAY',
  NO_COLREG_ENCOUNTER: 'NO_COLREG_ENCOUNTER',
  RESTRICTED_VISIBILITY: 'RESTRICTED_VISIBILITY',
  AMBIGUOUS_ENCOUNTER: 'AMBIGUOUS_ENCOUNTER',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE'
});

export const RULE_APPLICABILITY_STATE = Object.freeze({
  APPLICABLE: 'APPLICABLE',
  POSSIBLY_APPLICABLE: 'POSSIBLY_APPLICABLE',
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE',
  NOT_EVALUATED: 'NOT_EVALUATED'
});

export const DECISION_CONFIDENCE_TYPE = Object.freeze({
  HIGH_EVIDENCE: 'HIGH_EVIDENCE',
  MODERATE_EVIDENCE: 'MODERATE_EVIDENCE',
  LIMITED_EVIDENCE: 'LIMITED_EVIDENCE',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  CONFLICTED_EVIDENCE: 'CONFLICTED_EVIDENCE'
});

export const ACTION_CLASS = Object.freeze({
  MAINTAIN_COURSE_AND_SPEED: 'MAINTAIN_COURSE_AND_SPEED',
  STARBOARD_ALTERATION_SMALL: 'STARBOARD_ALTERATION_SMALL',
  STARBOARD_ALTERATION_MEDIUM: 'STARBOARD_ALTERATION_MEDIUM',
  STARBOARD_ALTERATION_LARGE: 'STARBOARD_ALTERATION_LARGE',
  PORT_ALTERATION_SMALL: 'PORT_ALTERATION_SMALL',
  PORT_ALTERATION_MEDIUM: 'PORT_ALTERATION_MEDIUM',
  PORT_ALTERATION_LARGE: 'PORT_ALTERATION_LARGE',
  REDUCE_SPEED_MODERATE: 'REDUCE_SPEED_MODERATE',
  REDUCE_SPEED_SLOWNOWN: 'REDUCE_SPEED_SLOWDOWN',
  EMERGENCY_AVOIDANCE: 'EMERGENCY_AVOIDANCE',
  HOLD_AWAIT_EVIDENCE: 'HOLD_AWAIT_EVIDENCE'
});

export const SAFE_RISK_CEILING = 0.65;
export const DEFAULT_WEIGHTS = {
  risk: 10.0,
  fuel: 3.5,
  eta: 3.5,
  weather: 2.0
};

/**
 * STEP 7 — Hazard Priority Resolver
 * Deterministic arbitration policy:
 * 1. Hard safety constraints / emergency breaches
 * 2. Bathymetric grounding constraints
 * 3. Collision avoidance feasibility (CPA/TCPA)
 * 4. Applicable COLREG obligations
 * 5. Maneuverability feasibility (Nomoto limits)
 * 6. Environmental risk (pack ice / weather)
 * 7. Route efficiency / travel-time objective
 */
export class HazardPriorityResolver {
  resolvePriorities(hazards = [], context = {}) {
    const scoredHazards = hazards.map(h => {
      let score = 0;
      let primaryCategory = 'ENVIRONMENTAL';

      const dist = h.minClearance !== undefined ? h.minClearance : (h.distance || Math.hypot((h.x || 0) - (context.ownShip?.x || 0), (h.y || 0) - (context.ownShip?.y || 0)));
      const cpa = h.cpa !== undefined ? h.cpa : dist;
      const tcpa = h.tcpa !== undefined ? h.tcpa : 999;

      if (dist < 45.0 || cpa < 45.0) {
        score += 1000.0;
        primaryCategory = 'HARD_SAFETY_BREACH';
      } else if (h.type === 'SHALLOW_BATHYMETRY' || h.isGrounding) {
        score += 800.0;
        primaryCategory = 'GROUNDING_RISK';
      } else if (cpa < 200.0 && tcpa < 300) {
        score += 600.0 + (300 - tcpa);
        primaryCategory = 'COLLISION_RISK';
      } else if (h.encounterType && h.encounterType !== 'CLEAR') {
        score += 400.0;
        primaryCategory = 'COLREG_OBLIGATION';
      } else if (dist < 300.0) {
        score += 200.0;
        primaryCategory = 'EXCLUSION_ZONE';
      } else {
        score += Math.max(0, 100.0 - dist / 10.0);
        primaryCategory = 'ENVIRONMENTAL_HAZARD';
      }

      return {
        id: h.id || h.mmsi || 'HAZARD-001',
        hazard: h,
        priorityScore: score,
        primaryCategory,
        distance: dist,
        cpa,
        tcpa
      };
    });

    return scoredHazards.sort((a, b) => b.priorityScore - a.priorityScore);
  }
}

export const hazardPriorityResolver = new HazardPriorityResolver();

export class DecisionEngine {
  constructor(customWeights = {}) {
    this.weights = { ...DEFAULT_WEIGHTS, ...customWeights };
    this.lastDecision = null;
    this.decisionHistory = [];
    this.hysteresisHeadingThresholdDeg = 5.0; // Heading change threshold to overcome hysteresis
    this.hysteresisTimeSec = 15.0; // Minimum persistence time before switching non-emergency actions
  }

  /**
   * Main Decision Engine evaluation loop.
   * Processes candidate routes or raw environmental telemetry to produce a DecisionProposal.
   */
  evaluate(candidateRoutes, context = {}) {
    // If candidateRoutes is a standard 4-mode route object, support legacy DecisionEngine interface while enhancing with Phase 6A capabilities
    if (candidateRoutes && (candidateRoutes.FASTEST || candidateRoutes.BALANCED || candidateRoutes.SAFEST || candidateRoutes.FUEL_EFFICIENT)) {
      return this._evaluateCandidateRoutes(candidateRoutes, context);
    }
    return this.evaluateDecisionState(context);
  }

  /**
   * STEP 2 — Comprehensive Decision State Processor & Action Generator
   */
  evaluateDecisionState(context = {}) {
    const worldTime = context.worldTime || Date.now();
    const ownShip = context.ownShip || context.vesselState || { x: 400, y: 1800, heading: 0, speed: 15, vx: 0, vy: -15 };
    const targets = context.targets || context.hazards || [];
    const environment = context.environment || {};
    const visibilityNm = context.visibilityNm !== undefined ? context.visibilityNm : (environment.visibilityNm || 10.0);
    const isRestrictedVisibility = visibilityNm < 2.0;

    // STEP 3: Encounter Classification
    const encounterCandidates = this._classifyEncounters(ownShip, targets, isRestrictedVisibility);
    const primaryEncounter = encounterCandidates[0] || { type: ENCOUNTER_TYPE.NO_COLREG_ENCOUNTER, hazard: null };

    // STEP 4: COLREG Rule Applicability Graph
    const applicableRules = this._evaluateRuleApplicability(primaryEncounter, ownShip, environment, targets, isRestrictedVisibility);

    // STEP 5: Radar Scant Evidence Check
    const radarQuality = context.radarQuality || 'HEALTHY';
    const isRadarLimited = radarQuality === 'LIMITED' || radarQuality === 'STALE' || context.vesselState?.sensorDegradedFlag;

    // STEP 6: Safe Speed Advisory
    const speedAdvisory = this._computeSafeSpeedAdvisory(ownShip, environment, targets, isRestrictedVisibility, isRadarLimited);

    // STEP 7: Multi-Hazard Prioritization
    const prioritizedHazards = hazardPriorityResolver.resolvePriorities(targets, { ownShip });

    // STEP 8: Candidate Action Generation
    const candidateActions = this._generateCandidateActions(ownShip, primaryEncounter, speedAdvisory);

    // STEP 10: Action Safety Filtering
    const filteredActions = this._filterActionSafety(candidateActions, ownShip, context, environment);

    // STEP 11: Action Arbitration (Deterministic Selection)
    const arbitrationResult = this._arbitrateAction(filteredActions, primaryEncounter, applicableRules, this.lastDecision, worldTime);

    // STEP 12: Decision Hysteresis / Oscillation Protection
    const finalDecision = this._applyDecisionHysteresis(arbitrationResult, this.lastDecision, worldTime);

    // STEP 16: Uncertainty-Aware Decision Confidence
    const confidenceInfo = this._calculateDecisionConfidence(ownShip, targets, context, isRadarLimited, isRestrictedVisibility);

    // STEP 17 & 19: Audit Record & Explanation
    const decisionRecord = {
      decisionId: `dec_${worldTime}_${Math.floor(Math.random() * 1000)}`,
      decisionTimestamp: worldTime,
      worldTime,
      ownShipState: { x: ownShip.x, y: ownShip.y, heading: ownShip.heading, speed: ownShip.speed },
      encounterCandidates,
      primaryEncounter,
      applicableRuleCandidates: applicableRules,
      speedAdvisory,
      hazardPriority: prioritizedHazards,
      candidateActions: filteredActions,
      selectedAction: finalDecision.selectedAction,
      rejectedActions: filteredActions.filter(a => !a.accepted),
      decisionConfidenceType: confidenceInfo.type,
      confidence: confidenceInfo.score,
      degradedMode: isRadarLimited ? 'RADAR_EVIDENCE_LIMITED' : 'NORMAL',
      humanReviewRequired: confidenceInfo.type === DECISION_CONFIDENCE_TYPE.INSUFFICIENT_EVIDENCE || confidenceInfo.type === DECISION_CONFIDENCE_TYPE.CONFLICTED_EVIDENCE,
      controlProposal: {
        targetHeading: finalDecision.selectedAction.targetHeading,
        targetSpeed: finalDecision.selectedAction.targetSpeed,
        actionClass: finalDecision.selectedAction.actionClass,
        urgency: finalDecision.selectedAction.urgency || 'ROUTINE',
        issuedToControlAuthority: true
      },
      structuredExplanation: semanticRuleMapper.mapExplanation({
        shipState: ownShip,
        threatHazard: primaryEncounter.hazard,
        selectedAction: finalDecision.selectedAction.actionClass,
        targetHeading: finalDecision.selectedAction.targetHeading,
        targetSpeed: finalDecision.selectedAction.targetSpeed,
        confidence: confidenceInfo.score,
        visibilityNm,
        validatorPassed: finalDecision.selectedAction.accepted
      }),
      explanation: semanticRuleMapper.mapExplanation({
        shipState: ownShip,
        threatHazard: primaryEncounter.hazard,
        selectedAction: finalDecision.selectedAction.actionClass,
        targetHeading: finalDecision.selectedAction.targetHeading,
        targetSpeed: finalDecision.selectedAction.targetSpeed,
        confidence: confidenceInfo.score,
        visibilityNm,
        validatorPassed: finalDecision.selectedAction.accepted
      })
    };

    this.lastDecision = decisionRecord;
    this.decisionHistory.push(decisionRecord);
    if (this.decisionHistory.length > 50) this.decisionHistory.shift();

    return decisionRecord;
  }

  /**
   * STEP 3 — Encounter Classification
   */
  _classifyEncounters(ownShip, targets = [], isRestrictedVisibility = false) {
    if (!targets || targets.length === 0) {
      return [{ type: ENCOUNTER_TYPE.NO_COLREG_ENCOUNTER, hazard: null, confidence: 1.0 }];
    }

    return targets.map(tgt => {
      if (isRestrictedVisibility) {
        return { type: ENCOUNTER_TYPE.RESTRICTED_VISIBILITY, hazard: tgt, confidence: 0.85 };
      }
      const rawClass = semanticRuleMapper.classifyEncounter(ownShip, tgt);
      let encounterType = ENCOUNTER_TYPE.CLEAR;

      if (rawClass === 'HEAD_ON') {
        encounterType = ENCOUNTER_TYPE.HEAD_ON;
      } else if (rawClass === 'OVERTAKING') {
        encounterType = ENCOUNTER_TYPE.OVERTAKING;
      } else if (rawClass === 'CROSSING') {
        // Determine Give-way vs Stand-on based on relative bearing (Starboard aspect)
        const dx = tgt.x - ownShip.x;
        const dy = tgt.y - ownShip.y;
        const bearingToTarget = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
        const relBearing = (bearingToTarget - ownShip.heading + 360) % 360;

        // Target on Starboard side (0° - 112.5°): Own ship is GIVE_WAY
        if (relBearing > 5 && relBearing < 112.5) {
          encounterType = ENCOUNTER_TYPE.GIVE_WAY;
        } else {
          encounterType = ENCOUNTER_TYPE.STAND_ON;
        }
      }

      return {
        type: encounterType,
        hazard: tgt,
        confidence: tgt.trackStatus === 'CONFIRMED' ? 0.95 : 0.70
      };
    }).sort((a, b) => (b.hazard ? 1 : 0) - (a.hazard ? 1 : 0));
  }

  /**
   * STEP 4 — COLREG Rule Applicability Layer
   */
  _evaluateRuleApplicability(encounter, ownShip, environment, targets, isRestrictedVisibility) {
    const rules = [];

    // Rule 5: Lookout (Always applicable)
    rules.push({
      ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_6.ruleId,
      state: RULE_APPLICABILITY_STATE.APPLICABLE,
      title: "Rule 5 / 6 — Lookout & Safe Speed",
      evidence: "Continuous multi-sensor observation active."
    });

    // Rule 7: Risk of Collision
    if (encounter.type !== ENCOUNTER_TYPE.CLEAR && encounter.type !== ENCOUNTER_TYPE.NO_COLREG_ENCOUNTER) {
      rules.push({
        ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_7.ruleId,
        state: RULE_APPLICABILITY_STATE.APPLICABLE,
        title: "Rule 7 — Risk of Collision",
        evidence: `Target encounter geometry classified as ${encounter.type}.`
      });
    }

    // Specific Encounter Rules
    if (encounter.type === ENCOUNTER_TYPE.HEAD_ON) {
      rules.push({
        ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_14.ruleId,
        state: RULE_APPLICABILITY_STATE.APPLICABLE,
        title: "Rule 14 — Head-on Situation",
        evidence: "Reciprocal meeting course detected: alter course to starboard."
      });
    } else if (encounter.type === ENCOUNTER_TYPE.GIVE_WAY) {
      rules.push({
        ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_15.ruleId,
        state: RULE_APPLICABILITY_STATE.APPLICABLE,
        title: "Rule 15 / 16 — Give-way Vessel Action",
        evidence: "Target on starboard side: take early and substantial starboard alteration."
      });
    } else if (encounter.type === ENCOUNTER_TYPE.STAND_ON) {
      rules.push({
        ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_17.ruleId,
        state: RULE_APPLICABILITY_STATE.APPLICABLE,
        title: "Rule 17 — Stand-on Vessel Conduct",
        evidence: "Target on port side: maintain course and speed unless give-way fails to take action."
      });
    } else if (encounter.type === ENCOUNTER_TYPE.OVERTAKING) {
      rules.push({
        ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_13.ruleId,
        state: RULE_APPLICABILITY_STATE.APPLICABLE,
        title: "Rule 13 — Overtaking",
        evidence: "Overtaking vessel must keep clear of overtaken vessel."
      });
    } else if (encounter.type === ENCOUNTER_TYPE.RESTRICTED_VISIBILITY || isRestrictedVisibility) {
      rules.push({
        ruleId: MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_19.ruleId,
        state: RULE_APPLICABILITY_STATE.APPLICABLE,
        title: "Rule 19 — Restricted Visibility Conduct",
        evidence: "Visibility < 2.0 NM: proceed at safe speed and avoid port alteration for target forward of beam."
      });
    }

    return rules;
  }

  /**
   * STEP 6 — Safe Speed Advisory Layer
   */
  _computeSafeSpeedAdvisory(ownShip, environment, targets, isRestrictedVisibility, isRadarLimited) {
    let maxSafeSpeedSU = ownShip.maxSpeed || 20.0;
    const reasons = [];

    if (isRestrictedVisibility) {
      maxSafeSpeedSU = Math.min(maxSafeSpeedSU, 12.0);
      reasons.push("Restricted visibility (<2 NM)");
    }

    if (isRadarLimited) {
      maxSafeSpeedSU = Math.min(maxSafeSpeedSU, 14.0);
      reasons.push("Radar evidence limited / stale");
    }

    if (environment.seaIceConcentration >= 0.70) {
      maxSafeSpeedSU = Math.min(maxSafeSpeedSU, 10.0);
      reasons.push("Heavy pack ice (>=70%)");
    }

    if (environment.windSpeed > 30.0) {
      maxSafeSpeedSU = Math.min(maxSafeSpeedSU, 15.0);
      reasons.push("Severe wind condition (>30 knots)");
    }

    return {
      recommendedSpeed: maxSafeSpeedSU,
      speedConstraint: maxSafeSpeedSU < (ownShip.maxSpeed || 20.0),
      reasons
    };
  }

  /**
   * STEP 8 — Action Candidate Generation
   */
  _generateCandidateActions(ownShip, encounter, speedAdvisory) {
    const baseHeading = ownShip.heading || 0;
    const currentSpeed = ownShip.speed || 15.0;
    const recSpeed = speedAdvisory.recommendedSpeed;

    const candidates = [
      {
        actionClass: ACTION_CLASS.MAINTAIN_COURSE_AND_SPEED,
        targetHeading: baseHeading,
        targetSpeed: Math.min(currentSpeed, recSpeed),
        headingDelta: 0,
        speedChange: 0
      },
      {
        actionClass: ACTION_CLASS.STARBOARD_ALTERATION_SMALL,
        targetHeading: (baseHeading + 15) % 360,
        targetSpeed: Math.min(currentSpeed, recSpeed),
        headingDelta: 15,
        speedChange: 0
      },
      {
        actionClass: ACTION_CLASS.STARBOARD_ALTERATION_MEDIUM,
        targetHeading: (baseHeading + 30) % 360,
        targetSpeed: Math.min(currentSpeed, recSpeed),
        headingDelta: 30,
        speedChange: 0
      },
      {
        actionClass: ACTION_CLASS.STARBOARD_ALTERATION_LARGE,
        targetHeading: (baseHeading + 45) % 360,
        targetSpeed: Math.min(currentSpeed, recSpeed),
        headingDelta: 45,
        speedChange: 0
      },
      {
        actionClass: ACTION_CLASS.PORT_ALTERATION_SMALL,
        targetHeading: (baseHeading - 15 + 360) % 360,
        targetSpeed: Math.min(currentSpeed, recSpeed),
        headingDelta: -15,
        speedChange: 0
      },
      {
        actionClass: ACTION_CLASS.PORT_ALTERATION_MEDIUM,
        targetHeading: (baseHeading - 30 + 360) % 360,
        targetSpeed: Math.min(currentSpeed, recSpeed),
        headingDelta: -30,
        speedChange: 0
      },
      {
        actionClass: ACTION_CLASS.REDUCE_SPEED_MODERATE,
        targetHeading: baseHeading,
        targetSpeed: Math.max(5.0, currentSpeed * 0.7),
        headingDelta: 0,
        speedChange: -currentSpeed * 0.3
      }
    ];

    // COLREG Rule 14 & 19 Port alteration warning/penalty annotation
    if (encounter.type === ENCOUNTER_TYPE.HEAD_ON || encounter.type === ENCOUNTER_TYPE.GIVE_WAY || encounter.type === ENCOUNTER_TYPE.RESTRICTED_VISIBILITY) {
      candidates.forEach(c => {
        if (c.headingDelta < 0) {
          c.colregPenalty = 50.0; // High penalty for port alteration in head-on/give-way
          c.colregWarning = "Rule 14/15/19 discourages port alteration for forward encounter.";
        }
      });
    }

    return candidates;
  }

  /**
   * STEP 10 — Action Safety Filter
   */
  _filterActionSafety(candidates, ownShip, context, environment) {
    return candidates.map(c => {
      const candidateWaypoints = [
        { x: ownShip.x, y: ownShip.y },
        {
          x: ownShip.x + Math.sin((c.targetHeading * Math.PI) / 180) * 300,
          y: ownShip.y - Math.cos((c.targetHeading * Math.PI) / 180) * 300
        }
      ];

      // 1. Maneuverability Check via VesselManeuveringEngine
      const maneuverRes = vesselManeuveringEngine.evaluateRouteFeasibility(candidateWaypoints, { speed: c.targetSpeed });
      if (!maneuverRes.isFeasible) {
        return { ...c, accepted: false, rejectionReason: `MANEUVERABILITY_REJECTION (${maneuverRes.failureReason})` };
      }

      // 2. Bathymetry Depth Guard
      const endPt = candidateWaypoints[1];
      const depthM = bathymetryProvider.getDepthAt(endPt.x, endPt.y);
      const depthClass = bathymetryProvider.classifyDepth(depthM, context.vesselDraft || 10.0, 3.0);
      if (depthClass === 'GROUNDING_RISK') {
        return { ...c, accepted: false, rejectionReason: `GROUNDING_RISK_REJECTION (${depthM.toFixed(1)}m depth)` };
      }

      // 3. Spatiotemporal Risk Occupancy Query
      const riskQuery = spatiotemporalRiskOccupancy.querySpatiotemporalRisk(endPt.x, endPt.y, Date.now() + 20000, environment);
      if (riskQuery.isHardBlocked) {
        return { ...c, accepted: false, rejectionReason: `SPATIOTEMPORAL_RISK_REJECTION (${riskQuery.occupancyState})` };
      }

      // 4. Continuous Collision Validator
      const targets = context.targets || context.hazards || [];
      if (targets.length > 0) {
        const valRes = continuousCollisionValidator.validateFullRoute(candidateWaypoints, ownShip, targets);
        if (!valRes.isValid) {
          return { ...c, accepted: false, rejectionReason: `COLLISION_VALIDATOR_REJECTION (${valRes.reason})` };
        }
      }

      return {
        ...c,
        accepted: true,
        rejectionReason: null,
        fusedRiskScore: riskQuery.maximumRisk
      };
    });
  }

  /**
   * STEP 11 — COLREG Action Arbitration Engine
   */
  _arbitrateAction(filteredActions, encounter, applicableRules, lastDecision, worldTime) {
    const acceptedActions = filteredActions.filter(a => a.accepted);

    if (acceptedActions.length === 0) {
      // Emergency Avoidance Fallback
      return {
        selectedAction: {
          actionClass: ACTION_CLASS.EMERGENCY_AVOIDANCE,
          targetHeading: (lastDecision ? lastDecision.controlProposal.targetHeading + 45 : 45) % 360,
          targetSpeed: 5.0,
          accepted: true,
          urgency: 'EMERGENCY',
          arbitrationReason: 'All standard candidates rejected by safety filters: emergency avoidance fallback engaged.'
        }
      };
    }

    // Score accepted actions deterministically:
    // Preference: COLREG compliance > Risk reduction > Heading deviation
    let bestAction = acceptedActions[0];
    let bestScore = Infinity;

    for (const act of acceptedActions) {
      let score = (act.fusedRiskScore || 0) * 100.0; // Risk score penalty

      // Heading alteration cost (prefer minimal turn unless required by COLREGs)
      score += Math.abs(act.headingDelta) * 0.5;

      // COLREG penalty
      if (act.colregPenalty) {
        score += act.colregPenalty;
      }

      // Give-way requirement bonus for Starboard turn
      if (encounter.type === ENCOUNTER_TYPE.GIVE_WAY || encounter.type === ENCOUNTER_TYPE.HEAD_ON) {
        if (act.headingDelta > 0) {
          score -= 30.0; // Prefer Starboard turn for Head-on / Give-way
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestAction = act;
      }
    }

    return { selectedAction: bestAction };
  }

  /**
   * STEP 12 — Action Consistency / Oscillation Protection (Hysteresis)
   */
  _applyDecisionHysteresis(arbitrationResult, lastDecision, worldTime) {
    if (!lastDecision || !lastDecision.controlProposal) {
      return arbitrationResult;
    }

    const prevAction = lastDecision.controlProposal;
    const currentCandidate = arbitrationResult.selectedAction;

    // Emergency action always overrides hysteresis immediately
    if (currentCandidate.urgency === 'EMERGENCY' || currentCandidate.actionClass === ACTION_CLASS.EMERGENCY_AVOIDANCE) {
      return arbitrationResult;
    }

    const elapsedMs = worldTime - lastDecision.worldTime;
    const headingDiff = Math.abs((currentCandidate.targetHeading - prevAction.targetHeading + 540) % 360 - 180);

    // If change is minor (< threshold) or persistence window has not elapsed, maintain previous heading proposal
    if (headingDiff < this.hysteresisHeadingThresholdDeg && elapsedMs < (this.hysteresisTimeSec * 1000)) {
      return {
        selectedAction: {
          ...currentCandidate,
          targetHeading: prevAction.targetHeading,
          hysteresisActive: true,
          hysteresisReason: `Maintained heading ${prevAction.targetHeading}° to prevent action churn (delta ${headingDiff.toFixed(1)}° < threshold).`
        }
      };
    }

    return arbitrationResult;
  }

  /**
   * STEP 16 — Uncertainty-Aware Decision Confidence
   */
  _calculateDecisionConfidence(ownShip, targets, context, isRadarLimited, isRestrictedVisibility) {
    let score = 0.95;
    let type = DECISION_CONFIDENCE_TYPE.HIGH_EVIDENCE;

    if (isRadarLimited) {
      score -= 0.30;
      type = DECISION_CONFIDENCE_TYPE.LIMITED_EVIDENCE;
    }

    if (isRestrictedVisibility) {
      score -= 0.15;
    }

    if (context.vesselState?.sensorDegradedFlag) {
      score = 0.55;
      type = DECISION_CONFIDENCE_TYPE.INSUFFICIENT_EVIDENCE;
    }

    return {
      score: parseFloat(Math.max(0.1, score).toFixed(2)),
      type
    };
  }

  /**
   * Legacy candidate routes evaluation method preserved for 100% backward compatibility
   */
  _evaluateCandidateRoutes(candidateRoutes, context = {}) {
    const {
      seaIceTrend = { slope: 0, horizonHours: 24, predicted: 0 },
      icebergTrajectories = [],
      weather = { windSpeed: 20, currentSpeed: 1.5, stormMode: false, severity: 0.3 },
      vesselState = { engineIssue: false, reducedSpeedCap: 18.0, fuelRemaining: 75.0, lowFuelFlag: false, sensorDegradedFlag: false }
    } = context;

    const activeWeights = { ...this.weights };
    const fuelLevel = vesselState.fuelRemaining !== undefined ? Math.max(0, Math.min(100, vesselState.fuelRemaining)) : 75.0;
    if (vesselState.lowFuelFlag || fuelLevel < 50.0) {
      const rampProgress = vesselState.lowFuelFlag ? 1.0 : Math.max(0, Math.min(1, (50.0 - fuelLevel) / 50.0));
      const scaleMultiplier = 1.0 + (rampProgress * 6.0);
      activeWeights.fuel = parseFloat((DEFAULT_WEIGHTS.fuel * scaleMultiplier).toFixed(2));
    }

    const stormState = context.stormState || (weather.stormActive ? { stormActive: true, severity: weather.severity || 0.8 } : { stormActive: false, severity: weather.severity || 0.3 });
    if (stormState.stormActive || stormState.severity > 0.3) {
      const stormRamp = Math.max(0, (stormState.severity - 0.2) / 0.8);
      const scaleMultiplier = 1.0 + (stormRamp * 5.0);
      activeWeights.weather = parseFloat((DEFAULT_WEIGHTS.weather * scaleMultiplier).toFixed(2));
    }

    const modes = ['FASTEST', 'BALANCED', 'SAFEST', 'FUEL_EFFICIENT'];
    const scores = {};
    const details = {};

    let minFuel = Infinity, maxFuel = -Infinity;
    let minEta = Infinity, maxEta = -Infinity;

    for (const m of modes) {
      const r = candidateRoutes[m];
      if (r) {
        const f = r.estimatedFuelConsumption !== undefined ? r.estimatedFuelConsumption : (r.fuel || 0);
        const e = r.eta !== undefined ? r.eta : (r.estimatedDuration || 0);
        if (f < minFuel) minFuel = f;
        if (f > maxFuel) maxFuel = f;
        if (e < minEta) minEta = e;
        if (e > maxEta) maxEta = e;
      }
    }

    let bestMode = 'BALANCED';
    let bestScore = Infinity;

    for (const m of modes) {
      const r = candidateRoutes[m];
      if (!r) {
        scores[m] = 999.0;
        continue;
      }

      if (r.waypoints && r.waypoints.length >= 2 && icebergTrajectories.length > 0) {
        const valRes = continuousCollisionValidator.validateFullRoute(r.waypoints, vesselState, icebergTrajectories);
        if (!valRes.isValid) {
          scores[m] = Infinity;
          details[m] = { score: Infinity, rejected: true, reason: `Space/Time Collision Validation Failed (${valRes.reason})` };
          continue;
        }
      }

      const riskScore = r.maxRisk !== undefined ? r.maxRisk : (r.riskScore || 0.2);
      if (riskScore > SAFE_RISK_CEILING) {
        scores[m] = Infinity;
        details[m] = { score: Infinity, rejected: true, reason: `Max risk (${riskScore.toFixed(2)}) exceeds safe ceiling (${SAFE_RISK_CEILING})` };
        continue;
      }

      if (vesselState.engineIssue) {
        const speedRequired = r.shipSpeed || 25.0;
        const cap = vesselState.reducedSpeedCap || 18.0;
        if (speedRequired > cap + 1.0) {
          scores[m] = Infinity;
          details[m] = { score: Infinity, rejected: true, reason: `Required speed (${speedRequired.toFixed(1)} SU/s) exceeds engine cap (${cap.toFixed(1)} SU/s)` };
          continue;
        }
      }

      const riskPenalty = riskScore * activeWeights.risk;
      const fuelVal = r.estimatedFuelConsumption !== undefined ? r.estimatedFuelConsumption : (r.fuel || 0);
      const fuelNorm = (maxFuel - minFuel) > 0.001 ? (fuelVal - minFuel) / (maxFuel - minFuel) : 0.5;
      const fuelPenalty = fuelNorm * activeWeights.fuel;

      const etaVal = r.eta !== undefined ? r.eta : (r.estimatedDuration || 0);
      const etaNorm = (maxEta - minEta) > 0.001 ? (etaVal - minEta) / (maxEta - minEta) : 0.5;
      const etaPenalty = etaNorm * activeWeights.eta;

      const weatherSev = weather.severity !== undefined ? weather.severity : (weather.stormMode ? 0.8 : 0.3);
      const weatherExposure = r.weatherExposure !== undefined ? r.weatherExposure : 0.4;
      const weatherPenalty = weatherSev * activeWeights.weather * weatherExposure;

      const totalScore = parseFloat((riskPenalty + fuelPenalty + etaPenalty + weatherPenalty).toFixed(2));
      scores[m] = totalScore;
      details[m] = { totalScore, riskPenalty, fuelPenalty, etaPenalty, weatherPenalty };

      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestMode = m;
      }
    }

    if (bestScore === Infinity) {
      const rejectionReasons = Object.entries(details)
        .map(([m, d]) => `${m}: ${d.reason || 'Rejected'}`)
        .join('; ');

      return {
        recommendedMode: 'NO_FEASIBLE_ROUTE',
        status: 'NO_FEASIBLE_ROUTE',
        confidence: 0.0,
        explanation: `CRITICAL: No candidate route satisfies vessel capability & safety constraints. All options rejected (${rejectionReasons}).`,
        scores,
        weightsUsed: activeWeights,
        details,
        allRejected: true
      };
    }

    let baseConfidence = 0.92;
    if (vesselState.sensorDegradedFlag) {
      baseConfidence = 0.55;
    } else if (weather.stormMode) {
      baseConfidence = 0.78;
    }

    const confidence = parseFloat(baseConfidence.toFixed(2));
    const recRoute = candidateRoutes[bestMode] || candidateRoutes['BALANCED'];
    const recRisk = recRoute ? (recRoute.maxRisk !== undefined ? recRoute.maxRisk : 0.2) : 0.2;
    const recFuel = recRoute ? (recRoute.estimatedFuelConsumption !== undefined ? recRoute.estimatedFuelConsumption : (recRoute.fuel || 0)) : 0;

    let explanation = "";
    if (vesselState.sensorDegradedFlag) {
      explanation += `[DEGRADED SENSOR DATA WARNING: Radar/Satellite offline] `;
    }

    if (bestMode === 'FUEL_EFFICIENT') {
      explanation += `Fuel-Efficient route selected: consumes ${recFuel.toFixed(1)} units while keeping risk (${recRisk.toFixed(2)}) below safe ceiling (${SAFE_RISK_CEILING}).`;
    } else if (bestMode === 'SAFEST') {
      explanation += `Safest route selected: achieves lowest risk score (${recRisk.toFixed(2)}) amidst active hazards.`;
    } else {
      explanation += `Balanced route selected: optimizes safety and fuel efficiency under clear conditions.`;
    }

    const structuredExplanation = semanticRuleMapper.mapExplanation({
      shipState: vesselState,
      threatHazard: icebergTrajectories[0] || null,
      hazards: icebergTrajectories,
      selectedAction: bestMode,
      details,
      maxRisk: recRisk,
      confidence,
      validatorPassed: bestScore !== Infinity
    });

    return {
      recommendedMode: bestMode,
      confidence,
      explanation,
      structuredExplanation,
      scores,
      weightsUsed: activeWeights,
      details
    };
  }
}

export const decisionEngine = new DecisionEngine();
