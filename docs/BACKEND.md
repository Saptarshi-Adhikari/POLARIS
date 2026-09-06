# Backend Audit & Microservice Architecture

**Status:** FASTAPI MICROSERVICE & CLIENT BRIDGE ACTIVE.

This repository features a Python FastAPI backend and browser-side Web Worker offloading.

- **Framework:** Python FastAPI (`backend/main.py`)
- **Web Worker:** `src/js/workers/routeWorker.js` (Non-blocking client-side pathfinding)
- **Client Bridge:** `src/js/ai/aiClient.js` (REST bridge between simulation & backend microservices)
- **ML Services:**
  - `train.py` & `model.joblib`: Iceberg trajectory prediction model using Random Forest.
  - `train_sea_ice.py` & `model_sea_ice.joblib`: Sea ice growth & concentration forecast model.
- **Data Routes:**
  - `/api/predict/iceberg`: Trajectory forecasts across +2h, +6h, +12h, +24h horizons.
  - `/api/sea-ice/forecast`: Grid concentration predictions.
  - `/api/route/optimize`: Remote candidate path optimization.

## Local Backend Startup
```bash
python -m uvicorn backend.main:app --reload --port 8000
```

