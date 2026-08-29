# Risk Model

**Note:** The risk model is currently a *Simulation / Heuristic*.

## Hazard Representation
Each iceberg is represented as a circle with a radius `r` proportional to its `size` and `mass` parameters. The hazard zone is defined as `r + safety_margin`.

## Risk Calculation
The `aiNavigator.js` assigns a "cost" to grid nodes based on their proximity to icebergs.
- If a node is inside an iceberg's hazard zone, its cost is set to `Infinity` (impassable).
- If a node is near the hazard zone, its cost is scaled up inversely proportional to the distance.

## UI System Risk Score
The telemetry UI (Right Sidebar) displays a "System Risk" score (e.g., `0.14`).
- **Implementation:** This is a visual approximation. It calculates the distance to the nearest iceberg and inversely scales it to a 0.0 - 1.0 range, adding some random jitter for visual effect.
- **Trace:** Raw Input (Iceberg X/Y) -> Distance Math -> Jitter -> UI Element `#sys-risk-score`.
