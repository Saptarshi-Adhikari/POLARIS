# 07 — POLARIS Normalized Data Model

## 1. Executive Summary
This document defines the canonical normalized data schemas consumed by the POLARIS navigation engine regardless of input source (DEMO vs REAL).

---

## 2. Canonical Schemas (`src/js/providers/schemas.js`)

### 1. `Hazard`
Represents physical navigation hazards (icebergs, growlers, ice floes).

```javascript
{
  id: "USNIC-A68A",
  type: "ICEBERG",               // ICEBERG | GROWLER | ICE_FLOE
  latitude: -61.20,
  longitude: -55.40,
  position: { x: 1764.0, y: 160.0 }, // Transformed POLARIS World Coords
  velocity: { vx: 0.15, vy: 0.08 },  // Drift velocity (SU/sec)
  geometry: {
    size: 2400,                   // Major axis dimension (m)
    radius: 80,                   // Collision envelope radius (SU)
    mass: 4.5                     // Mass scale factor
  },
  timestamp: 1773576000000,       // UTC Epoch Timestamp (ms)
  uncertainty: 0.02,              // Spatial uncertainty fraction (0..1)
  confidence: 0.98,               // Source confidence score (0..1)
  source: "USNIC",                // Provider attribution string
  rawObserved: true               // true = Observed, false = ML Forecast
}
```

### 2. `Environment`
Represents hydrodynamic and meteorological vector field conditions.

```javascript
{
  timestamp: 1773576000000,
  current: {
    speed: 2.1,                   // Speed in knots
    direction: 135,               // Direction in degrees (0..360)
    vx: 0.25,                     // Vector component X (SU/s)
    vy: 0.15                      // Vector component Y (SU/s)
  },
  wind: {
    speed: 38.5,                  // Speed in knots
    direction: 240,               // Direction in degrees (0..360)
    vx: -0.45,
    vy: -0.20
  },
  seaIce: {
    concentration: 0.28,          // Average concentration fraction (0..1)
    resistanceFactor: 1.2         // Resistance multiplier on hull
  },
  visibility: 12.0,               // Visibility in Nautical Miles
  source: "Copernicus Marine / ERA5"
}
```

### 3. `VesselObservation`
Represents ship position telemetry observations.

```javascript
{
  id: "POLARIS_01",
  timestamp: 1773576000000,
  latitude: -74.5,
  longitude: -70.0,
  speed: 14.5,                    // Speed Over Ground (knots)
  course: 330,                    // Course Over Ground (degrees)
  heading: 330,                   // Gyro Heading (degrees)
  source: "USCG AIS / GPS"
}
```

### 4. `DatasetManifest`
Metadata describing replay dataset properties.

```javascript
{
  datasetId: "antarctic_replay_2026_q1",
  name: "Southern Ocean USNIC / Copernicus Historical Replay",
  version: "1.0.0",
  temporalRange: {
    startUTC: "2026-03-15T00:00:00Z",
    endUTC: "2026-03-15T23:59:59Z"
  },
  geographicBounds: {
    latMin: -78.0, latMax: -60.0,
    lonMin: -75.0, lonMax: -35.0
  },
  license: "Public Domain / Copernicus Open Access",
  attribution: "U.S. National Ice Center & EU Copernicus Marine Service"
}
```
