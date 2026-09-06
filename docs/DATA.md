# Data Provenance & Antarctic Data Sets

| Data | Source File / Engine | Provenance | Used By | Refresh |
| :--- | :--- | :--- | :--- | :--- |
| **Sea Ice Concentration** | `data/antarctic/sea_ice_sample.json` & `vectorField.js` | Synthetic Antarctic Grid (10x10) | Pathfinding & Canvas Render | Real-time / Dynamic |
| **Ocean Currents** | `data/antarctic/ocean_currents_sample.json` & `vectorField.js` | Perlin-noise ocean current vectors | Physics Engine & Ship Drift | 60Hz |
| **Wind Speed** | `data/antarctic/wind_sample.json` & DOM Sliders | Vector field dataset & UI Sliders | Wind drag & Sea state | On Change |
| **Iceberg Tracks** | `data/antarctic/iceberg_tracks_sample.json` & `iceberg.js` | Synthetic tracks with mass/size profiles | Trajectory forecast & Risk grid | Real-time |
| **Route Calibration** | `data/routeCalibration.json` | Baseline speed, fuel burn & safety thresholds | Multi-route candidate scoring | Static config |
| **Uncertainty Calibration** | `data/uncertaintyCalibration.json` | Confidence intervals & risk bounds | `ConfidenceIntelligenceEngine` | Static config |
| **Ship Route** | `aiNavigator.js` & `routeWorker.js` | Web Worker A* pathfinding | Autopilot & Canvas | Recalculated |

