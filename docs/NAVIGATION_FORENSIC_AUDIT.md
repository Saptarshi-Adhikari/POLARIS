# Navigation Forensic Audit

## Geometry Inconsistencies
The application currently uses entirely different definitions for the size and collision boundaries of an iceberg depending on the subsystem:
- **Visual Geometry (`canvasRenderer.js`)**: Iceberg radius is roughly `Math.max(10, ice.size / 35)`. For a size 720 iceberg, this is ~20 units.
- **Click Validation (`main.js`)**: `collisionR = Math.max(25, ice.size / 25)`. For size 720, this is ~28.8 units.
- **A* Hard Collision (`aiNavigator.js` line 160)**: `collisionR = (ice.size / 2) + 30`. For size 720, this is 390 units.
- **AI Risk Grid (`aiNavigator.js` line 48)**: `hazardRadius = (ice.size / 10) + 100`. For size 720, this is 172 units.
- **Ship Collision Risk (`aiNavigator.js` line 61)**: `minDistance = (ice.size / 10) + 60`. For size 720, this is 132 units.

**Conclusion**: The geometries are completely inconsistent. A* avoids massive areas, while the renderer draws tiny icebergs. The collision radius for user clicks differs from A*.

## Ship Physics and Collision Detection
- **Physical Size**: The ship is treated as an infinitesimal point (`ship.x`, `ship.y`). There is no physical safety envelope or radius defined for the ship in its physics calculations.
- **Collision Detection**: `ship.js` has **ZERO** collision detection with icebergs. The `update()` method only integrates forces (thrust, drag, current, wind, ice) and clamps to the world boundaries (3600x2400). It never checks intersection with icebergs.
- **Continuous Collision (Swept)**: Not implemented. The ship can teleport through obstacles between frames if moving fast enough.
- **Collision Response**: Since collisions aren't detected, there is no response. The ship simply glides through the visual representation of an iceberg.

## Route Planning and Smoothing
- **A* Hazard Avoidance**: A* uses a coarse grid (48x32, cell size 75x75). It avoids cells whose centers are within `collisionR` of an iceberg. However, because of the coarse grid, a diagonal movement between two "safe" cells might visually and physically cut through a hazard zone.
- **Route Smoothing**: The current "smoothing" algorithm (`aiNavigator.js` lines 265-277) does not smooth. It merely rejects waypoints that are further than `3 * cellDiagonal` from the previous one. It performs **no line-of-sight safety testing** against iceberg geometries.
- **Dynamic Invalidation**: Route recalculation is based on an arbitrary timer and risk score (`needsReroute = isObstructed && timeSinceLastRoute > 5000`). It does not explicitly check if a moving iceberg has intersected the planned path corridor.
- **Autopilot Behaviour**: The autopilot simply turns the rudder toward the next waypoint (`ship.js` line 211). It does not modulate throttle, apply brakes, or slow down for sharp turns/hazards.

## Summary
The system lacks a unified hazard geometry, has absolutely no physical collision detection or response in the physics engine, relies on a coarse A* grid without line-of-sight safe smoothing, and lacks intelligent speed control and emergency braking. These must all be implemented to prevent the ship from passing through icebergs.
