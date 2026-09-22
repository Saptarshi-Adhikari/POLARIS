# POLARIS Real Data & Real Maps Master Architectural Specification

## 1. Executive Summary
POLARIS (Polar Operations & Location-Aware Route Intelligence System) is an interactive maritime digital twin and autonomous navigation console. This master document establishes the complete architectural specification for operating POLARIS in **REAL DATA MODE** alongside the existing **DEMO DATA MODE**.

Key Architectural Principle:  
> **REAL mode changes the DATA SOURCE, not the SAFETY AND NAVIGATION ARCHITECTURE.**

Whether running on synthetic demo scenarios or real historical USNIC iceberg observations, the exact same A* pathfinder (`AINavigator`), Web Worker engine (`routeWorker.js`), Nomoto ship dynamics (`Ship`), continuous collision checks, and green active route visualization (`CanvasRenderer`) govern vessel safety.

---

## 2. Why REAL Mode?
Polar navigation demands transition from conceptual simulation to real-world operational utility. REAL mode enables:
1. **Historical Replay Validation**: Testing vessel pathfinding against actual past iceberg locations recorded by USNIC (U.S. National Ice Center) and Copernicus Marine hydrodynamic reanalysis.
2. **Geographic Basemap Overlay**: Rendering vessel position, active routes, and hazard search envelopes over real geographic Southern Ocean / Antarctic basemaps.
3. **Scientific Credibility**: Displaying transparent data provenance metadata (source, UTC timestamp, dataset product, confidence intervals).

---

## 3. DEMO vs REAL Data Modes

| Dimension | DEMO MODE `[CURRENT]` | REAL HISTORICAL REPLAY `[CURRENT]` | REAL LIVE STREAM `[FUTURE]` |
| :--- | :--- | :--- | :--- |
| **Data Provider** | `DemoDataProvider` | `RealReplayProvider` | `RealLiveProvider` |
| **Data Source** | Synthetic LCG generator | USNIC Icebergs + Copernicus Marine | Live REST / WebSocket API |
| **Map Layer** | `DemoMapProvider` (Polar Canvas Grid) | `RealMapProvider` (Southern Ocean Basemap) | Interactive Vector MapLibre |
| **Coordinates** | World Simulation Units `(0..3600)` | Lat/Lon `(geoToWorld)` | Lat/Lon `(geoToWorld)` |
| **Replay Clock** | Simulation clock (`simTimeHours`) | Historical UTC timestamp step | Real-time wall clock |
| **Network Need** | 100% Offline | 100% Offline (Local Replay Bundle) | Authenticated Internet API |
| **Fail-Safe** | N/A | Error HUD (`RETRY` / `TO DEMO`) | Error HUD + Buffer Fallback |

---

## 4. Provider Layer Architecture

To prevent route planning and collision detection logic from directly coupling to raw external formats (USNIC CSV, NetCDF, GRIB2, GeoJSON), POLARIS introduces a clean provider abstraction:

```
  External Source (USNIC / Copernicus / ERA5)
                     ↓
              Provider Adapter
                     ↓
         Normalized POLARIS Model
 (Hazard / Environment / VesselObservation)
                     ↓
        GeoTransform (geoToWorld)
                     ↓
   Existing POLARIS Navigation Engine
 (AINavigator / Ship / CanvasRenderer)
```

---

## 5. Real Map Architecture & Coordinate Systems

### Map Layer Stack
1. **Layer 1 (Geographic Basemap)**: Deep ocean background fill, Southern Ocean coastlines (Antarctic Peninsula, Ronne Ice Shelf).
2. **Layer 2 (Nautical Context)**: Bathymetry depth contours (500m shelf break, 2000m abyssal slope), lat/lon graticule, scale bar.
3. **Layer 3 (Environmental Fields)**: Sea-ice concentration heatmap, ocean current vectors, wind drag vectors.
4. **Layer 4 (Iceberg Hazards)**: Observed real iceberg positions, safety collision envelopes, ML trajectory forecasts (+2h to +24h).
5. **Layer 5 (Active Route & Ship)**: Canonical green dashed route (`activeRoute`), vessel symbol, Nomoto heading vector, risk HUD.

