# ML-Aware Multi-Objective Route Optimization

This document outlines the architecture, route strategies, scoring matrices, fuel & ETA estimations, and recommendation models for ASTRALIS Multi-Objective Routing.

---

## 1. ROUTE STRATEGIES & DIVERGENT COSTING

The system generates three distinct route plans using weighted cost factors inside the global A* pathfinder:

- **FASTEST**:
  - Focus: Minimal travel time / ETA.
  - Multipliers: `icebergCostMult = 0.5`, `seaIceCostMult = 0.2`.
- **BALANCED**:
  - Focus: Optimization of fuel efficiency against safe margins.
  - Multipliers: `icebergCostMult = 1.0`, `seaIceCostMult = 1.0`.
- **SAFEST**:
  - Focus: Dynamic hazard evasion.
  - Multipliers: `icebergCostMult = 3.0`, `seaIceCostMult = 4.0`.

---

## 2. MULTI-OBJECTIVE SCORING MATRIX

Every strategy computes normalized metrics (ranging from `0.0` to `1.0`):

- **Iceberg Risk**: Evaluated by measuring path segment distance to static icebergs combined with ML predicted trajectories (penalized heavily if crossing forecasted safety buffers).
- **Sea Ice Risk**: Assesses current ocean ice concentrations blended with ML sea-ice predictions (+6h, +12h, and +24h forecasts).
- **Fuel Cost**: Normalized fuel consumption value relative to a maximum cruise consumption ceiling (2,500L).
- **Travel Time**: Normalized travel duration relative to target cruise duration (18 hours).
- **Overall Safety**: A composite safety score calculated as `1.0 - Math.max(icebergRisk, seaIceRisk)`.

---

## 3. FUEL & ETA ESTIMATE EQUATIONS

- **Travel Time (ETA)**:
  $$\text{ETA} = \frac{\text{Distance}}{\text{Speed}}$$
  Where speed is modulated by ocean currents and sea-ice resistance:
  $$\text{Speed} = \frac{\text{BaseSpeed} + 0.2 \times \text{CurrentAssist}}{1.0 + 1.5 \times \text{ForecastedIce}}$$
- **Fuel Consumption**:
  $$\text{Fuel} = \text{Distance} \times \text{BaseFuelRate} \times (1.0 + 1.5 \times \text{ForecastedIce})$$

---

## 4. AI RECOMMENDATION ENGINE

- **Selection Pipeline**: The navigator analyzes the strategies. If `BALANCED` risks exceed normal safety envelopes (e.g. `balanced.risk === 'HIGH'` or overall safety falls behind the safest option by $> 0.15$), the system recommends the `SAFEST` route.
- **Autonomous Adoption**: When `AutonomousController` is set to `ACTIVE`, it automatically sets the active pathing parameters to the AI recommended mode.
- **Copilot Explainability**: Compares data snapshots containing alternative scoring profiles, which are fed directly into the prompt payload of the Local LLM (Ollama) to explain selection trade-offs.
