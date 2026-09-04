"""
ASTRALIS Nav-OS — Supervised Window Builder
============================================
Converts canonical sequential observations into supervised training windows for multi-horizon drift & sea-ice targets.
"""

import json
import argparse
from pathlib import Path
import pandas as pd
import numpy as np


def build_supervised_windows(input_path: Path):
    print(f"[BuildWindows] Processing canonical tracks from {input_path}...")
    df = pd.read_csv(input_path)

    drift_records = []
    sea_ice_records = []

    horizons = {'10m': 2, '30m': 6, '60m': 12, '6h': 72, '12h': 144, '24h': 288}

    grouped = df.groupby('track_id')

    for track_id, group in grouped:
        group = group.sort_values('time_index').reset_index(drop=True)
        n = len(group)

        for i in range(n - 12):
            row = group.iloc[i]

            feat = {
                'track_id': track_id,
                'time_index': row['time_index'],
                'x_m': row['x_m'],
                'y_m': row['y_m'],
                'velocity_x_mps': row['velocity_x_mps'],
                'velocity_y_mps': row['velocity_y_mps'],
                'wind_u10_mps': row['wind_u10_mps'],
                'wind_v10_mps': row['wind_v10_mps'],
                'ocean_current_u_mps': row['ocean_current_u_mps'],
                'ocean_current_v_mps': row['ocean_current_v_mps'],
                'sea_ice_concentration': row['sea_ice_concentration'],
                'sea_surface_temperature_c': row['sea_surface_temperature_c'],
                'iceberg_radius_m': row['iceberg_radius_m']
            }

            # Build drift targets for available horizons
            drift_entry = dict(feat)
            valid_drift = False

            for h_name, h_steps in horizons.items():
                if i + h_steps < n:
                    target_row = group.iloc[i + h_steps]
                    drift_entry[f'target_dx_{h_name}'] = target_row['x_m'] - row['x_m']
                    drift_entry[f'target_dy_{h_name}'] = target_row['y_m'] - row['y_m']
                    valid_drift = True

            if valid_drift:
                drift_records.append(drift_entry)

            # Build sea-ice change targets
            sea_ice_entry = dict(feat)
            valid_ice = False
            for h_name, h_steps in [('6h', 72), ('12h', 144), ('24h', 288)]:
                if i + h_steps < n:
                    target_row = group.iloc[i + h_steps]
                    sea_ice_entry[f'target_sea_ice_change_{h_name}'] = target_row['sea_ice_concentration'] - row['sea_ice_concentration']
                    valid_ice = True

            if valid_ice:
                sea_ice_records.append(sea_ice_entry)

    out_dir = Path("backend/data/windows")
    out_dir.mkdir(parents=True, exist_ok=True)

    drift_df = pd.DataFrame(drift_records)
    drift_path = out_dir / "drift_windows.csv"
    drift_df.to_csv(drift_path, index=False)

    sea_ice_df = pd.DataFrame(sea_ice_records)
    sea_ice_path = out_dir / "sea_ice_windows.csv"
    sea_ice_df.to_csv(sea_ice_path, index=False)

    print(f"[BuildWindows] Exported {len(drift_df)} drift windows & {len(sea_ice_df)} sea-ice windows -> {out_dir}")


def main():
    parser = argparse.ArgumentParser(description="Supervised Window Builder")
    parser.add_argument('--input', type=str, required=True)
    args = parser.parse_args()

    build_supervised_windows(Path(args.input))


if __name__ == '__main__':
    main()
