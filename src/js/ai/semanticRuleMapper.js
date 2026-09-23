/**
 * POLARIS Nav-OS — Semantic Rule-Mapped Explainability Engine (Phase 2)
 *
 * Maps navigation actions and sensor telemetry to explicit maritime safety rules,
 * POLARIS physics limits, and environmental risk criteria.
 *
 * Provides structured fallback chain:
 *   Semantic Rule Mapping -> LLM Copilot -> Normal POLARIS Explanation -> Deterministic Fallback
 */

export const MARITIME_RULE_REGISTRY = {
  // IMO Polar Code & IMO COLREGs verified references
  IMO_POLAR_CODE_SAFETY_SPEED: {
    code: "IMO_POLAR_CODE_SAFE_SPEED",
    title: "IMO Polar Code Part I-A / Regulation 1.4 - Safe Speed in Pack Ice",
    description: "Vessels operating in ice-covered waters must maintain safe speed for prevailing ice concentration and visibility."
  },
  IMO_COLREGS_RULE_6: {
    code: "IMO_COLREGS_RULE_6",
    title: "IMO COLREGs Rule 6 - Safe Speed",
    description: "Every vessel shall at all times proceed at a safe speed so that she can take proper and effective action to avoid collision."
  },
  IMO_COLREGS_RULE_7: {
    code: "IMO_COLREGS_RULE_7",
    title: "IMO COLREGs Rule 7 - Risk of Collision",
    description: "Every vessel shall use all available means appropriate to the prevailing circumstances and conditions to determine if risk of collision exists."
  },
  IMO_COLREGS_RULE_8: {
    code: "IMO_COLREGS_RULE_8",
    title: "IMO COLREGs Rule 8 - Action to Avoid Collision",
    description: "Any action taken to avoid collision shall be positive, made in ample time and with due regard to the observance of good seamanship."
  },
  IMO_COLREGS_RULE_19: {
    code: "IMO_COLREGS_RULE_19",
    title: "IMO COLREGs Rule 19 - Conduct of Vessels in Restricted Visibility",
    description: "Every vessel shall navigate with caution when operating in or near an area of restricted visibility."
  },
  
  // POLARIS Engine Verified Safety Rules
  POLARIS_ICEBERG_EXCLUSION_ZONE: {
    code: "POLARIS_RULE_300M_ICEBERG_BUFFER",
    title: "POLARIS Safety Exclusion Buffer (300m)",
    description: "Projected corridor intersects iceberg exclusion zone (300m safety clearance)."
  },
  POLARIS_CRITICAL_COLLISION_ENVELOPE: {
    code: "POLARIS_RULE_45M_HARD_ENVELOPE",
    title: "POLARIS Hard Collision Radius (45m)",
    description: "Immediate physical clearance breach detected within vessel hull + iceberg radius."
  },
  POLARIS_HEAVY_ICE_CONCENTRATION: {
    code: "POLARIS_RULE_70PCT_ICE_CONCENTRATION",
    title: "POLARIS Sea-Ice Concentration Limit (70%)",
    description: "Pack ice density exceeds 70% unassisted PC6 vessel maneuverability threshold."
  },
  POLARIS_LOW_VISIBILITY_FOG: {
    code: "POLARIS_RULE_1NM_VISIBILITY_CUTOFF",
    title: "POLARIS Fog & Blizzard Visibility Cutoff (1.0 NM)",
    description: "Atmospheric visibility below 1.0 NM cutoff requires speed reduction or emergency hold."
  }
};

export class SemanticRuleMapper {
  /**
   * Maps current navigation state and candidate action to verified maritime rule citations.
   *
   * @param {Object} context - Telemetry & decision context
   * @returns {Object} Structured explanation with rule citations and evidence
   */
  mapExplanation(context = {}) {
    const action = (context.recommendedAction || context.baselineAction || 'continue').toLowerCase();
    const hazardDist = context.nearestIcebergDistM || (context.hazards && context.hazards[0] ? context.hazards[0].distance : 9999);
    const iceConc = context.seaIceConcentration || 0.0;
    const visibility = context.visibilityNm || 10.0;
    const isEmergency = context.emergencyActive || false;
    const routeBlocked = context.routeBlocked || false;

    const reasons = [];
    const ruleReferences = [];

    // 1. Evaluate Rule Citations
    if (isEmergency) {
      reasons.push("Emergency protocol active on vessel.");
      ruleReferences.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_8);
    }

    if (hazardDist < 45.0) {
      reasons.push(`Immediate physical clearance breach (${hazardDist.toFixed(0)}m < 45m).`);
      ruleReferences.push(MARITIME_RULE_REGISTRY.POLARIS_CRITICAL_COLLISION_ENVELOPE);
      ruleReferences.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_7);
    } else if (hazardDist < 300.0 || routeBlocked) {
      reasons.push(`Projected route intersects iceberg exclusion zone (${hazardDist.toFixed(0)}m < 300m).`);
      ruleReferences.push(MARITIME_RULE_REGISTRY.POLARIS_ICEBERG_EXCLUSION_ZONE);
      ruleReferences.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_8);
    }

    if (iceConc >= 0.70) {
      reasons.push(`Heavy sea ice concentration (${(iceConc * 100).toFixed(0)}% >= 70%).`);
      ruleReferences.push(MARITIME_RULE_REGISTRY.POLARIS_HEAVY_ICE_CONCENTRATION);
      ruleReferences.push(MARITIME_RULE_REGISTRY.IMO_POLAR_CODE_SAFETY_SPEED);
    }

    if (visibility < 1.0) {
      reasons.push(`Restricted atmospheric visibility (${visibility.toFixed(1)} NM < 1.0 NM).`);
      ruleReferences.push(MARITIME_RULE_REGISTRY.POLARIS_LOW_VISIBILITY_FOG);
      ruleReferences.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_19);
    }

    // Default clear navigation citation
    if (ruleReferences.length === 0) {
      reasons.push("Clear open-water navigation corridor.");
      ruleReferences.push(MARITIME_RULE_REGISTRY.IMO_COLREGS_RULE_6);
    }

    // Format natural language text
    const primaryRule = ruleReferences[0];
    const text = `ACTION: ${action.toUpperCase()} | Reason: ${reasons[0]} (Ref: ${primaryRule.code})`;

    return {
      action: action.toUpperCase(),
      reasons,
      ruleReferences,
      formattedText: text,
      timestamp: performance.now(),
      confidence: 0.95,
      source: 'semantic_rule_mapper'
    };
  }
}
