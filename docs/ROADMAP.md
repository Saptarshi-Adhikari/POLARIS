# Realistic Project Roadmap

Based on the CURRENT repository state (Frontend Mockup), this is the realistic progression path.

## PHASE 0 — Current Prototype (COMPLETED)
- Develop interactive UI.
- Build simulated physics for iceberg drift.
- Implement heuristic A* pathfinding.
- Prove the concept visually.

## PHASE 1 — Scientific Data Integration (COMPLETED)
- Stand up a Python FastAPI backend (done).
- Ingest sample weather (GFS) and current (HYCOM) datasets for model training (done).
- Establish dynamic API communication between frontend and backend via AIClient (done).

## PHASE 2 — ML Forecasting (COMPLETED)
- Train machine learning models (Random Forest estimators) for iceberg trajectory and sea ice concentration forecasting (done).
- Expose `/predict/iceberg` and `/predict/sea-ice` inference endpoints on the FastAPI backend (done).
- Integrate forecasts into the frontend interface to display growing uncertainty circles and risk metrics (done).
- Implement an AI Copilot (ASTRALIS) to explain navigation autopilot decisions using Llama 3.2 3B (done).

## PHASE 3 — Interactive Map and Advanced Physics
- Replace the 2D custom Canvas renderer with a production mapping engine (e.g., Leaflet or Mapbox).
- Integrate advanced drift physics (e.g., OpenDrift or equivalent) on the backend for multi-force simulation.

## PHASE 4 — Real-Time Sensor Fusion
- Integrate live satellite imagery API feeds (Sentinel-1 SAR imagery) for real-time ice edge detection.
- Implement WebSocket connections for real-time telemetry updates.

## PHASE 5 — Production Decision Support
- Build authentication and fleet management systems.
- Deploy the multi-service architecture containerized (Docker) to production infrastructure.
