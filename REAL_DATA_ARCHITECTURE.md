# POLARIS REAL Data Mode Architecture

## 1. Executive Summary
The POLARIS application features a modular **REAL DATA MODE** layer integrated directly into the existing 2D Digital Twin Canvas simulation architecture.

> [!IMPORTANT]
> **Zero Map Engine Overhead**: NO Cesium, NO MapLibre, NO MapTiler, NO Leaflet, NO 3D globe, and NO geographic basemap tiles are used. The existing 2D Canvas rendering engine, camera, physics, radar, and A* route planner remain intact.

---

## 2. System Architecture

```
┌─────────────────────────────────────────┐
│              DATA MODE SWITCH           │
│                DEMO / REAL              │
└────────────────────┬────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
        DEMO                  REAL
          │                     │
   Synthetic Data        Real Data Provider
      Provider              Orchestrator
          │                     │
          │      ┌──────────────┼──────────────┐
          │      │              │              │
          │   USNIC/BYU    Open-Meteo      Copernicus
          │   Icebergs        Wind          Currents
          │      │              │              │
          │      └──────────────┼──────────────┘
          │                     │
          └──────────┬──────────┘
                     │
         RealDataNormalizer (Lat/Lon → World Coords)
                     │
           RealDataCache (LocalStorage Snapshot)
                     │
         Canonical Real Environment Snapshot
                     │
   ┌─────────────────┼──────────────────┬─────────────────┐
   │                 │                  │                 │
Canvas Renderer    Radar          Risk Intelligence   Route Planner
(Official Labels)  (Real Bergs)   (Real Hazards)      (Real Avoidance)
```

---

## 3. Data Providers & Sources

### Icebergs:
1. **USNIC ERDDAP / NOAA PolarWatch**: Primary machine-readable iceberg API (`https://polarwatch.noaa.gov/erddap/tabledap/usnic_weekly_iceberg.json`)
2. **USNIC Antarctic Product Page**: Official USNIC Antarctic designations (`A-76`, `B-22`, `C-37`, `D-15D`)
3. **BYU SCP Database**: Backup historical database and tracks (`https://www.scp.byu.edu/current_icebergs.html`)

### Wind:
1. **Open-Meteo Forecast API**: Default keyless atmospheric wind vector API (`https://api.open-meteo.com/v1/forecast`)
2. **NOAA GFS / NOMADS**: Secondary atmospheric fallback

### Ocean Currents:
1. **Copernicus Marine Physics**: `GLOBAL_ANALYSISFORECAST_PHY_001_024` product via credentials in `.env.local`
2. **NOAA RTOFS / NOMADS**: Ocean model fallback

---

## 4. Lat/Lon Geodetic Projection Layer
Geographic coordinates are converted to world coordinates `(0..3600 x 0..2400)` via controlled linear scaling over the Antarctic region `[latMin: -78.0, latMax: -60.0, lonMin: -75.0, lonMax: -35.0]`:

```javascript
import { geoToWorld, worldToGeo } from './providers/geoTransform.js';

const worldPos = geoToWorld(lat, lon); // { x: 1840, y: 1200 }
```

---

## 5. Offline & Snapshot Import/Export
- **Canonical Runtime Format**: JSON (`RealEnvironmentSnapshot`)
- **Operator Export Formats**: JSON & CSV supported via `DataExporter.exportRealSnapshot(snapshot, format)`
- **Offline Resilience**: Automatically loads the last-known-good cached snapshot if external network requests fail or time out.

---

## 6. Official Iceberg Designation Labels
Every real iceberg renders its official USNIC identifier (e.g., `D-15D`, `B-15A`) attached to its 2D canvas entity, adhering to camera zoom transforms.
