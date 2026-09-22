# 13 — POLARIS DEMO vs REAL Mode Comparison Matrix

## Detailed Capability Comparison Matrix

| Capability / Attribute | DEMO MODE `[CURRENT]` | REAL REPLAY `[CURRENT]` | REAL LIVE STREAM `[FUTURE]` |
| :--- | :--- | :--- | :--- |
| **Geographic Basemap** | Polar Grid Canvas | Southern Ocean Map (`RealMapProvider`) | Vector MapLibre GL JS |
| **Geographic Coordinates** | World Units `(0..3600)` | Lat/Lon `(geoToWorld)` | Lat/Lon `(geoToWorld)` |
| **Iceberg Data Source** | Seeded LCG Synthetic | Real USNIC Catalogue | Live USNIC / Sentinel-1 Stream |
| **Ocean Hydrodynamics** | Euler Sine Field | Copernicus Marine Reanalysis | Copernicus Live API |
| **Wind Drag Vectors** | Synthetic Sliders | ERA5 Wind Vector Field | Live Atmospheric Feed |
| **AIS Vessel Traffic** | N/A | Local Historical Tracks | Live USCG AIS Stream |
| **Satellite SAR Overlay** | N/A | Cached Sentinel-1 Imagery | Live Sentinel Pipeline |
| **Route Pathfinder** | Web Worker A* (`routeWorker.js`) | Web Worker A* (`routeWorker.js`) | Web Worker A* (`routeWorker.js`) |
| **Collision Avoidance** | Nomoto Control (`Ship.js`) | Nomoto Control (`Ship.js`) | Nomoto Control (`Ship.js`) |
| **Replan Storm Lock** | `pendingWorkerRequestId` | `pendingWorkerRequestId` | `pendingWorkerRequestId` |
| **Replay Clock** | `simTimeHours` | Historical UTC Timestamp Step | Wall Clock / Real-Time |
| **Network Need** | 100% Offline | 100% Offline (Local Datasets) | Authenticated Internet |
| **Determinism** | 100% Deterministic | 100% Deterministic | Non-deterministic |
| **Data Provenance HUD** | Hidden | Integrated Provenance HUD | Integrated Live HUD |
| **Failure Handling** | N/A | Error HUD (`RETRY` / `TO DEMO`) | Reconnect Buffer + Fallback |
| **Intended Use Case** | Interactive Sandbox | Hackathon Judging & Replay | Real Ship Operational Bridge |
