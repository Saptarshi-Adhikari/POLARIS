"""CLI Pipeline builder generating a 500-scenario POLARIS domain dataset.

Executes scenario generation, split assignment, schema validation, JSONL export,
and manifest creation under data/decision/generated/
"""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.polaris_scenario_generator import PolarisScenarioGenerator
from backend.polaris_dataset_exporter import assign_dataset_splits, export_dataset_jsonl, generate_dataset_manifest
from backend.polaris_dataset_validator import PolarisDatasetValidator
from backend.polaris_review_exporter import build_prioritized_review_package, export_review_package_csv, compute_review_metrics

BENCHMARK_PATH = Path(__file__).resolve().parents[1] / "data" / "polaris_decision_cases.json"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "decision" / "generated"
REVIEW_DIR = Path(__file__).resolve().parents[1] / "data" / "decision" / "review"

def build_pipeline():
    print("==========================================================================")
    print("BUILDING POLARIS REPRODUCIBLE DOMAIN SCENARIO PIPELINE (500 SCENARIOS)")
    print("==========================================================================")

    # 1. Initialize Generator with Seed 42
    print("1. Initializing PolarisScenarioGenerator (Seed: 42)...")
    generator = PolarisScenarioGenerator(seed=42)

    # 2. Generate 500 scenarios across 20 scenario families
    print("2. Generating 500 domain scenarios across 20 scenario families...")
    scenarios = generator.generate_dataset(total_scenarios=500)

    # 3. Assign Splits by Episode ID (70% Train, 15% Val, 15% Test)
    print("3. Assigning Train / Validation / Test splits by Episode ID...")
    scenarios = assign_dataset_splits(scenarios, train_ratio=0.70, val_ratio=0.15)

    # 4. Validate Dataset Integrity & Leakage
    print("4. Running PolarisDatasetValidator checks...")
    validator = PolarisDatasetValidator(benchmark_file_path=str(BENCHMARK_PATH))
    val_report = validator.validate(scenarios)

    # 5. Export JSONL files
    print(f"5. Exporting dataset JSONL files to {OUTPUT_DIR}...")
    export_dataset_jsonl(scenarios, str(OUTPUT_DIR / "polaris_domain_scenarios_500.jsonl"))

    # 6. Build & Export Review Package
    print(f"6. Building prioritized domain review package in {REVIEW_DIR}...")
    review_items = build_prioritized_review_package(scenarios, top_n=100)
    export_review_package_csv(review_items, str(REVIEW_DIR / "review_package_top100.csv"))
    rev_metrics = compute_review_metrics(scenarios)

    # 7. Generate Manifest
    print("7. Generating dataset manifest...")
    manifest = generate_dataset_manifest(scenarios, str(OUTPUT_DIR), benchmark_path=str(BENCHMARK_PATH))

    print("\n==========================================================================")
    print("DATASET PIPELINE EXECUTION SUMMARY")
    print("==========================================================================")
    print(f"  Total Scenarios Generated  : {manifest['total_scenarios']}")
    print(f"  Train Split                : {manifest['dataset_splits']['TRAIN']}")
    print(f"  Validation Split           : {manifest['dataset_splits']['VALIDATION']}")
    print(f"  Test Split                 : {manifest['dataset_splits']['TEST']}")
    print(f"  Provenance Completeness    : {manifest['provenance_completeness_pct']}%")
    print(f"  Episode Leakage Detected   : {manifest['episode_leakage_detected']}")
    print(f"  Benchmark Leakage Detected : {manifest['benchmark_leakage_detected']}")
    print(f"  Duplicates / Ambiguous     : {manifest['duplicate_count']} / {manifest['ambiguous_count']}")
    print("\nAction Output Distribution:")
    for action, count in manifest['action_distribution'].items():
        print(f"  - {action:<20} : {count} scenarios")
    print("\nSource Type Distribution:")
    for stype, count in manifest['source_type_distribution'].items():
        print(f"  - {stype:<20} : {count} scenarios")
    print(f"\nReview Coverage (% Reviewed) : {rev_metrics['pct_reviewed']}% ({rev_metrics['reviewed_count']}/{rev_metrics['total_scenarios']})")
    print(f"Pipeline Status             : {manifest['readiness_status']}")
    print("==========================================================================")

if __name__ == "__main__":
    build_pipeline()

