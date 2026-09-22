# POLARIS Data Mode Architecture & Real Geographic Maps

## Executive Summary
POLARIS supports a production-grade **DATA MODE: [ DEMO | REAL ]** toggle, allowing the exact same safety and navigation engine to operate seamlessly across both synthetic simulation environments and real geographic maritime datasets (USNIC Icebergs, Copernicus Marine / ERA5 Ocean & Wind hydrodynamics).

---

## Architecture Overview

```
                      POLARIS DIGITAL TWIN HUD
                                 │
                         [ DATA: DEMO | REAL ]
                                 │
           ┌─────────────────────┴─────────────────────┐
           ▼                                           ▼
  [ DEMO DATA PROVIDER ]                     [ REAL REPLAY PROVIDER ]
  • Synthetic Icebergs                       • USNIC Iceberg Observations
  • Euler Vector Field                       • Copernicus Marine Currents
  • Polar Ocean Canvas Grid                  • ERA5 Wind Vector Field
  • Local Simulation Coordinates             • Geographic Lat/Lon Transform
           │                                           │
           └──────────────────┬────────────────────────┘
                              ▼
                [ NORMALIZED DATA SCHEMAS ]
                • Hazard (position, velocity, radius, source)
                • Environment (current, wind, seaIce)
                • VesselObservation (lat, lon, course)
                              │
                              ▼
                [ POLARIS NAVIGATION ENGINE ]
                • Web Worker A* Pathfinding (Async + 2.5s Timer Fallback)
                • Ship Hydrodynamics & Steering
                • Emergency Collision Avoidance
                • Green Active Route & Canvas Renderer
```

---

## Data Provider & Map Provider Abstraction Layer

POLARIS decouples data ingestion and visual map rendering from the navigation and safety architecture:

1. **`DataProvider` Layer (`src/js/providers/dataProvider.js`)**:
   - `DemoDataProvider`: Wraps the existing synthetic world generation engine.
   - `RealReplayProvider`: Loads historical maritime datasets from USNIC and Copernicus Marine, normalizes hazard schemas, applies uncertainty safety bounds, and manages replay timestamp state.

2. **`MapProvider` Layer (`src/js/providers/mapProvider.js`)**:
   - `DemoMapProvider`: Renders standard synthetic polar ocean canvas grid.
   - `RealMapProvider`: Renders a geographic basemap of the Southern Ocean / Antarctic Peninsula (deep ocean bathymetry, shelf break contours, continent coastlines, graticule lines in degrees, and scale bar) overlaid with all POLARIS visual elements (ship, green active route, iceberg collision envelopes, trajectories, and risk HUD).

---

## Normalized Data Schemas (`src/js/providers/schemas.js`)

All data inputs are validated and normalized into standardized objects before entering the navigation engine:

### 1. `Hazard`
```json
{
  "id": "USNIC-A68A",
  "type": "ICEBERG",
  "latitude": -61.20,
  "longitude": -55.40,
  "position": { "x": 1764.0, "y": 160.0 },
  "velocity": { "vx": 0.15, "vy": 0.08 },
  "geometry": { "size": 2400, "radius": 80, "mass": 4.5 },
  "timestamp": 1773576000000,
  "uncertainty": 0.02,
  "confidence": 0.98,
  "source": "USNIC (U.S. National Ice Center)"
}
```

### 2. `Environment`
```json
{
  "timestamp": 1773576000000,
  "current": { "speed": 2.1, "direction": 135, "vx": 0.25, "vy": 0.15 },
  "wind": { "speed": 38.5, "direction": 240, "vx": -0.45, "vy": -0.20 },
  "seaIce": { "concentration": 0.28, "resistanceFactor": 1.2 },
  "visibility": 12.0,
  "source": "Copernicus Marine / ERA5"
}
```

---

## Geographic Coordinate Transformation (`src/js/providers/geoTransform.js`)

POLARIS simulation world operates in normalized coordinates `(X: 0..3600, Y: 0..2400)`.  
Geographic coordinates `(Latitude, Longitude)` map to world space using the default Antarctic Southern Ocean bounding box (`DEFAULT_ANTARCTIC_BBOX`):

- **Latitude Range**: `-78.0°S` (Y = 2400) to `-60.0°S` (Y = 0)
- **Longitude Range**: `-75.0°W` (X = 0) to `-35.0°W` (X = 3600)

```javascript
import { geoToWorld, worldToGeo } from './providers/geoTransform.js';

// Convert lat/lon to simulation units
const worldPos = geoToWorld(-65.5, -55.0); // -> { x: 1800, y: 733.3 }

// Convert simulation units back to lat/lon
const geoPos = worldToGeo(1800, 733.3); // -> { lat: -65.5, lon: -55.0 }
```

---

## Failure Handling & Provenance HUD

1. **Integrated Provenance HUD**:
   When `DATA: REAL` is selected, a compact HUD displays provenance metadata:
   ```
   DATA: REAL | SOURCE: USNIC / Copernicus | TIME: 2026-03-15 12:00:00 UTC | MODE: HISTORICAL REPLAY
   ```
2. **Explicit Error Handling**:
   If real datasets fail to load or contain invalid schemas:
   - The HUD displays an explicit error message: `ERR: <reason>`.
   - Action buttons (`RETRY` or `SWITCH TO DEMO`) are presented.
   - The system **never silently falls back to DEMO mode**, preserving scientific credibility.

---

## Note on Non-Maritime Datasets (e.g. Indian Driving Dataset - IDD)

The **Indian Driving Dataset (IDD)** is an autonomous road-vehicle driving dataset containing urban traffic, pedestrian, and road scene annotations. It is **not a maritime dataset** and must not be used as an iceberg or ocean hydrodynamic data source for POLARIS. If integrated in future extensions, IDD should be treated strictly as a land/road transport scenario family.

---

## Extending Data Providers

To add a new live or historical dataset provider (e.g., Sentinel-1 SAR imagery or AIS vessel feeds):

1. Create a subclass of `DataProvider` in `src/js/providers/dataProvider.js`.
2. Implement `getHazards()`, `getEnvironment()`, and `getVesselObservation()`.
3. Normalize records using `createNormalizedHazard()` and `validateHazardSchema()`.
4. Register the new provider with `SimulationEngine.setDataMode()`.
