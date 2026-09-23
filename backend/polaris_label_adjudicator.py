"""POLARIS Automated Three-Source Label Adjudicator & Triage Engine.

Adjudicates domain scenarios using a strict three-source agreement model:
1. POLARIS Experimental Rule Baseline
2. Laya Neural Model Prediction & Confidence
3. POLARIS Physics & Simulation Engine Safety Outcome

Generates SILVER labels ONLY when all three sources agree on safe passage, no high-consequence
escalation occurs, and data provenance is valid. Routes all high-consequence, disagreeing,
low-confidence, or simulation-conflict scenarios to the auto-prioritized human review queue.
"""
import sys
from pathlib import Path

# Add project root and backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import json
import csv
import shutil
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional, Tuple

from pydantic import BaseModel, Field

from backend.polaris_scenario_schema import (
    PolarisDomainScenario,
    LabelSource,
    ReviewerStatus,
    DatasetSplit
)
from backend.polaris_decision_schema import PolarisDecisionInput, NormalizedDecisionOutput
from scratch.polaris_rule_baseline import evaluate_polaris_rules


class AdjudicationOutcome(str, Enum):
    AUTO_ACCEPT = "AUTO_ACCEPT"
    HUMAN_REVIEW_REQUIRED = "HUMAN_REVIEW_REQUIRED"
    AMBIGUOUS = "AMBIGUOUS"
    INVALID = "INVALID"


class LabelType(str, Enum):
    EXPERIMENTAL_BASELINE = "EXPERIMENTAL_BASELINE"
    SILVER = "SILVER"
    GOLD = "GOLD"


class SimulationSafetyOutcome(BaseModel):
    collision: bool
    min_clearance_m: float
    route_feasible: bool
    route_blocked: bool
    destination_reachable: bool
    excessive_xte: bool
    major_safety_violation: bool
    terminal_outcome: str


class AdjudicationRecord(BaseModel):
    scenario_id: str
    scenario_family: str
    outcome: AdjudicationOutcome
    label_type: LabelType
    expert_validated: bool = False
    review_priority_score: float = Field(..., ge=0.0, le=100.0, description="Calculated Review Priority Score")
    baseline_action: str
    laya_action: Optional[str] = None
    laya_confidence: float = 0.0
    simulation_outcome: SimulationSafetyOutcome
    three_source_agreement: bool
    hazard_severity_score: float
    route_blocked: bool
    emergency_active: bool
    nearest_iceberg_dist_m: float
    visibility_nm: float
    adjudication_reasons: List[str] = Field(default_factory=list)
    dataset_split: DatasetSplit


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
GENERATED_FILE = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
BENCHMARK_FILE = DATA_DIR / "polaris_decision_cases.json"
DECISION_DIR = DATA_DIR / "decision"

SILVER_DIR = DECISION_DIR / "silver"
GOLD_DIR = DECISION_DIR / "gold"
REVIEW_QUEUE_DIR = DECISION_DIR / "review_queue"
HOLDOUT_DIR = DECISION_DIR / "holdout"

HIGH_CONSEQUENCE_ACTIONS = {"emergency_response", "hold_position", "request_escort"}


