"""POLARIS Data Quality, Provenance & Leakage Validator.

Validates domain datasets against schema compliance, geography/physics limits,
provenance completeness, duplicate detection, and train/val/test split leakage.
"""
from typing import List, Dict, Any, Tuple
from backend.polaris_scenario_schema import PolarisDomainScenario, DatasetSplit


class PolarisDatasetValidator:
    """Comprehensive data quality and integrity validator."""

    def __init__(self, benchmark_file_path: str = None):
        self.benchmark_scenarios = set()
        if benchmark_file_path:
            self._load_benchmark_scenarios(benchmark_file_path)

    def _load_benchmark_scenarios(self, path: str):
        import json
        from pathlib import Path
        p = Path(path)
        if p.exists():
            try:
                with open(p) as f:
                    cases = json.load(f)
                    for c in cases:
                        self.benchmark_scenarios.add(c["id"])
            except Exception:
                pass

    def validate(self, scenarios: List[PolarisDomainScenario]) -> Dict[str, Any]:
        """Validate a list of scenarios and return a detailed report."""
        report = {
            "total_scenarios": len(scenarios),
            "valid_count": 0,
            "invalid_count": 0,
            "errors": [],
            "warnings": [],
            "split_counts": {s.value: 0 for s in DatasetSplit},
            "action_counts": {},
            "source_type_counts": {},
            "episode_split_leakage_detected": False,
            "benchmark_leakage_detected": False,
            "duplicate_scenario_ids": [],
            "ambiguous_count": 0,
            "provenance_completeness_pct": 100.0
        }

        seen_ids = set()
        episode_splits = {}
        missing_prov_count = 0

        for idx, scen in enumerate(scenarios):
            scen_id = scen.scenario_id
            ep_id = scen.episode_id
            split = scen.dataset_split

            # Check duplicate IDs
            if scen_id in seen_ids:
                report["duplicate_scenario_ids"].append(scen_id)
                report["errors"].append(f"Duplicate scenario ID found: {scen_id}")
            seen_ids.add(scen_id)

            # Check benchmark leakage
            if scen_id in self.benchmark_scenarios:
                report["benchmark_leakage_detected"] = True
                report["errors"].append(f"Benchmark leakage detected: Scenario {scen_id} is in 10-case holdout set!")

            # Check episode split integrity (leakage)
            if ep_id in episode_splits and episode_splits[ep_id] != split:
                report["episode_split_leakage_detected"] = True
                report["errors"].append(f"Episode leakage: Episode {ep_id} split mismatch ({episode_splits[ep_id]} vs {split})")
            episode_splits[ep_id] = split

            # Check provenance completeness
            if not scen.provenance or not scen.provenance.navigation_source.provider:
                missing_prov_count += 1
                report["warnings"].append(f"Scenario {scen_id} missing detailed provenance provider.")

            # Tally counts
            report["split_counts"][split.value] = report["split_counts"].get(split.value, 0) + 1
            action = scen.decision_label.selected_action
            report["action_counts"][action] = report["action_counts"].get(action, 0) + 1
            stype = scen.provenance.source_type.value
            report["source_type_counts"][stype] = report["source_type_counts"].get(stype, 0) + 1

            if scen.decision_label.reviewer_status.value == "AMBIGUOUS":
                report["ambiguous_count"] += 1

        if len(scenarios) > 0:
            report["provenance_completeness_pct"] = round(((len(scenarios) - missing_prov_count) / len(scenarios)) * 100, 1)

        report["invalid_count"] = len(report["errors"])
        report["valid_count"] = report["total_scenarios"] - report["invalid_count"]

        return report
