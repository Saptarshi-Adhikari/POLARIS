# 📈 AI Prediction Confidence & Uncertainty Intelligence

This document details the architecture, math models, live validation integrations, and environmental stability factors of the ASTRALIS AI Prediction Confidence & Uncertainty Intelligence system.

---

## 1. SYSTEM ARCHITECTURE

The Confidence Intelligence Engine is a unified calibrator that takes raw subsystem error metrics, stability indices, and data source modes to produce normalized reliability ratings:

```
[ Subsystem Inputs ]
  ├──> ValidationEngine (mean prediction error, samples)
  ├──> VectorField (wind / currents rate-of-change)
  ├──> aiClient (FastAPI offline/online status)
  └──> AutonomousController (mode shifts and emergency overrides)
        │
        v
[ ConfidenceIntelligenceEngine ] ──> UI Panel & Canvas uncertainty ellipse renderer
```

---

## 2. ICEBERG DEGRADATION & UNCERTAINTY GROWTH

Uncertainty is modeled as a monotonically increasing function over the forecast time horizon $t$:
$$\text{uncertainty}(t) = \text{baseUncertainty} \times (1 + \gamma \cdot t)$$
where $\gamma = 0.15$ represents the uncertainty growth rate.

This maps directly to time-degraded confidence:
$$\text{confidence}(t) = \text{baseConfidence} \times \frac{1}{1 + \gamma \cdot t} - \text{penalty}_{\text{validation}}$$
where:
- $\text{penalty}_{\text{validation}} = \min(0.2, \text{MeanError} \times 0.005)$
- The resulting confidence scores correspond to $+6\text{h}$, $+12\text{h}$, and $+24\text{h}$ horizons.

---

## 3. UNIFIED DECISION CONFIDENCE WEIGHTS

The compound Decision Confidence aggregate uses default weighted normalization:
- **Iceberg Forecast Reliability**: $25\%$
- **Sea-Ice Forecast Reliability**: $15\%$
- **Prediction Validation Accuracy**: $20\%$
- **Route Safety Margin**: $20\%$
- **Environmental Stability**: $10\%$
- **Autonomous Controller Tracking State**: $10\%$

If a component is missing (e.g. backend offline), completeness drops to $75\%$ (partial observability) and missing inputs degrade validation penalties, preventing the UI from showing fake high scores.

---

## 4. ENVIRONMENTAL & CONTROLLER STABILITY

1. **Environmental Stability**: Computed as the rolling variance of wind/current rate-of-change over the last 5 ticks.
2. **Controller Tracking**: Downgrades to `ADAPTING` ($60\%$) if the autonomous controller initiates emergency dodging loops or cross-track corrections.