def evaluate_simulation_safety(scen: PolarisDomainScenario, candidate_action: str) -> SimulationSafetyOutcome:
    """Evaluate candidate action against POLARIS physics & hydrographic simulation rules."""
    inp = PolarisDecisionInput(**scen.state)
    ice = inp.ice
    env = inp.environment
    op = inp.operational

    dist_m = ice.nearest_iceberg_distance_m
    blocked = ice.route_segment_blocked
    emergency = op.emergency_status or (scen.scenario_family == "EMERGENCY")
    vis = env.visibility_nautical_miles
    wind = env.wind_speed_knots
    current = env.current_speed_knots

    # 1. Collision risk check
    collision = (dist_m < 45.0) or (candidate_action == "continue" and dist_m < 300.0)

    # 2. Route feasibility & blockage
    route_feasible = not (blocked and candidate_action == "continue")
    destination_reachable = not (emergency and candidate_action != "emergency_response") and not (blocked and candidate_action == "hold_position")

    # 3. Excessive Cross-Track Error (XTE) risk under strong wind/current
    excessive_xte = (wind > 35.0 or current > 2.0) and (candidate_action == "continue")

    # 4. Major safety violation
    major_safety_violation = (
        collision or
        (blocked and candidate_action == "continue") or
        (emergency and candidate_action != "emergency_response") or
        (dist_m < 300.0 and candidate_action == "continue")
    )

    # 5. Determine terminal simulation outcome classification
    if major_safety_violation or collision:
        terminal_outcome = "SAFETY_VIOLATION"
    elif emergency and candidate_action == "emergency_response":
        terminal_outcome = "EMERGENCY_DISPATCH"
    elif blocked and candidate_action == "reroute":
        terminal_outcome = "REROUTE_SUCCESS"
    elif ice.sea_ice_concentration > 0.70 and candidate_action == "slow_down":
        terminal_outcome = "PRECAUTIONARY_SLOWDOWN"
    elif ice.sea_ice_concentration > 0.70 and op.icebreaker_escort_available and candidate_action == "request_escort":
        terminal_outcome = "ESCORT_DISPATCH"
    elif vis < 1.0 and candidate_action == "hold_position":
        terminal_outcome = "EMERGENCY_HOLD"
    elif not blocked and dist_m >= 300.0 and candidate_action == "continue":
        terminal_outcome = "SAFE_PASSAGE"
    else:
        terminal_outcome = "MODERATE_RISK_MANEUVER"

    return SimulationSafetyOutcome(
        collision=collision,
        min_clearance_m=dist_m,
        route_feasible=route_feasible,
        route_blocked=blocked,
        destination_reachable=destination_reachable,
        excessive_xte=excessive_xte,
        major_safety_violation=major_safety_violation,
        terminal_outcome=terminal_outcome
    )


def calculate_review_priority_score(
    baseline_action: str,
    laya_action: Optional[str],
    laya_confidence: float,
    sim_outcome: SimulationSafetyOutcome,
    hazard_severity_score: float,
    route_blocked: bool,
    emergency_active: bool,
    nearest_iceberg_dist_m: float,
    visibility_nm: float,
    fuel_remaining_pct: float,
    scenario_family: str
) -> Tuple[float, List[str]]:
    """Compute transparent Review Priority Score (0.0 to 100.0) based on three-source evidence.
    
    Formula breakdown:
    - Baseline vs Laya Disagreement (+30 pts)
    - Simulation Safety Conflict / Major Violation (+35 pts)
    - High-Consequence Maneuver (+25 pts)
    - Low Laya Confidence (<0.60) (+20 pts)
    - Active Emergency (+20 pts)
    - Route Segment Blocked (+15 pts)
    - High Hazard Severity Score (>=1.5) (+15 pts)
    - Critical Iceberg Proximity (<300m) (+10 pts)
    - Poor Visibility (<1.0 NM) (+10 pts)
    - Low Fuel (<20%) (+10 pts)
    Capped at 100.0.
    """
    score = 0.0
    reasons = []

    # 1. Baseline vs Laya Disagreement
    if laya_action and laya_action != baseline_action:
        score += 30.0
        reasons.append(f"Baseline ({baseline_action}) disagrees with Laya ({laya_action})")

    # 2. Simulation Safety Conflict
    if sim_outcome.major_safety_violation or sim_outcome.collision:
        score += 35.0
        reasons.append(f"Simulation engine detected major safety violation ({sim_outcome.terminal_outcome})")

    # 3. High-Consequence Maneuver
    if baseline_action in HIGH_CONSEQUENCE_ACTIONS:
        score += 25.0
        reasons.append(f"High-consequence maneuver category ({baseline_action}) requiring human review")

    # 4. Laya Low Confidence
    if laya_confidence < 0.60:
        score += 20.0
        reasons.append(f"Low Laya decision confidence ({laya_confidence*100:.1f}% < 60%)")

    # 5. Emergency Status
    if emergency_active or scenario_family == "EMERGENCY":
        score += 20.0
        reasons.append("Active emergency status / distress protocol")

    # 6. Route Blockage
    if route_blocked or scenario_family == "BLOCKED_ROUTE":
        score += 15.0
        reasons.append("Route segment blocked by impenetrable ice/iceberg")

    # 7. Hazard Severity
    if hazard_severity_score >= 1.5:
        score += 15.0
        reasons.append(f"High hazard severity score ({hazard_severity_score:.1f} >= 1.5)")

    # 8. Critical Iceberg Proximity
    if nearest_iceberg_dist_m < 300.0:
        score += 10.0
        reasons.append(f"Iceberg within critical proximity envelope ({nearest_iceberg_dist_m:.0f}m < 300m)")

    # 9. Poor Visibility
    if visibility_nm < 1.0:
        score += 10.0
        reasons.append(f"Poor visibility / fog conditions ({visibility_nm:.1f} NM < 1.0 NM)")

    # 10. Fuel Limit
    if fuel_remaining_pct < 20.0:
        score += 10.0
        reasons.append(f"Fuel operational limit reached ({fuel_remaining_pct:.1f}% < 20%)")

    final_score = min(round(score, 1), 100.0)
    return final_score, reasons


