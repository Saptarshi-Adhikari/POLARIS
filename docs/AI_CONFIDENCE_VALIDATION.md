# AI Confidence & Live Prediction Validation System

This document outlines the prediction validation mechanics, confidence equations, and real-time mapping for the ASTRALIS AI Navigation console.

---

## 1. ICEBERG PREDICTION VALIDATION

### Snapshot Structure
Every prediction request returns coordinates for discrete intervals (+10m, +30m, +60m). The engine snapshots these:
```json
{
  "icebergId": 1,
  "targetTime": 42.5,
  "predictedX": 1823.1,
  "predictedY": 914.5,
  "confidence": 0.85,
  "uncertainty": 20.0,
  "horizon": 30,
  "evaluated": false
}
```

### Time Horizon Mapping
Simulation time (`simTimeHours`) progresses continuously. Forecast horizons (measured in minutes) are mapped to absolute simulation coordinates:
$$\text{TargetTime} = \text{simTimeHours} + \frac{\text{Horizon}}{60.0}$$
When the simulation clock passes `TargetTime`, the actual iceberg positions are located, and the Euclidean distance error is computed:
$$\text{Error} = \sqrt{(X_{\text{actual}} - X_{\text{predicted}})^2 + (Y_{\text{actual}} - Y_{\text{predicted}})^2}$$

---

## 2. CONFIDENCE EQUATIONS

### A. Iceberg Trajectory ML Confidence
Exposed directly from the Random Forest model predictions. If the backend is offline, it defaults to `N/A` rather than fabricating numbers.

### B. Sea-Ice ML Forecast Confidence
Extracted from the MultiOutputRegressor Random Forest model outputs.

### C. Autonomous Control Decision Confidence
Calculated via a composite equation balancing multiple inputs:
$$\text{DecisionConfidence} = \frac{C_{\text{ice}} + C_{\text{sea-ice}} + S_{\text{route}} + H_{\text{stability}}}{4}$$
Where:
- $C_{\text{ice}}$: Current average iceberg prediction confidence.
- $C_{\text{sea-ice}}$: Sea-ice prediction confidence.
- $S_{\text{route}}$: Overall safety margin of the current route strategy ($1.0 - \max(\text{icebergRisk}, \text{seaIceRisk})$).
- $H_{\text{stability}}$: Hysteresis modifier ($0.95$ when status remains stable, decreases to $0.75$ when the controller ALTERs course or speed).

---

## 3. REAL-TIME AI PIPELINE STAGES

The live dashboard displays a 7-stage processing chain:
1. **ENVIRONMENT**: Evaluates whether atmospheric/oceanic conditions are loaded.
2. **DETECTION**: Confirms if ship sensors track hazards.
3. **ML PREDICTION**: Assesses if the ML service is online and returning trajectory arrays.
4. **ROUTE ANALYSIS**: Verifies if the multi-objective A* solver has completed scoring.
5. **AI DECISION**: Reflects whether the AutonomousController is operating.
6. **SHIP EXECUTION**: Monitors active waypoint tracking.
7. **VALIDATION**: Checks if target horizons are reached and error averages compiled.
