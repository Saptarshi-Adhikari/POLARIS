# AI Mission Planner

This document outlines the architecture, optimization logic, and overriding behaviors of the pre-voyage ASTRALIS AI Mission Planner.

---

## 1. ARCHITECTURE

The Mission Planner operates as an optimization module prior to route initialization:

```
[ Mission Input Sliders ] ──> [ Mission Planner (missionPlanner.js) ]
                                    │
                         (Scores A* Strategy Routes)
                                    │
                                    v
                         [ Recommended Selection ]
                                    │
                      (Pushed to Autonomous Controller)
```

---

## 2. CONSTRAINT RESOLUTION & SCORING

### Evaluated Strategies:
1. **SHORTEST (SPEED priority)**
2. **BALANCED (BALANCED priority)**
3. **SAFEST (SAFETY priority)**

### Compliance Threshold Checks:
- **Fuel Feasibility**: Fuel consumption percentage $\le$ max fuel constraint.
- **Risk Feasibility**: Maximum trajectory/concentration risk $\le$ risk ceiling.
- **Timeline Feasibility**: Travel time (ETA) $\le$ target arrival hour threshold.

### Scoring Equations:
- **SAFETY Priority**:
  $$\text{Score} = S_{\text{margin}} \times 2.0 - \text{Risk}_{\text{max}} \times 1.5 - P_{\text{fuel}} - P_{\text{eta}}$$
- **SPEED Priority**:
  $$\text{Score} = (1.0 - \text{ETA\_Ratio}) \times 2.0 - \text{Risk}_{\text{max}} \times 3.0 - P_{\text{fuel}}$$
- **BALANCED Priority**:
  $$\text{Score} = S_{\text{margin}} \times 1.0 + (1.0 - \text{ETA\_Ratio}) \times 1.0 - C_{\text{fuel\_ratio}}$$

---

## 3. DECISION INTEGRATION HIERARCHY

To ensure vessel safety under active scenarios, the autonomous overrides adhere to the following sequence:
1. **EMERGENCY STOP** (Imminent collision alerts)
2. **CRITICAL REROUTE** (Sudden corridor crossings)
3. **REAL-TIME SAFETY RESPONSE** (Drift corrections and speed caps)
4. **MISSION PLAN** (Applied pre-voyage strategy recommendations)
5. **NORMAL AUTOPILOT** (Nominal waypoint tracking)
