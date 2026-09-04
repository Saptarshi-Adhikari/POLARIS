"""
ASTRALIS Nav-OS — Model Registry & Backend Inference Bridge
=============================================================
Manages versioned model artifacts under backend/models/registry/ with full metadata traceability.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
import joblib


REGISTRY_DIR = Path(__file__).parent / "models" / "registry"


def get_model_metadata(model_id: str) -> Optional[Dict[str, Any]]:
    path = REGISTRY_DIR / f"{model_id}.joblib"
    if not path.exists():
        return None

    data = joblib.load(path)
    return {
        "model_id": model_id,
        "feature_names": data.get("feature_names", []),
        "horizon": data.get("horizon", "10m"),
        "data_provenance": data.get("data_provenance", "synthetic"),
        "synthetic_only": True,
        "not_field_validated": True
    }


def list_registered_models() -> Dict[str, Any]:
    REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
    models = [p.stem for p in REGISTRY_DIR.glob("*.joblib")]
    return {
        "registry_directory": str(REGISTRY_DIR),
        "available_models": models,
        "total_count": len(models)
    }
