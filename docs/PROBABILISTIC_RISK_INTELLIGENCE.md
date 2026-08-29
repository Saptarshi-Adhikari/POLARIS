# Probabilistic AI Risk Intelligence Map

This document outlines the architecture, mathematical formulas, and integrations for the ASTRALIS Probabilistic AI Risk Intelligence Map.

---

## 1. ARCHITECTURE

The Risk Intelligence Engine operates as a central fusion layer combining ML trajectory predictors, sea-ice forecasting models, and planned route parameters:

```
ML Iceberg Forecast ─┐
                     ├── Risk Intelligence Engine ──> Risk Map Overlay
ML Sea-Ice Forecast ─┘                 │
                                       ├── Route Optimizer
                                       ├── Autonomous Controller
                                       ├── Explainability Panel
                                       └── AI Copilot Context
```

---

## 2. RISK FUSION METHODOLOGY

### A. Iceberg Risk (Smooth Gaussian Decay)
For each spatial grid cell $(x, y)$, the risk decays exponentially relative to distance to the iceberg's actual coordinates and its predicted ML future horizons:
$$\text{influenceActual} = e^{-\frac{d_{\text{actual}}}{75.0}}$$
$$\text{influencePredicted} = e^{-\frac{d_{\text{predicted}}}{60.0 + \text{uncertaintyRadius}}}$$
The spatial influence adapts dynamically to prediction confidences returned by the machine learning classifiers:
$$\text{icebergRisk} = \max(\text{influenceActual}, \text{influencePredicted} \times \text{Confidence})$$

### B. Sea-Ice Risk (Worsening Modifiers)
Calculates current freezing rates and scales them against horizons (+6h, +12h, +24h):
$$\text{seaIceRisk} = \text{currentSeaIce} + (\text{Trend} \times 0.35 \text{ if Trend > 0.05 else 0})$$

### C. Combined Grid Cell Risk
The final cell risk is computed by mapping maximum risks:
$$\text{combinedRisk} = \max(\text{icebergRisk}, \text{seaIceRisk})$$

---

## 3. PERFORMANCE & CACHING STRATEGY

Risk map calculations are computationally heavy. To preserve a high frame rate, the system:
1. Caches a discrete grid ($48 \times 32$ matrix cells).
2. Restricts update evaluations using a throttled execution loop (ticking once every 1.5 seconds under nominal conditions).
3. Utilizes canvas overlay rendering to render soft radial gradients from cached data, preventing animation latency.
