import sys
from pathlib import Path

# Add project root and backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import unittest
import json
import shutil
import hashlib
from fastapi.testclient import TestClient

from backend.main import app
from backend.polaris_review_manager import PolarisReviewManager

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CORPUS_PATH = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
BENCHMARK_PATH = DATA_DIR / "polaris_decision_cases.json"
REVIEW_DIR = DATA_DIR / "decision" / "review"
TMP_DIR = Path(__file__).resolve().parents[1] / "scratch" / "test_api_tmp"


class PolarisReviewAPITests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def _file_hash(self, path: Path) -> str:
        if not path.exists():
            return ""
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()

    def setUp(self):
        TMP_DIR.mkdir(parents=True, exist_ok=True)
        self.corpus_hash_before = self._file_hash(CORPUS_PATH)
        self.benchmark_hash_before = self._file_hash(BENCHMARK_PATH)

    def tearDown(self):
        # Cleanup temp directory if any
        if TMP_DIR.exists():
            shutil.rmtree(TMP_DIR, ignore_errors=True)

    def test_01_get_review_html_endpoint(self):
        res = self.client.get("/review")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/html", res.headers["content-type"])
        html = res.text
        self.assertIn("POLARIS", html)
        self.assertIn("POLARIS EXPERT DOMAIN REVIEW", html)
        self.assertIn("NOT EXPERT VALIDATED", html)

    def test_02_get_scenarios_api_endpoint(self):
        res = self.client.get("/review/api/scenarios?top_n=10")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("scenarios", data)
        self.assertIn("manifest", data)
        self.assertLessEqual(len(data["scenarios"]), 10)
        self.assertEqual(data["manifest"]["metrics"]["total_scenarios"], 500)

    def test_03_get_scenario_detail_endpoint(self):
        # First fetch list to get valid ID
        res_list = self.client.get("/review/api/scenarios?top_n=1")
        scen_id = res_list.json()["scenarios"][0]["scenario_id"]

        res_detail = self.client.get(f"/review/api/scenarios/{scen_id}")
        self.assertEqual(res_detail.status_code, 200)
        data = res_detail.json()
        self.assertEqual(data["scenario_id"], scen_id)
        self.assertIn("provenance", data)
        self.assertIn("decision_label", data)

    def test_04_get_metrics_api_endpoint(self):
        res = self.client.get("/review/api/metrics")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("metrics", data)
        self.assertIn("readiness_status", data)

    def test_05_annotation_submission_workflow(self):
        # Create isolated manager for test annotation to avoid dirtying prod review dir
        tmp_corpus = TMP_DIR / "corpus_copy.jsonl"
        tmp_review = TMP_DIR / "review_tmp"
        tmp_review.mkdir(parents=True, exist_ok=True)
        shutil.copy(CORPUS_PATH, tmp_corpus)

        test_mgr = PolarisReviewManager(
            corpus_path=str(tmp_corpus),
            review_dir=str(tmp_review),
            benchmark_path=str(BENCHMARK_PATH)
        )
        scen_id = list(test_mgr.scenarios_map.keys())[0]

        updated = test_mgr.submit_expert_annotation(
            scenario_id=scen_id,
            reviewer_id="TEST_REVIEWER",
            selected_action="slow_down",
            confidence=4.0,
            rationale="Test annotation for workflow validation",
            driving_evidence_factors=["sea_ice_concentration"]
        )

        self.assertEqual(updated.decision_label.reviewer_id, "TEST_REVIEWER")
        self.assertEqual(updated.decision_label.selected_action, "slow_down")
        self.assertEqual(updated.decision_label.reviewer_status.value, "MODIFIED")

    def test_06_invalid_annotation_rejection(self):
        # Test invalid action via API
        res_list = self.client.get("/review/api/scenarios?top_n=1")
        scen_id = res_list.json()["scenarios"][0]["scenario_id"]

        bad_payload = {
            "scenario_id": scen_id,
            "reviewer_id": "REV_TEST",
            "selected_action": "invalid_maneuver",
            "confidence": 4.0,
            "rationale": "Invalid action test"
        }
        res = self.client.post("/review/api/annotate", json=bad_payload)
        self.assertEqual(res.status_code, 400)

        # Test missing rationale
        bad_payload2 = {
            "scenario_id": scen_id,
            "reviewer_id": "REV_TEST",
            "selected_action": "slow_down",
            "confidence": 4.0,
            "rationale": ""
        }
        res2 = self.client.post("/review/api/annotate", json=bad_payload2)
        self.assertEqual(res2.status_code, 400)

    def test_07_ambiguous_review_workflow(self):
        tmp_corpus = TMP_DIR / "corpus_copy_ambig.jsonl"
        tmp_review = TMP_DIR / "review_tmp_ambig"
        tmp_review.mkdir(parents=True, exist_ok=True)
        shutil.copy(CORPUS_PATH, tmp_corpus)

        test_mgr = PolarisReviewManager(
            corpus_path=str(tmp_corpus),
            review_dir=str(tmp_review),
            benchmark_path=str(BENCHMARK_PATH)
        )
        scen_id = list(test_mgr.scenarios_map.keys())[0]

        updated = test_mgr.submit_expert_annotation(
            scenario_id=scen_id,
            reviewer_id="TEST_REVIEWER_AMBIG",
            selected_action="AMBIGUOUS",
            confidence=2.0,
            rationale="Insufficient information to determine safe speed",
            additional_info_needed="Requires sonar ice keel profiling"
        )

        self.assertEqual(updated.decision_label.reviewer_status.value, "AMBIGUOUS")
        self.assertIsNone(updated.decision_label.consensus_action)
        self.assertTrue(updated.decision_label.disagreement_flag)

    def test_08_multi_reviewer_disagreement_and_consensus(self):
        tmp_corpus = TMP_DIR / "corpus_copy_multi.jsonl"
        tmp_review = TMP_DIR / "review_tmp_multi"
        tmp_review.mkdir(parents=True, exist_ok=True)
        shutil.copy(CORPUS_PATH, tmp_corpus)

        test_mgr = PolarisReviewManager(
            corpus_path=str(tmp_corpus),
            review_dir=str(tmp_review),
            benchmark_path=str(BENCHMARK_PATH)
        )
        scen_id = list(test_mgr.scenarios_map.keys())[0]

        # Reviewer 1 -> slow_down
        test_mgr.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_A", selected_action="slow_down",
            confidence=4.0, rationale="Slow down in pack ice"
        )
        # Reviewer 2 -> reroute (disagreement)
        scen_dis = test_mgr.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_B", selected_action="reroute",
            confidence=4.0, rationale="Reroute around pack ice"
        )
        self.assertTrue(scen_dis.decision_label.disagreement_flag)
        self.assertIsNone(scen_dis.decision_label.consensus_action)

        # Reviewer 3 -> slow_down (majority consensus achieved 2 out of 3)
        scen_con = test_mgr.submit_expert_annotation(
            scenario_id=scen_id, reviewer_id="REV_C", selected_action="slow_down",
            confidence=5.0, rationale="Agree with slowdown"
        )
        self.assertFalse(scen_con.decision_label.disagreement_flag)
        self.assertEqual(scen_con.decision_label.consensus_action, "slow_down")
        self.assertEqual(scen_con.decision_label.label_source.value, "CONSENSUS")

    def test_09_dataset_immutability(self):
        # Ensure hashes of generated dataset and benchmark remain strictly identical
        corpus_hash_after = self._file_hash(CORPUS_PATH)
        benchmark_hash_after = self._file_hash(BENCHMARK_PATH)
        self.assertEqual(self.corpus_hash_before, corpus_hash_after)
        self.assertEqual(self.benchmark_hash_before, benchmark_hash_after)


if __name__ == "__main__":
    unittest.main()
