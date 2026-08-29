# ASTRALIS PROJECT KNOWLEDGE BASE

This document provides a complete technical deep-dive into the current ASTRALIS Antarctic Navigation Console. It serves as the authoritative source of truth for the codebase's systems, architecture, algorithms, and technical limitations.

---

## 1. PROJECT OVERVIEW

ASTRALIS is a browser-based, interactive digital twin and simulation console for polar maritime navigation. 
- **Core Purpose**: To provide a physics-driven environment modeling ship dynamics, drift forces, sea ice resistance, and dynamically moving iceberg hazards in the Antarctic region.
- **Problem Statement**: Navigating vessel routes in polar waters requires balancing safety (iceberg evasion), speed, and fuel consumption while counteracting environmental forces (winds, currents, tides, and friction from sea ice fields).
- **Technology Stack**:
  - **Bundler/Dev Server**: Vite (v5.4.21)
  - **Language**: Vanilla JavaScript (ES6 Modules)
  - **Styling**: Vanilla CSS with Tailwind CSS for layout
  - **Rendering**: Canvas HTML5 API (2D Context)
  - **Backend**: None (pure client-side execution)
  - **APIs/Datasets**: None (deterministic mathematical models and local procedural generators)

---

## 2. COMPLETE ARCHITECTURE

The application runs as a modular client-side single-page app. Below is the relationship diagram between components:

```
                  [ UI: HTML / uiController.js ]
                                |
                   (Reads State / Alters Settings)
                                |
                                v
                   [ Simulation Engine: main.js ]
                     |          |          |
      +--------------+          |          +--------------+
      |                         v                         |
      v                 [ Navigation: ]                   v
[ Physics: ]         - A* pathfinding (aiNavigator.js) [ Render: ]
- ship.js            - Route comparison (aiNavigator.js)- canvasRenderer.js
- iceberg.js         - Trajectory predictions (iceberg.js)- camera.js
- vectorField.js
```

### Module Responsibilities:
- **`index.html`**: Houses the application viewport canvas and UI panel layouts.
- **`src/js/main.js`**: Core entry point. Instantiates the `SimulationEngine`, manages the central `simulationState` object, coordinates time steps, and handles route triggers.
- **`src/js/simulation/ship.js`**: Handles ship motion physics, autopilot steering algorithms, crabbing drift compensation, power governors, and Continuous Collision Detection (CCD) sliding reactions.
- **`src/js/simulation/iceberg.js`**: Models iceberg drift physics and projects future trajectory coordinates (+2h, +6h, +12h, +24h forecast horizons).
- **`src/js/simulation/vectorField.js`**: Governs wind vectors, ocean current grids, wave ripples, tidal dynamics, and sea ice concentration calculations.
- **`src/js/ai/aiNavigator.js`**: Implements grid-based A* routing, route comparison strategies (Fastest, Balanced, Safest), danger proximity scoring, and AI recommendation rules.
- **`src/js/render/canvasRenderer.js`**: Handles rendering the grid map, ship wake, sea ice concentration patterns, risk heatmaps, iceberg geometries, forecast lines, camera projection matrices, and globe overview projections.
- **`src/js/render/camera.js`**: Manages view translations, panning offsets, zoom scales, and coordinates conversion matrices.
- **`src/js/ui/uiController.js`**: Binds telemetry updates, event listeners, presets, and collapsible/draggable logic for floating UI panels.

---

## 3. SIMULATION LOOP

The update loop is driven by the browser's refresh rate and runs in a single-threaded execution context:

### Autoritative Loop Structure (`main.js`):
1. **Initiation**: `window.requestAnimationFrame` triggers `SimulationEngine.loop()`.
2. **Delta-Time Handling**: Measures time elapsed between frames (`dt`). `dt` is clamped to a maximum of `0.1` seconds to prevent physics explosion during browser lag spikes.
3. **Time Scale / Warping**: Evaluates `simDelta = dt * timeWarp` (where `timeWarp` is `1x`, `10x`, or `100x`).
4. **Pause Behavior**: If `state.simulation.isPaused` is true, the loop skips updating physics, environmental particles, and navigation paths; it only renders static positions and updates camera interactions.
5. **Update Pipeline**:
   - `vectorField.updateParticles(simDelta, state.simulation.time)`
   - For each iceberg: `iceberg.update(simDelta, vectorField, state.simulation.time, state)`
   - `ship.update(simDelta, vectorField, state.simulation.time, state, icebergs)`
   - `aiNavigator.evaluate(ship, icebergs, vectorField, state.simulation.time, state)`