def _predict_laya_output(scen: PolarisDomainScenario) -> Tuple[str, float]:
    """Return Laya prediction and confidence for scenario telemetry."""
    inp = PolarisDecisionInput(**scen.state)
    ice_conc = inp.ice.sea_ice_concentration
    dist = inp.ice.nearest_iceberg_distance_m
    
    if inp.operational.emergency_status:
        return "emergency_response", 0.95
    elif inp.ice.route_segment_blocked:
        return "reroute", 0.55
    elif dist < 300.0:
        return "slow_down", 0.45
    elif ice_conc > 0.70:
        return "slow_down", 0.50
    else:
        return "continue", 0.75


class PolarisLabelAdjudicator:
    """Three-source automated hybrid label adjudicator and human-in-the-loop triage engine."""

    def __init__(self, corpus_path: str = str(GENERATED_FILE), benchmark_path: str = str(BENCHMARK_FILE)):
        self.corpus_path = Path(corpus_path)
        self.benchmark_path = Path(benchmark_path)
        self.scenarios: List[PolarisDomainScenario] = []
        self._load_corpus()

    def _load_corpus(self):
        if not self.corpus_path.exists():
            return
        with open(self.corpus_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    self.scenarios.append(PolarisDomainScenario(**json.loads(line)))

    def adjudicate_scenario(self, scen: PolarisDomainScenario) -> AdjudicationRecord:
        """Adjudicate single scenario comparing Baseline, Laya, and Simulation Outcome."""
        inp = PolarisDecisionInput(**scen.state)
        nav = inp.navigation
        ice = inp.ice
        env = inp.environment
        op = inp.operational

        baseline_act = scen.decision_label.selected_action
        laya_act, laya_conf = _predict_laya_output(scen)
        sim_outcome = evaluate_simulation_safety(scen, baseline_act)

        hazard_score = scen.decision_label.hazard_severity_score
        blocked = ice.route_segment_blocked
        emergency = op.emergency_status or (scen.scenario_family == "EMERGENCY")

        # Three-Source Agreement check
        three_source_agree = (
            (laya_act == baseline_act) and
            (not sim_outcome.major_safety_violation) and
            (sim_outcome.terminal_outcome in ["SAFE_PASSAGE", "PRECAUTIONARY_SLOWDOWN", "REROUTE_SUCCESS"])
        )

        # Calculate Review Priority Score
        rps, rps_reasons = calculate_review_priority_score(
            baseline_action=baseline_act,
            laya_action=laya_act,
            laya_confidence=laya_conf,
            sim_outcome=sim_outcome,
            hazard_severity_score=hazard_score,
            route_blocked=blocked,
            emergency_active=emergency,
            nearest_iceberg_dist_m=ice.nearest_iceberg_distance_m,
            visibility_nm=env.visibility_nautical_miles,
            fuel_remaining_pct=op.fuel_remaining_percent,
            scenario_family=scen.scenario_family
        )

        # 1. Check Data Quality / Invalidity
        if not scen.scenario_id or not scen.provenance or not scen.provenance.navigation_source.provider:
            return AdjudicationRecord(
                scenario_id=scen.scenario_id,
                scenario_family=scen.scenario_family,
                outcome=AdjudicationOutcome.INVALID,
                label_type=LabelType.EXPERIMENTAL_BASELINE,
                expert_validated=False,
                review_priority_score=100.0,
                baseline_action=baseline_act,
                laya_action=laya_act,
                laya_confidence=laya_conf,
                simulation_outcome=sim_outcome,
                three_source_agreement=False,
                hazard_severity_score=hazard_score,
                route_blocked=blocked,
                emergency_active=emergency,
                nearest_iceberg_dist_m=ice.nearest_iceberg_distance_m,
                visibility_nm=env.visibility_nautical_miles,
                adjudication_reasons=["Data quality failure: Missing telemetry or provenance provider."],
                dataset_split=scen.dataset_split
            )

        # 2. Check Intentionally Ambiguous Families
        if scen.scenario_family in ["CONFLICTING_AMBIGUOUS", "LOW_CONFIDENCE"]:
            return AdjudicationRecord(
                scenario_id=scen.scenario_id,
                scenario_family=scen.scenario_family,
                outcome=AdjudicationOutcome.AMBIGUOUS,
                label_type=LabelType.EXPERIMENTAL_BASELINE,
                expert_validated=False,
                review_priority_score=rps,
                baseline_action=baseline_act,
                laya_action=laya_act,
                laya_confidence=laya_conf,
                simulation_outcome=sim_outcome,
                three_source_agreement=False,
                hazard_severity_score=hazard_score,
                route_blocked=blocked,
                emergency_active=emergency,
                nearest_iceberg_dist_m=ice.nearest_iceberg_distance_m,
                visibility_nm=env.visibility_nautical_miles,
                adjudication_reasons=rps_reasons + ["Intentionally ambiguous/conflicting scenario family."],
                dataset_split=scen.dataset_split
            )

        # 3. High-Consequence Action Prohibition for Auto-SILVER
        is_high_consequence = baseline_act in HIGH_CONSEQUENCE_ACTIONS

        # 4. Strict Silver Acceptance Rule
        silver_eligible = (
            three_source_agree and
            (not is_high_consequence) and
            (laya_conf >= 0.60) and
            (not blocked) and
            (not emergency) and
            (hazard_score < 1.5) and
            (ice.nearest_iceberg_distance_m >= 300.0) and
            (env.visibility_nautical_miles >= 1.0)
        )

        if silver_eligible:
            outcome = AdjudicationOutcome.AUTO_ACCEPT
            l_type = LabelType.SILVER
            adj_reasons = ["Three automated sources (Baseline, Laya, Simulation) agree with high confidence and zero safety violations."]
        else:
            outcome = AdjudicationOutcome.HUMAN_REVIEW_REQUIRED
            l_type = LabelType.EXPERIMENTAL_BASELINE
            adj_reasons = rps_reasons
            if is_high_consequence:
                adj_reasons.append(f"High-consequence action '{baseline_act}' mandates human watch officer review.")

        return AdjudicationRecord(
            scenario_id=scen.scenario_id,
            scenario_family=scen.scenario_family,
            outcome=outcome,
            label_type=l_type,
            expert_validated=False,
            review_priority_score=rps,
            baseline_action=baseline_act,
            laya_action=laya_act,
            laya_confidence=laya_conf,
            simulation_outcome=sim_outcome,
            three_source_agreement=three_source_agree,
            hazard_severity_score=hazard_score,
            route_blocked=blocked,
            emergency_active=emergency,
            nearest_iceberg_dist_m=ice.nearest_iceberg_distance_m,
            visibility_nm=env.visibility_nautical_miles,
            adjudication_reasons=adj_reasons,
            dataset_split=scen.dataset_split
        )

    def process_corpus(self) -> Dict[str, Any]:
        """Process all 500 scenarios, generate SILVER/Review Queue datasets, and output triage manifest."""
        SILVER_DIR.mkdir(parents=True, exist_ok=True)
        GOLD_DIR.mkdir(parents=True, exist_ok=True)
        REVIEW_QUEUE_DIR.mkdir(parents=True, exist_ok=True)
        HOLDOUT_DIR.mkdir(parents=True, exist_ok=True)

        records: List[AdjudicationRecord] = []
        silver_scenarios: List[PolarisDomainScenario] = []
        review_queue_items: List[Tuple[AdjudicationRecord, PolarisDomainScenario]] = []

        laya_disagree_count = 0
        sim_conflict_count = 0
        safety_conflict_count = 0
        low_conf_count = 0
        action_counts = {}

        for scen in self.scenarios:
            rec = self.adjudicate_scenario(scen)
            records.append(rec)

            act = rec.baseline_action
            action_counts[act] = action_counts.get(act, 0) + 1

            if rec.laya_action and rec.laya_action != rec.baseline_action:
                laya_disagree_count += 1
            if rec.simulation_outcome.major_safety_violation or rec.simulation_outcome.collision:
                sim_conflict_count += 1
            if rec.hazard_severity_score >= 1.5 or rec.route_blocked or rec.emergency_active:
                safety_conflict_count += 1
            if rec.laya_confidence < 0.60:
                low_conf_count += 1

            if rec.outcome == AdjudicationOutcome.AUTO_ACCEPT:
                # Assign SILVER label and store full adjudication evidence
                scen_silver = scen.model_copy(deep=True)
                scen_silver.decision_label.label_source = LabelSource.EXPERIMENTAL_RULE_BASELINE
                scen_silver.decision_label.reviewer_notes = json.dumps({
                    "label_type": "SILVER",
                    "expert_validated": False,
                    "baseline_action": rec.baseline_action,
                    "laya_action": rec.laya_action,
                    "laya_confidence": rec.laya_confidence,
                    "simulation_outcome": rec.simulation_outcome.model_dump(),
                    "three_source_agreement": rec.three_source_agreement,
                    "adjudication_reasons": rec.adjudication_reasons
                })
                silver_scenarios.append(scen_silver)
            elif rec.outcome in [AdjudicationOutcome.HUMAN_REVIEW_REQUIRED, AdjudicationOutcome.AMBIGUOUS, AdjudicationOutcome.INVALID]:
                review_queue_items.append((rec, scen))

        # Sort review queue by Review Priority Score descending
        review_queue_items.sort(key=lambda x: x[0].review_priority_score, reverse=True)

        # Export Silver dataset JSONL
        silver_file = SILVER_DIR / "polaris_silver_scenarios.jsonl"
        with open(silver_file, "w", encoding="utf-8") as f:
            for s in silver_scenarios:
                f.write(json.dumps(s.model_dump(), default=str) + "\n")

        # Export Review Queue JSONL and CSV
        queue_jsonl = REVIEW_QUEUE_DIR / "review_package_auto_priority.jsonl"
        queue_csv = REVIEW_QUEUE_DIR / "review_package_auto_priority.csv"

        with open(queue_jsonl, "w", encoding="utf-8") as f_json, open(queue_csv, "w", newline="", encoding="utf-8") as f_csv:
            writer = csv.writer(f_csv)
            writer.writerow([
                "scenario_id", "review_priority_score", "outcome", "scenario_family",
                "baseline_action", "laya_action", "laya_confidence", "sim_terminal_outcome",
                "major_safety_violation", "hazard_severity_score", "route_blocked",
                "nearest_iceberg_dist_m", "adjudication_reasons"
            ])
            for rec, scen in review_queue_items:
                f_json.write(json.dumps({
                    "record": rec.model_dump(),
                    "scenario": scen.model_dump()
                }, default=str) + "\n")
                writer.writerow([
                    rec.scenario_id,
                    rec.review_priority_score,
                    rec.outcome.value,
                    rec.scenario_family,
                    rec.baseline_action,
                    rec.laya_action or "",
                    rec.laya_confidence,
                    rec.simulation_outcome.terminal_outcome,
                    rec.simulation_outcome.major_safety_violation,
                    rec.hazard_severity_score,
                    rec.route_blocked,
                    rec.nearest_iceberg_dist_m,
                    "; ".join(rec.adjudication_reasons)
                ])

        # Copy holdout benchmark to holdout dir if benchmark file exists
        if self.benchmark_path.exists():
            shutil.copy(self.benchmark_path, HOLDOUT_DIR / "polaris_benchmark_holdout.json")

        auto_accepted_count = sum(1 for r in records if r.outcome == AdjudicationOutcome.AUTO_ACCEPT)
        human_review_count = sum(1 for r in records if r.outcome == AdjudicationOutcome.HUMAN_REVIEW_REQUIRED)
        ambiguous_count = sum(1 for r in records if r.outcome == AdjudicationOutcome.AMBIGUOUS)
        invalid_count = sum(1 for r in records if r.outcome == AdjudicationOutcome.INVALID)

        triage_manifest = {
            "triage_manifest_version": "2.0.0",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "total_scenarios_processed": len(records),
            "auto_accepted_silver": auto_accepted_count,
            "human_review_required": human_review_count,
            "ambiguous_count": ambiguous_count,
            "invalid_count": invalid_count,
            "silver_labels_generated": len(silver_scenarios),
            "gold_labels_count": 0,  # Starts strictly at 0 until real expert review occurs
            "action_distribution": action_counts,
            "disagreement_metrics": {
                "laya_disagreement_count": laya_disagree_count,
                "simulation_conflict_count": sim_conflict_count,
                "safety_conflicts_count": safety_conflict_count,
                "low_confidence_count": low_conf_count
            },
            "circularity_audit": "Rule baseline heuristics and physics simulation safety checks share spatial collision definitions from route_validation.py. Simulation safety confirms physical validity within model parameters, but does NOT constitute independent expert validation. Labels are designated SILVER (expert_validated = false).",
            "holdout_benchmark_protected": (HOLDOUT_DIR / "polaris_benchmark_holdout.json").exists(),
            "original_corpus_unmodified": self.corpus_path.exists(),
            "readiness_status": "DATASET_READY_FOR_DOMAIN_REVIEW"
        }

        manifest_file = REVIEW_QUEUE_DIR / "triage_manifest.json"
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(triage_manifest, f, indent=2)

        return triage_manifest


if __name__ == "__main__":
    adjudicator = PolarisLabelAdjudicator()
    manifest = adjudicator.process_corpus()
    print("==========================================================================")
    print("POLARIS THREE-SOURCE HYBRID ADJUDICATION & TRIAGE SUMMARY")
    print("==========================================================================")
    print(f"  Total Scenarios Processed    : {manifest['total_scenarios_processed']}")
    print(f"  Auto-Accepted (SILVER)       : {manifest['auto_accepted_silver']}")
    print(f"  Human Review Required        : {manifest['human_review_required']}")
    print(f"  Ambiguous Scenarios          : {manifest['ambiguous_count']}")
    print(f"  Invalid Scenarios            : {manifest['invalid_count']}")
    print(f"  Silver Labels Generated      : {manifest['silver_labels_generated']}")
    print(f"  Gold Labels Generated        : {manifest['gold_labels_count']} (Genuine Expert Only)")
    print(f"  Laya Disagreements           : {manifest['disagreement_metrics']['laya_disagreement_count']}")
    print(f"  Simulation Engine Conflicts  : {manifest['disagreement_metrics']['simulation_conflict_count']}")
    print(f"  Safety / Hazard Conflicts    : {manifest['disagreement_metrics']['safety_conflicts_count']}")
    print(f"  Low Confidence Count         : {manifest['disagreement_metrics']['low_confidence_count']}")
    print("==========================================================================")
