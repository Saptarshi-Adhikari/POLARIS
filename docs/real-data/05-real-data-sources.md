# 05 — POLARIS Real Data Sources Audit

## 1. Overview
This document provides a detailed evaluation of external data sources evaluated for POLARIS, detailing their maritime relevance, data formats, licensing terms, and integration role.

---

## 2. Detailed Data Source Evaluations

### 1. Indian Driving Dataset (IDD) `[NON-MARITIME / EXPLICIT EXCLUSION]`
- **Provider**: IIIT Hyderabad / Intel.
- **URL**: [https://idd.insaan.iiit.ac.in/](https://idd.insaan.iiit.ac.in/)
- **Nature of Data**: Autonomous road vehicle driving imagery, street scenes, urban traffic.
- **POLARIS Relevance**: **NOT MARITIME**. IDD is a land-transport road dataset and cannot be used for polar iceberg or ocean hydrodynamic modeling.
- **Usage**: Documented as an explicit non-maritime exclusion. Potential future land-transport extension only.

### 2. Mendeley Traffic Datasets `[NON-MARITIME UNLESS VERIFIED]`
- **Provider**: Mendeley Data repository.
- **Nature of Data**: Urban road traffic flow / traffic sensor recordings.
- **POLARIS Relevance**: General links to road traffic repositories do not establish maritime relevance. Marked unsuitable unless a specific maritime vessel tracking dataset is verified.

### 3. USNIC (U.S. National Ice Center) `[CURRENT - MARITIME]`
- **Provider**: NOAA / U.S. Navy / U.S. Coast Guard.
- **URL**: [https://usicecenter.gov/Catalog/AntarcIceberg](https://usicecenter.gov/Catalog/AntarcIceberg)
- **Nature of Data**: Antarctic iceberg tracking catalogue (A-68A, B-15A, C-19B, etc.), observed lat/lon, dimensions, timestamps.
- **POLARIS Relevance**: **PRIMARY REAL ICEBERG DATASET**. Normalized via `RealReplayProvider`.

### 4. Copernicus Marine Service `[CURRENT - MARITIME]`
- **Provider**: European Union Copernicus Programme.
- **URL**: [https://data.marine.copernicus.eu/](https://data.marine.copernicus.eu/)
- **Nature of Data**: Global ocean physics reanalysis (ocean currents $v_x, v_y$, sea ice concentration, sea surface temperature).
- **POLARIS Relevance**: **PRIMARY OCEAN HYDRODYNAMICS DATASET**. Normalized via `RealReplayProvider`.

### 5. ERA5 (ECMWF Reanalysis v5) `[CURRENT - MARITIME]`
- **Provider**: European Centre for Medium-Range Weather Forecasts (ECMWF).
- **URL**: [https://www.ecmwf.int/en/forecasts/datasets/era5-hourly-data-single-levels-1940-present](https://www.ecmwf.int/en/forecasts/datasets/era5-hourly-data-single-levels-1940-present)
- **Nature of Data**: Global hourly atmospheric reanalysis (10m wind $u, v$ vectors).
- **POLARIS Relevance**: **PRIMARY WIND DRAG DATASET**.

### 6. OpenStreetMap (OSM) `[CURRENT - BASEMAP]`
- **Provider**: OpenStreetMap Foundation.
- **URL**: [https://www.openstreetmap.org/](https://www.openstreetmap.org/)
- **Nature of Data**: Open geographic basemap & coastline vector geometry.
- **POLARIS Relevance**: **PRIMARY GEOGRAPHIC BASEMAP**. Rendered via `RealMapProvider`.

### 7. OpenSeaMap `[PROPOSED - MARITIME CONTEXT]`
- **Provider**: OpenSeaMap Project.
- **URL**: [https://www.openseamap.org/](https://www.openseamap.org/)
- **Nature of Data**: Open seamarks, buoys, beacons, and marine navigation overlays.
- **POLARIS Relevance**: Visual nautical context layer (not official SOLAS ENC charts).

### 8. Sentinel-1 SAR `[FUTURE - SATELLITE]`
- **Provider**: European Space Agency / Copernicus.
- **URL**: [https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1)
- **Nature of Data**: Synthetic Aperture Radar sea-ice imagery.
- **POLARIS Relevance**: Future automated satellite feature-extraction pipeline.

### 9. USCG AIS Vessel Traffic `[FUTURE - VESSEL TRAFFIC]`
- **Provider**: U.S. Coast Guard Navigation Center.
- **URL**: [https://navcen.uscg.gov/ais-data-sharing-categories-requirements](https://navcen.uscg.gov/ais-data-sharing-categories-requirements)
- **Nature of Data**: Vessel Automatic Identification System tracks.
- **POLARIS Relevance**: Future multi-vessel traffic avoidance layer.
