# 16 — POLARIS Real Data Source Matrix

## Comprehensive Data Source Evaluation Matrix

| Source | Maritime Relevant? | Input Type | Primary Format | Main Use in POLARIS | Target POLARIS Layer | Reliability & Availability | License / Attribution Terms | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Indian Driving Dataset (IDD)** | ❌ No | Urban traffic imagery | Annotations / Images | **EXCLUDED** (Road dataset; future land transport extension only) | N/A | High (Local files) | IIIT-H Research Use | `[EXCLUDED - NON-MARITIME]` |
| **Mendeley Traffic** | ❌ No | Road traffic flows | CSV / JSON | **EXCLUDED** (Urban road traffic; unsuitable for maritime) | N/A | High (Static repository) | CC BY 4.0 | `[EXCLUDED - UNVERIFIED]` |
| **USNIC Iceberg Catalogue** | ✅ Yes | Iceberg track observations | CSV / GeoJSON / Shapefile | Antarctic Iceberg Contacts & Dimensions | Layer 5 (Iceberg Contacts) | High (NOAA / USCG Public Catalog) | Public Domain (U.S. Govt) | `[CURRENT - IMPLEMENTED]` |
| **Copernicus Marine Service** | ✅ Yes | Ocean physics reanalysis & NRT | NetCDF / REST API | Ocean currents $v_x, v_y$, sea ice concentration | Layer 4 (Hydrodynamics & Sea Ice) | High (EU Copernicus Operations) | Open Access (Credit Copernicus) | `[CURRENT - IMPLEMENTED]` |
| **ERA5 (ECMWF)** | ✅ Yes | Atmospheric reanalysis | GRIB2 / NetCDF | 10m Wind velocity drag vectors | Layer 4 (Environmental Drag) | High (ECMWF Climate Data Store) | Copernicus License | `[CURRENT - IMPLEMENTED]` |
| **OpenStreetMap (OSM)** | ✅ Yes | Geographic vector data | Vector Tiles / GeoJSON | Southern Ocean Coastlines & Landmass | Layer 1 (Geographic Basemap) | High (Local cached tiles / GeoJSON) | ODbL (`© OpenStreetMap`) | `[CURRENT - IMPLEMENTED]` |
| **OpenSeaMap** | ✅ Yes | Nautical seamarks | Vector Overlay | Beacons, buoys, marine context | Layer 2 (Nautical Context) | High (Public vector tiles) | CC BY-SA 2.0 | `[PROPOSED]` |
| **Sentinel-1 SAR** | ✅ Yes | Satellite radar imagery | GeoTIFF / NetCDF | Sea-ice & iceberg boundary extraction | Layer 5 & 6 (Observed & Forecast) | Medium (Orbital pass latency) | Open Access (Credit ESA) | `[PROPOSED]` |
| **USCG AIS Traffic** | ✅ Yes | Vessel position broadcasts | NMEA / JSON Stream | Surrounding vessel tracks & multi-vessel avoidance | Layer 7 (Vessel Traffic) | High (USCG Public Stream) | Public Domain / USCG Terms | `[FUTURE]` |
| **MapLibre GL JS** | ✅ Yes | Vector map rendering engine | Vector Tiles | Interactive WebGL geographic basemap | Layer 1 & 2 (Basemap Engine) | High (BSD License) | BSD 3-Clause | `[FUTURE]` |
