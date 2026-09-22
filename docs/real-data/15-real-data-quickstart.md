# 15 — POLARIS Real Data Developer Quickstart Guide

## Developer Quickstart: Adding a New Real Dataset to POLARIS

Follow this 12-step workflow to prepare, normalize, and register a new real dataset into POLARIS:

```
 1. Obtain Dataset  ──►  2. Verify License  ──►  3. Check Coords  ──►  4. Check Units
         │
         ▼
 5. Check Timestamps ──► 6. Convert Format ──► 7. Validate Records ──► 8. Add Metadata
         │
         ▼
 9. Normalize Model  ──► 10. Load Provider ──► 11. Replay/Render ──► 12. Verify Safety Core
```

---

## Code Examples for Data Normalization

### 1. Normalizing Iceberg CSV / GeoJSON
```javascript
import { createNormalizedHazard, validateHazardSchema } from './schemas.js';
import { geoToWorld } from './geoTransform.js';

export function parseIcebergRecord(rawRecord) {
  // Convert lat/lon to simulation units
  const worldPos = geoToWorld(rawRecord.lat, rawRecord.lon);

  const hazard = createNormalizedHazard({
    id: rawRecord.id,
    type: 'ICEBERG',
    latitude: rawRecord.lat,
    longitude: rawRecord.lon,
    position: worldPos,
    velocity: { vx: rawRecord.drift_vx || 0.1, vy: rawRecord.drift_vy || 0.05 },
    geometry: {
      size: rawRecord.length_m || 1000,
      radius: (rawRecord.length_m || 1000) / 30, // Convert to SU radius
      mass: (rawRecord.length_m || 1000) / 300
    },
    timestamp: Date.parse(rawRecord.timestamp_utc),
    uncertainty: 0.03,
    confidence: 0.95,
    source: rawRecord.source || 'USNIC'
  });

  const check = validateHazardSchema(hazard);
  if (!check.valid) {
    throw new Error(`Corrupt record rejected: ${check.reason}`);
  }

  return hazard;
}
```

### 2. Normalizing Ocean Current / Wind Environment Data
```javascript
import { createNormalizedEnvironment } from './schemas.js';

export function parseEnvironmentRecord(rawEnv) {
  return createNormalizedEnvironment({
    timestamp: Date.parse(rawEnv.timestamp_utc),
    current: {
      speed: rawEnv.current_speed_knots,
      direction: rawEnv.current_dir_deg,
      vx: Math.cos(rawEnv.current_dir_deg * Math.PI / 180) * rawEnv.current_speed_knots * 0.1,
      vy: Math.sin(rawEnv.current_dir_deg * Math.PI / 180) * rawEnv.current_speed_knots * 0.1
    },
    wind: {
      speed: rawEnv.wind_speed_knots,
      direction: rawEnv.wind_dir_deg,
      vx: Math.cos(rawEnv.wind_dir_deg * Math.PI / 180) * rawEnv.wind_speed_knots * 0.01,
      vy: Math.sin(rawEnv.wind_dir_deg * Math.PI / 180) * rawEnv.wind_speed_knots * 0.01
    },
    seaIce: {
      concentration: rawEnv.sea_ice_fraction || 0.2,
      resistanceFactor: 1.0 + (rawEnv.sea_ice_fraction || 0.2) * 0.8
    },
    source: rawEnv.source || 'Copernicus Marine'
  });
}
```

---

## Verification & Testing
After adding a new provider, run the test suite:
```bash
npx vitest run tests/data_mode_provider.test.js
```
