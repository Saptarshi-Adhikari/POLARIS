# 🔮 AI What-If & Counterfactual Simulator

This document details the architecture, formulas, recommendation metrics, and integration logic of the ASTRALIS AI What-If & Counterfactual Simulator.

---

## 1. SYSTEM ARCHITECTURE

The simulator operates as a non-destructive shadow evaluation layer. It creates an isolated snapshot of the vessel, environmental configurations, and targets, allowing hypothetical adjustments without mutating active values:

```
[ Active Simulation state ] ──> captureBaseline()
                                         │
                                         v
Hypothetical Settings ────────> [ CounterfactualSimulator ] ──> Hypothetical Route Overlay (canvasRenderer)
(Sliders: Wind, Current, Ice)
                                         │
                                         └──> Readout Panel / Toggles (index.html)
```

---

## 2. SHADOW PIPELINE ESTIMATIONS

To prevent CPU locks, the simulator estimates segments analytically:
1. **ETA Projections**: Traverses waypoints of the baseline path, determining speed modifications:
   $$\text{speed}_{\text{hypo}} = \max\left(2.0, (v_{\text{base}} + \mathbf{v}_{\text{current}} \cdot \mathbf{u}_{\text{segment}}) \cdot \text{slowdown}_{\text{ice}}\right)$$
   $$\text{slowdown}_{\text{ice}} = 1.0 - (\text{concentration}_{\text{seaIce}} \cdot 0.6)$$
2. **Fuel Scaling**: Correlates travel time with baseline throttle and wind gust resistances:
   $$\text{consumption} \propto t_{\text{traversal}} \cdot \text{drag}_{\text{gust}} \cdot \text{resistance}_{\text{ice}}$$

---

## 3. DECISION RECOMMENDATIONS

The engine evaluates outputs against Mission Planner constraints (risk ceiling, ETA hours):
- **FASTEST**: Kept if risk stays below threshold.
- **SAFEST**: Recommended if iceberg danger increases beyond thresholds.
- **DELAY_DEPARTURE**: Triggers if fuel exceeds capacity constraints.
- **REROUTE_REQUIRED**: Alerts if predicted trajectory vectors cross corridors.
