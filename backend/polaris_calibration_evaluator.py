"""POLARIS Silver vs Expert Gold Calibration Pipeline.

Builds a stratified 24-scenario calibration package, reads genuine expert annotations from the review portal,
computes 3-way agreement metrics (Silver vs Expert, Baseline vs Expert, Laya vs Expert), confusion matrices,
and generates calibration outputs without modifying original datasets or training Laya.
"""
import sys
import json
import csv
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from backend.polaris_scenario_schema import (
    PolarisDomainScenario,
    IndividualAnnotation,
    LabelSource,
    ReviewerStatus
)
from backend.polaris_label_adjudicator import (
    PolarisLabelAdjudicator,
    AdjudicationOutcome,
    LabelType
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CORPUS_FILE = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
BENCHMARK_FILE = DATA_DIR / "polaris_decision_cases.json"
SILVER_FILE = DATA_DIR / "decision" / "silver" / "polaris_silver_scenarios.jsonl"
QUEUE_FILE = DATA_DIR / "decision" / "review_queue" / "review_package_auto_priority.jsonl"

CALIBRATION_DIR = DATA_DIR / "decision" / "calibration"

ACTIONS = ["continue", "slow_down", "reroute", "hold_position", "request_escort", "emergency_response", "AMBIGUOUS"]
ACTION_CODE_MAP = {
    "continue": "C",
    "slow_down": "S",
    "reroute": "R",
    "hold_position": "H",
    "request_escort": "E",
    "emergency_response": "M",
    "AMBIGUOUS": "A"
}


def select_stratified_calibration_sample(
    corpus_file: Path = CORPUS_FILE,
    benchmark_file: Path = BENCHMARK_FILE
) -> List[Dict[str, Any]]:
    """Select exactly 24 stratified non-duplicate scenarios covering:
    - 6 SILVER / AUTO_ACCEPT
    - 6 HUMAN_REVIEW_REQUIRED
    - 3 CONTINUE (baseline action)
    - 3 SLOW_DOWN (baseline action)
    - 3 REROUTE (baseline action)
    - 3 High-consequence / high-risk cases (EMERGENCY / HOLD_POSITION / REQUEST_ESCORT)
    """
    adjudicator = PolarisLabelAdjudicator(corpus_path=str(corpus_file), benchmark_path=str(benchmark_file))
    
    silver_candidates = []
    human_review_candidates = []
    
    continue_candidates = []
    slow_down_candidates = []
    reroute_candidates = []
    high_consequence_candidates = []
    
    for scen in adjudicator.scenarios:
        rec = adjudicator.adjudicate_scenario(scen)
        item = {
            "record": rec,
            "scenario": scen
        }
        
        if rec.outcome == AdjudicationOutcome.AUTO_ACCEPT:
            silver_candidates.append(item)
        elif rec.outcome == AdjudicationOutcome.HUMAN_REVIEW_REQUIRED:
            human_review_candidates.append(item)
            
        if rec.baseline_action == "continue":
            continue_candidates.append(item)
        elif rec.baseline_action == "slow_down":
            slow_down_candidates.append(item)
        elif rec.baseline_action == "reroute":
            reroute_candidates.append(item)
            
        if rec.baseline_action in {"emergency_response", "hold_position", "request_escort"} or rec.emergency_active:
            high_consequence_candidates.append(item)
            
    selected_ids = set()
    sample = []

    def _pick(candidates, count, tag):
        picked = 0
        for c in candidates:
            sid = c["scenario"].scenario_id
            if sid not in selected_ids:
                selected_ids.add(sid)
                c_copy = dict(c)
                c_copy["stratum_tag"] = tag
                sample.append(c_copy)
                picked += 1
                if picked >= count:
                    break

    _pick(silver_candidates, 6, "SILVER_AUTO_ACCEPT")
    _pick(human_review_candidates, 6, "HUMAN_REVIEW_REQUIRED")
    _pick(continue_candidates, 3, "ACTION_CONTINUE")
    _pick(slow_down_candidates, 3, "ACTION_SLOW_DOWN")
    _pick(reroute_candidates, 3, "ACTION_REROUTE")
    _pick(high_consequence_candidates, 3, "HIGH_CONSEQUENCE_RISK")

    # If count is less than 24 due to overlap, fill remaining from remaining human review / silver candidates
    if len(sample) < 24:
        for c in human_review_candidates + silver_candidates:
            sid = c["scenario"].scenario_id
            if sid not in selected_ids:
                selected_ids.add(sid)
                c_copy = dict(c)
                c_copy["stratum_tag"] = "STRATIFIED_FILL"
                sample.append(c_copy)
                if len(sample) >= 24:
                    break

    return sample[:24]


class PolarisCalibrationEvaluator:
    """Manages creation of calibration package, loading of expert reviews, and metrics calculation."""

    def __init__(
        self,
        calibration_dir: Path = CALIBRATION_DIR,
        corpus_file: Path = CORPUS_FILE,
        benchmark_file: Path = BENCHMARK_FILE
    ):
        self.calibration_dir = calibration_dir
        self.corpus_file = corpus_file
        self.benchmark_file = benchmark_file
        self.calibration_dir.mkdir(parents=True, exist_ok=True)
        
        self.sample_items = select_stratified_calibration_sample(self.corpus_file, self.benchmark_file)

    def export_calibration_package(self) -> Dict[str, Any]:
        """Export calibration_sample.jsonl and calibration_manifest.json."""
        sample_file = self.calibration_dir / "calibration_sample.jsonl"
        manifest_file = self.calibration_dir / "calibration_manifest.json"

        with open(sample_file, "w", encoding="utf-8") as f:
            for item in self.sample_items:
                record_dict = item["record"].model_dump()
                scen_dict = item["scenario"].model_dump()
                row = {
                    "scenario_id": item["scenario"].scenario_id,
                    "stratum_tag": item["stratum_tag"],
                    "adjudication_record": record_dict,
                    "scenario": scen_dict
                }
                f.write(json.dumps(row, default=str) + "\n")

        manifest = {
            "calibration_version": "1.0.0",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "total_sample_size": len(self.sample_items),
            "stratification": {
                "silver_count": sum(1 for x in self.sample_items if x["record"].outcome == AdjudicationOutcome.AUTO_ACCEPT),
                "human_review_count": sum(1 for x in self.sample_items if x["record"].outcome == AdjudicationOutcome.HUMAN_REVIEW_REQUIRED),
                "action_distribution": {
                    act: sum(1 for x in self.sample_items if x["record"].baseline_action == act)
                    for act in ["continue", "slow_down", "reroute", "hold_position", "request_escort", "emergency_response"]
                }
            },
            "protected_corpus": str(self.corpus_file),
            "protected_benchmark": str(self.benchmark_file)
        }

        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        return manifest

    def evaluate_against_expert_reviews(
        self,
        reviewed_scenarios_map: Dict[str, PolarisDomainScenario]
    ) -> Dict[str, Any]:
        """Compare calibration sample against expert annotations in reviewed_scenarios_map."""
        silver_agreed = 0
        silver_modified = 0
        silver_ambiguous = 0
        silver_rejected = 0
        silver_total = 0

        silver_matches = 0
        laya_matches = 0
        baseline_matches = 0
        human_review_total = 0
        human_review_agreed = 0

        reviewed_records = []
        gold_calibration_records = []

        # Confusion matrices
        # Rows: System Action (Silver/Laya/Baseline), Cols: Expert Action (C, S, R, H, E, M, A)
        conf_matrix_silver = {row_act: {col_act: 0 for col_act in ACTIONS} for row_act in ACTIONS}
        conf_matrix_laya = {row_act: {col_act: 0 for col_act in ACTIONS} for row_act in ACTIONS}
        conf_matrix_baseline = {row_act: {col_act: 0 for col_act in ACTIONS} for row_act in ACTIONS}

        for item in self.sample_items:
            rec = item["record"]
            scen = item["scenario"]
            sid = scen.scenario_id

            if sid in reviewed_scenarios_map:
                rev_scen = reviewed_scenarios_map[sid]
                annotations = rev_scen.decision_label.individual_annotations
                if not annotations:
                    continue

                expert_act = rev_scen.decision_label.consensus_action or annotations[0].selected_action
                if rev_scen.decision_label.reviewer_status == ReviewerStatus.AMBIGUOUS or expert_act == "ambiguous":
                    expert_act = "AMBIGUOUS"

                expert_act_clean = expert_act.lower().strip() if expert_act != "AMBIGUOUS" else "AMBIGUOUS"
                baseline_act = rec.baseline_action.lower().strip()
                laya_act = (rec.laya_action or "continue").lower().strip()
                silver_act = baseline_act  # Auto-accepted SILVER action equals baseline action

                # Record for Gold output
                gold_rec = {
                    "scenario_id": sid,
                    "provenance": scen.provenance.model_dump(),
                    "stratum_tag": item["stratum_tag"],
                    "adjudication_outcome": rec.outcome.value,
                    "baseline_action": baseline_act,
                    "laya_action": laya_act,
                    "laya_confidence": rec.laya_confidence,
                    "silver_action": silver_act if rec.outcome == AdjudicationOutcome.AUTO_ACCEPT else None,
                    "expert_action": expert_act_clean,
                    "expert_validated": True,
                    "expert_confidence": annotations[0].confidence,
                    "expert_rationale": annotations[0].rationale,
                    "driving_evidence_factors": annotations[0].driving_evidence_factors,
                    "reviewer_id": annotations[0].reviewer_id,
                    "reviewed_at": annotations[0].reviewed_at,
                    "consensus_status": rev_scen.decision_label.reviewer_status.value
                }
                gold_calibration_records.append(gold_rec)

                # Populate confusion matrices
                matrix_expert_key = expert_act_clean if expert_act_clean in ACTIONS else "AMBIGUOUS"
                
                if rec.outcome == AdjudicationOutcome.AUTO_ACCEPT:
                    conf_matrix_silver[silver_act][matrix_expert_key] += 1
                conf_matrix_laya[laya_act][matrix_expert_key] += 1
                conf_matrix_baseline[baseline_act][matrix_expert_key] += 1

                # Silver validity breakdown
                if rec.outcome == AdjudicationOutcome.AUTO_ACCEPT:
                    silver_total += 1
                    if expert_act_clean == silver_act:
                        silver_agreed += 1
                        silver_matches += 1
                    elif matrix_expert_key == "AMBIGUOUS":
                        silver_ambiguous += 1
                    elif expert_act_clean in ["hold_position", "emergency_response", "request_escort"]:
                        silver_rejected += 1
                    else:
                        silver_modified += 1

                # Agreement matches
                if laya_act == expert_act_clean:
                    laya_matches += 1
                if baseline_act == expert_act_clean:
                    baseline_matches += 1

                if rec.outcome == AdjudicationOutcome.HUMAN_REVIEW_REQUIRED:
                    human_review_total += 1
                    if baseline_act == expert_act_clean:
                        human_review_agreed += 1

                reviewed_records.append(gold_rec)

        total_reviewed = len(reviewed_records)
        silver_agreement_rate = (silver_agreed / silver_total * 100.0) if silver_total > 0 else 0.0
        baseline_agreement_rate = (baseline_matches / total_reviewed * 100.0) if total_reviewed > 0 else 0.0
        laya_agreement_rate = (laya_matches / total_reviewed * 100.0) if total_reviewed > 0 else 0.0

        # Save gold_calibration.jsonl
        gold_file = self.calibration_dir / "gold_calibration.jsonl"
        with open(gold_file, "w", encoding="utf-8") as f:
            for g in gold_calibration_records:
                f.write(json.dumps(g, default=str) + "\n")

        # Save calibration_results.jsonl
        results_file = self.calibration_dir / "calibration_results.jsonl"
        with open(results_file, "w", encoding="utf-8") as f:
            for g in gold_calibration_records:
                f.write(json.dumps(g, default=str) + "\n")

        # Determine decision classification
        if total_reviewed < 20:
            training_decision = "CALIBRATION INSUFFICIENT — SAMPLE TOO SMALL"
        elif silver_agreement_rate >= 80.0:
            training_decision = "CALIBRATION PROMISING — MORE REVIEW NEEDED"
        else:
            training_decision = "SILVER DATA REQUIRES REVISION"

        report = {
            "calibration_report_version": "1.0.0",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "sample_size_total": len(self.sample_items),
            "scenarios_reviewed_count": total_reviewed,
            "silver_reviewed_count": silver_total,
            "human_review_reviewed_count": human_review_total,
            "gold_calibration_count": len(gold_calibration_records),
            "expert_agreement_rates": {
                "silver_expert_agreement_pct": round(silver_agreement_rate, 1),
                "baseline_expert_agreement_pct": round(baseline_agreement_rate, 1),
                "laya_expert_agreement_pct": round(laya_agreement_rate, 1)
            },
            "silver_validity_analysis": {
                "total_silver_reviewed": silver_total,
                "agreed_count": silver_agreed,
                "modified_count": silver_modified,
                "ambiguous_count": silver_ambiguous,
                "rejected_count": silver_rejected,
                "silver_expert_agreement_rate_pct": round(silver_agreement_rate, 1)
            },
            "human_review_queue_analysis": {
                "total_human_review_scenarios": human_review_total,
                "baseline_agreement_count": human_review_agreed,
                "baseline_agreement_pct": round((human_review_agreed / human_review_total * 100.0) if human_review_total > 0 else 0.0, 1),
                "disagreement_rate_pct": round(((human_review_total - human_review_agreed) / human_review_total * 100.0) if human_review_total > 0 else 0.0, 1)
            },
            "confusion_matrices": {
                "silver_vs_expert": conf_matrix_silver,
                "laya_vs_expert": conf_matrix_laya,
                "baseline_vs_expert": conf_matrix_baseline
            },
            "training_decision": training_decision,
            "laya_training_status": "MODEL TRAINING NOT STARTED",
            "protected_benchmark": str(self.benchmark_file),
            "protected_corpus": str(self.corpus_file)
        }

        report_file = self.calibration_dir / "calibration_report.json"
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)

        return report
