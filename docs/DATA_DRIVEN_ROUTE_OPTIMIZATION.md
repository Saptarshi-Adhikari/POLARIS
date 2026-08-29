# Data-Driven Route Optimization & Calibration

This document describes the enhancements to the ASTRALIS routing engine to ensure stable, smooth, deterministic, and safe navigation trajectories.

---

## 1. Routing Problems Discovered
- **NaN Propagation**: In the closed-loop autopilot drift compensation, taking `Math.asin` of a ratio exceeding `[-1, 1]` resulted in `NaN` propagating into heading calculations, causing the vessel to become invisible.
- **Directionless Environment Penalties**: Currents and wind resistance were applied uniformly rather than factoring in the movement vector direction relative to current flow.
- **Uncontrolled Route Smoothing**: Waypoint removal was purely geometric, allowing smoothed paths to take shortcuts straight through dense sea ice fields or high risk coordinates.
- **Unchecked Topology**: Waypoints lacked finite value and boundary validations.

---

## 2. Final Route Cost Equation

$$\text{TOTAL\_COST} = \text{distanceCost} + \text{icebergPenalty} + \text{seaIcePenalty} + \text{environmentalPenalty} + \text{routeRiskPenalty} + \text{turningPenalty}$$

- **distanceCost**: The A* step cost (1.0 for orthogonal movement, 1.414 for diagonals).
- **icebergPenalty**: Scaled quadratically using `icebergWeight` from `5.0` to `15.0`.
- **seaIcePenalty**: Scaled linearly relative to concentration and `seaIceWeight`.
- **environmentalPenalty**: Derived from the dot product of movement direction and environmental current/wind vectors:
  - Tail assist: Reduces overall traverse cost.
  - Head resist: Increases cost.
  - Cross-flow: Adds handling/drift penalties.
- **turningPenalty**: Discourages zig-zagging.

---

## 3. Parameter Ranges & Calibrated Weights

The training pipeline selected the following calibrated configuration parameters (saved in `src/data/routeCalibration.json`):

```json
{
  "icebergWeight": 5.38,
  "seaIceWeight": 3.2,
  "currentWeight": 0.25,
  "crossCurrentWeight": 0.11,
  "riskWeight": 5.93,
  "turnPenalty": 0.26,
  "heuristicWeight": 1.0,
  "smoothingTolerance": 15
}
```

---

## 4. Python Calibration & Validation Methodology

We generated a synthetic-but-physics-informed dataset of $50$ scenarios incorporating variations in start/destination coordinates, iceberg configurations, current strength, and sea-ice concentration. Random weights search was used to evaluate cost profiles, selecting parameters that minimize iceberg collision zones while maintaining high distance efficiency.

The regression test scenarios verified in `backend/route_validation.py` are:
1. **SCENARIO 1**: Open Water (straight route)
2. **SCENARIO 2**: Single Iceberg Blockage (safe detour avoidance)
3. **SCENARIO 3**: Iceberg + Sea Ice (chooses safe corridor)
4. **SCENARIO 4**: Strong Head Current (verifies resistance)
5. **SCENARIO 5**: Strong Cross Current (stable heading)
6. **SCENARIO 6**: Complex Recovery (combined hazard avoidance)

---

## 5. Live Deterministic Planner
JavaScript A* remains the live runtime planner, utilizing the optimized weights loaded from `routeCalibration.json`. This guarantees explainable, reproducible, and offline-compatible maritime route forecasts.
