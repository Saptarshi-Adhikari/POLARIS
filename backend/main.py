from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import joblib
import numpy as np
import os

# Phase 7: ML drift prediction router
from ml_api import router as ml_router

app = FastAPI(
    title="Astralis ML Iceberg Prediction Service",
    description="Provides scikit-learn random forest trajectory predictions for Antarctic icebergs."
)

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Phase 7 ML router
app.include_router(ml_router)


# Global model state
MODEL_PATH = "backend/model.joblib"
model = None

@app.on_event("startup")
def load_prediction_model():
    global model
    if os.path.exists(MODEL_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            print(f"Loaded ML model from {MODEL_PATH}")
        except Exception as e:
            print(f"Error loading model from {MODEL_PATH}: {e}")
    else:
        print(f"Warning: Model not found at {MODEL_PATH}. Prediction endpoints will require training.")

class IcebergRequest(BaseModel):
    icebergId: str
    x: float
    y: float
    vx: float
    vy: float
    wind_speed: float
    wind_dir: float
    current_speed: float
    current_dir: float

class TrajectoryPrediction(BaseModel):
    time: int # in minutes: 10, 30, 60
    x: float
    y: float
    confidence: float
    uncertainty: float

class IcebergPredictionResponse(BaseModel):
    icebergId: str
    predictions: List[TrajectoryPrediction]

@app.get("/health")
def health_check():
    return {
        "status": "ONLINE" if model is not None else "DEGRADED",
        "model_loaded": model is not None
    }

@app.post("/predict/iceberg", response_model=IcebergPredictionResponse)
def predict_trajectory(request: IcebergRequest):
    global model
    if model is None:
        # If the model isn't trained yet, let's load or raise error
        if os.path.exists(MODEL_PATH):
            model = joblib.load(MODEL_PATH)
        else:
            raise HTTPException(
                status_code=503, 
                detail="Model is not trained yet. Run train.py first."
            )
            
    # Prepare features
    features = np.array([[
        request.x,
        request.y,
        request.vx,
        request.vy,
        request.wind_speed,
        request.wind_dir,
        request.current_speed,
        request.current_dir
    ]])
    
    # Predict displacements
    # Output structure of y: [dx_10, dy_10, dx_30, dy_30, dx_60, dy_60]
    preds = model.predict(features)[0]
    
    dx_10, dy_10 = preds[0], preds[1]
    dx_30, dy_30 = preds[2], preds[3]
    dx_60, dy_60 = preds[4], preds[5]
    
    # Compute absolute target coordinates
    x_10 = request.x + dx_10
    y_10 = request.y + dy_10
    
    x_30 = request.x + dx_30
    y_30 = request.y + dy_30
    
    x_60 = request.x + dx_60
    y_60 = request.y + dy_60
    
    import json
    u_10 = 12.0
    u_30 = 24.0
    u_60 = 48.0
    
    cal_path = "src/data/uncertaintyCalibration.json"
    if os.path.exists(cal_path):
        try:
            with open(cal_path, "r") as f:
                cal = json.load(f)
                u_10 = cal.get("uncertainty_10", 12.0)
                u_30 = cal.get("uncertainty_30", 24.0)
                u_60 = cal.get("uncertainty_60", 48.0)
        except Exception as e:
            print(f"Error loading calibrated uncertainties in FastAPI: {e}")

    predictions = [
        TrajectoryPrediction(
            time=10,
            x=round(x_10, 2),
            y=round(y_10, 2),
            confidence=0.95,
            uncertainty=round(u_10, 2)
        ),
        TrajectoryPrediction(
            time=30,
            x=round(x_30, 2),
            y=round(y_30, 2),
            confidence=0.86,
            uncertainty=round(u_30, 2)
        ),
        TrajectoryPrediction(
            time=60,
            x=round(x_60, 2),
            y=round(y_60, 2),
            confidence=0.72,
            uncertainty=round(u_60, 2)
        )
    ]
    
    return IcebergPredictionResponse(
        icebergId=request.icebergId,
        predictions=predictions
    )

import httpx

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2:3b")

@app.get("/copilot/health")
async def copilot_health():
    async with httpx.AsyncClient() as client:
        try:
            res = await client.get(f"{OLLAMA_HOST}/", timeout=2.0)
            return {
                "status": "ONLINE" if res.status_code == 200 else "OFFLINE",
                "model": OLLAMA_MODEL
            }
        except Exception:
            return {"status": "OFFLINE", "model": OLLAMA_MODEL}

class CopilotExplainRequest(BaseModel):
    ship: dict
    decision: dict
    ml: dict
    environment: dict
    hazards: List[dict]
    questionType: Optional[str] = "general"
    routeComparisons: Optional[dict] = None

@app.post("/copilot/explain")
async def copilot_explain(request: CopilotExplainRequest):
    ship_data = request.ship
    decision_data = request.decision
    ml_data = request.ml
    env_data = request.environment
    hazards_data = request.hazards
    
    question_prompts = {
        "general": "Explain what the autonomous navigation system is currently doing and why.",
        "slowdown": "Focus your explanation on why the vessel has slowed down or stopped.",
        "reroute": "Focus your explanation on why the route strategy is being altered or recalculated."
    }
    question_instruction = question_prompts.get(request.questionType, "Explain the current state.")
    
    prompt = f"""
System instruction:
You are ASTRALIS, an Antarctic maritime navigation decision-support copilot.
You explain decisions made by the simulation using only the supplied structured data.
Do not invent sensor readings, forecasts, or events.
Do not claim you directly control the vessel.
Explain the existing ML forecast and autonomous navigation decision clearly and concisely.

Structured Data:
- Ship Status: Speed={ship_data.get('speed')}kts, Heading={ship_data.get('heading')}°, Fuel={ship_data.get('fuel')}%
- Decision: Mode={decision_data.get('mode')}, TargetHeading={decision_data.get('targetHeading')}°, TargetSpeed={decision_data.get('targetSpeed')}kts, Confidence={decision_data.get('confidence')}, Reason="{decision_data.get('reason')}"
- ML Trajectories: Status={ml_data.get('status')}, Confidence={ml_data.get('confidence')}, Active Forecasts={ml_data.get('forecastCount')}
- Environment: Wind={env_data.get('wind')}, Ocean Current={env_data.get('current')}, Sea Ice={env_data.get('seaIce')}
- Nearby Hazards: {len(hazards_data)} icebergs tracked in vicinity.
- Route Comparison Options: {request.routeComparisons}

User query: {question_instruction}
"""
    
    async with httpx.AsyncClient() as client:
        try:
            ollama_payload = {
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_predict": 120
                }
            }
            res = await client.post(f"{OLLAMA_HOST}/api/generate", json=ollama_payload, timeout=12.0)
            if res.status_code == 200:
                data = res.json()
                return {
                    "status": "ONLINE",
                    "explanation": data.get("response", "").strip(),
                    "riskLevel": "CRITICAL" if decision_data.get('mode') in ['EMERGENCY_STOP'] else ("HIGH" if decision_data.get('mode') in ['REROUTE'] else ("MEDIUM" if decision_data.get('mode') in ['REDUCE_SPEED', 'ALTER_COURSE'] else "LOW"))
                }
        except Exception:
            pass
            
    mode = decision_data.get('mode')
    reason = decision_data.get('reason')
    fallback_expl = f"Vessel operating in {mode} mode because {reason}."
    
    return {
        "status": "OFFLINE",
        "explanation": fallback_expl,
        "riskLevel": "CRITICAL" if mode in ['EMERGENCY_STOP'] else ("HIGH" if mode in ['REROUTE'] else ("MEDIUM" if mode in ['REDUCE_SPEED', 'ALTER_COURSE'] else "LOW"))
    }

