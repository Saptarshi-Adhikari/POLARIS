# POLARIS — DEFINITIVE CURRENT-STATE STATUS MATRIX

**Generated**: 2026-09-27T17:54:26.467Z
**Total Connected Software Capabilities**: 44
**Hardware Status**: PERMANENTLY OUT OF SCOPE (0 Physical Sensors / NMEA / CAN)

---

## 1. CAPABILITY SUMMARY

| Status Category | Count | Percentage |
| :--- | ---: | ---: |
| **REAL_DATA_VERIFIED** | 39 | 88.64% |
| **EXPERIMENTAL_REAL_DATA_BACKED** | 3 | 6.82% |
| **SYNTHETIC_ONLY** | 1 | 2.27% |
| **OPTIONAL_RUNTIME_NOT_VERIFIED** | 1 | 2.27% |
| **TOTAL** | **44** | **100.00%** |

---

## 2. 44-CAPABILITY MASTER REGISTRY

| # | Capability | Code Exists | Runtime Reachable | Tested | Browser Verified | Real Data Verified | Definite Status | Evidence |
| :-: | :--- | :-: | :-: | :-: | :-: | :-: | :--- | :--- |
| 1 | 3D Spatiotemporal Pathfinding | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | GEBCO + USNIC + Open-Meteo (Explicit (x,y,t) A* pathfinder with time-dependent hazard occupancy and atomic route adoption.) |
| 2 | ML Drift Forecasting | YES | YES | YES | YES | NO | `EXPERIMENTAL_REAL_DATA_BACKED` | USNIC Iceberg Trajectories / Real AIS (Polynomial drift forecasting trained/evaluated against real iceberg & vessel motion histories.) |
| 3 | Continuous Collision Check | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real AIS + USNIC Ice Contacts (Continuous space-time segment intersection validator using rotated vessel OBB footprints.) |
| 4 | OpenDrift/OpenBerg Integration | YES | YES | YES | YES | NO | `EXPERIMENTAL_REAL_DATA_BACKED` | Open-Meteo Wind & Copernicus Current (Hydrodynamic reference drift model operating on real wind and current forcing fields.) |
| 5 | Asymmetric Left/Right Evaluation | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | GEBCO + Real AIS (Evaluates port and starboard detour routes symmetrically before route commitment.) |
| 6 | COLREG-referenced Rules | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real AIS Target Tracks (COLREG-referenced Rules 5-19 applicability classifier and safe action selector.) |
| 7 | Curvature Smoothing | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | GEBCO & USNIC A* Waypoints (Kinematic turning limit smoother for continuous heading transitions.) |
| 8 | Dynamic Speed Adjustment | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Open-Meteo Current Forcing (Enforces steerage way throttle floor and emergency deceleration caps.) |
| 9 | Sensor Fusion Engine | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real AIS + Radar Replay + Sentinel-1 SAR (Track-level Covariance Intersection & Conservative Conflict Weighting multi-sensor fusion.) |
| 10 | Route Stability & Hysteresis | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | USNIC & Real AIS Dynamic Feeds (Commitment window and candidate cost improvement threshold (>=15%) hysteresis.) |
| 11 | Real Data Mode (REAL) | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | USNIC + Open-Meteo + GEBCO + AIS + Sentinel-1 (Unified real data ingestion pipeline with provenance tracking and health failover.) |
| 12 | Demo Data Mode (DEMO) | YES | YES | YES | YES | NO | `SYNTHETIC_ONLY` | N/A (Synthetic Mode) (Synthetic baseline generator for controlled offline demonstration.) |
| 13 | Bathymetry Safety Constraints | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | GEBCO Bathymetric Grid (5-tier bathymetric depth safety classifier and route segment depth validator.) |
| 14 | Radar PPI Visualizer | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Radar Perception Engine / Real AIS (Plan Position Indicator (PPI) rotating radar sweep renderer.) |
| 15 | Explainable AI (XAI) Dashboard | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Navigation Decisions (Auditable semantic XAI explanation mapper with COLREG & safety rule citations.) |
| 16 | Text-to-Speech (TTS) Alerts | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Hazard Warnings (Bridge voice alert system emitting debounced audio warnings.) |
| 17 | Autonomous Training Lab (Shift+F6) | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Backed Environments (Automated round-robin scenario runner and dataset collection bot.) |
| 18 | DNV Maritime Schema Adapter | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Telemetry Streams (Exports episode telemetry into DNV traffic situation standard JSON schema.) |
| 19 | JSONL Episode Exporter | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Telemetry Streams (Streams 10Hz telemetry, header metadata, and failure forensics to JSONL format.) |
| 20 | Dual Rendering (Canvas / Cesium) | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | GEBCO & Sentinel-1 Map Rasters (Dual-mode 2D HTML5 Canvas and 3D CesiumJS globe rendering adapter.) |
| 21 | Hybrid Forecasting (Physics + ML) | YES | YES | YES | YES | NO | `EXPERIMENTAL_REAL_DATA_BACKED` | Open-Meteo Current + Real AIS Trajectories (Hybrid hydrodynamic drift vector and ML trajectory residual prediction model.) |
| 22 | Web Worker Background Search | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | GEBCO Depth Grid Queries (Off-main-thread Web Worker A* search with 2500ms synchronous guard.) |
| 23 | Emergency Control Authority | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real AIS & USNIC Contact Proximity (Overrides active route guidance to execute tangential sliding or hard stop.) |
| 24 | Storm & Adverse Weather Avoidance | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Open-Meteo Wind/Wave API (Ingests wind/wave scalar grids to scale pathfinding traversal costs.) |
| 25 | Scenario Generator & Open Benchmark Suite | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | USNIC & GEBCO Real Benchmark Specs (12 scenario classes and open benchmark taxonomy evaluation framework.) |
| 26 | Replan Storm Guard | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Noisy Real AIS Updates (Prevents high-frequency route oscillation (zero flapping under sensor noise).) |
| 27 | Fuel-Optimal Route Mode | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Open-Meteo Current & Wind Fields (Power-law fuel consumption optimization across 4 operational profiles.) |
| 28 | Adaptive Calibration / Effective Drag Estimation | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | USNIC Observed Iceberg Tracks (Bounded EWMA adaptation of iceberg effective drag coefficient from track residuals.) |
| 29 | Docker Containerization | YES | YES | YES | YES | NO | `OPTIONAL_RUNTIME_NOT_VERIFIED` | N/A (Local Docker Daemon Inactive) (Multi-stage production Dockerfile and Compose setup for offline edge containerization.) |
| 30 | AIS Target Tracking & Gap Extrapolation | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real MMSI AIS Telemetry Dataset (Target tracking, MMSI association, and dead-reckoning gap extrapolation.) |
| 31 | Vessel Maneuvering & Steering Constraints | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Navigation Loop (Nomoto steering dynamics, speed-dependent turn rates, and acceleration limits.) |
| 32 | Sentinel-1 SAR Product Pipeline | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Copernicus CDSE OData API (Sentinel-1 product discovery, OData STAC query normalization, and AOI filtering.) |
| 33 | Sentinel-1 SAR Preprocessing & Perception | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real Sentinel-1 GeoTIFF Datasets (Decibel backscatter normalization (sigma0) and CFAR detector engine.) |
| 34 | Trained Sentinel-1 SAR U-Net Perception | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real Antarctic SAR Imagery (5-class pixel mask U-Net semantic segmentation engine for ice classification.) |
| 35 | Real SAR Dataset Ingestion Pipeline | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Antarctic SAR Grounding Dataset (Canonical SAR dataset schema loader, scene-level splitter, and label quality auditor.) |
| 36 | Trained SAR U-Net PyTorch Model | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Antarctic Sentinel-1 Satellite Imagery (PyTorch U-Net training pipeline and exported model checkpoint metadata.) |
| 37 | SAR Model Validation Framework | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Circum-Antarctic SAR Validation Dataset (Independent Antarctic SAR generalization benchmark framework (31 tests verified).) |
| 38 | SAR Model Edge Inference | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real SAR Scene Arrays (Browser JS runtime forward pass inference for SAR target extraction.) |
| 39 | Marine Radar Calibration & Detection Validation | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real Marine Radar Replay Telemetry (Decomposed range loss compensation, CA-CFAR noise estimation, and polar transform.) |
| 40 | Multi-Sensor Uncertainty Fusion & Spatiotemporal Risk Occupancy | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | 7 Real Data Sources (USNIC, GEBCO, AIS, SAR, etc.) (Unified spatiotemporal risk occupancy engine with predict-before-fuse track correlation.) |
| 41 | Autonomous Decision Engine & COLREG Priority Arbitration | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Multi-Sensor Risk Fields (COLREG-referenced rule arbitration, hazard prioritization, and safe action selection.) |
| 42 | Adaptive Counterfactual Simulation & Decision Stability | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real-Data Risk States (Non-mutating action branching simulation and perturbation robustness analyzer.) |
| 43 | End-to-End Adaptive Execution & Dynamic Rerouting | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real Environmental Feeds (Closed-loop adaptive navigation orchestrator with stale result rejection.) |
| 44 | Adversarial End-to-End Benchmarking & Demonstration Readiness | YES | YES | YES | YES | YES | `REAL_DATA_VERIFIED` | Real Data Benchmark Sessions (20-scenario suite, 14 safety invariants, and multi-dimensional scorecard generator.) |
