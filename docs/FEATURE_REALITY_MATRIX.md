# Feature Reality Matrix

| Feature | Exists | Functional | Real Data | Simulated | ML | Backend | Visualized | Notes |
|---|---|---|---|---|---|---|---|---|
| **Antarctic map** | Yes | Yes | No | Yes | No | No | Yes | Procedural/Hardcoded path for visual context only. Not real geographic data. |
| **Coastline** | Yes | Yes | No | Yes | No | No | Yes | Stylized approximation. |
| **Ice shelf** | Yes | Yes | No | Yes | No | No | Yes | Approximated within the procedural geometry. |
| **Vessel** | Yes | Yes | No | Yes | No | No | Yes | Pseudo-3D top-down render, rotates with heading. |
| **Vessel movement** | Yes | Yes | No | Yes | No | No | Yes | Driven by physics update loop and route following. |
| **Heading** | Yes | Yes | No | Yes | No | No | Yes | Mathematically derived from velocity vector. |
| **Route** | Yes | Yes | No | Yes | No | No | Yes | Recalculated dynamically via internal A* algorithm. |
| **A* Algorithm** | Yes | Yes | No | Yes | No | No | Yes | Fully functional custom implementation in JS. |
| **Risk Heatmap** | Yes | Yes | No | Yes | No | No | Yes | Derived from iceberg proximity (heuristic), not ML. |
| **Sea ice** | No | No | No | No | No | No | No | Currently only discrete icebergs exist, no continuous sea ice field. |
| **Icebergs** | Yes | Yes | No | Yes | No | No | Yes | Generated with random mass/size profiles. |
| **Iceberg movement** | Yes | Yes | No | Yes | No | No | Yes | Driven by the underlying vector field physics. |
| **Weather (Wind)** | Yes | Yes | No | Yes | No | No | Yes | Scalar value that influences the vector field. |
| **Ocean current** | Yes | Yes | No | Yes | No | No | Yes | Underlying perlin-noise-like grid pushing objects. |
| **Satellite imagery** | No | No | No | No | No | No | No | Removed from UI to prevent misleading claims. |
| **AI** | No | No | No | No | No | No | No | Pathfinding is A*, not AI. |
| **ML** | No | No | No | No | No | No | No | Zero trained models in repository. |
| **Uncertainty** | No | No | No | No | No | No | No | Physics are deterministic based on the vector field. |
| **Confidence** | No | No | No | No | No | No | No | Previous "91.3%" score was entirely fake and removed. |
| **Fuel** | No | No | No | No | No | No | No | Removed from UI as it was not actually simulated. |
| **Forecasting** | Yes | Yes | No | Yes | No | No | Yes | Short-term linear extrapolation of current velocity vector. |
| **Alternative routes** | No | No | No | No | No | No | No | A* returns only a single optimal path. |
