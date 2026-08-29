# ML Iceberg Trajectory Prediction System

This document outlines the architecture, model design, dataset generation, and system integration details for the ASTRALIS Machine Learning Iceberg Trajectory Prediction system.

---

## 1. SYSTEM ARCHITECTURE

The system consists of a dual-layer architecture:
1. **Frontend JS Console**: Coordinates physics simulation, rendering, A* path planning, and routes risk evaluation.
2. **Python FastAPI Backend**: Hosts the trained scikit-learn Machine Learning (ML) predictor model and answers position inference queries.

```
+------------------------------------+
|       JavaScript Frontend          |
|  - Renders UI / Map                |
|  - Runs Euler Physics              |
|  - A* Navigation Planner           |
+-----------------+------------------+
                  |
         (HTTP POST /predict/iceberg)
                  |
                  v
+-----------------+------------------+
|       Python FastAPI Backend       |
|  - main.py (Endpoint)              |
|  - model.joblib (Random Forest)    |
+------------------------------------+
```

---

## 2. SYNTHETIC DATASET GENERATION

To train the trajectory predictor, a reproducible synthetic dataset generator was implemented in `backend/dataset_generator.py`.
- **Methodology**: Evaluates step-by-step drift calculations under a variety of randomized starting parameters:
  - **Inputs**: Coordinate ranges, initial drift velocities ($v_x, v_y$), wind speeds ($0\text{--}100\text{ km/h}$), wind directions, current speeds, current directions, mass, and wave response coefficients.
  - **Dynamics**: Models vector additions from currents and winds while introducing Gaussian noise and random walk variance to simulate environmental turbulence.
  - **Targets**: Outputs future displacement offsets ($\Delta x, \Delta y$) at $+10$, $+30$, and $+60$ minutes into the future.
  - **File**: Saved locally to `backend/iceberg_trajectories.csv`.

---

## 3. MODEL TRAINING

The ML predictor uses a multi-output machine learning regression model:
- **Model Type**: Scikit-Learn `MultiOutputRegressor(RandomForestRegressor)`
- **Configuration**: `n_estimators=50`, `max_depth=12`, trained using random state seeds for determinism.
- **Input Features**:
  - `x`, `y` (Current coordinates)
  - `vx`, `vy` (Current velocities)
  - `wind_speed`, `wind_dir` (Wind speed/direction)
  - `current_speed`, `current_dir` (Ocean current speed/direction)
- **Output Targets**:
  - `dx_10`, `dy_10` (Displacement offsets at +10m)
  - `dx_30`, `dy_30` (Displacement offsets at +30m)
  - `dx_60`, `dy_60` (Displacement offsets at +60m)
- **Saving**: The trained model state is serialized to `backend/model.joblib`.

---

## 4. FRONTEND INTEGRATION & AI NAVIGATION

- **Communication**: The frontend `AIClient` class performs periodic (once every 3 seconds) asynchronous HTTP POST requests containing current parameters to `http://127.0.0.1:8000/predict/iceberg`.
- **Graceful Fallback**: If the FastAPI backend is offline or unresponsive, the client clears cached ML arrays. The simulation falls back automatically to default physics-based linear projections, ensuring the canvas never freezes or displays runtime crashes.
- **Corridor Risk Analysis**: The `AINavigator` class maps these predicted ML points against the ship's planned route corridor. If any ML predicted coordinates (including their time-growing uncertainty radius) intersect the safety corridor boundary, the navigation system flags the route as obstructed and triggers A* route recalculations.

---

## 5. UI VISUALIZATIONS

- **Status Headers**: Displays status variables in the AI Decision Advisor:
  - `AI ENGINE`: `ONLINE` (green) / `OFFLINE` (red).
  - `CONF`: Model average prediction confidence (e.g. `87%`).
  - `FORECASTS`: Active tracking count.
- **Trajectory Lines**:
  - **Physics Mode**: Standard light ice-blue dotted lines.
  - **ML Mode**: Magenta-pink dotted lines indicating ML-driven predictions.
  - **Uncertainty Bounds**: Filled translucent circles expanding at future forecast horizons.

---

## 6. INSTRUCTIONS TO RUN

### Prerequisites
Ensure Python 3.11+ is installed.

### 1. Install Dependencies
Run from the root directory:
```bash
pip install -r backend/requirements.txt
```

### 2. Train the Model
Run the training script to generate the synthetic dataset and train the RandomForest model:
```bash
python backend/train.py
```

### 3. Start the Backend Server
Start the FastAPI uvicorn daemon:
```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```
