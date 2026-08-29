# Routing

**Classification:** HEURISTIC / SIMULATED.

## Algorithm Details
The routing is handled by `src/js/ai/aiNavigator.js`. It uses a discrete grid overlaid on the continuous canvas space.

- **Start Point:** Ship's current (X,Y).
- **Destination:** A fixed (X,Y) point on the canvas (usually top-right).
- **Neighbor Selection:** 8-way movement on the grid.
- **Cost Function:** Distance traveled + Heuristic (Euclidean distance to goal) + Hazard Penalty (Proximity to icebergs).
- **Obstacle Handling:** Iceberg radii are treated as high-cost or impassable nodes.
- **Dynamic Behavior:** The `SimulationEngine` calls `evaluate()` periodically. If an iceberg drifts over the current path, the path cost skyrockets, triggering a full recalculation.
- **Visualization:** `canvasRenderer.js` draws a line through the returned waypoint array.

This is a real pathfinding algorithm, but it operates on fake/simulated data.