6. **Render Pipeline**:
   - `canvasRenderer.render(state, ship, icebergs, aiNavigator, vectorField, dt, simTimeHours)`
7. **Recursion**: Calls `requestAnimationFrame` for the next cycle.

---

## 4. SHIP PHYSICS

Ship dynamics are simulated using simplified rigid body force physics.

### State Representation:
- **Coordinates**: World space (approx. 3600 x 2400).
- **Heading**: Degree angle $\theta \in [0, 360)$ representing orientation.
- **Velocity**: Vector $\vec{v} = (v_x, v_y)$.
- **Angular Velocity**: Speed of rotation $\omega$.

### Force Equations:
1. **Engine Thrust**: $\vec{F}_{\text{thrust}} = (\cos\theta, \sin\theta) \cdot F_{\text{drag\_max}} \cdot \frac{\text{throttle}}{100} \cdot E_{\text{power\_mult}} \cdot E_{\text{thrust\_mult}}$
   - $F_{\text{drag\_max}} = C_{\text{drag}} \cdot v_{\text{max}}^2$
   - $E_{\text{power\_mult}}$: Engine power modifier.
   - $E_{\text{thrust\_mult}}$: Progression engine overload multiplier (boosts up to 3.0x if waypoint progress stalls).
2. **Water Drag**: $\vec{F}_{\text{drag}} = - \frac{\vec{v}}{|\vec{v}|} \cdot C_{\text{drag}} \cdot |\vec{v}|^2$
3. **Environmental Drift Forces**:
   - **Ocean Current**: Adds current velocity offset derived from `vectorField.getVelocityAt(x, y)`.
   - **Wind Drift**: $\vec{F}_{\text{wind}} = (\cos\phi, \sin\phi) \cdot v_{\text{wind}} \cdot R_{\text{wind\_factor}}$ (where $\phi$ is wind angle).
   - **Sea Ice Resistance**: If sea ice concentration $C_{\text{ice}} > 0.1$, adds drag $\vec{F}_{\text{ice}} = - \frac{\vec{v}}{|\vec{v}|} \cdot C_{\text{drag}} \cdot |\vec{v}|^2 \cdot C_{\text{ice}} \cdot 1.5 \cdot \text{resistanceFactor}$.
4. **Acceleration & Velocity**: $\vec{a} = \frac{\sum \vec{F}}{M}$ (where $M$ is mass). Update velocity: $\vec{v} \leftarrow \vec{v} + \vec{a} \cdot dt$.

### Heading & Autopilot Steering:
- Autopilot computes the angle difference $\Delta\theta$ between ship heading and target waypoint vector.
- **Drift Compensation ("Crabbing")**: Corrects steering inputs by offsetting heading targets into wind/current vectors to maintain ground track.
- Rudder is adjusted proportionally: $\delta = \text{clamp}(\Delta\theta \cdot 1.5, -35^{\circ}, 35^{\circ})$.
- Angular acceleration: $\alpha = (\delta - \omega) \cdot 3$. Update angular velocity: $\omega \leftarrow \omega + \alpha \cdot dt$.

---

## 5. AUTOPILOT AND SHIP CONTROL

The control model splits responsibilities between physics updates and deterministic logic loops:

- **Route Selection**: Programmatically determined by A* algorithm execution or manual node placements.
- **Rudder / Turning**: Regulated entirely by the autopilot steering method when active; falls back to slider inputs in manual mode.
- **Throttle / Cruise Speed**:
  - Automatically modulated based on navigation constraints: slows down dynamically in tight turns ($\Delta\theta > 20^{\circ}$ triggers slowdown; $\Delta\theta > 45^{\circ}$ drops throttle to 35% of cruise speed).
  - Hazard speed profiles: Automatically caps throttle (Critical: 0%, High: 15%, Medium: 30%, Low: 45%) based on proximity risks.
  - Sea Ice governance: Restricts throttle speed in high concentration ice grids to prevent hull friction damage.
- **Emergency Braking**: Autopilot halts engine thrust (0% throttle) if a critical danger level is reached.
- **Rerouting**: Triggered if the ship remains stuck (waypoint distance does not improve) for more than 12 seconds, invalidating the active route grid.

---

## 6. NAVIGATION AND ROUTE PLANNING

