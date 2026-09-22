# 11 — POLARIS Data Provenance & Quality Specification

## 1. Overview
High-latitude maritime navigation requires full auditability of all data inputs. This document establishes the formal data quality rules, classification states, and provenance metadata schemas enforced by POLARIS.

---

## 2. Classification States

POLARIS explicitly tags every data object with one of five canonical classification states:

1. **`OBSERVED`**: Verified physical satellite or radar observation (e.g. USNIC SAR contact).
2. **`FORECAST`**: Predictive ML inference trajectory (+2h to +24h forecast envelope).
3. **`REANALYSIS`**: Assimilated ocean physics grid (Copernicus Marine / ERA5 reanalysis).
4. **`SIMULATED`**: Synthetic physics model output (DEMO mode LCG icebergs).
5. **`UNKNOWN`**: Unverified data input (flagged for inspection or rejection).

---

## 3. Data Quality Validation Protocol

```
Input Record → Schema Check → Range Check → Finite Check → Freshness Check → Approved State
```

- **Duplicate Detection**: Identifies hazards within $< 500\text{m}$ radius bearing identical source IDs and merges updates.
- **Outlier Rejection**: Rejects speed spikes $> 50\text{ knots}$ for iceberg drift as physical anomalies.
- **Spatial Validation**: Ensures coordinates fall strictly within allowable regional Antarctic bounding box (`DEFAULT_ANTARCTIC_BBOX`).
