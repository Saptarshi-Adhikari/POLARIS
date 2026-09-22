# 17 — POLARIS Real Data FAQ (Frequently Asked Questions)

## Frequently Asked Questions

### Q1: Can POLARIS display real geographic maps?
**Yes.** In REAL mode, `RealMapProvider` renders a real Southern Ocean / Antarctic Peninsula geographic basemap (deep ocean bathymetry, 500m shelf break, 2000m abyssal slope, continent coastlines, graticule lines in degrees, and 100 NM scale bar) while preserving all POLARIS visual overlays.

### Q2: Can POLARIS consume real iceberg datasets?
**Yes.** `RealReplayProvider` normalizes real Antarctic iceberg catalogue observations from **USNIC** (U.S. National Ice Center), including recorded positions (lat/lon), dimensions, mass, and update timestamps.

### Q3: Can POLARIS consume real ocean hydrodynamics and weather data?
**Yes.** POLARIS normalizes global ocean physics reanalysis currents and ERA5 10m wind velocity fields from **Copernicus Marine Service** and **ECMWF**.

### Q4: Can satellite imagery (e.g. Sentinel-1 SAR) be ingested?
**Yes.** Sentinel-1 SAR radar satellite imagery can be ingested into an image processing pipeline to extract iceberg boundaries and sea-ice concentration fields `[PROPOSED]`.

### Q5: Can AIS vessel traffic broadcasts be processed?
**Yes.** Vessel Automatic Identification System (AIS) position broadcasts can be ingested into a multi-vessel traffic avoidance layer `[FUTURE]`.

### Q6: Can the Indian Driving Dataset (IDD) be used as an iceberg source?
**No.** IDD is an autonomous road/urban vehicle driving dataset. It is **NOT** a maritime dataset and is explicitly excluded from maritime iceberg modeling.

### Q7: Can REAL DATA MODE operate completely offline?
**Yes.** `RealReplayProvider` uses local historical replay dataset bundles stored under `data/antarctic/`, ensuring 100% offline-safe execution during competition demos and judging.

### Q8: Why is historical replay preferred over live streaming APIs for hackathons?
Historical replay guarantees **100% deterministic, zero-latency, offline-safe execution** without relying on external API server uptime, rate limits, or network keys.

### Q9: What happens if a real data payload is corrupted or unreachable?
POLARIS displays an explicit **REAL DATA ERROR** banner on the Provenance HUD with action buttons (`RETRY`, `HISTORICAL REPLAY`, `TO DEMO`). **REAL mode NEVER silently switches to DEMO mode without user confirmation.**

### Q10: How are latitude and longitude converted to simulation coordinates?
`geoToWorld(lat, lon)` maps latitude/longitude to POLARIS world units `(0..3600 x 0..2400)` via `DEFAULT_ANTARCTIC_BBOX`, applying linear normalization and bounds validation.

### Q11: Does REAL mode replace POLARIS's existing navigation engine?
**No.** Core rule: **REAL mode changes the DATA SOURCE, not the SAFETY & NAVIGATION ENGINE.** The exact same A* Web Worker pathfinder, Nomoto ship controller, and collision checks evaluate vessel safety.

### Q12: Can OpenSeaMap replace official nautical charts?
**No.** OpenSeaMap provides helpful open-source visual seamarks but is **NOT** an official Electronic Navigational Chart (ENC) for SOLAS regulatory compliance.