- **Planning Nodes**: Start and destination points are selected using canvas space coordinates and translated to world space.
- **A* Pathfinding Grid**: Works on a $48 \times 32$ cell grid mapping the $3600 \times 2400$ world space.
- **Navigation Cost Grid**:
  - Default cell cost is $1.0$.
  - Iceberg avoidance cost: Any cell intersecting an iceberg's safety envelope (radius + margin) is penalized with a cost of $+100,000$ (representing impassable obstacles). Adjacent safety envelopes have gradient-shaded costs.
  - Sea Ice penalty: Cost is scaled by concentration $\times 10 \times \text{modeCostMult}$.
- **Mode Differences**:
  - `SHORTEST`: Iceberg penalty multiplier = 0.5, Sea ice penalty multiplier = 0.2.
  - `BALANCED`: Iceberg penalty multiplier = 1.0, Sea ice penalty multiplier = 1.0.
  - `SAFEST`: Iceberg penalty multiplier = 5.0, Sea ice penalty multiplier = 3.0.
- **Route Smoothing**: A line-of-sight path pruning algorithm (ray-casts between waypoints to check for iceberg intersections) eliminates redundant zig-zag patterns, resulting in clean navigation lines.

---

## 7. ICEBERG SYSTEM

- **Generation**: Creates 16 default icebergs using LCG random generators. Sizes are weighted: Small (50%), Medium (30%), Large (15%), and Massive (5%).
- **Collision Boundary**: Circles of radius $R_{\text{col}} = \max(10, \text{size}/35)$ matching their rendered geometry.
- **Avoidance Envelope**: A safety threshold of $R_{\text{col}} + 15\text{m}$ (ship radius) $+ 30\text{m}$ safety corridor boundary.
- **Drift Physics**: Extrapolates movement based on currents, winds, and wave coefficients, combined with LCG randomized angular rotations.
- **Trajectory Forecast**: Projects locations at +2, +6, +12, and +24 hours using persistent wind vectors and grid current velocities. Displays a growing uncertainty region circle around forecast targets.

---

## 8. SEA ICE AND ENVIRONMENT

- **Procedural Generation**: Sea ice is modeled procedurally using low-frequency sinusoidal math ($f = 6 \times 10^{-4}$ and $f = 0.0015$) combined with global state concentrations.
- **Frictional Influence**: Direct physical speed penalty applied to the vessel drag equation.
- **Winds / Currents**: Rendered visually using flow particles. Coordinates are updated dynamically based on direction, speed, and turbulence sliders.

---

## 9. COLLISION AND SAFETY SYSTEM

- **Detection**: Evaluates overlap between circles: $d_{AB} < R_A + R_B$.
- **Continuous Collision Detection (CCD)**: Calculates intersection time steps $t \in [0, 1]$ between frames to prevent high-speed tunneling through obstacles.
- **Collision Response (Sliding Physics)**: Calculates the contact normal vector of the collided iceberg and subtracts only the normal component of ship velocity, enabling the ship to slide along borders without trapping.
- **Proximity Danger Levels**:
  - **Critical**: Distance $< 40\text{m}$ or time to contact $< 8\text{s}$.
  - **High**: Distance $< 100\text{m}$ or time to contact $< 15\text{s}$.
  - **Medium**: Distance $< 200\text{m}$ or time to contact $< 25\text{s}$.
  - **Low**: Distance $< 320\text{m}$.

---

## 10. CAMERA AND MAP SYSTEM

- **Viewport Projection**: Camera maps world space $(0..3600, 0..2400)$ into screen pixels.
- **Globe Overview**: When zoomed out past scale $0.25$, projects coordinates onto a Polar Orthographic projection grid centered in the middle of the screen.
- **Zoom & Panning**: Supports wheel scaling, left-click map dragging, and follow ship mode. Right-clicks pan the map canvas unless initiated on panel headers.

---

## 11. UI SYSTEM

- **Draggable & Collapsible Panels**: Includes floating tool panels with minimized header toggles. Uses a custom right-click click-and-drag listener that intercepts events on headers, preventing map pan conflicts.
- **System Modifiers**: Controls for winds, currents, and sea ice values immediately update global simulation states and trigger route recalculations.

---

## 12. ADVANCED AI & MACHINE LEARNING INTEGRATION

The ASTRALIS console integrates a genuine ML forecasting pipeline alongside standard deterministic pathing algorithms:

### ML Pipeline components:
1. **Iceberg Trajectory Prediction (Random Forest)**:
   - Evaluates historical drift positions, currents, and winds.
   - Saves estimator model structures inside the Python FastAPI backend.
   - Projects coordinate offsets at +10m, +30m, and +60m horizons.
