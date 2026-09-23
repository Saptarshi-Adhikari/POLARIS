"""POLARIS Roadmap & Research Gap Integration Unit & Integration Test Suite."""
import sys
from pathlib import Path

# Add project root and backend to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

import unittest
import json

from backend.polaris_telemetry_fitter import VesselTelemetryFitter
from benchmark.benchmark_runner import PolarNavigationBenchmarkRunner
from research.marl.multi_agent_colregs_env import MultiAgentCOLREGsEnv
from research.hydrodynamics.hydrodynamic_surrogate import HydrodynamicsSurrogateModel

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CORPUS_PATH = DATA_DIR / "decision" / "generated" / "polaris_domain_scenarios_500.jsonl"
BENCHMARK_PATH = DATA_DIR / "polaris_decision_cases.json"


class PolarisRoadmapTests(unittest.TestCase):

    def test_01_telemetry_fitter_fallback(self):
        fitter = VesselTelemetryFitter()
        res = fitter.fit_nomoto_parameters()
        self.assertEqual(res["status"], "READY_FOR_EXTERNAL_DATA")
        self.assertEqual(res["fitted_k"], 0.15)
        self.assertEqual(res["fitted_t"], 12.0)

    def test_02_marl_environment_isolation(self):
        env = MultiAgentCOLREGsEnv(num_vessels=2, num_icebergs=3)
        state = env.reset()
        self.assertEqual(len(state["vessels"]), 2)
        self.assertEqual(state["status"], "RESEARCH_ONLY")

    def test_03_hydrodynamics_surrogate(self):
        surrogate = HydrodynamicsSurrogateModel()
        res = surrogate.predict_resistance(speed_knots=10.0, ice_concentration=0.5, ice_thickness_m=0.3)
        self.assertIn("total_resistance_kn", res)
        self.assertEqual(res["status"], "FUTURE_DATA_REQUIRED")

    def test_04_benchmark_suite_runner(self):
        runner = PolarNavigationBenchmarkRunner(corpus_path=str(CORPUS_PATH), benchmark_path=str(BENCHMARK_PATH))
        report = runner.run_benchmark_suite(max_scenarios=5)
        self.assertEqual(report["evaluated_scenarios_count"], 5)
        self.assertIn("overall_metrics", report)


if __name__ == "__main__":
    unittest.main()
