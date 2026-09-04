"""
ASTRALIS Nav-OS — Data Ingestion & Adapters
=============================================
Ingests CSV or JSON track data and maps columns into the canonical schema.
"""

import json
import argparse
from pathlib import Path
import pandas as pd
from schema import SCHEMA_VERSION, validate_row


def ingest_astralis_synthetic(input_path: Path, output_path: Path):
    print(f"[Ingest] Reading input from {input_path}...")

    df = pd.read_csv(input_path) if input_path.suffix == '.csv' else pd.read_json(input_path)

    # Standardize column mapping
    df['schema_version'] = SCHEMA_VERSION
    df['data_provenance'] = 'synthetic'
    df['source_dataset'] = input_path.stem
    df['is_synthetic'] = True

    if 'track_id' not in df.columns:
        df['track_id'] = 'track_' + df.get('iceberg_id', df.index).astype(str)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)

    manifest = {
        "source_dataset": input_path.stem,
        "data_provenance": "synthetic",
        "row_count": len(df),
        "track_count": df['track_id'].nunique(),
        "canonical_path": str(output_path)
    }

    manifest_path = output_path.parent / f"{output_path.stem}_manifest.json"
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"[Ingest] Ingested {len(df)} rows across {df['track_id'].nunique()} tracks -> {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Data Ingestion & Adapter Service")
    parser.add_argument('--input', type=str, required=True)
    parser.add_argument('--adapter', type=str, default='astralis_synthetic')
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path("backend/data/canonical") / f"{input_path.stem}_canonical.csv"

    ingest_astralis_synthetic(input_path, output_path)


if __name__ == '__main__':
    main()
