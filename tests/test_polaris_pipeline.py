import sys
from pathlib import Path

# Add project root and backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import unittest
import json

from backend.polaris_scenario_schema import PolarisDomainScenario, DatasetSplit
from backend.polaris_scenario_generator import PolarisScenarioGenerator
from backend.polaris_dataset_validator import PolarisDatasetValidator
from backend.polaris_dataset_exporter import assign_dataset_splits, export_dataset_jsonl, generate_dataset_manifest
from backend.polaris_decision import PolarisDecisionAdapter
from backend.polaris_decision_schema import PolarisDecisionInput

BENCHMARK_PATH = Path(__file__).resolve().parents[1] / "data" / "polaris_decision_cases.json"
TMP_DIR = Path(__file__).resolve().parents[1] / "scratch" / "test_tmp"


class PolarisPipelineTests(unittest.TestCase):

    def setUp(self):
        TMP_DIR.mkdir(parents=True, exist_ok=True)

    def test_01_deterministic_generation(self):
        gen1 = PolarisScenarioGenerator(seed=42)
        scens1 = gen1.generate_dataset(10)

        gen2 = PolarisScenarioGenerator(seed=42)
        scens2 = gen2.generate_dataset(10)

        for s1, s2 in zip(scens1, scens2):
            self.assertEqual(s1.scenario_id, s2.scenario_id)
            self.assertEqual(s1.state, s2.state)
            self.assertEqual(s1.decision_label.selected_action, s2.decision_label.selected_action)

    def test_02_schema_and_provenance_validation(self):
        gen = PolarisScenarioGenerator(seed=100)
        scens = gen.generate_dataset(20)
        val = PolarisDatasetValidator(benchmark_file_path=str(BENCHMARK_PATH))
        report = val.validate(scens)

        self.assertEqual(report["total_scenarios"], 20)
        self.assertEqual(report["provenance_completeness_pct"], 100.0)
        self.assertFalse(report["benchmark_leakage_detected"])
        self.assertFalse(report["episode_split_leakage_detected"])

    def test_03_split_integrity_no_episode_leakage(self):
        gen = PolarisScenarioGenerator(seed=200)
        scens = gen.generate_dataset(50)
        scens = assign_dataset_splits(scens, train_ratio=0.70, val_ratio=0.15)

        train_episodes = {s.episode_id for s in scens if s.dataset_split == DatasetSplit.TRAIN}
        val_episodes = {s.episode_id for s in scens if s.dataset_split == DatasetSplit.VALIDATION}
        test_episodes = {s.episode_id for s in scens if s.dataset_split == DatasetSplit.TEST}

        self.assertTrue(train_episodes.isdisjoint(val_episodes))
        self.assertTrue(train_episodes.isdisjoint(test_episodes))
        self.assertTrue(val_episodes.isdisjoint(test_episodes))

    def test_04_no_benchmark_holdout_leakage(self):
        gen = PolarisScenarioGenerator(seed=300)
        scens = gen.generate_dataset(20)
        val = PolarisDatasetValidator(benchmark_file_path=str(BENCHMARK_PATH))
        report = val.validate(scens)
        self.assertFalse(report["benchmark_leakage_detected"])

    def test_05_export_import_roundtrip(self):
        gen = PolarisScenarioGenerator(seed=400)
        scens = gen.generate_dataset(5)
        jsonl_path = str(TMP_DIR / "roundtrip.jsonl")
        export_dataset_jsonl(scens, jsonl_path)

        loaded = []
        with open(jsonl_path, "r", encoding="utf-8") as f:
            for line in f:
                loaded.append(PolarisDomainScenario(**json.loads(line)))

        self.assertEqual(len(loaded), 5)
        self.assertEqual(loaded[0].scenario_id, scens[0].scenario_id)

    def test_07_field_level_provenance(self):
        gen = PolarisScenarioGenerator(seed=600)
        scen = gen.generate_scenario(0, "MODERATE_ICE", "EP_001")
        self.assertIsNotNone(scen.provenance.field_provenance)
        self.assertIn("USNIC", scen.provenance.field_provenance.iceberg_position.provider)
        self.assertIn("Copernicus CMEMS", scen.provenance.field_provenance.sea_ice_concentration.provider)
        self.assertIn("ECMWF ERA5", scen.provenance.field_provenance.current_conditions.provider)
        self.assertEqual(scen.provenance.field_provenance.vessel_kinematics.data_state.value, "SIMULATED")

    def test_08_scenario_and_label_provenance_classification(self):
        gen = PolarisScenarioGenerator(seed=700)
        scen = gen.generate_scenario(0, "HEAVY_ICE", "EP_002")
        self.assertEqual(scen.provenance.source_type.value, "REAL_SOURCE_DERIVED_SIMULATED")
        self.assertEqual(scen.decision_label.label_source.value, "EXPERIMENTAL_RULE_BASELINE")
        self.assertFalse(scen.decision_label.disagreement_flag)

    def test_09_expert_review_annotation_and_consensus(self):
        from backend.polaris_scenario_schema import IndividualAnnotation, ReviewerStatus
        from backend.polaris_review_exporter import apply_expert_annotation
        gen = PolarisScenarioGenerator(seed=800)
        scen = gen.generate_scenario(0, "CLEAR", "EP_003")

        # Single expert review
        ann1 = IndividualAnnotation(
            reviewer_id="REV_01",
            selected_action="continue",
            confidence=0.9,
            rationale="Clear passage confirmed by satellite",
            reviewed_at="2026-09-22T22:00:00Z"
        )
        scen = apply_expert_annotation(scen, ann1)
        self.assertEqual(scen.decision_label.reviewer_status, ReviewerStatus.ACCEPTED)
        self.assertEqual(scen.decision_label.label_source, "EXPERT")
        self.assertEqual(scen.decision_label.consensus_action, "continue")
        self.assertFalse(scen.decision_label.disagreement_flag)

        # Disagreeing second expert review
        ann2 = IndividualAnnotation(
            reviewer_id="REV_02",
            selected_action="slow_down",
            confidence=0.7,
            rationale="Precautionary slowdown for potential growlers",
            reviewed_at="2026-09-22T22:05:00Z"
        )
        scen = apply_expert_annotation(scen, ann2)
        self.assertEqual(scen.decision_label.reviewer_status, ReviewerStatus.AMBIGUOUS)
        self.assertIsNone(scen.decision_label.consensus_action)
        self.assertTrue(scen.decision_label.disagreement_flag)

    def test_10_review_export_and_metrics(self):
        from backend.polaris_review_exporter import build_prioritized_review_package, export_review_package_csv, compute_review_metrics
        gen = PolarisScenarioGenerator(seed=900)
        scens = gen.generate_dataset(20)
        items = build_prioritized_review_package(scens, top_n=10)
        self.assertEqual(len(items), 10)
        
        csv_path = str(TMP_DIR / "review_package.csv")
        export_review_package_csv(items, csv_path)
        self.assertTrue(Path(csv_path).exists())

        metrics = compute_review_metrics(scens)
        self.assertIn("pct_reviewed", metrics)
        self.assertIn("action_review_coverage", metrics)

    def test_11_invalid_provenance_rejection(self):
        from backend.polaris_scenario_schema import ScenarioProvenance, ProvenanceDetail, DataState, SourceType
        gen = PolarisScenarioGenerator(seed=1000)
        scen = gen.generate_scenario(0, "CLEAR", "EP_004")
        # Nullify provider to create invalid provenance detail
        scen.provenance.navigation_source.provider = ""
        val = PolarisDatasetValidator()
        report = val.validate([scen])
        self.assertGreater(len(report["warnings"]), 0)


if __name__ == "__main__":
    unittest.main()

