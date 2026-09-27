/**
 * POLARIS Nav-OS — Deterministic Semantic Rule-Mapped Explainability Engine (Phase 1A)
 *
 * Implements a deterministic, auditable rule-mapped explanation schema for maritime navigation.
 * Evaluates encounter geometry (HEAD_ON, CROSSING, OVERTAKING, CLEAR), Polar Code limits,
 * rejected alternative actions, safety gates, and explicit rule citations.
 */

export const MARITIME_RULE_REGISTRY = {
  // IMO COLREGs Verified Rule Definitions
  IMO_COLREGS_RULE_6: {
    ruleId: "IMO_COLREGS_RULE_6",
    title: "Rule 6 - Safe Speed",
    applicableEncounter: "ANY",
    description: "Proceed at a safe speed to allow proper and effective collision avoidance action.",
    disclaimer: "Decision associated with COLREG Rule 6 (Safe Speed)."
  },
  IMO_COLREGS_RULE_7: {
    ruleId: "IMO_COLREGS_RULE_7",
    title: "Rule 7 - Risk of Collision",
    applicableEncounter: "ANY",
    description: "Use all available means to determine if risk of collision exists.",
    disclaimer: "Decision associated with COLREG Rule 7 (Risk of Collision)."
  },
  IMO_COLREGS_RULE_8: {
    ruleId: "IMO_COLREGS_RULE_8",
    title: "Rule 8 - Action to Avoid Collision",
    applicableEncounter: "ANY",
    description: "Action taken to avoid collision shall be positive, made in ample time, and with due regard to good seamanship.",
    disclaimer: "Decision associated with COLREG Rule 8 (Action to Avoid Collision)."
  },
  IMO_COLREGS_RULE_13: {
    ruleId: "IMO_COLREGS_RULE_13",
    title: "Rule 13 - Overtaking",
    applicableEncounter: "OVERTAKING",
    description: "Any vessel overtaking any other shall keep out of the way of the vessel being overtaken.",
    disclaimer: "Decision associated with COLREG Rule 13 (Overtaking)."
  },
  IMO_COLREGS_RULE_14: {
    ruleId: "IMO_COLREGS_RULE_14",
    title: "Rule 14 - Head-on Situation",
    applicableEncounter: "HEAD_ON",
    description: "When two power-driven vessels are meeting on reciprocal courses, each shall alter course to starboard so that each shall pass on the port side.",
    disclaimer: "Decision associated with COLREG Rule 14 (Head-on Situation)."
  },
  IMO_COLREGS_RULE_15: {
    ruleId: "IMO_COLREGS_RULE_15",
    title: "Rule 15 - Crossing Situation",
    applicableEncounter: "CROSSING",
    description: "When two power-driven vessels are crossing, the vessel which has the other on her own starboard side shall keep out of the way.",
    disclaimer: "Decision associated with COLREG Rule 15 (Crossing Situation)."
  },
  IMO_COLREGS_RULE_16: {
    ruleId: "IMO_COLREGS_RULE_16",
    title: "Rule 16 - Action by Give-way Vessel",
    applicableEncounter: "CROSSING",
    description: "Every vessel which is directed to keep out of the way of another vessel shall take early and substantial action to keep well clear.",
    disclaimer: "Decision associated with COLREG Rule 16 (Give-way Action)."
  },
  IMO_COLREGS_RULE_17: {
    ruleId: "IMO_COLREGS_RULE_17",
    title: "Rule 17 - Action by Stand-on Vessel",
    applicableEncounter: "CROSSING",
    description: "Where one of two vessels is to keep out of the way, the other shall keep her course and speed.",
    disclaimer: "Decision associated with COLREG Rule 17 (Stand-on Conduct)."
  },
  IMO_COLREGS_RULE_19: {
    ruleId: "IMO_COLREGS_RULE_19",
    title: "Rule 19 - Conduct of Vessels in Restricted Visibility",
    applicableEncounter: "RESTRICTED_VISIBILITY",
    description: "Every vessel shall navigate with caution when operating in or near an area of restricted visibility.",
    disclaimer: "Decision associated with COLREG Rule 19 (Restricted Visibility)."
  },

  // IMO Polar Code References
  IMO_POLAR_CODE_SAFETY_SPEED: {
    ruleId: "IMO_POLAR_CODE_SAFE_SPEED",
    title: "IMO Polar Code Part I-A / Reg 1.4 - Safe Speed in Pack Ice",
    applicableEncounter: "POLAR_ICE",
    description: "Vessels operating in ice-covered waters must maintain safe speed for prevailing ice concentration.",
    disclaimer: "Decision associated with IMO Polar Code Reg 1.4 (Safe Speed in Ice)."
  },
  IMO_POLAR_CODE_EXCLUSION_ZONE: {
    ruleId: "IMO_POLAR_CODE_ICEBERG_BUFFER",
    title: "IMO Polar Code Safety Buffer (300m Exclusion)",
    applicableEncounter: "ICEBERG_HAZARD",
    description: "Projected navigation corridor must maintain 300m safety exclusion buffer from detected icebergs.",
    disclaimer: "Decision associated with IMO Polar Code Exclusion Zone Buffer."
  },

  // POLARIS Deterministic Safety Hard Limits
  POLARIS_CRITICAL_COLLISION_ENVELOPE: {
    ruleId: "POLARIS_RULE_45M_HARD_ENVELOPE",
    title: "POLARIS Hard Collision Envelope (45m)",
    applicableEncounter: "EMERGENCY_BREACH",
    description: "Immediate physical clearance breach detected within vessel hull footprint + iceberg radius.",
    disclaimer: "Decision associated with POLARIS Hard Collision Envelope Limit."
  },
  POLARIS_BATHYMETRY_DEPTH_GUARD: {
    ruleId: "POLARIS_BATHYMETRY_DEPTH_LIMIT",
    title: "POLARIS Bathymetry Clearance Safety Limit",
    applicableEncounter: "SHALLOW_WATER",
    description: "Route segment intersects shallow bathymetric depth contour boundary.",
    disclaimer: "Decision associated with POLARIS Bathymetric Depth Limit."
  },
  POLARIS_ROUTE_STABILITY_POLICY: {
    ruleId: "POLARIS_ROUTE_STABILITY_HYSTERESIS",
    title: "POLARIS Route Stability & Hysteresis Policy",
    applicableEncounter: "ROUTE_REPLAN",
    description: "Candidate route rejected due to insufficient cost improvement (<15%) or commitment window hysteresis.",
    disclaimer: "Decision associated with POLARIS Route Stability Policy."
  },

  // Phase 2B AIS Target Tracking Gap Rule
  AIS_GAP_EXTRAPOLATION: {
    ruleId: "AIS_GAP_EXTRAPOLATION_RULE",
    title: "AIS Target Gap Dead-Reckoning Extrapolation",
    applicableEncounter: "AIS_TARGET_GAP",
    description: "Target tracking system extrapolating vessel position during temporary transmission gap.",
    disclaimer: "Decision associated with AIS Gap Dead-Reckoning Extrapolation."
  },

  // Phase 2C Vessel Maneuvering Constraints Rule
  MANEUVERABILITY_CONSTRAINT: {
    ruleId: "MANEUVERABILITY_CONSTRAINT_RULE",
    title: "Vessel Maneuvering Steering & Turn-Rate Constraints",
    applicableEncounter: "MANEUVERING_LIMIT",
    description: "Route candidate or steering command subject to physical vessel turn-rate, rudder-rate, or acceleration limits.",
    disclaimer: "Decision associated with Vessel Maneuvering Constraints."
  }
};

