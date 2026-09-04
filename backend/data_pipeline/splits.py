"""
ASTRALIS Nav-OS — Group-Aware Track Splitting
=============================================
Creates track-id group-aware train/val/test splits (70/15/15) to prevent temporal leakage.
"""

import json
import argparse
from pathlib import Path
import pandas as pd
import numpy as np


def create_splits(input_path: Path, seed: int = 42):
    print(f"[Splits] Reading windows from {input_path} (seed={seed})...")
    df = pd.read_csv(input_path)

    tracks = df['track_id'].unique()
    rng = np.random.default_rng(seed)
    shuffled_tracks = rng.permutation(tracks)

    n_total = len(shuffled_tracks)
    n_train = int(n_total * 0.70)
    n_val = int(n_total * 0.15)

    train_tracks = set(shuffled_tracks[:n_train])
    val_tracks = set(shuffled_tracks[n_train:n_train + n_val])
    test_tracks = set(shuffled_tracks[n_train + n_val:])

    # Verify zero track overlap
    assert len(train_tracks.intersection(val_tracks)) == 0, "Train and Val track overlap!"
    assert len(train_tracks.intersection(test_tracks)) == 0, "Train and Test track overlap!"
    assert len(val_tracks.intersection(test_tracks)) == 0, "Val and Test track overlap!"

    out_dir = Path("backend/data/splits")
    out_dir.mkdir(parents=True, exist_ok=True)

    manifest = {
        "split_seed": seed,
        "total_tracks": n_total,
        "train_track_count": len(train_tracks),
        "val_track_count": len(val_tracks),
        "test_track_count": len(test_tracks),
        "zero_track_overlap_verified": True,
        "train_tracks": list(train_tracks),
        "val_tracks": list(val_tracks),
        "test_tracks": list(test_tracks)
    }

    manifest_path = out_dir / "split_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[Splits] Verified 0 track overlap across {n_total} tracks -> {manifest_path}")


def main():
    parser = argparse.ArgumentParser(description="Track-Aware Data Splitter")
    parser.add_argument('--input', type=str, required=True)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()

    create_splits(Path(args.input), args.seed)


if __name__ == '__main__':
    main()