MODEL_SEA_ICE_PATH = os.path.join(os.path.dirname(__file__), "model_sea_ice.joblib")
model_sea_ice = None

if os.path.exists(MODEL_SEA_ICE_PATH):
    model_sea_ice = joblib.load(MODEL_SEA_ICE_PATH)

class SeaIceRequest(BaseModel):
    x: float
    y: float
    current_ice: float
    temperature: float
    wind_speed: float
    wind_dir: float

class SeaIcePredictionResponse(BaseModel):
    status: str
    current_ice: float
    ice_6h: float
    ice_12h: float
    ice_24h: float
    confidence: float

@app.post("/predict/sea-ice", response_model=SeaIcePredictionResponse)
def predict_sea_ice(request: SeaIceRequest):
    global model_sea_ice
    if model_sea_ice is None:
        if os.path.exists(MODEL_SEA_ICE_PATH):
            model_sea_ice = joblib.load(MODEL_SEA_ICE_PATH)
        else:
            raise HTTPException(status_code=503, detail="Sea Ice model not trained.")
            
    features = np.array([[
        request.x,
        request.y,
        request.current_ice,
        request.temperature,
        request.wind_speed,
        request.wind_dir
    ]])
    
    preds = model_sea_ice.predict(features)[0]
    
    conf = float(np.clip(1.0 - (request.wind_speed / 200.0) - abs(request.temperature + 10.0) / 100.0, 0.5, 0.98))
    
    return SeaIcePredictionResponse(
        status="ONLINE",
        current_ice=request.current_ice,
        ice_6h=round(float(preds[0]), 3),
        ice_12h=round(float(preds[1]), 3),
        ice_24h=round(float(preds[2]), 3),
        confidence=round(conf, 2)
    )
