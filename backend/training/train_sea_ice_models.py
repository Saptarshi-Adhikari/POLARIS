"""
ASTRALIS Nav-OS — Sea-Ice Forecast Training Script
==================================================
Trains HistGradientBoosting model for sea-ice concentration change at 6h, 12h, 24h horizons.
"""

import json
import argparse
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import HistGradientBoostingRegressor

FEATURE_COLS = [
    'x_m', 'y_m', 'velocity_x_mps', 'velocity_y_mps',
    'wind_u10_mps', 'wind_v10_mps', 'ocean_current_u_mps', 'ocean_current_v_mps',
    'sea_ice_concentration', 'sea_surface_temperature_c', 'iceberg_radius_m'
]


def train_sea_ice_models(dataset_path: Path, split_path: Path, smoke_test: bool = False):
    print(f"[TrainSeaIce] Loading sea-ice dataset from {dataset_path} (smoke_test={smoke_test})...")
    df = pd.read_csv(dataset_path)

    with open(split_path) as f:
        split_meta = json.load(f)

    train_tracks = set(split_meta['train_tracks'])
    train_df = df[df['track_id'].isin(train_tracks)]

    if smoke_test:
        train_df = train_df.head(500)

    reg_dir = Path("backend/models/registry")
    reg_dir.mkdir(parents=True, exist_ok=True)

    for h in ['6h', '12h', '24h']:
        target_col = f"target_sea_ice_change_{h}"

        if target_col not in train_df.columns:
            continue

        X_train = train_df[FEATURE_COLS].fillna(0).values
        y_train = train_df[target_col].fillna(0).values

        model = HistGradientBoostingRegressor(random_state=42)
        model.fit(X_train, y_train)

        save_path = reg_dir / f"sea_ice_gb_{h}.joblib"
        joblib.dump({"model": model, "feature_names": FEATURE_COLS, "horizon": h, "data_provenance": "synthetic"}, save_path)
        print(f"[TrainSeaIce] Horizon {h}: Saved Sea Ice Model -> {save_path}")


def main():
    parser = argparse.ArgumentParser(description="Train Sea-Ice Forecast Models")
    parser.add_argument('--dataset', type=str, required=True)
    parser.add_argument('--split-manifest', type=str, required=True)
    parser.add_argument('--smoke-test', action='store_true')
    args = parser.parse_args()

    train_sea_ice_models(Path(args.dataset), Path(args.split_manifest), args.smoke_test)


if __name__ == '__main__':
    main()
