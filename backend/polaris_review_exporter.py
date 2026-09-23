"""POLARIS Domain Review Workflow & Prioritization Exporter.

Builds prioritized review packages for polar mariners/domain experts,
handles reviewer feedback imports, consensus calculations, and review metrics reporting.
"""
import json
import csv
from pathlib import Path
from typing import List, Dict, Any, Optional

from backend.polaris_scenario_schema import (
    PolarisDomainScenario,
    ReviewPackageItem,
    ReviewerStatus,
    IndividualAnnotation,
    DatasetSplit
)

# Priority categories based on scenario risk
PRIORITY_CATEGORIES = {
    "EMERGENCY": 1,
    "HEAVY_ICE_ESCORT_REQUEST": 2,
    "BLOCKED_ROUTE": 3,
    "ZERO_VISIBILITY_HOLD": 4,
    "HEAVY_ICE_POOR_VISIBILITY": 5,
    "MULTIPLE_HAZARDS": 6,
    "CONFLICTING_AMBIGUOUS": 7,
    "LOW_CONFIDENCE": 8,
    "NEAR_MISS": 9,
    "ICEBERG_NEAR_ROUTE": 10
}


def build_prioritized_review_package(scenarios: List[PolarisDomainScenario], top_n: int = 100) -> List[ReviewPackageItem]:
    """Sort scenarios by risk priority and return top_n items formatted for review."""
    items = []
    
    for scen in scenarios:
        fam = scen.scenario_family
        rank = PRIORITY_CATEGORIES.get(fam, 99)
        
        # High severity or blocked route elevates rank
        if scen.decision_label.hazard_severity_score >= 1.5:
            rank = min(rank, 2)
        if scen.decision_label.evidence.route_blocked:
            rank = min(rank, 3)

        item = ReviewPackageItem(
            scenario_id=scen.scenario_id,
            priority_rank=rank,
            priority_category="HIGH_RISK" if rank <= 5 else ("MODERATE_RISK" if rank <= 10 else "LOW_RISK"),
            scenario_family=fam,
            source_type=scen.provenance.source_type,
            state=scen.state,
            baseline_action=scen.decision_label.selected_action,
            evidence=scen.decision_label.evidence,
            reviewer_status=scen.decision_label.reviewer_status
        )
        items.append(item)

    # Sort by priority rank
    items.sort(key=lambda x: (x.priority_rank, x.scenario_id))
    return items[:top_n]


def export_review_package_csv(review_items: List[ReviewPackageItem], output_path: str):
    """Export review items to CSV format for rapid tabular review."""
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)

    with open(p, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "scenario_id", "priority_rank", "priority_category", "scenario_family",
            "vessel_speed", "ice_conc", "iceberg_dist_m", "route_blocked", "visibility_nm",
            "baseline_action", "reviewer_id", "review_status", "selected_action", "rationale"
        ])
        for item in review_items:
            nav = item.state.get("navigation", {})
            ice = item.state.get("ice", {})
            env = item.state.get("environment", {})
            writer.writerow([
                item.scenario_id,
                item.priority_rank,
                item.priority_category,
                item.scenario_family,
                nav.get("vessel_speed_knots"),
                ice.get("sea_ice_concentration"),
                ice.get("nearest_iceberg_distance_m"),
                ice.get("route_segment_blocked"),
                env.get("visibility_nautical_miles"),
                item.baseline_action,
                "",  # Reviewer ID (To be filled)
                item.reviewer_status.value,
                "",  # Selected Action (To be filled)
                ""   # Rationale (To be filled)
            ])


def apply_expert_annotation(scen: PolarisDomainScenario, annotation: IndividualAnnotation) -> PolarisDomainScenario:
    """Apply an individual expert annotation and compute consensus if multiple annotations exist."""
    scen.decision_label.individual_annotations.append(annotation)
    
    annotations = scen.decision_label.individual_annotations
    if len(annotations) == 1:
        scen.decision_label.reviewer_id = annotation.reviewer_id
        scen.decision_label.selected_action = annotation.selected_action
        scen.decision_label.reviewer_status = ReviewerStatus.ACCEPTED
        scen.decision_label.label_source = "EXPERT"
        scen.decision_label.consensus_action = annotation.selected_action
        scen.decision_label.disagreement_flag = False
    else:
        # Multi-reviewer consensus logic
        actions = [a.selected_action for a in annotations]
        from collections import Counter
        counts = Counter(actions)
        most_common, freq = counts.most_common(1)[0]
        
        if freq > len(annotations) / 2:
            scen.decision_label.consensus_action = most_common
            scen.decision_label.selected_action = most_common
            scen.decision_label.label_source = "CONSENSUS"
            scen.decision_label.reviewer_status = ReviewerStatus.ACCEPTED
            scen.decision_label.disagreement_flag = False
        else:
            scen.decision_label.consensus_action = None
            scen.decision_label.reviewer_status = ReviewerStatus.AMBIGUOUS
            scen.decision_label.disagreement_flag = True

    return scen


def compute_review_metrics(scenarios: List[PolarisDomainScenario]) -> Dict[str, Any]:
    """Calculate detailed review coverage metrics across total scenarios and per-action."""
    total = len(scenarios)
    if total == 0:
        return {}

    status_counts = {s.value: 0 for s in ReviewerStatus}
    action_counts = {}
    action_reviewed = {}

    for scen in scenarios:
        st = scen.decision_label.reviewer_status.value
        status_counts[st] = status_counts.get(st, 0) + 1
        
        act = scen.decision_label.selected_action
        action_counts[act] = action_counts.get(act, 0) + 1
        if act not in action_reviewed:
            action_reviewed[act] = 0
        if st != "UNREVIEWED":
            action_reviewed[act] += 1

    reviewed_count = total - status_counts["UNREVIEWED"]

    return {
        "total_scenarios": total,
        "reviewed_count": reviewed_count,
        "pct_reviewed": round((reviewed_count / total) * 100, 1),
        "pct_accepted": round((status_counts["ACCEPTED"] / total) * 100, 1),
        "pct_modified": round((status_counts["MODIFIED"] / total) * 100, 1),
        "pct_rejected": round((status_counts["REJECTED"] / total) * 100, 1),
        "pct_ambiguous": round((status_counts["AMBIGUOUS"] / total) * 100, 1),
        "action_review_coverage": {
            act: f"{action_reviewed[act]}/{action_counts[act]} ({(action_reviewed[act]/action_counts[act])*100:.1f}%)"
            for act in action_counts
        }
    }