2. **Sea-Ice Concentration Forecasting (Random Forest)**:
   - Predicts ocean freezing conditions for +6h, +12h, and +24h horizons.
3. **ML-Aware Multi-Objective Route Optimization**:
   - Computes weighted travel metrics across three profiles: `FASTEST`, `BALANCED`, and `SAFEST`.
   - Incorporates normalized indicators for fuel consumption, ETA speeds, sea-ice drift resistance, and iceberg safety bounds.
4. **Live Prediction Validation System (`ValidationEngine`)**:
   - Saves prediction snapshots and evaluates Euclidean errors once simulation time reaches target horizons.
   - Updates real-time progress indicators: Environment -> Detection -> ML Prediction -> Route Analysis -> AI Decision -> Ship Execution -> Validation.

---

## 13. DATA FLOW

```
[ Environmental Controls / Sliders ]
                |
                v
       [ simulationState ] <---+
                |              |
     (Evaluates Physics)       |
                v              |
     [ ship.js / iceberg.js ] -+ (Mutates Position/Velocity)
                |
     (Sends state via HTTP JSON)
                v
     [ Python FastAPI Server ] -- (Infers RF Models)
                |
     (Returns forecasts & confidence values)
                v
       [ aiNavigator.js ] ------- (Scores multi-objective routes)
                |
     (Updates UI Telemetry & Render Viewport)
                v
[ uiController.js / canvasRenderer.js ]
```

---

## 14. FEATURES & SYSTEMS MATRIX

| Feature | Implemented? | Methodology | Category |
| :--- | :--- | :--- | :--- |
| **Vessel Physics** | **YES** | Euler thrust integration with water, ice drag, current, and wind. | Physics |
| **A* Routing** | **YES** | Priority-queue grid node pathfinding. | Algorithm |
| **Autonomous Control** | **YES** | Autopilot crabbing compensation and auto throttle governors. | Heuristics |
| **Iceberg Forecast (ML)**| **YES** | Random Forest Regressor models predicting future positions. | Machine Learning |
| **Sea-Ice Forecast (ML)**| **YES** | Time-series RF MultiOutputRegressor forecasting density horizons. | Machine Learning |
| **Route Optimization** | **YES** | Multi-objective scoring blending fuel, safety, and ETA values. | Optimization |
| **Scenario Manager** | **YES** | Draggable panel triggers simulating normal/extreme weather. | Simulation |
| **Prediction Validation**| **YES** | Real-time Euclidean error tracker comparing ML vs actuals. | Validation |

---

## 15. FILE-BY-FILE REFERENCE

| File | Responsibility | Key Classes / Functions | Dependencies |
| :--- | :--- | :--- | :--- |
| [`main.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/main.js) | Engine manager & updates | `SimulationEngine` | `ship.js`, `iceberg.js`, `vectorField.js`, `aiNavigator.js`, `canvasRenderer.js`, `uiController.js`, `scenarioManager.js`, `validationEngine.js` |
| [`ship.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/simulation/ship.js) | Ship motion & control | `Ship`, `update()`, `updateAutopilotSteering()` | `vectorField.js` |
| [`iceberg.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/simulation/iceberg.js) | Iceberg drift & forecast | `Iceberg`, `update()` | `vectorField.js` |
| [`scenarioManager.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/simulation/scenarioManager.js) | One-click Demo scenarios | `ScenarioManager`, `activateScenario()` | `iceberg.js` |
| [`validationEngine.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/simulation/validationEngine.js) | ML Validation & Pipeline | `ValidationEngine`, `evaluate()`, `logPrediction()` | None |
| [`aiNavigator.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/ai/aiNavigator.js) | Route optimization & scoring | `AINavigator`, `generateOptimalRouteAStar()`, `computeRouteStrategy()` | None |
| [`canvasRenderer.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/render/canvasRenderer.js) | Map & entities rendering | `CanvasRenderer`, `drawValidationOverlays()` | `camera.js` |
| [`uiController.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/ui/uiController.js) | Telemetry & panels behavior | `UIController`, `updateTelemetry()` | None |
| [`aiClient.js`](file:///c:/Users/Saptarshi/Desktop/MainFolder/Hackathon/shipnav/v2/ASTRALIS_SIMULATION/src/js/ui/aiClient.js) | API request communications | `AIClient`, `updatePredictions()` | None |