### Coordinate Transformation Boundary (`geoTransform.js`)
POLARIS simulation world operates in normalized simulation units `(X: 0..3600, Y: 0..2400)`.  
Geographic coordinates `(Latitude, Longitude)` transform via `DEFAULT_ANTARCTIC_BBOX`:
- `geoToWorld(lat, lon)`: Maps lat/lon to simulation units `(x, y)`.
- `worldToGeo(x, y)`: Maps simulation units `(x, y)` back to lat/lon.

---

## 6. Real Maritime Datasets vs Non-Maritime Datasets

### Maritime Datasets `[VALIDATED]`
- **USNIC Iceberg Catalogue**: Real observed iceberg locations (A-68A, B-15A, C-19B, etc.), dimensions, mass, timestamps.
- **Copernicus Marine Service**: Global ocean physics reanalysis (current speed, direction, sea ice concentration).
- **ERA5 (ECMWF)**: Atmospheric reanalysis wind velocity fields.
- **Sentinel-1 SAR**: Satellite Synthetic Aperture Radar sea-ice imagery (future processing pipeline).
- **USCG AIS**: Vessel Automatic Identification System tracks.

### Non-Maritime Dataset Distinction `[EXPLICIT]`
- **Indian Driving Dataset (IDD)**: IDD is an autonomous road/urban driving dataset. It is **NOT** a maritime dataset and must **NOT** be used as an iceberg or ocean hydrodynamic source for POLARIS.

---

## 7. Failure Handling & Provenance HUD

1. **Integrated Provenance HUD**:
   Displays explicit source metadata when `DATA: REAL` is active:
   ```
   DATA: REAL | SOURCE: USNIC / Copernicus | TIME: 2026-03-15 12:00:00 UTC | MODE: HISTORICAL REPLAY
   ```
2. **Failure Handling Rule**:
   REAL mode **NEVER silently falls back to DEMO mode**. If real data payload is corrupted or unavailable:
   - Displays `REAL DATA ERROR`.
   - Offers explicit options: `RETRY`, `USE HISTORICAL REPLAY`, or `SWITCH TO DEMO`.

---

## 8. Specialized Documentation Links

For detailed sub-system documentation, refer to the specialized specification files:

- 📖 **[01-real-data-overview.md](01-real-data-overview.md)**: Conceptual overview & high-level design.
- 📐 **[02-real-data-integration-guide.md](02-real-data-integration-guide.md)**: Main technical integration guide.
- 🎨 **[03-real-map-architecture.md](03-real-map-architecture.md)**: Geographic map rendering stack.
- 🌐 **[04-coordinate-systems-and-georeferencing.md](04-coordinate-systems-and-georeferencing.md)**: Geo coordinate transforms.
- 📊 **[05-real-data-sources.md](05-real-data-sources.md)**: Detailed source-by-source matrix.
- 📁 **[06-real-data-formats.md](06-real-data-formats.md)**: GeoJSON, NetCDF, GRIB, CSV specs.
- 📝 **[07-normalized-data-model.md](07-normalized-data-model.md)**: Canonical schema definitions.
- 🖥️ **[08-real-mode-ui-specification.md](08-real-mode-ui-specification.md)**: UI overlay & Provenance HUD.
- ⏱️ **[09-real-replay-system.md](09-real-replay-system.md)**: Historical replay clock engine.
- 📡 **[10-real-live-data-architecture.md](10-real-live-data-architecture.md)**: Future live streaming specs.
- 🛡️ **[11-data-provenance-and-quality.md](11-data-provenance-and-quality.md)**: Provenance & data validation rules.
- ⚓ **[12-real-mode-safety-and-navigation.md](12-real-mode-safety-and-navigation.md)**: Navigation & safety integration.
- 📊 **[13-demo-vs-real-comparison.md](13-demo-vs-real-comparison.md)**: Mode comparison matrix.
- 🗺️ **[14-real-data-implementation-roadmap.md](14-real-data-implementation-roadmap.md)**: Phased implementation roadmap.
- 🚀 **[15-real-data-quickstart.md](15-real-data-quickstart.md)**: Developer quickstart guide.
- 📋 **[16-real-data-source-matrix.md](16-real-data-source-matrix.md)**: Full source evaluation matrix.
- ❓ **[17-real-data-faq.md](17-real-data-faq.md)**: Frequently asked questions.
- 📚 **[18-real-data-reference-library.md](18-real-data-reference-library.md)**: Annotated link reference library.
