# 03 — POLARIS Real Map Architecture

## 1. Executive Summary
This document specifies the map rendering architecture for POLARIS in **REAL DATA MODE**, detailing basemap layers, nautical context, tile server policies, and visual layer composition.

---

## 2. Navigational Authority vs. Visual Basemap

POLARIS enforces a strict conceptual distinction between visualization and route authority:

- **Geographic Basemap (OpenStreetMap / MapLibre / Canvas GeoJSON)**: Provides visual geographical context (coastlines, continent landmass, ocean depth contours, graticules).
- **POLARIS Navigation Core (`AINavigator` & `activeRoute`)**: Remains the **SOLE NAVIGATIONAL AUTHORITY**. The active route, risk scoring, and collision checks are calculated by POLARIS's A* pathfinding engine operating over validated hazard envelopes.

---

## 3. Map Layer Composition Stack

POLARIS renders visual elements in a 10-layer composite stack:

```
  Layer 10 — Safety / Risk / CPA Overlays & Emergency Banners
  Layer 9  — Ship Vessel Icon, Heading Vector & Velocity Leader
  Layer 8  — POLARIS Active Route (Green Dashed Canonical Line)
  Layer 7  — Vessel Traffic (AIS Targets) [FUTURE]
  Layer 6  — Iceberg Forecast & Uncertainty Search Envelopes (+2h..+24h)
  Layer 5  — Real Iceberg Observations (USNIC Contacts)
  Layer 4  — Environmental Sea-Ice Heatmap & Current Drift Vectors
  Layer 3  — Bathymetry Depth Contours (500m Shelf Break, 2000m Abyssal)
  Layer 2  — Nautical Context (Latitude/Longitude Graticules & Scale Bar)
  Layer 1  — Geographic Southern Ocean Basemap Fill (Navy / Dark Slate)
```

---

## 4. Tile Provider Policies & Attribution Requirements

### OpenStreetMap (OSM)
- **Role**: Geographic basemap & landmass boundaries.
- **Attribution**: Required on UI (`© OpenStreetMap contributors`).
- **Tile Usage Policy**: Public OSM tile servers (`tile.openstreetmap.org`) are intended for low-volume browsing and **MUST NOT** be abused as unrestricted heavy CDNs. POLARIS uses local GeoJSON vector boundaries / cached tile fallbacks for reliable offline hackathon operation.

### OpenSeaMap
- **Role**: Open-source nautical context (seamarks, buoys, beacons).
- **Attribution**: `Data © OpenSeaMap contributors`.
- **Limitation Notice**: OpenSeaMap is an open crowdsourced overlay and **IS NOT** an official Electronic Navigational Chart (ENC) for SOLAS regulatory compliance.

---

## 5. Map & Coordinate Synchronization Stack

```
  Geographic Coordinates (Latitude, Longitude)
                      ↕ (geoToWorld)
  POLARIS World Coordinates (0..3600, 0..2400)
                      ↕ (Camera Transform)
  Canvas Screen Coordinates (Pixels)
```

The camera applies panning and zooming over POLARIS world coordinates. All simulation entities live in world coordinates, allowing the renderer to map both map geometries and simulation entities synchronously to canvas pixels.
