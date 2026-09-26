# ADVANCED REAL DATA ARCHITECTURE

## 1. Overview
The POLARIS Advanced Real Data Architecture integrates real-world satellite observations, atmospheric wind vector fields, ocean physics models, and target correlation algorithms directly into the existing 2D Digital Twin Canvas simulator without adding external map rendering engines (NO Cesium, MapLibre, MapTiler, or 3D globes).

---

## 2. Integrated Data Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA PROVIDERS & SOURCES                 │
│  USNIC ERDDAP  │  Open-Meteo Wind  │  Copernicus Current   │  Sentinel-1 SAR  │
└───────┬─────────────────┬───────────────────┬──────────────────────┬─────────┘
        │                 │                   │                      │
        ▼                 ▼                   ▼                      ▼
  UsnicIceberg       OpenMeteoWind      CopernicusCurrent        SarContact
    Provider            Provider             Provider             Provider
        │                 │                   │                      │
        └─────────────────┼───────────────────┴──────────────────────┘
                          │
                          ▼
                RealDataNormalizer (Lat/Lon → World Coords)
                          │
                          ▼
               ContactCorrelationEngine
        (USNIC Icebergs ↔ SAR Detections ↔ AIS)
                          │
                          ▼
            RealDataCache (LocalStorage Snapshot)
                          │
                          ▼
            Canonical RealEnvironmentSnapshot
                          │
      ┌───────────────────┼────────────────────┬────────────────────┐
      ▼                   ▼                    ▼                    ▼
2D Canvas Renderer   Radar PPI Display   Risk Intelligence   A* Route Planner
 (Official Names &    (Blip Symbols:      (Confidence-Aware  (Collision Hazard
 Uncertainty Cones)  ● USNIC, ◇ SAR)       Risk Exposure)       Avoidance)
```

---

## 3. Truth State Classifications

Every entity in the POLARIS system maintains an explicit truth state:

1. **OBSERVED**: Authoritative catalogued observation from USNIC / NOAA PolarWatch.
2. **DETECTED**: Bright object detection candidate from Sentinel-1 SAR imagery.
3. **CORRELATED**: Spatial/temporal match between SAR detection and known catalogued target.
4. **PROJECTED**: Forward trajectory forecast (0h, 6h, 12h, 24h) with growing uncertainty envelope.
5. **SIMULATED**: Synthetic procedural entity used in DEMO mode.

---

## 4. OpenDrift Velocity Decomposition

Iceberg motion vector is decomposed into multi-component physical forces:

$$\mathbf{V}_{\text{iceberg}} = \alpha \cdot \mathbf{V}_{\text{current}} + \beta \cdot \mathbf{V}_{\text{wind}} + \mathbf{V}_{\text{observed}}$$

- `currentComponent`: Hydrodynamic current vector $\mathbf{V}_{\text{current}}$
- `windComponent`: 2% windage coupling vector $\mathbf{V}_{\text{wind}} \cdot 0.02$
- `modelVelocity`: Integrated physics drift
- `uncertainty`: Growth rate $r_u(t) = r_0 + \gamma \cdot t$

---

## 5. DNV Maritime Schema Compatibility

POLARIS exports navigation scenarios and COLAV avoidance evaluations to DNV-compatible JSON schemas via `DnvMaritimeSchemaAdapter`:

- **Traffic Situation**: Standardized initial environment, vessel telemetry, and hazard list.
- **Situation Output**: Evaluation results, COLREG compliance, and active route waypoints.
