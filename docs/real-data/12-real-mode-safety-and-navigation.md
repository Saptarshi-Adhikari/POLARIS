# 12 — POLARIS Real Mode Safety & Navigation Integration

## 1. Executive Summary
This document specifies how REAL data inputs seamlessly connect into POLARIS's existing core navigation and safety architecture without requiring modifications to the pathfinder, collision detector, or vessel flight control.

---

## 2. Core Integration Pipeline

```
  Real Maritime Hazard (USNIC Observation)
                     ↓
  Normalized Hazard (createNormalizedHazard)
                     ↓
  GeoTransform Boundary (geoToWorld)
                     ↓
  Existing Risk Model (RiskIntelligenceEngine)
                     ↓
  Existing Pathfinder (AINavigator / routeWorker.js)
                     ↓
  Active Route State (state.navigation.activeRoute)
                     ↓
  Nomoto Ship Controller (Ship.js Autopilot)
                     ↓
  Continuous Collision Avoidance Checks
```

---

## 3. Core Invariants (Unchanged Components)

1. **Pathfinder (`AINavigator.js`)**: Executes the exact same Web Worker A* grid search algorithm.
2. **Replan Storm Guard (`pendingWorkerRequestId`)**: Enforces state locks to prevent replan storms whether hazards are synthetic or real.
3. **2.5s Timeout Guard**: Automatically falls back to synchronous pathfinding if background workers delay or fail.
4. **Nomoto Vessel Dynamics (`Ship.js`)**: Steering, drag, thrust, and fuel consumption algorithms remain identical.
5. **NavTestBot & EpisodeRunner (`Shift+F6`)**: Automated testing suite operates identically across both modes.
