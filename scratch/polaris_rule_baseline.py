"""POLARIS Deterministic Rule-Based Navigation Baseline.

Implements transparent heuristic rule logic using POLARIS input telemetry.
Serves as the benchmark baseline against which Laya neural outputs are compared.
"""
from typing import Dict, Any, Tuple
from backend.polaris_decision_schema import PolarisDecisionInput, NormalizedDecisionOutput

# EXPERIMENTAL HEURISTIC THRESHOLDS (Used solely for comparative baseline benchmark)
HIGH_ICE_CONCENTRATION_THRESHOLD = 0.70  # >70% sea ice concentration
CRITICAL_ICEBERG_DIST_M = 300.0         # <300m iceberg proximity
POOR_VISIBILITY_NM = 1.0                 # <1.0 NM fog/snow visibility
LOW_CONFIDENCE_THRESHOLD = 0.60          # Require human review if model confidence <60%

def evaluate_polaris_rules(inp: PolarisDecisionInput) -> NormalizedDecisionOutput:
    """Evaluate deterministic rule baseline on POLARIS telemetry state."""
    reasons = []
    
    # 1. Emergency Status Check
    if inp.operational.emergency_status:
        reasons.append("Vessel declared emergency status")
        return NormalizedDecisionOutput(
            route_action="emergency_response",
            route_action_confidence=1.0,
            hazard_severity_score=2.0,
            escort_required_prob=1.0,
            human_review_required=True,
            human_review_reasons=reasons
        )

    # 2. Severe Proximity Hazard / Blocked Route Check
    if inp.ice.route_segment_blocked or inp.ice.nearest_iceberg_distance_m < CRITICAL_ICEBERG_DIST_M:
        reasons.append(f"Route segment blocked or iceberg within critical range ({inp.ice.nearest_iceberg_distance_m:.0f}m)")
        
        if inp.operational.icebreaker_escort_available and inp.ice.sea_ice_concentration >= HIGH_ICE_CONCENTRATION_THRESHOLD:
            action = "request_escort"
        else:
            action = "reroute"
            
        return NormalizedDecisionOutput(
            route_action=action,
            route_action_confidence=0.95,
            hazard_severity_score=1.8 if inp.ice.route_segment_blocked else 1.5,
            escort_required_prob=0.90 if inp.ice.sea_ice_concentration >= HIGH_ICE_CONCENTRATION_THRESHOLD else 0.40,
            human_review_required=True if action == "request_escort" or inp.environment.visibility_nautical_miles < POOR_VISIBILITY_NM else False,
            human_review_reasons=reasons if action == "request_escort" or inp.environment.visibility_nautical_miles < POOR_VISIBILITY_NM else []
        )

    # 3. High Sea Ice Concentration / Poor Visibility
    if inp.ice.sea_ice_concentration >= HIGH_ICE_CONCENTRATION_THRESHOLD:
        if inp.environment.visibility_nautical_miles < POOR_VISIBILITY_NM:
            reasons.append("Heavy pack ice combined with poor visibility (<1.0 NM)")
            action = "hold_position"
            review = True
        else:
            action = "slow_down"
            review = False
            
        return NormalizedDecisionOutput(
            route_action=action,
            route_action_confidence=0.85,
            hazard_severity_score=1.2,
            escort_required_prob=0.75,
            human_review_required=review,
            human_review_reasons=reasons
        )

    # 4. Moderate Hazards (Moderate Ice or Reduced Visibility)
    if inp.ice.sea_ice_concentration > 0.30 or inp.environment.visibility_nautical_miles < 3.0:
        return NormalizedDecisionOutput(
            route_action="slow_down",
            route_action_confidence=0.80,
            hazard_severity_score=0.8,
            escort_required_prob=0.20,
            human_review_required=False,
            human_review_reasons=[]
        )

    # 5. Clear Water / Low Hazard
    return NormalizedDecisionOutput(
        route_action="continue",
        route_action_confidence=0.95,
        hazard_severity_score=0.1,
        escort_required_prob=0.05,
        human_review_required=False,
        human_review_reasons=[]
    )
