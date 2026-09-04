"""
ASTRALIS Nav-OS - ML Baseline Training Script (Phase 7)
========================================================
Trains a Random Forest model for iceberg drift velocity prediction.

Features:
  x, y, vx, vy, wind_x, wind_y, current_x, current_y,
  sea_ice_concentration, water_temperature, collision_radius

Targets:
  next_vx, next_vy  (velocity at next timestep)

The script generates synthetic data internally using the same
Wagner 2017 drift model as syntheticDataGenerator.js - no browser
or exported JSON file is required.

Usage:
    python backend/ml_train.py
    python backend/ml_train.py --samples 10000 --trees 200
"""

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
import joblib
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error


# ?? Synthetic data generation ????????????????????????????????????????????????

def generate_synthetic_data(num_icebergs: int = 200, duration_hours: int = 12):
    """
    Generate synthetic iceberg trajectory data using the Wagner 2017
    2% wind-rule drift model with stochastic forcing.

    Returns a list of (features, target_vx, target_vy) tuples.
    """
    print(f"[ml_train] Generating {num_icebergs} x {duration_hours}h synthetic trajectories...")
    records = []
    rng = np.random.default_rng(42)
    DT_S = 60  # 1-minute time steps
    WIND_FACTOR = 0.02

    for i in range(num_icebergs):
        x  = rng.uniform(400, 3200)
        y  = rng.uniform(400, 2000)
        vx = rng.uniform(-0.3, 0.3)
        vy = rng.uniform(-0.3, 0.3)

        wind_x     = rng.uniform(-12, 12)
        wind_y     = rng.uniform(-12, 12)
        current_x  = rng.uniform(-0.25, 0.25)
        current_y  = rng.uniform(-0.25, 0.25)
        sea_ice    = rng.uniform(0.0, 0.7)
        radius     = rng.uniform(8, 40)

        steps = duration_hours * 60
        for _ in range(steps):
            # Features at current timestep
            feat = [x, y, vx, vy, wind_x, wind_y, current_x, current_y, sea_ice, -1.8, radius]

            # Wagner drift model (next velocity)
            dvx = current_x * 0.1 + wind_x * WIND_FACTOR * 0.1 + rng.normal(0, 0.005)
            dvy = current_y * 0.1 + wind_y * WIND_FACTOR * 0.1 + rng.normal(0, 0.005)

            next_vx = vx + dvx
            next_vy = vy + dvy

            # Soft speed cap
            speed = np.hypot(next_vx, next_vy)
            if speed > 0.5:
                next_vx *= 0.5 / speed
                next_vy *= 0.5 / speed

            records.append((feat, next_vx, next_vy))

            # Advance state
            vx = next_vx
            vy = next_vy
            x  = np.clip(x + vx * DT_S, 0, 3600)
            y  = np.clip(y + vy * DT_S, 0, 2400)

    print(f"[ml_train] Generated {len(records)} samples")
    return records


def load_external_json(filepath: str):
    """
    Optionally load data from a browser-exported JSON file (Phase 6 schema).
    Falls back gracefully if the file is absent.
    """
    path = Path(filepath)
    if not path.exists():
        return None
    print(f"[ml_train] Loading external dataset from {path}?")
    with open(path) as f:
        data = json.load(f)
    records = []
    for d in data:
        feat = [
            d.get('x',                     0),
            d.get('y',                     0),
            d.get('velocity_x',            0),
            d.get('velocity_y',            0),
            d.get('wind_x',                0),
            d.get('wind_y',                0),
            d.get('current_x',             0),
            d.get('current_y',             0),
            d.get('sea_ice_concentration', 0),
            d.get('water_temperature',  -1.8),
            d.get('collision_radius',     10),
        ]
        records.append((feat, d.get('velocity_x', 0), d.get('velocity_y', 0)))
    print(f"[ml_train] Loaded {len(records)} external samples")
    return records


# ?? Model class ??????????????????????????????????????????????????????????????

FEATURE_NAMES = [
    'position_x', 'position_y',
    'velocity_x', 'velocity_y',
    'wind_x',     'wind_y',
    'current_x',  'current_y',
    'sea_ice_concentration',
    'water_temperature',
    'collision_radius',
]


class IcebergDriftPredictor:
    def __init__(self, n_estimators: int = 200, max_depth: int = 15):
        params = dict(
            n_estimators    = n_estimators,
            max_depth       = max_depth,
            min_samples_split = 10,
            min_samples_leaf  = 5,
            random_state    = 42,
            n_jobs          = -1,
        )
        self.model_vx      = RandomForestRegressor(**params)
        self.model_vy      = RandomForestRegressor(**params)
        self.feature_names = FEATURE_NAMES
        self.is_trained    = False
        self.metrics       = {}

    def train(self, records):
        X   = np.array([r[0] for r in records])
        y_vx = np.array([r[1] for r in records])
        y_vy = np.array([r[2] for r in records])

        X_tr, X_te, vx_tr, vx_te, vy_tr, vy_te = train_test_split(
            X, y_vx, y_vy, test_size=0.2, random_state=42
        )
        print(f"[ml_train] Train: {len(X_tr)} | Test: {len(X_te)}")

        t0 = time.time()
        print("[ml_train] Fitting model_vx?")
        self.model_vx.fit(X_tr, vx_tr)
        print("[ml_train] Fitting model_vy?")
        self.model_vy.fit(X_tr, vy_tr)
        elapsed = time.time() - t0
        print(f"[ml_train] Training complete in {elapsed:.1f}s")

        vx_pred = self.model_vx.predict(X_te)
        vy_pred = self.model_vy.predict(X_te)

        mae_vx  = mean_absolute_error(vx_te, vx_pred)
        mae_vy  = mean_absolute_error(vy_te, vy_pred)
        rmse_vx = np.sqrt(mean_squared_error(vx_te, vx_pred))
        rmse_vy = np.sqrt(mean_squared_error(vy_te, vy_pred))
        mae_avg = (mae_vx + mae_vy) / 2

        self.metrics = dict(
            mae_vx=mae_vx, mae_vy=mae_vy,
            rmse_vx=rmse_vx, rmse_vy=rmse_vy,
            mae_avg=mae_avg,
        )
        self.is_trained = True
        return self.metrics

    def save(self, filepath):
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump({
            'model_vx':      self.model_vx,
            'model_vy':      self.model_vy,
            'feature_names': self.feature_names,
            'is_trained':    self.is_trained,
            'metrics':       self.metrics,
        }, filepath)
        print(f"[ml_train] Model saved -> {filepath}")

    @classmethod
    def load(cls, filepath):
        d   = joblib.load(filepath)
        obj = cls.__new__(cls)
        obj.model_vx      = d['model_vx']
        obj.model_vy      = d['model_vy']
        obj.feature_names = d['feature_names']
        obj.is_trained    = d['is_trained']
        obj.metrics       = d.get('metrics', {})
        return obj

    def predict(self, features: list) -> dict:
        if not self.is_trained:
            raise RuntimeError("Model not trained")
        x = np.array(features).reshape(1, -1)
        return {
            'velocity_x': float(self.model_vx.predict(x)[0]),
            'velocity_y': float(self.model_vy.predict(x)[0]),
        }


