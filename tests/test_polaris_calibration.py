"""POLARIS Calibration & Expert Gold Evaluation Test Suite."""
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
    LabelSource
)
from backend.polaris_calibration_evaluator import PolarisCalibrationEvaluator, select_stratified_calibration_sample

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CORPUS_PATH = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
BENCHMARK_PATH = DATA_DIR / "polaris_decision_cases.json"
TMP_DIR = Path(__file__).resolve().parents[1] / "scratch" / "test_calib_tmp"


class PolarisCalibrationTests(unittest.TestCase):

    def setUp(self):
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        self.tmp_calib_dir = TMP_DIR / "calibration"
        self.evaluator = PolarisCalibrationEvaluator(
            calibration_dir=self.tmp_calib_dir,
            corpus_file=CORPUS_PATH,
            benchmark_file=BENCHMARK_PATH
        )

    def tearDown(self):
        if TMP_DIR.exists():
            shutil.rmtree(TMP_DIR, ignore_errors=True)

    def test_01_calibration_sample_selection(self):
        sample = self.evaluator.sample_items
        self.assertEqual(len(sample), 24)
        
        # Verify no duplicate scenario IDs
        sids = [x["scenario"].scenario_id for x in sample]
        self.assertEqual(len(sids), len(set(sids)))

    def test_02_export_calibration_package(self):
        manifest = self.evaluator.export_calibration_package()
        self.assertEqual(manifest["total_sample_size"], 24)
        
        sample_file = self.tmp_calib_dir / "calibration_sample.jsonl"
        self.assertTrue(sample_file.exists())
        
        with open(sample_file, "r", encoding="utf-8") as f:
            lines = [line for line in f if line.strip()]
        self.assertEqual(len(lines), 24)

    def test_03_protected_benchmark_and_corpus(self):
        manifest = self.evaluator.export_calibration_package()
        self.assertTrue(BENCHMARK_PATH.exists())
        self.assertTrue(CORPUS_PATH.exists())

    def test_04_expert_annotation_persistence_and_evaluation(self):
        # Simulate an expert annotation on one of the sample scenarios
        sample_scen = self.evaluator.sample_items[0]["scenario"].model_copy(deep=True)
        sid = sample_scen.scenario_id
        
        ann = IndividualAnnotation(
            reviewer_id="TEST_MARINER_01",
            selected_action="continue",
            confidence=5.0,
            rationale="Clear open water passage confirmed.",
            driving_evidence_factors=["nearest_iceberg_distance_m", "visibility_nautical_miles"],
            review_status=ReviewerStatus.ACCEPTED,
            reviewed_at="2026-09-22T20:00:00Z"
        )
        sample_scen.decision_label.individual_annotations.append(ann)
        sample_scen.decision_label.consensus_action = "continue"
        sample_scen.decision_label.reviewer_status = ReviewerStatus.ACCEPTED
        sample_scen.decision_label.label_source = LabelSource.EXPERT

        reviewed_map = {sid: sample_scen}
        report = self.evaluator.evaluate_against_expert_reviews(reviewed_map)

        self.assertEqual(report["scenarios_reviewed_count"], 1)
        self.assertIn("expert_agreement_rates", report)
        self.assertIn("confusion_matrices", report)
        
        gold_file = self.tmp_calib_dir / "gold_calibration.jsonl"
        self.assertTrue(gold_file.exists())

    def test_05_no_fake_gold_labels_on_unreviewed(self):
        report = self.evaluator.evaluate_against_expert_reviews({})
        self.assertEqual(report["scenarios_reviewed_count"], 0)
        self.assertEqual(report["gold_calibration_count"], 0)


if __name__ == "__main__":
    unittest.main()
