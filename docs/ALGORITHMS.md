# Algorithms

## 1. Pathfinding (A* Variant)
- **Purpose:** Find the shortest safe path from Ship to Destination.
- **Inputs:** Start (X,Y), Goal (X,Y), Grid Nodes, Iceberg Positions.
- **Outputs:** Array of Waypoint Coordinates.
- **Implementation:** `src/js/ai/aiNavigator.js`.
- **Complexity:** $O(E + V \log V)$ roughly, depending on grid resolution and heuristic efficiency.
- **Assumptions:** Assumes icebergs are static during the exact moment of calculation (recalculates frequently to fake dynamic avoidance).

## 2. Iceberg Kinematics (Euler Integration)
- **Purpose:** Move icebergs.
- **Inputs:** Vector field current $V_c$, Wind vector $V_w$, Iceberg mass $m$.
- **Outputs:** New Position $(X_{t+1}, Y_{t+1})$.
- **Mathematical Formulation:** 
  $Velocity = (V_c \times c_{resp}) + (V_w \times w_{resp})$
  $Position = Position + Velocity \times \Delta t$
- **Implementation:** `src/js/simulation/iceberg.js`.

## 3. Vector Field Generation
- **Purpose:** Create ocean current visualization.
- **Implementation:** Procedural generation using Math.sin/cos and time offsets in `src/js/simulation/vectorField.js`.
