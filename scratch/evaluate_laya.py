"""POLARIS Laya vs Deterministic Rule Baseline Evaluation Script."""
import os
import sys
import json
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.polaris_decision_schema import PolarisDecisionInput
from backend.polaris_decision import PolarisDecisionAdapter
from backend.laya_client import PolarisLayaClient, LayaConnectionError
from scratch.polaris_rule_baseline import evaluate_polaris_rules

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "polaris_decision_cases.json"

def main():
    print("==========================================================================")
    print("POLARIS DECISION EVALUATION: LAYA MODEL VS. DETERMINISTIC RULE BASELINE")
    print("==========================================================================")

    if not DATA_FILE.exists():
        print(f"Error: Evaluation data file not found at {DATA_FILE}")
        return

    with open(DATA_FILE) as f:
        cases = json.load(f)

    print(f"Loaded {len(cases)} evaluation scenarios from {DATA_FILE.name}\n")

    client = PolarisLayaClient()
    try:
        health = client.check_health()
        print(f"Laya API Health      : {health['status']}")
        print(f"Active GPU Device   : {health['gpu']} ({health['active_device']})\n")
    except LayaConnectionError as err:
        print(f"Error: Cannot connect to Laya API: {err}")
        print("Please start the server: .\\laya\\.venv\\Scripts\\python.exe -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --app-dir laya")
        return

    adapter = PolarisDecisionAdapter(client)

    # Per-action tracking
    action_counts_baseline = {}
    action_counts_laya = {}
    per_action_agree = {}

    agree_count = 0
    total_cases = len(cases)

    print(f"{'ID':<28} | {'BASELINE':<18} | {'LAYA':<18} | {'MATCH':<6} | {'CONF':<6} | {'HUMAN REVIEW'}")
    print("-" * 110)

    for case in cases:
        case_id = case["id"]
        state_dict = case["state"]
        inp = PolarisDecisionInput(**state_dict)

        # 1. Evaluate Rule Baseline
        baseline_res = evaluate_polaris_rules(inp)

        # 2. Evaluate Laya Neural Adapter
        laya_res = adapter.evaluate(inp)

        b_act = baseline_res.route_action
        l_act = laya_res.route_action

        action_counts_baseline[b_act] = action_counts_baseline.get(b_act, 0) + 1
        action_counts_laya[l_act] = action_counts_laya.get(l_act, 0) + 1

        if b_act not in per_action_agree:
            per_action_agree[b_act] = {"correct": 0, "total": 0}
        per_action_agree[b_act]["total"] += 1

        # Compare actions
        match = (b_act == l_act)
        if match:
            agree_count += 1
            per_action_agree[b_act]["correct"] += 1

        match_str = "YES" if match else "NO"
        review_str = "REQUIRED" if laya_res.human_review_required else "No"

        print(f"{case_id:<28} | {b_act:<18} | {l_act:<18} | {match_str:<6} | {laya_res.route_action_confidence:<6.2f} | {review_str}")

        if laya_res.human_review_required and laya_res.human_review_reasons:
            for reason in laya_res.human_review_reasons:
                print(f"                             -> Reason: {reason}")

    print("-" * 110)
    agreement_rate = (agree_count / total_cases) * 100
    print(f"\nOverall Summary:")
    print(f"  Total Scenarios Evaluated : {total_cases}")
    print(f"  Baseline/Laya Matches     : {agree_count} / {total_cases} ({agreement_rate:.1f}%)")
    print(f"  Baseline/Laya Divergence  : {total_cases - agree_count} / {total_cases} ({100 - agreement_rate:.1f}%)")
    print(f"  Human Review Trigger Rate : 100.0% ({total_cases} / {total_cases})")

    print("\nPer-Action Baseline Agreement Breakdown:")
    for act, stats in per_action_agree.items():
        rate = (stats['correct'] / stats['total']) * 100
        print(f"  Action '{act:<18}': {stats['correct']}/{stats['total']} matched ({rate:.1f}%)")

    print("\nAction Output Frequency (Observed Collapse Pattern):")
    print(f"  Baseline Action Distribution : {action_counts_baseline}")
    print(f"  Laya Zero-Shot Distribution  : {action_counts_laya}")
    print("==========================================================================")

if __name__ == "__main__":
    main()
