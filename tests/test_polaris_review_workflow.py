import sys
from pathlib import Path

# Add project root and backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import unittest
import json
import shutil

from backend.polaris_scenario_schema import (
    PolarisDomainScenario,
    IndividualAnnotation,
    ReviewerStatus,
    LabelSource,
    DatasetSplit
)
from backend.polaris_scenario_generator import PolarisScenarioGenerator
from backend.polaris_review_manager import PolarisReviewManager
from backend.polaris_review_exporter import (
    build_prioritized_review_package,
    export_review_package_csv,
    compute_review_metrics
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
BENCHMARK_PATH = DATA_DIR / "polaris_decision_cases.json"
CORPUS_PATH = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
TMP_DIR = Path(__file__).resolve().parents[1] / "scratch" / "test_review_tmp"


class PolarisReviewWorkflowTests(unittest.TestCase):

    def setUp(self):
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        # Create temp corpus copy to avoid touching main files during test runs
        self.tmp_corpus = TMP_DIR / "temp_corpus.jsonl"
        self.tmp_review_dir = TMP_DIR / "review"
        self.tmp_review_dir.mkdir(parents=True, exist_ok=True)

        if CORPUS_PATH.exists():
            shutil.copy(CORPUS_PATH, self.tmp_corpus)
        else:
            gen = PolarisScenarioGenerator(seed=42)
            scens = gen.generate_dataset(10)
            with open(self.tmp_corpus, "w", encoding="utf-8") as f:
                for s in scens:
                    f.write(json.dumps(s.model_dump(), default=str) + "\n")

        self.manager = PolarisReviewManager(
            corpus_path=str(self.tmp_corpus),
            review_dir=str(self.tmp_review_dir),
            benchmark_path=str(BENCHMARK_PATH)
        )

    def tearDown(self):
        if TMP_DIR.exists():
            shutil.rmtree(TMP_DIR, ignore_errors=True)

    def test_01_reviewer_annotation_creation(self):
        scen_id = list(self.manager.scenarios_map.keys())[0]
        scen = self.manager.submit_expert_annotation(
            scenario_id=scen_id,
            reviewer_id="REV_MASTER_01",
            selected_action="slow_down",
            confidence=5.0,
            rationale="Heavy pack ice detected along planned track",
            driving_evidence_factors=["sea_ice_concentration", "ice_thickness"]
        )
        self.assertEqual(scen.decision_label.reviewer_id, "REV_MASTER_01")
        self.assertEqual(scen.decision_label.selected_action, "slow_down")
        self.assertEqual(scen.decision_label.reviewer_status, ReviewerStatus.MODIFIED)
        self.assertEqual(scen.decision_label.label_source, LabelSource.EXPERT)

    def test_02_reviewer_validation(self):
        scen_id = list(self.manager.scenarios_map.keys())[0]
        # Missing reviewer ID
        with self.assertRaises(ValueError):
            self.manager.submit_expert_annotation(
                scenario_id=scen_id, reviewer_id="", selected_action="slow_down",
                confidence=4.0, rationale="Valid rationale"
            )

        # Missing rationale
        with self.assertRaises(ValueError):
            self.manager.submit_expert_annotation(
                scenario_id=scen_id, reviewer_id="REV_01", selected_action="slow_down",
                confidence=4.0, rationale=""
            )

        # Invalid confidence rating
        with self.assertRaises(ValueError):
            self.manager.submit_expert_annotation(
                scenario_id=scen_id, reviewer_id="REV_01", selected_action="slow_down",
                confidence=10.0, rationale="Valid rationale"
            )

    def test_03_invalid_action_rejection(self):
        scen_id = list(self.manager.scenarios_map.keys())[0]
        with self.assertRaises(ValueError):
            self.manager.submit_expert_annotation(
                scenario_id=scen_id, reviewer_id="REV_01", selected_action="fly_around",
                confidence=4.0, rationale="Invalid maneuver"
            )

    def test_04_ambiguous_review_handling(self):
        scen_id = list(self.manager.scenarios_map.keys())[0]
        scen = self.manager.submit_expert_annotation(
            scenario_id=scen_id,
            reviewer_id="REV_02",
            selected_action="AMBIGUOUS",
            confidence=3.0,
            rationale="Satellite imagery obscured by cloud cover; cannot safely determine path.",
            additional_info_needed="Requires high-resolution SAR data."
        )
        self.assertEqual(scen.decision_label.reviewer_status, ReviewerStatus.AMBIGUOUS)
        self.assertIsNone(scen.decision_label.consensus_action)
        self.assertTrue(scen.decision_label.disagreement_flag)

    def test_05_multi_reviewer_annotations_and_consensus(self):
        scen_id = list(self.manager.scenarios_map.keys())[1]
        
        # Reviewer 1 -> reroute
        self.manager.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_01", selected_action="reroute",
            confidence=4.0, rationale="Iceberg blocking primary channel"
        )

        # Reviewer 2 -> reroute (majority consensus)
        scen = self.manager.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_02", selected_action="reroute",
            confidence=5.0, rationale="Agree with reroute via East channel"
        )

        self.assertEqual(scen.decision_label.consensus_action, "reroute")
        self.assertEqual(scen.decision_label.label_source, LabelSource.CONSENSUS)
        self.assertFalse(scen.decision_label.disagreement_flag)

    def test_06_disagreement_preservation(self):
        scen_id = list(self.manager.scenarios_map.keys())[2]

        # Reviewer 1 -> hold_position
        self.manager.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_01", selected_action="hold_position",
            confidence=4.0, rationale="Zero visibility hold"
        )

        # Reviewer 2 -> slow_down (disagreement)
        scen = self.manager.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_02", selected_action="slow_down",
            confidence=3.0, rationale="Creep forward at 2 kts"
        )

        self.assertIsNone(scen.decision_label.consensus_action)
        self.assertEqual(scen.decision_label.reviewer_status, ReviewerStatus.AMBIGUOUS)
        self.assertTrue(scen.decision_label.disagreement_flag)
        self.assertEqual(len(scen.decision_label.individual_annotations), 2)

    def test_07_review_export_and_import(self):
        scen_id = list(self.manager.scenarios_map.keys())[0]
        self.manager.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_EXP", selected_action="request_escort",
            confidence=4.0, rationale="Heavily ridged multi-year ice"
        )

        manifest = self.manager.save_reviewed_dataset()
        self.assertTrue((self.tmp_review_dir / "annotations.jsonl").exists())
        self.assertTrue((self.tmp_review_dir / "reviewed_scenarios.jsonl").exists())
        self.assertTrue((self.tmp_review_dir / "review_package_top100.csv").exists())
        self.assertTrue((self.tmp_review_dir / "review_manifest.json").exists())

        # Reload manager to test persistent review import
        new_manager = PolarisReviewManager(
            corpus_path=str(self.tmp_corpus),
            review_dir=str(self.tmp_review_dir),
            benchmark_path=str(BENCHMARK_PATH)
        )
        loaded_scen = new_manager.scenarios_map[scen_id]
        self.assertEqual(loaded_scen.decision_label.reviewer_id, "REV_EXP")
        self.assertEqual(loaded_scen.decision_label.selected_action, "request_escort")

    def test_08_original_dataset_immutability(self):
        original_mtime = CORPUS_PATH.stat().st_mtime if CORPUS_PATH.exists() else None
        scen_id = list(self.manager.scenarios_map.keys())[0]
        self.manager.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_01", selected_action="slow_down",
            confidence=4.0, rationale="Testing immutability"
        )
        self.manager.save_reviewed_dataset()
        if CORPUS_PATH.exists():
            self.assertEqual(CORPUS_PATH.stat().st_mtime, original_mtime)

    def test_09_benchmark_protection(self):
        qc = self.manager.run_quality_control()
        self.assertFalse(qc["benchmark_leakage_detected"])

    def test_10_split_protection(self):
        qc = self.manager.run_quality_control()
        self.assertFalse(qc["episode_leakage_detected"])

    def test_11_review_metrics(self):
        scen_ids = list(self.manager.scenarios_map.keys())
        self.manager.submit_expert_annotation(
            scenario_id=scen_ids[0], reviewer_id="REV_01", selected_action="continue",
            confidence=5.0, rationale="Accepted baseline"
        )
        self.manager.submit_expert_annotation(
            scenario_id=scen_ids[1], reviewer_id="REV_01", selected_action="reroute",
            confidence=4.0, rationale="Modified action"
        )
        manifest = self.manager.save_reviewed_dataset()
        metrics = manifest["metrics"]

        self.assertGreater(metrics["reviewed_count"], 0)
        self.assertIn("pct_reviewed", metrics)
        self.assertIn("action_review_coverage", metrics)
        self.assertEqual(manifest["readiness_status"], "DOMAIN_REVIEW_IN_PROGRESS")

    def test_12_provenance_preservation(self):
        scen = list(self.manager.scenarios_map.values())[0]
        self.assertEqual(scen.provenance.source_type.value, "REAL_SOURCE_DERIVED_SIMULATED")
        self.assertIsNotNone(scen.provenance.field_provenance)


if __name__ == "__main__":
    unittest.main()
