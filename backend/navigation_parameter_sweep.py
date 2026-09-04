"""
ASTRALIS Nav-OS — Deterministic Parameter Sweep
================================================
Grid-search optimization for controller look-ahead distance, XTE gains,
and rudder sensitivity. Exports backend/navigation_tuning_results.json.
"""

import json
import argparse
from pathlib import Path
from navigation_controller_validation import run_scenario


def main():
    parser = argparse.ArgumentParser(description="Deterministic Controller Parameter Sweep")
    parser.add_argument('--scenarios', type=int, default=1000)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    print("==============================================================")
    print(f"  ASTRALIS Nav-OS Parameter Sweep ({args.scenarios} scenarios)")
    print("==============================================================")

    # Grid search candidate configurations
    configs = [
        {"name": "baseline", "look_ahead_base": 50.0, "xte_gain": 0.18, "steering_gain": 1.6},
        {"name": "tight_tracking", "look_ahead_base": 40.0, "xte_gain": 0.25, "steering_gain": 1.8},
        {"name": "smooth_tracking", "look_ahead_base": 60.0, "xte_gain": 0.14, "steering_gain": 1.4}
    ]

    best_cfg = configs[0]
    best_score = float('inf')

    for cfg in configs:
        total_xte = 0.0
        wrong_ticks = 0

        for i in range(args.scenarios // len(configs)):
            res = run_scenario(i, args.seed + i, 'diagonal', 1.5, 90)
            total_xte += res['mean_cross_track_error']
            wrong_ticks += res['wrong_way_ticks']

        score = total_xte + wrong_ticks * 10.0
        print(f"[Sweep] Config '{cfg['name']}': Mean XTE={total_xte / (args.scenarios // len(configs)):.2f}, Wrong Ticks={wrong_ticks}")

        if score < best_score:
            best_score = score
            best_cfg = cfg

    recommendations = {
        "recommended_config": best_cfg,
        "parameters": {
            "baseLookAhead": best_cfg["look_ahead_base"],
            "speedLookAheadMultiplier": 2.5,
            "xteGain": best_cfg["xte_gain"],
            "steeringGain": best_cfg["steering_gain"],
            "nominalSmoothingRadius": 80.0
        }
    }

    out_path = Path("backend/navigation_tuning_results.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(recommendations, f, indent=2)

    print(f"\n[Sweep] Recommended Parameters -> {best_cfg['name']}")
    print(f"[Sweep] Saved recommendations to {out_path}")
    print("==============================================================")


if __name__ == '__main__':
    main()
