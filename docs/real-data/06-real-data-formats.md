# 06 — POLARIS Real Data Formats Specification

## 1. Overview
This document specifies supported and proposed file formats, REST API structures, and local static replay bundles for ingesting real data into POLARIS.

---

## 2. Ingestion Format Specifications

### A. GeoJSON `[CURRENT / PROPOSED]`
Used for vector coastlines, iceberg observation points, and route geometry.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-55.40, -61.20]
      },
      "properties": {
        "id": "USNIC-A68A",
        "name": "A-68A Remnant",
        "size_meters": 2400,
        "collision_radius_m": 80,
        "timestamp": "2026-03-15T12:00:00Z",
        "source": "USNIC"
      }
    }
  ]
}
```

### B. CSV (Comma-Separated Values) `[CURRENT]`
Used for simple iceberg observation catalogues and vessel track logs.

```csv
id,name,latitude,longitude,size_m,collision_radius_m,timestamp,source
USNIC-A68A,A-68A Remnant,-61.20,-55.40,2400,80,2026-03-15T12:00:00Z,USNIC
USNIC-B15A,B-15A Segment,-64.80,-62.10,1800,60,2026-03-15T12:00:00Z,USNIC
```

### C. NetCDF (Network Common Data Form) `[PROPOSED]`
Used by Copernicus Marine Service for 3D/4D gridded ocean physics datasets (currents, salinity, sea surface height).  
*Note*: Browser environments process preprocessed JSON/GeoJSON slices extracted from NetCDF files.

### D. GRIB2 (GRIdded Binary v2) `[PROPOSED]`
Used by ECMWF / WMO for global weather forecasts (ERA5 10m wind vector fields). Preprocessed via Python backend (`backend/main.py`).

### E. Static Replay Bundle Format `[CURRENT]`
For deterministic hackathon presentations, local static datasets are stored under `data/antarctic/`:

```
data/antarctic/
├── metadata.json                 # Scenario metadata & spatial bounds
├── iceberg_tracks_sample.json     # USNIC iceberg observation tracks
├── ocean_currents_sample.json     # Copernicus hydrodynamics grid
├── wind_sample.json               # ERA5 wind vectors
└── sea_ice_sample.json            # Concentration percentage grid
```

---

## 3. Conceptual REST & WebSocket Endpoints `[FUTURE]`

- `GET /api/real/icebergs`: Returns JSON array of normalized `Hazard` objects.
- `GET /api/real/environment`: Returns normalized `Environment` snapshot.
- `WS /ws/real/telemetry`: Streaming WebSocket endpoint for live AIS vessel observations.
