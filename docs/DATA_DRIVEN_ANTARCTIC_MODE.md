# 🛰️ Data-Driven Antarctic Mode

This document outlines the architecture, offline-first design, data formats, and integrations of the ASTRALIS Data-Driven Antarctic Mode.

---

## 1. ARCHITECTURE

The Data-Driven Mode shifts environmental vectors (currents, winds, sea ice concentrations) and iceberg trackers from procedural simulations to preprocessed historical observation snapshots:

```
[ Mode Switch UI ]
        │
        ├──> SIMULATION (Procedural Environment Fields)
        │
        └──> DATA-DRIVEN (antarcticDataManager.js Adapter)
                    │
                    ├──> sea_ice_sample.json
                    ├──> ocean_currents_sample.json
                    ├──> wind_sample.json
                    └──> iceberg_tracks_sample.json
```

---

## 2. COORDINATE NORMALIZATION & SCALING

The datasets are stored in downscaled spatial structures to optimize loading speeds and bundle sizes:
- **Sea Ice Grid**: $12 \times 8$ observation cells.
- **Ocean Currents**: $6 \times 4$ observation cells.
- **Wind Grid**: $6 \times 4$ observation cells.

When the ship queries conditions at world coordinate $(x, y)$ inside the range $[0\text{ to }3600, 0\text{ to }2400]$:
1. Coordinates are mapped to the discrete dataset index columns/rows:
   $$\text{col} = \text{clamp}\left(\left\lfloor \frac{x}{3600} \cdot W_{\text{grid}} \right\rfloor, 0, W_{\text{grid}} - 1\right)$$
   $$\text{row} = \text{clamp}\left(\left\lfloor \frac{y}{2400} \cdot H_{\text{grid}} \right\rfloor, 0, H_{\text{grid}} - 1\right)$$
2. The index retrieves the corresponding data value.
3. The time index is selected by rounding simulation time:
   $$\text{index}_t = \text{clamp}\left(\left\lfloor \frac{\text{simTime}}{12} \right\rfloor, 0, 2\right)$$
   corresponding to steps at $0\text{ hours}$, $12\text{ hours}$, and $24\text{ hours}$.

---

## 3. OFFLINE RESILIENCE & FALLBACKS

- **Offline-First Design**: Datasets are bundled statically into the Vite build and imported synchronously. No runtime APIs, REST endpoints, or active internet connections are required.
- **Graceful Fallbacks**: If parsing errors occur or specific coordinate queries fail, the manager catches exceptions locally and falls back to procedural simulation fields for the affected layer (reverting status to `FALLBACK`).

---

## 4. INTEGRATIONS

- **Sea-Ice ML**: Feeds preprocessed sea-ice concentration arrays into the forecasting pipelines.
- **A\* Router**: Evaluates dataset current vectors and tracked iceberg zones.
- **Risk Map**: Blends preprocessed inputs with ML horizons.
- **Autopilot**: Computes lateral drift vectors using dataset ocean current/wind components.
