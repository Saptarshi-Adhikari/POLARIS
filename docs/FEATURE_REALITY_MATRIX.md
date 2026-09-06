# Feature Reality Matrix

| Feature | Exists | Functional | Real Data | Simulated | ML | Backend | Visualized | Notes |
|---|---|---|---|---|---|---|---|---|
| **Antarctic map** | Yes | Yes | Synthetic | Yes | No | No | Yes | 3600x2400 Antarctic coordinate space with polar projection. |
| **Coastline** | Yes | Yes | Synthetic | Yes | No | No | Yes | Stylized Antarctic coastline bounds. |
| **Ice shelf** | Yes | Yes | Synthetic | Yes | No | No | Yes | Approximated within grid geometry. |
| **Vessel** | Yes | Yes | Synthetic | Yes | No | No | Yes | Top-down render, rotates with heading and velocity vector. |
| **Vessel movement** | Yes | Yes | Synthetic | Yes | No | No | Yes | Driven by physics update loop, crabbing steering, and drag. |
| **Heading** | Yes | Yes | Synthetic | Yes | No | No | Yes | Derived from velocity vector and autopilot gyrocompass. |
| **Route** | Yes | Yes | Synthetic | Yes | No | No | Yes | Recalculated dynamically via Web Worker A* algorithm. |
| **A* Algorithm** | Yes | Yes | Synthetic | Yes | No | No | Yes | Offloaded to Web Worker with 2.5s fallback to sync mode. |
| **Risk Heatmap** | Yes | Yes | Synthetic | Yes | No | No | Yes | Derived from iceberg proximity grid & temporal collision risk. |
| **Sea ice** | Yes | Yes | Synthetic | Yes | Yes | No | Yes | Continuous 10x10 concentration grid dataset & linear trend. |
| **Icebergs** | Yes | Yes | Synthetic | Yes | No | No | Yes | 16 discrete icebergs with mass/size profiles. |
| **Iceberg movement** | Yes | Yes | Synthetic | Yes | No | No | Yes | Driven by vector field physics and drift kinematics. |
| **Weather (Wind)** | Yes | Yes | Synthetic | Yes | No | No | Yes | Wind vectors influencing drag and sea state. |
| **Ocean current** | Yes | Yes | Synthetic | Yes | No | No | Yes | Perlin-noise ocean current grid pushing objects. |
| **PPI Radar Monitor** | Yes | Yes | Synthetic | Yes | No | No | Yes | 30 RPM sweep beam, target blips, range rings, cardinal labels. |
| **Alternative routes** | Yes | Yes | Synthetic | Yes | No | No | Yes | 4 side-by-side strategy cards (`ROUTE A` to `ROUTE D`). |
| **AI Recommendation** | Yes | Yes | Synthetic | Yes | Rule-Based | No | Yes | Multi-factor weighted decision engine (`DecisionEngine`). |
| **Fuel** | Yes | Yes | Synthetic | Yes | No | No | Yes | Simulated consumption rate & tank percentage remaining. |
| **Forecasting** | Yes | Yes | Synthetic | Yes | Random Forest | Yes | Yes | Trajectory forecast at +2h, +6h, +12h, +24h horizons. |
