# POLARIS / ASTRALIS Nav-OS — Data Sources & Licenses

## 1. Provider Truth Table

| Data Layer | Category | Status / Provenance | License & Attribution | Notes |
|---|---|---|---|---|
| **Antarctic Coastline GeoJSON** | Geography | `BUNDLED` | [Natural Earth](https://www.naturalearthdata.com/) (Public Domain) | Simplified Antarctic vector coastline clipped to lat < -45°S. |
| **Stylized Coastal Bathymetry** | Oceanography | `STYLIZED` | Synthetic Geometry | Distance-to-coast depth band rendering in 3-4 deepening navy shades. |
| **Open-Meteo Marine API** | Meteorology | `LIVE` / `CACHED` | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) (Open-Meteo / ECMWF IFS HRES) | Ingests live surface wind speed/direction, gusts, wave height, wave direction, wave period, and SST for Southern Ocean (Bharati Corridor). |
| **USNIC Antarctic Icebergs** | Iceberg | `CACHED` | U.S. Government Public Domain ([USNIC](https://usicecenter.gov/Products/AntarcIcebergs)) | Tracked named icebergs (`D28`, `D15`, `D22A`) with approximate public drift positions and predicted displacement cones. |
| **Antarctic Sea-Ice Grid** | Satellite | `SIM` | Synthetic Model | Data-driven procedural concentration grid reprojected onto Lat/Lon geodetic frame (`synthetic: true`). |
| **Southern Ocean Currents** | Oceanography | `SIM` | Synthetic Model | Data-driven procedural 2D current vector field reprojected onto Lat/Lon geodetic frame. |

---

## 2. Deferred SeaIceAdapter Specification: `OsiSafAdapter`

POLARIS implements a strict provider architecture via `DataProvider.js` and `RealDataProvider.js`. Real sea-ice concentration is badged `SIM` today while fully specifying the drop-in `SeaIceAdapter` interface for future live satellite raster ingestion.

### Interface Contract
```javascript
export class SeaIceAdapter {
  /**
   * Fetch sea-ice concentration grid for a given date and bounding box.
   * @param {string} date YYYY-MM-DD
   * @param {Object} bbox { minLat, maxLat, minLon, maxLon }
   * @returns {Promise<{ data: Float32Array, width: number, height: number, provenance: Object }>}
   */
  async fetchGrid(date, bbox) {
    throw new Error('fetchGrid must be implemented');
  }
}
```

### `OsiSafAdapter` Target Specifications
- **Target Product**: EUMETSAT OSI-SAF Global Sea Ice Concentration (`OSI-401-d` / `OSI-401-b`)
- **Ingestion Endpoint**: Public no-auth FTP / HTTP server `ftp://osisaf.met.no/reprocessed/ice/conc/v3/` or `https://osisaf-web.met.no/`
- **Data Format**: NetCDF-4 / GeoTIFF daily global gridded raster (10 km polar stereographic grid)
- **License**: Free open access (EUMETSAT OSI-SAF License)
- **Plug-in Seam**: In `RealDataProvider.js`, replace `getSeaIce()` to delegate to `OsiSafAdapter.fetchGrid()`. **Zero UI or ModeManager changes required.**
