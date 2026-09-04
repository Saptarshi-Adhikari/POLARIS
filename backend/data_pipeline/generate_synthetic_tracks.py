"""
ASTRALIS Nav-OS — Synthetic Track Generator
============================================
Generates 2,000+ physically coherent synthetic iceberg & sea-ice trajectories.
Uses 2% wind-rule drift dynamics with time-correlated stochastic forcing.
"""

import json
import math
import argparse
from pathlib import Path
import pandas as pd
import numpy as np


def generate_synthetic_tracks(tracks: int = 2000, hours: int = 48, cadence_minutes: int = 5, seed: int = 42):
    print(f"[SyntheticGenerator] Generating {tracks} tracks x {hours}h @ {cadence_minutes}m cadence (seed={seed})...")
    rng = np.random.default_rng(seed)

    dt_sec = cadence_minutes * 60
    steps_per_track = (hours * 60) // cadence_minutes

    records = []

    for t_idx in range(tracks):
        track_id = f"ICE_{t_idx + 1:04d}"

        x = rng.uniform(400.0, 3200.0)
        y = rng.uniform(400.0, 2000.0)
        vx = rng.uniform(-0.3, 0.3)
        vy = rng.uniform(-0.3, 0.3)

        radius = rng.uniform(10.0, 45.0)
        draft = radius * 1.5
        area = math.pi * radius * radius

        # Correlated environmental background
        base_current_u = rng.uniform(-0.3, 0.3)
        base_current_v = rng.uniform(-0.3, 0.3)
        base_wind_u = rng.uniform(-10.0, 10.0)
        base_wind_v = rng.uniform(-10.0, 10.0)
        sea_ice = rng.uniform(0.0, 0.8)

        for step in range(steps_per_track):
            time_idx = step
            timestamp_sec = step * dt_sec

            # Time-correlated perturbations
            current_u = base_current_u + 0.05 * math.sin(step * 0.1 + t_idx)
            current_v = base_current_v + 0.05 * math.cos(step * 0.1 + t_idx)
            wind_u = base_wind_u + 0.5 * math.sin(step * 0.05)
            wind_v = base_wind_v + 0.5 * math.cos(step * 0.05)

            # Wagner drift equation: v_ice = current + 0.02 * wind + noise
            dvx = current_u * 0.05 + wind_u * 0.02 * 0.05 + rng.normal(0, 0.002)
            dvy = current_v * 0.05 + wind_v * 0.02 * 0.05 + rng.normal(0, 0.002)

            vx = np.clip(vx + dvx, -1.5, 1.5)
            vy = np.clip(vy + dvy, -1.5, 1.5)

            x = np.clip(x + vx * dt_sec * 0.01, 0, 3600)
            y = np.clip(y + vy * dt_sec * 0.01, 0, 2400)

            lat = -64.382 - (y / 1000) * 0.5
            lon = 72.821 + (x / 1000) * 0.8

            records.append({
                "schema_version": "1.0.0",
                "data_provenance": "synthetic",
                "source_dataset": "astralis_synthetic_generator",
                "track_id": track_id,
                "timestamp_utc": f"2026-09-01T00:{step % 60:02d}:00Z",
                "time_index": time_idx,
                "latitude": lat,
                "longitude": lon,
                "x_m": x,
                "y_m": y,
                "velocity_x_mps": vx,
                "velocity_y_mps": vy,
                "speed_mps": math.hypot(vx, vy),
                "wind_u10_mps": wind_u,
                "wind_v10_mps": wind_v,
                "ocean_current_u_mps": current_u,
                "ocean_current_v_mps": current_v,
                "sea_ice_concentration": float(sea_ice),
                "sea_surface_temperature_c": -1.8,
                "wave_height_m": 1.2,
                "iceberg_radius_m": float(radius),
                "iceberg_area_m2": float(area),
                "iceberg_draft_m": float(draft),
                "observation_confidence": 0.95,
                "position_uncertainty_m": 5.0,
                "is_interpolated": False,
                "is_synthetic": True
            })

    df = pd.DataFrame(records)

    out_dir = Path("backend/data/generated")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv = out_dir / "synthetic_tracks.csv"
    df.to_csv(out_csv, index=False)

    metadata = {
        "data_provenance": "synthetic",
        "synthetic_only": True,
        "not_field_validated": True,
        "generator_version": "1.0.0",
        "random_seed": seed,
        "track_count": tracks,
        "hours": hours,
        "cadence_minutes": cadence_minutes,
        "row_count": len(df)
    }

    with open(out_dir / "synthetic_tracks_manifest.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"[SyntheticGenerator] Successfully exported {len(df)} rows across {tracks} tracks -> {out_csv}")


def main():
    parser = argparse.ArgumentParser(description="Synthetic Track Generator")
    parser.add_argument('--tracks', type=int, default=2000)
    parser.add_argument('--hours', type=int, default=48)
    parser.add_argument('--cadence-minutes', type=int, default=5)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    generate_synthetic_tracks(args.tracks, args.hours, args.cadence_minutes, args.seed)


if __name__ == '__main__':
    main()
