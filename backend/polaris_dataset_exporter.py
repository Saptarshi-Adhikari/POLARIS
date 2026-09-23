"""POLARIS Pipeline Exporters & Dataset Manifest Builder.

Provides dataset split assignment (Train/Val/Test by Episode ID), JSON/JSONL dataset export,
and manifest summary generation.
"""
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Tuple

from backend.polaris_scenario_schema import PolarisDomainScenario, DatasetSplit
from backend.polaris_dataset_validator import PolarisDatasetValidator


def assign_dataset_splits(scenarios: List[PolarisDomainScenario], train_ratio: float = 0.70, val_ratio: float = 0.15) -> List[PolarisDomainScenario]:
    """Group scenarios by Episode ID and assign splits consistently without leakage."""
    episodes = list(dict.fromkeys([s.episode_id for s in scenarios]))
    total_episodes = len(episodes)
    
    n_train = int(total_episodes * train_ratio)
    n_val = int(total_episodes * val_ratio)

    train_episodes = set(episodes[:n_train])
    val_episodes = set(episodes[n_train:n_train + n_val])
    test_episodes = set(episodes[n_train + n_val:])

    for scen in scenarios:
        if scen.episode_id in train_episodes:
            scen.dataset_split = DatasetSplit.TRAIN
        elif scen.episode_id in val_episodes:
            scen.dataset_split = DatasetSplit.VALIDATION
        else:
            scen.dataset_split = DatasetSplit.TEST

    return scenarios


def export_dataset_jsonl(scenarios: List[PolarisDomainScenario], output_path: str):
    """Export scenarios to JSONL format."""
    p = Path(output_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        for scen in scenarios:
            f.write(json.dumps(scen.model_dump(), default=str) + "\n")


def generate_dataset_manifest(scenarios: List[PolarisDomainScenario], output_dir: str, benchmark_path: str = None) -> Dict[str, Any]:
    """Validate dataset and build a comprehensive dataset manifest JSON file."""
    validator = PolarisDatasetValidator(benchmark_file_path=benchmark_path)
    val_report = validator.validate(scenarios)

    manifest = {
        "dataset_name": "POLARIS_DOM_DECISION_CORPUS",
        "version": "1.0.0",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "total_scenarios": val_report["total_scenarios"],
        "dataset_splits": val_report["split_counts"],
        "action_distribution": val_report["action_counts"],
        "source_type_distribution": val_report["source_type_counts"],
        "provenance_completeness_pct": val_report["provenance_completeness_pct"],
        "episode_leakage_detected": val_report["episode_split_leakage_detected"],
        "benchmark_leakage_detected": val_report["benchmark_leakage_detected"],
        "duplicate_count": len(val_report["duplicate_scenario_ids"]),
        "ambiguous_count": val_report["ambiguous_count"],
        "readiness_status": "READY_FOR_DOMAIN_REVIEW" if val_report["invalid_count"] == 0 else "VALIDATION_FAILED"
    }

    out_p = Path(output_dir) / "dataset_manifest.json"
    out_p.parent.mkdir(parents=True, exist_ok=True)
    with open(out_p, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return manifest