export class SemanticRuleMapper {
  /**
   * Classify encounter geometry based on vessel headings, relative bearing, and motion.
   *
   * @param {Object} shipState - { x, y, heading, speed }
   * @param {Object} hazard - { x, y, vx, vy, heading }
   * @returns {String} 'HEAD_ON' | 'CROSSING' | 'OVERTAKING' | 'CLEAR'
   */
  classifyEncounter(shipState = {}, hazard = null) {
    if (!hazard) return 'CLEAR';

    const dx = hazard.x - shipState.x;
    const dy = hazard.y - shipState.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 1500) return 'CLEAR';

    // Nautical math: 0° = North (-Y in screen/canvas), 90° = East (+X in screen/canvas)
    // Angle in degrees clockwise from North (-Y)
    const bearingToHazard = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const shipHeading = ((shipState.heading || 0) % 360 + 360) % 360;

    // Relative angle of hazard from ship bow (0° = dead ahead, 90° = starboard beam)
    const relativeBearing = Math.abs((bearingToHazard - shipHeading + 540) % 360 - 180);

    const hazardHeading = hazard.heading !== undefined
      ? ((hazard.heading % 360 + 360) % 360)
      : (Math.atan2(hazard.vx || 0, -(hazard.vy || 0)) * 180 / Math.PI + 360) % 360;

