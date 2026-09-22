# 02 — POLARIS Real Data Technical Integration Guide

## 1. Overview
This technical integration guide details the developer-facing architecture for implementing and extending Data Providers, Map Providers, Data Validation, Failure Handling, and Provenance metadata within POLARIS.

---

## 2. Provider Abstraction Architecture

POLARIS decouples data ingestion and visual map rendering from the navigation core using two class hierarchies:

```
                  DataProvider Base Class
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
   DemoDataProvider                  RealReplayProvider
(Synthetic Icebergs & Math)     (USNIC & Copernicus Marine)
                                              │
                                              ▼
                                     RealLiveProvider [PROPOSED]
                                      (Authenticated WebSockets)
```

```
                  MapProvider Base Class
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
     DemoMapProvider                   RealMapProvider
   (Polar Canvas Grid)            (Southern Ocean Basemap)
```

### Why Provider Abstraction is Mandatory
The POLARIS pathfinder (`AINavigator`), collision detection engine, and Nomoto vessel controller must **NOT** directly import or parse third-party data formats (e.g. USNIC CSVs, Copernicus NetCDF, ERA5 GRIB2). 

Instead:
```
  Third-Party Source (USNIC / Copernicus)
                     ↓
              Provider Adapter
                     ↓
         Normalized POLARIS Model
 (Hazard / Environment / VesselObservation)
                     ↓
        GeoTransform (geoToWorld)
                     ↓
   Existing POLARIS Navigation Engine
```

---

## 3. Data Validation Rules

Every real data record MUST pass strict validation before entering POLARIS state:

| Validation Step | Rule & Threshold | Action on Failure |
| :--- | :--- | :--- |
| **Schema Validation** | Must contain required fields (`id`, `latitude`, `longitude`, `timestamp`). | Reject record, log warning. |
| **Latitude Bounds** | Latitude must be a finite number in `[-90.0, 90.0]`. | Reject record. |
| **Longitude Bounds** | Longitude must be a finite number in `[-180.0, 180.0]`. | Reject record. |
| **Finite Number Check** | Positions, velocities, and radii must not be `NaN` or `Infinity`. | Reject record. |
| **Timestamp Freshness** | Timestamp must not exceed max observation window (> 7 days stale). | Flag as STALE, inflate uncertainty radius. |
| **Geometry Safety** | Collision radius must be $> 0$ (default to 25 SU if missing). | Assign default safety radius. |

---

## 4. Failure Handling Specification

REAL mode enforces explicit error handling to protect scientific integrity:

> **CRITICAL RULE**: REAL mode MUST NEVER silently convert to DEMO mode upon data loading failure.

### Error States & Allowed Actions
If an external API fails, a network timeout occurs, or a dataset payload is corrupted:
1. Set provider state: `status = 'ERROR'`, `errorMessage = '<reason>'`.
2. Display the explicit **REAL DATA ERROR** banner on the Provenance HUD.
3. Present three explicit user actions:
   - **`RETRY`**: Re-attempt fetching/initializing real data provider.
   - **`HISTORICAL REPLAY`**: Switch to deterministic local historical replay snapshot.
   - **`SWITCH TO DEMO`**: Explicitly switch back to synthetic DEMO mode upon user selection.

---

## 5. Data Provenance Metadata Schema

Every observation and environmental field in REAL mode must maintain full provenance metadata:

```json
{
  "provider": "REAL_HISTORICAL_REPLAY",
  "status": "READY",
  "errorMessage": null,
  "source": "USNIC / Copernicus Marine",
  "timeUTC": "2026-03-15 12:00:00 UTC",
  "mode": "HISTORICAL REPLAY",
  "recordCount": 6,
  "attribution": "U.S. National Ice Center / EU Copernicus Marine Service",
  "license": "Public Domain / Copernicus Open Access"
}
```
