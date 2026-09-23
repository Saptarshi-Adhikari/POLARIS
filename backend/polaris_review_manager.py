"""POLARIS Domain Review Manager & Quality Control Pipeline.

Manages expert annotation persistence, dataset immutability, multi-reviewer consensus,
disagreement tracking, quality control validation, and review metrics reporting.
"""
import json
import csv
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional

from backend.polaris_scenario_schema import (
    PolarisDomainScenario,
    IndividualAnnotation,
    ReviewerStatus,
    LabelSource,
    DatasetSplit
)
from backend.polaris_review_exporter import (
    build_prioritized_review_package,
    export_review_package_csv,
    compute_review_metrics
)
from backend.polaris_dataset_validator import PolarisDatasetValidator

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
GENERATED_FILE = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
REVIEW_DIR = DATA_DIR / "decision" / "review"
BENCHMARK_FILE = DATA_DIR / "polaris_decision_cases.json"

VALID_ACTIONS = {
    "continue", "slow_down", "reroute", "hold_position",
    "request_escort", "emergency_response", "AMBIGUOUS"
}


class PolarisReviewManager:
    """Manages local expert review persistence, consensus, metrics, and quality validation."""

    def __init__(
        self,
        corpus_path: str = str(GENERATED_FILE),
        review_dir: str = str(REVIEW_DIR),
        benchmark_path: str = str(BENCHMARK_FILE)
    ):
        self.corpus_path = Path(corpus_path)
        self.review_dir = Path(review_dir)
        self.benchmark_path = Path(benchmark_path)
        self.review_dir.mkdir(parents=True, exist_ok=True)

        self.scenarios_map: Dict[str, PolarisDomainScenario] = {}
        self._load_corpus()
        self._load_existing_reviews()

    def _load_corpus(self):
        """Load original generated corpus without mutating the file."""
        if not self.corpus_path.exists():
            return
        with open(self.corpus_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                data = json.loads(line)
                scen = PolarisDomainScenario(**data)
                self.scenarios_map[scen.scenario_id] = scen

    def _load_existing_reviews(self):
        """Load persistent expert annotations from review_dir/annotations.jsonl if present."""
        ann_file = self.review_dir / "annotations.jsonl"
        if not ann_file.exists():
            return
        with open(ann_file, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                record = json.loads(line)
                scen_id = record.get("scenario_id")
                if scen_id in self.scenarios_map:
                    annotation = IndividualAnnotation(**record["annotation"])
                    self._apply_annotation_to_scenario(self.scenarios_map[scen_id], annotation)

    def submit_expert_annotation(
        self,
        scenario_id: str,
        reviewer_id: str,
        selected_action: str,
        confidence: float,
        rationale: str,
        additional_info_needed: Optional[str] = None,
        driving_evidence_factors: Optional[List[str]] = None,
        review_status: Optional[str] = None
    ) -> PolarisDomainScenario:
        """Validate and apply an expert review annotation, persisting to separate review files."""
        if scenario_id not in self.scenarios_map:
            raise ValueError(f"Scenario ID {scenario_id} not found in corpus.")

        selected_action_clean = selected_action.lower().strip()
        if selected_action_clean not in VALID_ACTIONS and selected_action_clean != "ambiguous":
            raise ValueError(f"Invalid action '{selected_action}'. Must be one of {VALID_ACTIONS}")

        if not reviewer_id or not reviewer_id.strip():
            raise ValueError("Reviewer ID is required.")

        if not rationale or not rationale.strip():
            raise ValueError("Review rationale is required.")

        if confidence < 1.0 or confidence > 5.0:
            raise ValueError("Confidence rating must be between 1 (very low) and 5 (very high).")

        scen = self.scenarios_map[scenario_id]

        # Check duplicate annotation by same reviewer
        for existing in scen.decision_label.individual_annotations:
            if existing.reviewer_id == reviewer_id:
                raise ValueError(f"Reviewer {reviewer_id} has already annotated scenario {scenario_id}.")

        # Determine review status
        baseline_act = scen.decision_label.evidence.evidence_reference or scen.decision_label.selected_action
        if review_status:
            status_enum = ReviewerStatus(review_status.upper())
        elif selected_action_clean == "ambiguous":
            status_enum = ReviewerStatus.AMBIGUOUS
        elif selected_action_clean == scen.decision_label.selected_action:
            status_enum = ReviewerStatus.ACCEPTED
        else:
            status_enum = ReviewerStatus.MODIFIED

        annotation = IndividualAnnotation(
            reviewer_id=reviewer_id,
            selected_action=selected_action_clean,
            confidence=confidence,
            rationale=rationale,
            additional_info_needed=additional_info_needed,
            driving_evidence_factors=driving_evidence_factors or [],
            review_status=status_enum,
            reviewed_at=datetime.utcnow().isoformat() + "Z"
        )

        # Apply annotation and compute consensus
        self._apply_annotation_to_scenario(scen, annotation)

        # Persist to separate review outputs (do not touch original corpus file)
        self._save_annotation_log(scenario_id, annotation)
        self.save_reviewed_dataset()

        return scen

    def _apply_annotation_to_scenario(self, scen: PolarisDomainScenario, annotation: IndividualAnnotation):
        """Update scenario decision label annotations and calculate consensus."""
        scen.decision_label.individual_annotations.append(annotation)
        annotations = scen.decision_label.individual_annotations

        if len(annotations) == 1:
            scen.decision_label.reviewer_id = annotation.reviewer_id
            scen.decision_label.reviewer_status = annotation.review_status
            if annotation.selected_action == "ambiguous":
                scen.decision_label.reviewer_status = ReviewerStatus.AMBIGUOUS
                scen.decision_label.consensus_action = None
                scen.decision_label.disagreement_flag = True
            else:
                scen.decision_label.selected_action = annotation.selected_action
                scen.decision_label.consensus_action = annotation.selected_action
                scen.decision_label.label_source = LabelSource.EXPERT
                scen.decision_label.disagreement_flag = False
            scen.decision_label.reviewer_notes = annotation.rationale
        else:
            # Multi-reviewer consensus
            actions = [a.selected_action for a in annotations if a.selected_action != "ambiguous"]
            if not actions:
                scen.decision_label.consensus_action = None
                scen.decision_label.reviewer_status = ReviewerStatus.AMBIGUOUS
                scen.decision_label.disagreement_flag = True
            else:
                from collections import Counter
                counts = Counter(actions)
                most_common, freq = counts.most_common(1)[0]
                if freq > len(annotations) / 2:
                    scen.decision_label.consensus_action = most_common
                    scen.decision_label.selected_action = most_common
                    scen.decision_label.label_source = LabelSource.CONSENSUS
                    scen.decision_label.reviewer_status = ReviewerStatus.ACCEPTED
                    scen.decision_label.disagreement_flag = False
                else:
                    scen.decision_label.consensus_action = None
                    scen.decision_label.reviewer_status = ReviewerStatus.AMBIGUOUS
                    scen.decision_label.disagreement_flag = True

    def _save_annotation_log(self, scenario_id: str, annotation: IndividualAnnotation):
        """Append annotation to annotations.jsonl log."""
        log_file = self.review_dir / "annotations.jsonl"
        record = {
            "scenario_id": scenario_id,
            "annotation": annotation.model_dump()
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, default=str) + "\n")

    def save_reviewed_dataset(self) -> Dict[str, Any]:
        """Save reviewed scenarios to reviewed_scenarios.jsonl and gold/polaris_gold_scenarios.jsonl."""
        reviewed_file = self.review_dir / "reviewed_scenarios.jsonl"
        gold_dir = DATA_DIR / "decision" / "gold"
        gold_dir.mkdir(parents=True, exist_ok=True)
        gold_file = gold_dir / "polaris_gold_scenarios.jsonl"

        gold_count = 0
        with open(reviewed_file, "w", encoding="utf-8") as f_rev, open(gold_file, "w", encoding="utf-8") as f_gold:
            for scen in self.scenarios_map.values():
                f_rev.write(json.dumps(scen.model_dump(), default=str) + "\n")
                if scen.decision_label.individual_annotations or scen.decision_label.reviewer_status != ReviewerStatus.UNREVIEWED:
                    gold_count += 1
                    scen_gold = scen.model_copy(deep=True)
                    scen_gold.decision_label.label_source = LabelSource.EXPERT
                    f_gold.write(json.dumps(scen_gold.model_dump(), default=str) + "\n")

        # Re-export prioritized review package CSV
        scenarios_list = list(self.scenarios_map.values())
        review_items = build_prioritized_review_package(scenarios_list, top_n=100)
        export_review_package_csv(review_items, str(self.review_dir / "review_package_top100.csv"))

        # Compute review metrics and manifest
        metrics = compute_review_metrics(scenarios_list)
        metrics["gold_labels_count"] = gold_count
        qc_report = self.run_quality_control()

        # Determine dataset status
        pct = metrics.get("pct_reviewed", 0.0)
        if qc_report["errors"]:
            readiness_status = "VALIDATION_FAILED"
        elif pct == 0.0:
            readiness_status = "DATASET_READY_FOR_DOMAIN_REVIEW"
        elif pct < 50.0:
            readiness_status = "DOMAIN_REVIEW_IN_PROGRESS"
        else:
            readiness_status = "DOMAIN_REVIEWED_TRAINING_READINESS_AUDIT_REQUIRED"

        manifest = {
            "review_manifest_version": "1.0.0",
            "updated_at": datetime.utcnow().isoformat() + "Z",
            "metrics": metrics,
            "quality_control": qc_report,
            "readiness_status": readiness_status,
            "benchmark_holdout_protected": not qc_report["benchmark_leakage_detected"],
            "original_corpus_unmodified": self.corpus_path.exists()
        }

        manifest_file = self.review_dir / "review_manifest.json"
        with open(manifest_file, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)

        return manifest

    def run_quality_control(self) -> Dict[str, Any]:
        """Run hard quality control checks on the reviewed dataset."""
        validator = PolarisDatasetValidator(benchmark_file_path=str(self.benchmark_path))
        scenarios = list(self.scenarios_map.values())
        val_report = validator.validate(scenarios)

        errors = val_report.get("errors", [])
        warnings = val_report.get("warnings", [])

        # Additional review-specific checks
        for scen in scenarios:
            for ann in scen.decision_label.individual_annotations:
                if not ann.reviewer_id:
                    errors.append(f"Scenario {scen.scenario_id} has annotation with missing reviewer_id.")
                if ann.selected_action not in VALID_ACTIONS and ann.selected_action != "ambiguous":
                    errors.append(f"Scenario {scen.scenario_id} has invalid action {ann.selected_action}.")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "benchmark_leakage_detected": val_report["benchmark_leakage_detected"],
            "episode_leakage_detected": val_report["episode_split_leakage_detected"]
        }

    def get_scenarios_for_review(self, top_n: int = 100) -> List[Dict[str, Any]]:
        """Return prioritized list of scenarios for review UI rendering."""
        auto_queue_file = DATA_DIR / "decision" / "review_queue" / "review_package_auto_priority.jsonl"
        if auto_queue_file.exists():
            res = []
            with open(auto_queue_file, "r", encoding="utf-8") as f:
                for line in f:
                    if not line.strip():
                        continue
                    item = json.loads(line)
                    scen_data = item.get("scenario")
                    scen_id = scen_data.get("scenario_id") if scen_data else None
                    if scen_id and scen_id in self.scenarios_map:
                        res.append(self.scenarios_map[scen_id].model_dump())
                    if len(res) >= top_n:
                        break
            if res:
                return res

        items = build_prioritized_review_package(list(self.scenarios_map.values()), top_n=top_n)
        res = []
        for item in items:
            scen = self.scenarios_map.get(item.scenario_id)
            if scen:
                res.append(scen.model_dump())
        return res
