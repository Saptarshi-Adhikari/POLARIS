# POLARIS / ASTRALIS Nav-OS — Data Sources & Licenses

| Data Layer | Category | Status / Provenance | License & Attribution | Notes |
|---|---|---|---|---|
| **Antarctic Coastline GeoJSON** | Geography | `BUNDLED` | [Natural Earth](https://www.naturalearthdata.com/) (Public Domain) | Simplified Antarctic vector coastline clipped to lat < -45°S. |
| **Stylized Coastal Bathymetry** | Oceanography | `STYLIZED` | Synthetic Geometry | Distance-to-coast depth band rendering in 3-4 deepening navy shades. |
| **Open-Meteo Marine API** | Meteorology | `LIVE` / `CACHED` | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Open-Meteo / ECMWF IFS HRES) | Ingests live surface wind speed/direction, gusts, wave height, wave direction, wave period, and SST for Southern Ocean (Bharati Corridor). |
| **USNIC Antarctic Icebergs** | Iceberg | `LIVE` / `CACHED` | U.S. Government Public Domain ([USNIC](https://usicecenter.gov/Products/AntarcIcebergs)) | Tracked named icebergs (e.g. A23a, D15, B15a) with approximate public drift positions and predicted displacement cones. |
| **Antarctic Sea-Ice Grid** | Satellite | `SIM` | Synthetic Model | Data-driven procedural concentration grid reprojected onto Lat/Lon geodetic frame. |
| **Southern Ocean Currents** | Oceanography | `SIM` | Synthetic Model | Data-driven procedural 2D current vector field reprojected onto Lat/Lon geodetic frame. |
