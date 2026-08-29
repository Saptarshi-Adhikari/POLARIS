# AI Autonomous Navigation Controller

This document describes the design, implementation, and operational integration details for the ASTRALIS AI Autonomous Navigation Decision Controller.

---

## 1. CONTROLLER ARCHITECTURE

The AI Autonomous Controller acts as a high-level command layer sitting between user objectives/ML predictions and low-level physics execution:

```
+-------------------------------------------------+
|               ASTRALIS Console                  |
|  - Targets selection (Start, Destination)       |
+------------------------+------------------------+
                         |
                         v
+------------------------+------------------------+
|      AI Autonomous Controller (Periodic)        |
|  - Throttled evaluation once every 2 seconds    |
|  - Assesses route, turns, ice, wind, currents   |
|  - Maps ML trajectories and corridor overlays   |
+------------------------+------------------------+
                         |
                 (Decision Command)
                         |
                         v
+------------------------+------------------------+
|        Vessel Autopilot / Physics Engine        |
|  - Low-level crabbing drift compensation       |
|  - Smooth steering angle and power adjustments |
+-------------------------------------------------+
```

---

## 2. DECISION LOGIC & PRIORITY MODEL

The autonomous controller evaluates states sequentially according to the following priority matrix:

1. **Predicted Collision Risk**: Checks immediate relative vectors and time to closest approach (emergency stops if distance $< 40\text{m}$).
2. **ML Predicted corridor intersection**: Uses the Random Forest ML forecasts. If predicted positions (modified by time-growing confidence margins) cross the planned ship corridor, a `REROUTE` signal is triggered, forcing A* replanning.
3. **Immediate Proximity Hazard**: Flags obstacles within direct sensor margins, slowing speed targeting.
4. **Sharp Turn Projections**: Looks ahead at upcoming waypoints. If a turn exceeds $30^{\circ}$, caps speeds dynamically to avoid overshoot or wide drifting arcs.
5. **Frictional Resistance**: Limits speeds if crossing heavy sea ice field concentrations.
6. **Leeway Drift Combat**: Increases the maximum engine power threshold limit to 80% if wind speed exceeds $70\text{ km/h}$, combatting lateral leeway drift.
7. **Safe Cruising**: Maintains normal cruise speed (22 knots) when risk is low.

---

## 3. HYSTERESIS & STABILITY CONTROL

To prevent structural oscillation (e.g. ship constantly changing headings or speed targets every evaluation cycle), the controller implements:
- **Heading Hysteresis**: Heading changes are only updated if the difference exceeds $5^{\circ}$, unless the ship is in immediate proximity to a waypoint.
- **Speed Hysteresis**: Speed targets are filtered to require a change $> 1$ knot before adjusting target speed.

---

## 4. GRACEFUL FALLBACK

- **Offline Behavior**: If the FastAPI ML backend goes offline, the `AIClient` reports an `OFFLINE` status.
- **Physics Evasion**: The controller continues to run normally, substituting the ML trajectory data with standard linear physics forecasting extrapolation and direct circular hazard proximity sensors.

---

## 5. REPRODUCIBLE SYSTEM CLASSIFICATION

For review transparency, the controller components are categorized as follows:
- **ML Trajectory Prediction**: Trained Scikit-Learn Random Forest Regressor (Python FastAPI backend).
- **Global Path Planner**: A* Search Algorithm on weighted cell grids.
- **Autonomous Control Logic**: Purely deterministic rule-based control layer with stability hysteresis filters (JavaScript frontend).
- **Vessel Dynamics**: Rigid-body physics engine (Euler thrust integration and vector additions).
