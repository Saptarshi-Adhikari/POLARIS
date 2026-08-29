# Demo Scenario System

This document outlines the architecture, setup configs, and operational behaviors for the ASTRALIS One-Click Demo Scenario System.

---

## 1. SCENARIO ARCHITECTURE

The Scenario Manager ([`scenarioManager.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/simulation/scenarioManager.js)) runs as a supervisory module. When a scenario triggers:
1. It checkpoints default simulation state values (ship position, fuel, winds, iceberg layouts).
2. It resets parameters and overlays scenario specific parameters (heavy currents, winds, spawned crossers).
3. It forces global recalculation and client forecasts.
4. The low-level deterministic navigation controls and ML layers execute in real-time.

```
+-------------------------------------------------+
|               🎬 DEMO SCENARIOS                 |
|  - Normal Transit / Iceberg Crossing / Ice / etc|
+------------------------+------------------------+
                         |
                 (State Override)
                         |
                         v
+------------------------+------------------------+
|       Autonomous Controller / A* Planner       |
|  - Processes new weather limits & spawned cross |
+------------------------+------------------------+
                         |
                         v
+------------------------+------------------------+
|           Real-Time Navigation Engine           |
|  - Steers vessel and reacts to forecasts        |
+-------------------------------------------------+
```

---

## 2. SCENARIO PROFILES

### 1. 🟢 Normal Transit
- **Parameters**: Mild wind (15 km/h), moderate currents (2 SU/h), sea ice disabled.
- **Expected Outcome**: Autopilot cruises at target speed (22 knots) towards destination node safely.

### 2. 🧊 Iceberg Crossing
- **Parameters**: Spawns a massive iceberg directly ahead. The iceberg is configured with cross-path velocity (`vx = -30, vy = 40`).
- **Expected Outcome**: The ML trajectory forecast intercepts the route safety corridor, raising hazard level alerts. The controller alters target speed and triggers A* course recalculations, routing safely around the forecast coordinates.

### 3. ❄️ Increasing Sea Ice
- **Parameters**: Environment sea ice concentration field is boosted to 75%.
- **Expected Outcome**: Grid weights spike. The A* path planner routes around the heaviest patches. Autopilot slows target speed to 10 knots for safety.

### 4. 🌪 Extreme Weather
- **Parameters**: Cross-winds exceed 85 km/h, current rates rise to 12 SU/h.
- **Expected Outcome**: Autopilot increases maximum engine limits to 80% to combat leeway drift, and steers crabbing angles to stabilize heading targets.

---

## 3. REAL-TIME PHASE INDICATORS

To explain navigation logic to evaluators, the scenario card displays real-time stages:
- **`SETUP`**: Environmental states populated.
- **`DETECTION`**: Entities mapped within sensor margins.
- **`PREDICTION`**: ML trajectory forecasts active.
- **`DECISION`**: Autonomous Controller issues override commands.
- **`EXECUTION`**: Vessel autopilot adjusts steering/throttle.