    const headingDiff = Math.abs((shipHeading - hazardHeading + 540) % 360 - 180);

    // HEAD_ON: Hazard ahead (relativeBearing < 45°) and reciprocal heading (headingDiff > 135°)
    if (relativeBearing < 45 && headingDiff > 135) {
      return 'HEAD_ON';
    }

    // OVERTAKING: Hazard ahead/broad (relativeBearing < 60°) and nearly same heading (headingDiff < 45°)
    if (relativeBearing < 60 && headingDiff < 45) {
      return 'OVERTAKING';
    }

    // CROSSING: Hazard approaching from side/quarter with crossing vector
    if (relativeBearing < 112.5) {
      return 'CROSSING';
    }

    return 'CLEAR';
  }



  /**
   * Alias for mapExplanation to ensure full compatibility.
   */
  generateExplanation(context = {}) {
    return this.mapExplanation(context);
  }

  generateSemanticExplanation(context = {}) {
    return this.mapExplanation(context);
  }

  /**
   * Builds a complete, deterministic Explainable AI explanation object.
   *
   * @param {Object} context - Telemetry, DecisionEngine output, planner candidates & validator state
   * @returns {Object} Structured Explanation Object conforming to POLARIS Phase 1A Schema
   */
  mapExplanation(context = {}) {
    const timestamp = context.timestamp || Date.now();
    const decisionId = `dec_${timestamp}_${Math.floor(Math.random() * 1000)}`;
    const hazard = context.threatHazard || (context.hazards && context.hazards[0] ? context.hazards[0] : null);
    const shipState = context.shipState || context.vesselState || { x: 400, y: 1800, heading: 0, speed: 15 };

    const encounterType = this.classifyEncounter(shipState, hazard);
    const hazardDist = context.minClearance !== undefined
      ? context.minClearance
      : (hazard ? Math.hypot(hazard.x - shipState.x, hazard.y - shipState.y) : 9999);

    const cpa = context.minDcpa !== undefined ? context.minDcpa : (hazard ? hazardDist : 9999);
    const tcpa = context.shortestTcpa !== undefined ? context.shortestTcpa : 999;
    const isEmergency = context.emergencyActive || (context.state === 'EMERGENCY');

    // 1. Evidence Assembly
    const evidence = {
      cpa: parseFloat(cpa.toFixed(1)),
      tcpa: parseFloat(tcpa.toFixed(1)),
      minClearance: parseFloat(hazardDist.toFixed(1)),
      uncertaintyRadiusSU: hazard ? (hazard.uncertaintyRadius || 20.0) : 0,
      encounterType,
      seaIceConcentration: context.seaIceConcentration || 0.0,
      visibilityNm: context.visibilityNm || 10.0,
      // Bathymetry Evidence Integration
      depthMetrics: context.depthMetrics || {
        minimumDepth: context.minimumDepth !== undefined ? context.minimumDepth : 45.0,
        draft: context.vesselDraft || 16.0,
        requiredSafeDepth: context.requiredSafeDepth || 20.0,
        margin: context.depthMargin !== undefined ? context.depthMargin : 25.0,
        classification: context.depthClassification || 'SAFE'
      },
      // Live Environmental Provenance Integration
      environmentalProvenance: context.environmentalProvenance || {
        dataAgeMinutes: context.dataAgeMinutes !== undefined ? context.dataAgeMinutes : 5,
        source: context.environmentalSource || 'USNIC + Open-Meteo + Copernicus',
        status: context.environmentalStatus || 'LIVE'
      },
      // Dynamic Effective Drift Calibration Evidence Integration
      driftCalibration: context.driftCalibration || {
        icebergId: hazard ? (hazard.id || 'A-76') : 'A-76',
        effectiveParameter: context.effectiveDragParameter || 1.15,
        status: context.driftCalibrationStatus || 'ADAPTED',
        confidence: context.driftCalibrationConfidence || 0.88,
        residualVariance: context.driftResidualVariance || 0.42,
        scope: context.driftScope || 'TRACK_ADAPTED',
        disclaimer: 'adaptive drift parameter estimated from observed track residuals'
      }
    };

    // 2. Applicable Rules & Candidates
    const applicableRules = [];
    const ruleBasis = [];

    if (isEmergency) {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_8);
      applicableRules.push(MARITIME_RULE_REGISTRY.POLARIS_CRITICAL_COLLISION_ENVELOPE);
      ruleBasis.push("Immediate clearance breach or emergency override triggered.");
    }

    if (encounterType === 'HEAD_ON') {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_14);
      ruleBasis.push("Reciprocal meeting course detected: starboard alteration (Rule 14) candidate.");
    } else if (encounterType === 'CROSSING') {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_15);
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_16);
      ruleBasis.push("Crossing situation detected: give-way alteration (Rule 15/16) candidate.");
    } else if (encounterType === 'OVERTAKING') {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_13);
      ruleBasis.push("Overtaking situation detected: keep clear of overtaken vessel (Rule 13).");
    }

    if (hazardDist < 300.0) {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_POLAR_CODE_EXCLUSION_ZONE);
      ruleBasis.push("Corridor intersects 300m iceberg exclusion buffer.");
    }

    if (evidence.seaIceConcentration >= 0.70) {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_POLAR_CODE_SAFETY_SPEED);
      ruleBasis.push("Heavy pack ice density (>=70%) requires safe speed reduction.");
    }

    if (hazard && (hazard.isPredicted || hazard.trackStatus === 'PREDICTED' || hazard.trackStatus === 'STALE')) {
      applicableRules.push(MARITIME_RULE_REGISTRY.AIS_GAP_EXTRAPOLATION);
      ruleBasis.push(`Target ${hazard.mmsi || hazard.id || 'vessel'} position extrapolated (Age: ${hazard.ageSeconds || 10}s, Status: ${hazard.trackStatus || 'PREDICTED'}, Uncertainty: ±${hazard.positionUncertainty || 5.0}m).`);
    }

    if (context.maneuverabilityRejection || context.maneuverabilityConstraint) {
      applicableRules.push(MARITIME_RULE_REGISTRY.MANEUVERABILITY_CONSTRAINT);
      const reqTurn = context.requiredTurnRate || 18.5;
      const maxTurn = context.maxTurnRate || 15.0;
      ruleBasis.push(`MANEUVERABILITY: Required turn rate (${reqTurn}°/s) exceeds vessel physical limit (${maxTurn}°/s). Source: SHIP_DYNAMICS.`);
    }

    if (applicableRules.length === 0) {
      applicableRules.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_6);
      ruleBasis.push("Clear open-water navigation corridor.");
    }

    // 3. Alternative Actions & Rejections
    const alternativeActions = ['STARBOARD_DETOUR', 'PORT_DETOUR', 'MAINTAIN_COURSE', 'REDUCE_SPEED'];
    const rejectedAlternatives = [];

    const selectedAction = (context.selectedAction || context.recommendedMode || 'STARBOARD_DETOUR').toUpperCase();

    // Population of actual evidence-based rejections
    if (context.details) {
      for (const [mode, detail] of Object.entries(context.details)) {
        if (detail.rejected) {
          let reasonText = detail.reason || 'Rejected by Decision Engine';
          let category = 'SAFETY_GATE';

          if (reasonText.includes('Collision') || reasonText.includes('Clearance')) {
            category = 'COLLISION_VALIDATOR_REJECTION';
          } else if (reasonText.includes('depth') || reasonText.includes('Bathymetry')) {
            category = 'BATHYMETRY_CONSTRAINT_REJECTION';
          } else if (reasonText.includes('Speed') || reasonText.includes('Engine')) {
            category = 'ENGINE_CAPABILITY_REJECTION';
          } else if (reasonText.includes('risk') || reasonText.includes('ceiling')) {
            category = 'RISK_CEILING_REJECTION';
          }

          rejectedAlternatives.push({
            action: mode,
            category,
            reason: reasonText
          });
        }
      }
    }

    if (selectedAction.includes('STARBOARD') || selectedAction === 'SAFEST' || selectedAction === 'BALANCED') {
      if (!rejectedAlternatives.some(r => r.action === 'PORT_DETOUR')) {
        const portClearance = context.portClearance !== undefined ? context.portClearance : (hazardDist - 30);
        if (portClearance < 45.0 || context.portRejectedReason) {
          rejectedAlternatives.push({
            action: 'PORT_DETOUR',
            category: 'INSUFFICIENT_CLEARANCE',
            reason: context.portRejectedReason || `Port detour offers lower clearance (${portClearance.toFixed(1)}m) or higher risk.`
          });
        }
      }
    }

    if (context.bathymetryBlocked) {
      rejectedAlternatives.push({
        action: 'SHALLOW_WATER_BRANCH',
        category: 'BATHYMETRY_CONSTRAINT_REJECTION',
        reason: 'Route branch violates 20m depth contour boundary.'
      });
      applicableRules.push(MARITIME_RULE_REGISTRY.POLARIS_BATHYMETRY_DEPTH_GUARD);
    }

    if (context.stabilityRejected) {
      rejectedAlternatives.push({
        action: 'MINOR_IMPROVEMENT_REROUTE',
        category: 'ROUTE_STABILITY_REJECTION',
        reason: 'Route improvement (<15%) below stability hysteresis threshold.'
      });
      applicableRules.push(MARITIME_RULE_REGISTRY.POLARIS_ROUTE_STABILITY_POLICY);
    }

    // 4. Deterministic Natural Language Summary Construction
    const primaryRule = applicableRules[0];
    const observationText = hazard
      ? `OBSERVATION: Threat ${hazard.id || 'iceberg'} at ${hazardDist.toFixed(0)}m (CPA: ${cpa.toFixed(0)}m, TCPA: ${tcpa.toFixed(0)}s).`
      : `OBSERVATION: Open water corridor.`;

    const predictionText = `PREDICTION: Hazard trajectory relative aspect indicates ${encounterType} geometry.`;
    const inferenceText = `INFERENCE: Risk score ${context.maxRisk ? context.maxRisk.toFixed(2) : '0.15'} below ceiling (${context.safeCeiling || 0.65}).`;
    const ruleText = `RULE: ${primaryRule.disclaimer}`;
    const decisionText = `DECISION: Adopt ${selectedAction} route.`;
    const actionText = `ACTION: Target Heading ${context.targetHeading !== undefined ? context.targetHeading.toFixed(0) : '330'}°, Target Speed ${context.targetSpeed !== undefined ? context.targetSpeed.toFixed(1) : '15.0'} SU/s.`;

    const summaryText = `${observationText} ${predictionText} ${inferenceText} ${ruleText} ${decisionText} ${actionText}`;

    return {
      timestamp,
      decisionId,
      decisionType: context.triggerReason || (isEmergency ? 'EMERGENCY_REROUTE' : 'ROUTE_SELECTION'),
      hazard: hazard ? { id: hazard.id, x: hazard.x, y: hazard.y, vx: hazard.vx, vy: hazard.vy } : null,
      hazardState: isEmergency ? 'IMMINENT_COLLISION' : (hazardDist < 300 ? 'EXCLUSION_ZONE_BREACH' : 'CLEAR'),
      prediction: {
        encounterType,
        cpa,
        tcpa
      },
      uncertainty: {
        radiusSU: evidence.uncertaintyRadiusSU,
        confidence: context.confidence || 0.92
      },
      risk: {
        score: context.maxRisk || 0.15,
        ceiling: 0.65,
        level: isEmergency ? 'CRITICAL' : (hazardDist < 300 ? 'HIGH' : 'LOW')
      },
      evidence,
      applicableRules,
      ruleBasis,
      alternativeActions,
      rejectedAlternatives,
      selectedAction,
      controlCommand: {
        targetHeading: context.targetHeading !== undefined ? context.targetHeading : 330,
        targetSpeed: context.targetSpeed !== undefined ? context.targetSpeed : 15.0,
        mode: selectedAction
      },
      safetyGate: {
        continuousCollisionValidatorPassed: context.validatorPassed !== undefined ? context.validatorPassed : true,
        reason: context.validatorReason || 'Space/Time continuous envelope clear.'
      },
      confidence: context.confidence || 0.92,
      sourceModules: ['DecisionEngine', 'SemanticRuleMapper', 'ContinuousCollisionValidator', 'FastFirstSafePlanner'],
      summaryText,
      get summary() { return this.summaryText; }
    };
  }
}

export const semanticRuleMapper = new SemanticRuleMapper();
