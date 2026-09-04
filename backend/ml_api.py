"""
ASTRALIS Nav-OS - ML Inference API Router (Phase 8 Hybrid Support)
==================================================================
FastAPI router providing /ml/health and /ml/predict endpoints.
Supports both Phase 8 Hybrid Model (Physics + Residual NN) and Phase 7 Random Forest.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from typing import Optional, Dict
import numpy as np
import joblib

router = APIRouter(prefix="/ml", tags=["ML Drift Prediction"])

HYBRID_MODEL_PATH = Path(__file__).parent / "models" / "iceberg_drift_hybrid.joblib"
RF_MODEL_PATH = Path(__file__).parent / "models" / "iceberg_drift_rf.joblib"

_model_data = None
_model_type = None


def _try_load_model():
    global _model_data, _model_type
    if HYBRID_MODEL_PATH.exists():
        try:
            _model_data = joblib.load(HYBRID_MODEL_PATH)
            _model_type = "hybrid"
            print(f"[ML API] Hybrid model loaded from {HYBRID_MODEL_PATH}")
            return
        except Exception as e:
            print(f"[ML API] Failed to load Hybrid model: {e}")

    if RF_MODEL_PATH.exists():
        try:
            _model_data = joblib.load(RF_MODEL_PATH)
            _model_type = "random_forest"
            print(f"[ML API] Random Forest model loaded from {RF_MODEL_PATH}")
            return
        except Exception as e:
            print(f"[ML API] Failed to load RF model: {e}")

    print("[ML API] WARNING: No trained model file found.")


class IcebergFeatures(BaseModel):
    position_x: float
    position_y: float
    velocity_x: float
    velocity_y: float
    wind_x: float
    wind_y: float
    current_x: float
    current_y: float
    sea_ice_concentration: float
    water_temperature: float = -1.8
    radius: float = 10.0
    collision_radius: Optional[float] = None


class PredictionResponse(BaseModel):
    velocity_x: float
    velocity_y: float
    source: str
    physics_component: Optional[Dict[str, float]] = None
    ml_residual: Optional[Dict[str, float]] = None
    mae_avg: Optional[float] = None


@router.get("/health")
def ml_health():
    if _model_data is None:
        _try_load_model()

    loaded = _model_data is not None
    history = _model_data.get('training_history', {}) if loaded and _model_type == 'hybrid' else {}
    metrics = _model_data.get('metrics', {}) if loaded and _model_type == 'random_forest' else {}

    mae_avg = history.get('hybrid_mae_avg') if _model_type == 'hybrid' else metrics.get('mae_avg')

    return {
        "status": "ready" if loaded else "no_model",
        "model_type": _model_type,
        "is_trained": _model_data.get('is_trained', False) if loaded else False,
        "mae_avg": mae_avg
    }


@router.post("/predict", response_model=PredictionResponse)
def ml_predict(features: IcebergFeatures):
    global _model_data, _model_type
    if _model_data is None:
        _try_load_model()

    rad = features.radius if features.radius is not None else (features.collision_radius or 10.0)

    feature_dict = {
        'position_x': features.position_x,
        'position_y': features.position_y,
        'velocity_x': features.velocity_x,
        'velocity_y': features.velocity_y,
        'wind_x': features.wind_x,
        'wind_y': features.wind_y,
        'current_x': features.current_x,
        'current_y': features.current_y,
        'sea_ice_concentration': features.sea_ice_concentration,
        'water_temperature': features.water_temperature,
        'radius': rad
    }

    if _model_data is not None and _model_type == "hybrid":
        try:
            physics_model = _model_data['physics']
            nn_residual_vx = _model_data['nn_residual_vx']
            nn_residual_vy = _model_data['nn_residual_vy']

            phys_pred = physics_model.predict(feature_dict)

            nn_input = np.array([[
                feature_dict['position_x'],
                feature_dict['position_y'],
                feature_dict['velocity_x'],
                feature_dict['velocity_y'],
                feature_dict['wind_x'],
                feature_dict['wind_y'],
                feature_dict['current_x'],
                feature_dict['current_y'],
                feature_dict['sea_ice_concentration'],
                feature_dict['water_temperature'],
                feature_dict['radius'],
                phys_pred['velocity_x'],
                phys_pred['velocity_y']
            ]])

            res_vx = float(nn_residual_vx.predict(nn_input)[0])
            res_vy = float(nn_residual_vy.predict(nn_input)[0])

            final_vx = float(phys_pred['velocity_x'] + res_vx)
            final_vy = float(phys_pred['velocity_y'] + res_vy)

            mae_avg = _model_data.get('training_history', {}).get('hybrid_mae_avg')

            return PredictionResponse(
                velocity_x=final_vx,
                velocity_y=final_vy,
                source="hybrid_physics_ml",
                physics_component={
                    'velocity_x': float(phys_pred['velocity_x']),
                    'velocity_y': float(phys_pred['velocity_y'])
                },
                ml_residual={
                    'velocity_x': res_vx,
                    'velocity_y': res_vy
                },
                mae_avg=mae_avg
            )
        except Exception as e:
            print(f"[ML API] Hybrid prediction error: {e}, falling back...")

    if _model_data is not None and _model_type == "random_forest":
        try:
            model_vx = _model_data['model_vx']
            model_vy = _model_data['model_vy']

            feature_vec = np.array([[
                features.position_x, features.position_y,
                features.velocity_x, features.velocity_y,
                features.wind_x, features.wind_y,
                features.current_x, features.current_y,
                features.sea_ice_concentration,
                features.water_temperature,
                rad
            ]])

            pred_vx = float(model_vx.predict(feature_vec)[0])
            pred_vy = float(model_vy.predict(feature_vec)[0])
            mae_avg = _model_data.get('metrics', {}).get('mae_avg')

            return PredictionResponse(
                velocity_x=pred_vx,
                velocity_y=pred_vy,
                source="random_forest",
                mae_avg=mae_avg
            )
        except Exception as e:
            print(f"[ML API] RF prediction error: {e}, falling back...")

    # Physics Fallback (Wagner 2017)
    phys_vx = features.current_x * 0.1 + features.wind_x * 0.002
    phys_vy = features.current_y * 0.1 + features.wind_y * 0.002

    return PredictionResponse(
        velocity_x=phys_vx,
        velocity_y=phys_vy,
        source="physics_wagner_2017",
        physics_component={'velocity_x': phys_vx, 'velocity_y': phys_vy},
        ml_residual={'velocity_x': 0.0, 'velocity_y': 0.0}
    )


_try_load_model()
