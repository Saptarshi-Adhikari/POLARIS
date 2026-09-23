"""POLARIS Automated Label Adjudicator Unit & Integration Test Suite."""
import sys
from pathlib import Path

# Add project root and backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import unittest
import json
import shutil
import hashlib

from backend.polaris_scenario_schema import PolarisDomainScenario, LabelSource
from backend.polaris_scenario_generator import PolarisScenarioGenerator
from backend.polaris_label_adjudicator import (
    PolarisLabelAdjudicator,
    calculate_review_priority_score,
    AdjudicationOutcome,
    LabelType,
    SimulationSafetyOutcome
)

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CORPUS_PATH = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
BENCHMARK_PATH = DATA_DIR / "polaris_decision_cases.json"
TMP_DIR = Path(__file__).resolve().parents[1] / "scratch" / "test_adj_tmp"


class PolarisAdjudicatorTests(unittest.TestCase):

    def setUp(self):
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        self.tmp_corpus = TMP_DIR / "corpus.jsonl"
        if CORPUS_PATH.exists():
            shutil.copy(CORPUS_PATH, self.tmp_corpus)
        else:
            gen = PolarisScenarioGenerator(seed=42)
            scens = gen.generate_dataset(20)
            with open(self.tmp_corpus, "w", encoding="utf-8") as f:
                for s in scens:
                    f.write(json.dumps(s.model_dump(), default=str) + "\n")

        self.adjudicator = PolarisLabelAdjudicator(
            corpus_path=str(self.tmp_corpus),
            benchmark_path=str(BENCHMARK_PATH)
        )

    def tearDown(self):
        if TMP_DIR.exists():
            shutil.rmtree(TMP_DIR, ignore_errors=True)

    def test_01_deterministic_adjudication(self):
        scen = self.adjudicator.scenarios[0]
        rec1 = self.adjudicator.adjudicate_scenario(scen)
        rec2 = self.adjudicator.adjudicate_scenario(scen)
        self.assertEqual(rec1.outcome, rec2.outcome)
        self.assertEqual(rec1.review_priority_score, rec2.review_priority_score)

    def test_02_silver_label_creation(self):
        # Create a clear scenario that satisfies AUTO_ACCEPT criteria
        gen = PolarisScenarioGenerator(seed=123)
        scen = gen.generate_scenario(0, "CLEAR", "EP_CLEAR")
        rec = self.adjudicator.adjudicate_scenario(scen)
        self.assertEqual(rec.outcome, AdjudicationOutcome.AUTO_ACCEPT)
        self.assertEqual(rec.label_type, LabelType.SILVER)
        self.assertFalse(rec.expert_validated)

    def test_03_human_review_routing(self):
        # Heavy ice / blocked scenario must route to HUMAN_REVIEW_REQUIRED
        gen = PolarisScenarioGenerator(seed=456)
        scen = gen.generate_scenario(0, "BLOCKED_ROUTE", "EP_BLOCKED")
        rec = self.adjudicator.adjudicate_scenario(scen)
        self.assertEqual(rec.outcome, AdjudicationOutcome.HUMAN_REVIEW_REQUIRED)
        self.assertGreater(rec.review_priority_score, 0.0)

    def test_04_disagreement_detection(self):
        sim = SimulationSafetyOutcome(
            collision=False,
            min_clearance_m=500.0,
            route_feasible=True,
            route_blocked=False,
            destination_reachable=True,
            excessive_xte=False,
            major_safety_violation=False,
            terminal_outcome="SAFE_PASSAGE"
        )
        score, reasons = calculate_review_priority_score(
            baseline_action="slow_down",
            laya_action="continue",
            laya_confidence=0.55,
            sim_outcome=sim,
            hazard_severity_score=1.2,
            route_blocked=False,
            emergency_active=False,
            nearest_iceberg_dist_m=500.0,
            visibility_nm=2.0,
            fuel_remaining_pct=80.0,
            scenario_family="MODERATE_ICE"
        )
        self.assertGreaterEqual(score, 50.0)
        self.assertTrue(any("disagrees" in r for r in reasons))

    def test_05_high_risk_escalation(self):
        gen = PolarisScenarioGenerator(seed=789)
        scen = gen.generate_scenario(0, "EMERGENCY", "EP_EMERGENCY")
        rec = self.adjudicator.adjudicate_scenario(scen)
        self.assertEqual(rec.outcome, AdjudicationOutcome.HUMAN_REVIEW_REQUIRED)
        self.assertTrue(rec.emergency_active)

    def test_06_ambiguous_handling(self):
        gen = PolarisScenarioGenerator(seed=999)
        scen = gen.generate_scenario(0, "CONFLICTING_AMBIGUOUS", "EP_AMBIG")
        rec = self.adjudicator.adjudicate_scenario(scen)
        self.assertEqual(rec.outcome, AdjudicationOutcome.AMBIGUOUS)

    def test_07_no_fake_expert_labels(self):
        manifest = self.adjudicator.process_corpus()
        self.assertEqual(manifest["gold_labels_count"], 0)
        self.assertEqual(manifest["auto_accepted_silver"], manifest["silver_labels_generated"])

    def test_08_train_test_protection(self):
        manifest = self.adjudicator.process_corpus()
        self.assertTrue(manifest["holdout_benchmark_protected"])
        self.assertTrue(manifest["original_corpus_unmodified"])

    def test_09_reproducibility(self):
        m1 = self.adjudicator.process_corpus()
        m2 = self.adjudicator.process_corpus()
        self.assertEqual(m1["total_scenarios_processed"], m2["total_scenarios_processed"])
        self.assertEqual(m1["auto_accepted_silver"], m2["auto_accepted_silver"])
        self.assertEqual(m1["human_review_required"], m2["human_review_required"])

    def test_10_high_consequence_action_prohibition(self):
        # Emergency response, hold position, request escort must never auto-silver
        gen = PolarisScenarioGenerator(seed=123)
        scen = gen.generate_scenario(0, "CLEAR", "EP_CLEAR")
        # Artificially set state to produce emergency_response action
        scen.state["operational"]["emergency_status"] = True
        rec = self.adjudicator.adjudicate_scenario(scen)
        self.assertNotEqual(rec.outcome, AdjudicationOutcome.AUTO_ACCEPT)
        self.assertEqual(rec.outcome, AdjudicationOutcome.HUMAN_REVIEW_REQUIRED)

    def test_11_simulation_conflict_detection(self):
        gen = PolarisScenarioGenerator(seed=123)
        scen = gen.generate_scenario(0, "CLEAR", "EP_CLEAR")
        # Artificially set iceberg dist < 45m to trigger collision in simulation
        scen.state["ice"]["nearest_iceberg_distance_m"] = 30.0
        rec = self.adjudicator.adjudicate_scenario(scen)
        self.assertTrue(rec.simulation_outcome.collision)
        self.assertEqual(rec.outcome, AdjudicationOutcome.HUMAN_REVIEW_REQUIRED)


if __name__ == "__main__":
    unittest.main()