# ?? Physics baseline (Wagner 2017) ???????????????????????????????????????????

def wagner_baseline_mae(records: list, sample: int = 5000) -> float:
    """Estimate MAE of the pure Wagner 2%-wind rule on a random sub-sample."""
    rng = np.random.default_rng(0)
    idx = rng.choice(len(records), min(sample, len(records)), replace=False)
    errs_vx, errs_vy = [], []
    for i in idx:
        feat, true_vx, true_vy = records[i]
        # Wagner: next_vx ? current_x*0.1 + wind_x*0.002, next_vy similarly
        current_x, current_y = feat[6], feat[7]
        wind_x,    wind_y    = feat[4], feat[5]
        pred_vx = current_x * 0.1 + wind_x * 0.02 * 0.1
        pred_vy = current_y * 0.1 + wind_y * 0.02 * 0.1
        errs_vx.append(abs(true_vx - pred_vx))
        errs_vy.append(abs(true_vy - pred_vy))
    return (np.mean(errs_vx) + np.mean(errs_vy)) / 2


# ?? CLI entry point ??????????????????????????????????????????????????????????

def main() -> None:
    parser = argparse.ArgumentParser(description='ASTRALIS ML Baseline Training - Phase 7')
    parser.add_argument('--samples',    type=int, default=200,   help='Number of synthetic icebergs')
    parser.add_argument('--hours',      type=int, default=12,    help='Duration per trajectory (hours)')
    parser.add_argument('--trees',      type=int, default=200,   help='RF n_estimators')
    parser.add_argument('--depth',      type=int, default=15,    help='RF max_depth')
    parser.add_argument('--data',       type=str, default='',    help='Optional external JSON dataset path')
    parser.add_argument('--model-out',  type=str,
                        default='backend/models/iceberg_drift_rf.joblib',
                        help='Output model path')
    args = parser.parse_args()

    sep = '=' * 62
    print(sep)
    print('  ASTRALIS Nav-OS  ML Baseline Training (Phase 7)')
    print(sep)

    # Load or generate data
    records = None
    if args.data:
        records = load_external_json(args.data)
    if not records:
        records = generate_synthetic_data(args.samples, args.hours)

    # Physics baseline
    physics_mae = wagner_baseline_mae(records)
    print(f"\n[ml_train] Wagner 2017 physics baseline MAE : {physics_mae:.6f} SU/s")

    # Train
    predictor = IcebergDriftPredictor(n_estimators=args.trees, max_depth=args.depth)
    metrics   = predictor.train(records)

    # Results
    print(f"\n[ml_train] --- RESULTS -------------------------------------------")
    print(f"[ml_train] MAE  vx  : {metrics['mae_vx']:.6f} SU/s")
    print(f"[ml_train] MAE  vy  : {metrics['mae_vy']:.6f} SU/s")
    print(f"[ml_train] RMSE vx  : {metrics['rmse_vx']:.6f} SU/s")
    print(f"[ml_train] RMSE vy  : {metrics['rmse_vy']:.6f} SU/s")
    print(f"[ml_train] Avg  MAE : {metrics['mae_avg']:.6f} SU/s")

    print(f"\n[ml_train] --- FEATURE IMPORTANCE --------------------------------")
    for name, imp_vx, imp_vy in zip(
        predictor.feature_names,
        predictor.model_vx.feature_importances_,
        predictor.model_vy.feature_importances_,
    ):
        avg = (imp_vx + imp_vy) / 2
        print(f"[ml_train]   {name:<28}: {avg:.4f}")

    # Compare vs. physics
    print(f"\n[ml_train] --- COMPARISON ----------------------------------------")
    print(f"[ml_train] Wagner 2017 MAE  : {physics_mae:.6f} SU/s")
    print(f"[ml_train] Random Forest MAE: {metrics['mae_avg']:.6f} SU/s")
    if metrics['mae_avg'] < physics_mae:
        print("[ml_train] PASS: ML model BEATS physics baseline!")
    else:
        print("[ml_train] NOTE: ML model on par with physics baseline (expected on self-generated data)")

    # Save
    predictor.save(args.model_out)

    print('\n' + sep)
    print('  Training complete!')
    print(sep)


if __name__ == '__main__':
    main()
