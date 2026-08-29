# 🔍 Explainable AI Route Intelligence

This document outlines the architecture, explanation rank algorithms, tradeoff calculations, and safety timelines of the ASTRALIS Explainable AI Route Intelligence system.

---

## 1. SYSTEM ARCHITECTURE

The Explainability Engine is a unified reporting layer that acts as the transparent bridge between raw observation logs, ML predictions, and low-level steering commands:

```
Subsystem Metrics (XTE, ML, Risk, Mode)
                  │
                  v
    [ ExplainabilityEngine ] ──> UI Dashboard display panel (index.html)
                  │
                  └──> AI Copilot Context (Passes structural reasons)
```

---

## 2. EXPLANATION GENERATION & RANKING

Top reasons are ranked dynamically based on absolute metric thresholds:
1. **Iceberg Collision Proximity**: Checked first when a predicted Random Forest corridor crosses within $150$ SU of the vessel.
2. **Sea-Ice Concentration**: Checked second when average concentration exceeds $0.4$ ($40\%$).
3. **Mission Constraint Optimization**: Evaluates pre-voyage fuel and ETA targets.
4. **Adverse Currents**: Triggers when environmental resistance exceeds $3.0$.

---

## 3. COUNTERFACTUAL & TRADEOFF LOGIC

### A. Tradeoff Calculations
Compares the active strategy directly against rejected paths using relative percentages:
$$\Delta \text{Risk} = (\text{Risk}_{\text{Shortest}} - \text{Risk}_{\text{Safest}}) \times 100$$
$$\Delta \text{ETA} = \frac{\text{ETA}_{\text{Safest}} - \text{ETA}_{\text{Shortest}}}{\text{ETA}_{\text{Shortest}}} \times 100$$

### B. Counterfactual Explanations
Answers "Why not strategy $X$?" using evaluated rules:
- *SHORTEST rejected*: Exceeds mission risk limits.
- *SAFEST rejected*: ETA constraint cannot be satisfied.

---

## 4. SUBSYSTEM TIMELINE STATUS MAPPINGS

Each decision pipeline stage evaluates component states:
- **🛰️ DATA**: `READY` (procedural) or `ACTIVE` (Data-Driven Mode).
- **🤖 ML FORECAST**: `ACTIVE` (FastAPI online) or `FALLBACK` (procedural drift predictions).
- **🧠 RISK ANALYSIS**: `ACTIVE` (Gaussian corridor decay grid loaded).
- **🧭 MISSION CONSTRAINTS**: `READY` or `FALLBACK` (constraint violations detected).
- **🗺️ ROUTE SELECTION**: `READY` or `OFFLINE`.
- **🚢 AUTONOMOUS ACTION**: `ACTIVE` (autopilot active) or `READY` (manual override).
