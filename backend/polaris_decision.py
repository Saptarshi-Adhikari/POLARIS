"""POLARIS Decision Adapter for Laya Decision Engine.

Converts POLARIS decision telemetry inputs into Laya state and questions,
invokes PolarisLayaClient, and normalizes the response into a POLARIS decision object.
"""
import logging
from typing import Dict, Any, Tuple
from backend.polaris_decision_schema import PolarisDecisionInput, NormalizedDecisionOutput
from backend.laya_client import PolarisLayaClient, LayaClientError

logger = logging.getLogger("polaris.decision_adapter")

# Laya Decision Questions tailored to POLARIS vessel navigation
POLARIS_LAYA_QUESTIONS = {
    "route_action": {
        "type": "choice",
        "instructions": "Which navigation strategy should the vessel execute based on ice, route, and environmental conditions?",
        "criteria": {
            "continue": "open water or light ice, clear path ahead, normal speed",
            "slow_down": "moderate ice concentration or reduced visibility, proceed with caution",
            "reroute": "projected route blocked by iceberg or heavy impenetrable pack ice",
            "hold_position": "severe fog/blizzard or dense unnavigable ice pack, stop and wait",
            "request_escort": "heavy ice floes requiring icebreaker escort vessel assistance",
            "emergency_response": "vessel collision imminent or structural hull distress"
        }
    },
    "hazard_severity": {
        "type": "score",
        "instructions": "Rate the structural damage risk to hull from sea ice and icebergs.",
        "criteria": [
            "low hazard / clear water or thin brash ice",
            "moderate hazard / first-year ice floes",
            "critical hazard / thick multi-year ice floes or iceberg collision risk"
        ]
    },
    "escort_required": {
        "type": "noul",
        "instructions": "Does the vessel require icebreaker assistance to proceed safely?"
    },
    "human_review_required": {
        "type": "noul",
        "instructions": "Does this navigation scenario require mandatory human watch officer review?"
    }
}


class PolarisDecisionAdapter:
    """Adapter translating POLARIS telemetry inputs to Laya HTTP requests and normalizing decisions."""

    def __init__(self, client: PolarisLayaClient = None):
        self.client = client or PolarisLayaClient()

    def evaluate(self, inp: PolarisDecisionInput) -> NormalizedDecisionOutput:
        """Submit POLARIS input state to Laya and return a normalized decision object."""
        laya_state = inp.to_laya_state()

        try:
            res = self.client.predict_decision(laya_state, POLARIS_LAYA_QUESTIONS)
        except LayaClientError as e:
            logger.error(f"Laya client failed during decision evaluation: {e}")
            raise

        answers = res.get("answers", {})
        routing = res.get("routing", {})

        # Extract route_action
        action_obj = answers.get("route_action", {})
        action = action_obj.get("choice", "slow_down")
        action_conf = float(action_obj.get("confidence", 0.5))

        # Extract hazard_severity score
        hazard_obj = answers.get("hazard_severity", {})
        hazard_score = float(hazard_obj.get("score", 1.0))

        # Extract escort_required probability
        escort_obj = answers.get("escort_required", {})
        escort_prob = float(escort_obj.get("noul", 0.5))

        # Extract human_review_required probability
        review_obj = answers.get("human_review_required", {})
        review_prob = float(review_obj.get("noul", 0.5))

        # Human Review Gating Logic
        reasons = []
        review_flag = False

        if action_conf < 0.60:
            review_flag = True
            reasons.append(f"Low Laya model decision confidence ({action_conf:.2%})")

        if hazard_score >= 1.5:
            review_flag = True
            reasons.append(f"High predicted hazard severity ({hazard_score:.2f} / 2.0)")

        if inp.ice.route_segment_blocked:
            review_flag = True
            reasons.append("Projected route segment intersects iceberg exclusion zone")

        if inp.operational.emergency_status:
            review_flag = True
            reasons.append("Vessel emergency status active")

        if review_prob >= 0.70:
            review_flag = True
            reasons.append(f"High model human review score ({review_prob:.2%})")

        return NormalizedDecisionOutput(
            route_action=action,
            route_action_confidence=action_conf,
            hazard_severity_score=hazard_score,
            escort_required_prob=escort_prob,
            human_review_required=review_flag,
            human_review_reasons=reasons,
            laya_routing_model=routing.get("model"),
            laya_routing_reason=routing.get("reason")
        )
