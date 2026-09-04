"""
ASTRALIS Nav-OS — Multi-Horizon Iceberg Drift Model Training
============================================================
Trains Physics-only, Random Forest, HistGradientBoosting, and Hybrid models
for multi-horizon iceberg displacement prediction. Saves versioned artifacts.
"""

import json
import argparse
from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from sklearn.ensemble import RandomForestRegressor, HistGradientBoostingRegressor
from sklearn.multioutput import MultiOutputRegressor
from sklearn.neural_network import MLPRegressor


FEATURE_COLS = [
    'x_m', 'y_m', 'velocity_x_mps', 'velocity_y_mps',
    'wind_u10_mps', 'wind_v10_mps', 'ocean_current_u_mps', 'ocean_current_v_mps',
    'sea_ice_concentration', 'sea_surface_temperature_c', 'iceberg_radius_m'
]


def train_drift_models(dataset_path: Path, split_path: Path, smoke_test: bool = False):
    print(f"[TrainDrift] Loading dataset from {dataset_path} (smoke_test={smoke_test})...")
    df = pd.read_csv(dataset_path)

    with open(split_path) as f:
        split_meta = json.load(f)

    train_tracks = set(split_meta['train_tracks'])
    val_tracks = set(split_meta['val_tracks'])
    test_tracks = set(split_meta['test_tracks'])

    train_df = df[df['track_id'].isin(train_tracks)]
    val_df = df[df['track_id'].isin(val_tracks)]
    test_df = df[df['track_id'].isin(test_tracks)]

    if smoke_test:
        train_df = train_df.head(500)
        val_df = val_df.head(100)
        test_df = test_df.head(100)

    reg_dir = Path("backend/models/registry")
    reg_dir.mkdir(parents=True, exist_ok=True)

    horizons = ['10m', '30m', '60m'] if smoke_test else ['10m', '30m', '60m', '6h', '12h', '24h']

    for h in horizons:
        target_dx = f"target_dx_{h}"
        target_dy = f"target_dy_{h}"

        if target_dx not in train_df.columns:
            continue

        X_train = train_df[FEATURE_COLS].fillna(0).values
        y_train = train_df[[target_dx, target_dy]].fillna(0).values

        X_val = val_df[FEATURE_COLS].fillna(0).values
        y_val = val_df[[target_dx, target_dy]].fillna(0).values

        # 1. Random Forest
        rf = RandomForestRegressor(n_estimators=20 if smoke_test else 100, random_state=42, n_jobs=-1)
        rf.fit(X_train, y_train)

        rf_path = reg_dir / f"drift_rf_{h}.joblib"
        joblib.dump({"model": rf, "feature_names": FEATURE_COLS, "horizon": h, "data_provenance": "synthetic"}, rf_path)

        # 2. HistGradientBoosting (Dual 1D models)
        gb_x = HistGradientBoostingRegressor(random_state=42)
        gb_y = HistGradientBoostingRegressor(random_state=42)
        gb_x.fit(X_train, y_train[:, 0])
        gb_y.fit(X_train, y_train[:, 1])

        gb_path = reg_dir / f"drift_gb_{h}.joblib"
        joblib.dump({"model_x": gb_x, "model_y": gb_y, "feature_names": FEATURE_COLS, "horizon": h, "data_provenance": "synthetic"}, gb_path)

        # 3. Hybrid Model (Physics + MLP Residual)
        # Physics baseline
        phys_train_dx = X_train[:, 6] * 60 + X_train[:, 4] * 0.02 * 60
        phys_train_dy = X_train[:, 7] * 60 + X_train[:, 5] * 0.02 * 60
        res_train = y_train - np.column_stack([phys_train_dx, phys_train_dy])

        mlp = MLPRegressor(hidden_layer_sizes=(32, 16), max_iter=100 if smoke_test else 200, random_state=42)
        mlp.fit(X_train, res_train)

        hybrid_path = reg_dir / f"drift_hybrid_{h}.joblib"
        joblib.dump({"model_residual": mlp, "feature_names": FEATURE_COLS, "horizon": h, "data_provenance": "synthetic"}, hybrid_path)

        print(f"[TrainDrift] Horizon {h}: Saved RF, GB, and Hybrid models -> {reg_dir}")


def main():
    parser = argparse.ArgumentParser(description="Train Multi-Horizon Drift Models")
    parser.add_argument('--dataset', type=str, required=True)
    parser.add_argument('--split-manifest', type=str, required=True)
    parser.add_argument('--smoke-test', action='store_true')
    args = parser.parse_args()

    train_drift_models(Path(args.dataset), Path(args.split_manifest), args.smoke_test)


if __name__ == '__main__':
    main()
