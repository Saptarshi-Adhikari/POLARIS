# Codebase Map

A directory-by-directory explanation of the repository.

```
ASTRALIS_SIMULATION/
├── index.html
├── package.json
├── src/
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── main.js
│       ├── ai/
│       │   └── aiNavigator.js
│       ├── render/
│       │   └── canvasRenderer.js
│       ├── simulation/
│       │   ├── iceberg.js
│       │   ├── ship.js
│       │   └── vectorField.js
│       └── ui/
│           └── uiController.js
└── docs/
```

## Root Directory
- **Purpose:** Entry points and configuration.
- **Important Files:** 
  - `index.html`: Defines the layout, canvas, UI sidebars, and loads Tailwind CSS.
  - `package.json`: Contains Vite dependency for running the dev server.

## `src/js/` (Root)
- **Purpose:** Core execution.
- **Important Files:**
  - `main.js`: The central orchestrator. It instantiates all simulation, AI, and render classes. It contains the `requestAnimationFrame` loop that drives the entire application.
- **Relationship:** Depends on all subdirectories.

## `src/js/simulation/`
- **Purpose:** Mathematical modeling and state management of physical entities.
- **Important Files:**
  - `vectorField.js`: Creates a grid of vectors representing ocean currents. Contains logic to update vectors based on wind, tides, and time.
  - `iceberg.js`: Maintains X/Y coordinates, mass, and calculates drift velocity based on the vector field.
  - `ship.js`: Maintains X/Y coordinates and handles logic for moving the ship along an array of route waypoints.
- **Relationship:** Consumed by `main.js`, `ai/`, and `render/`.

## `src/js/ai/`
- **Purpose:** Pathfinding and collision avoidance.
- **Important Files:**
  - `aiNavigator.js`: Implements the pathfinding algorithm. Given the ship, icebergs, and grid, it returns a safe route.
- **Relationship:** Evaluates data from `simulation/`, result is consumed by `main.js`.

## `src/js/render/`
- **Purpose:** Visual output.
- **Important Files:**
  - `canvasRenderer.js`: Contains all the HTML5 Canvas 2D context methods (`beginPath`, `arc`, `lineTo`) to draw the grid, vectors, icebergs, ship, and routes.
- **Relationship:** Reads state from `simulation/` and `ai/` every frame to draw the screen.

## `src/js/ui/`
- **Purpose:** Handling DOM interactions outside of the canvas.
- **Important Files:**
  - `uiController.js`: Attaches event listeners to the sliders (wind, current) and buttons (Storm Mode, Add Iceberg). Updates DOM elements with telemetry text.
- **Relationship:** Mutates state in `simulation/` (e.g. changing wind speed).
