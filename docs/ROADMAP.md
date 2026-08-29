# Realistic Project Roadmap

Based on the CURRENT repository state (Frontend Mockup), this is the realistic progression path.

## PHASE 0 — Current Prototype (COMPLETED)
- Develop interactive UI.
- Build simulated physics for iceberg drift.
- Implement heuristic A* pathfinding.
- Prove the concept visually.

## PHASE 1 — Scientific Data Integration
- Stand up a Python FastAPI backend.
- Replace HTML5 Canvas with a mapping library (e.g., Leaflet or Mapbox).
- Ingest static/historical weather (GFS) and current (HYCOM) datasets.
- Pass real coordinates from backend to frontend.

## PHASE 2 — ML Forecasting
- Train a basic ML model on historical iceberg drift data.
- Replace the deterministic Euler drift physics with ML inference.
- Expose an inference endpoint on the backend.

## PHASE 3 — Iceberg Trajectory Prediction
- Integrate with OpenDrift.
- Feed live satellite data into OpenDrift.
- Map the output back to the UI.

## PHASE 4 — Real-Time Sensor Fusion
- Integrate live API feeds (Sentinel-1 SAR imagery).
- Implement WebSocket connections for real-time frontend updates.
- Refine the risk model based on live data uncertainty.

## PHASE 5 — Production Decision Support
- Build authentication and fleet management.
- Implement fuel-optimization constraints in the routing algorithm.
- Containerize and deploy via CI/CD.
