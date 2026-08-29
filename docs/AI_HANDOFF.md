# AI Agent Handoff

### PROJECT PURPOSE
To provide a visual, interactive demonstration of autonomous ship navigation avoiding drifting ice hazards.

### CURRENT ARCHITECTURE
100% Client-side. Vanilla HTML/JS/CSS served via Vite.

### SOURCE OF TRUTH
The `.js` files in `src/js/` are the absolute source of truth.

### CURRENT IMPLEMENTATION
- `canvasRenderer.js` draws the state.
- `aiNavigator.js` calculates A* routes.
- `vectorField.js` & `iceberg.js` handle fake physics.

### IMPORTANT FILES
- `index.html`
- `src/js/main.js`

### DATA FLOW
User Input -> `uiController.js` -> `vectorField.js` (update physics) -> `aiNavigator.js` (check collision) -> `canvasRenderer.js` (draw).

### ALGORITHMS
A* Pathfinding and simple Euler Integration (drift).

### WHAT MUST NOT BE ASSUMED
- Do NOT assume a Python backend exists.
- Do NOT assume the "AI" is a trained ML model.
- Do NOT assume the data is real.

### REAL VS SIMULATED
- **Real:** UI interactivity, canvas drawing, pathfinding math.
- **Simulated:** Ocean currents, weather, risk scores, fuel efficiency.

### CURRENT LIMITATIONS
Performance degrades with too many entities. No data persistence.

### SAFE MODIFICATION RULES
- Keep rendering logic strictly in `canvasRenderer.js`.
- Keep DOM manipulation strictly in `uiController.js`.
- Keep math strictly in `aiNavigator.js` or `simulation/`.

### TESTING REQUIREMENTS
Run `npm run build` to ensure Vite bundles correctly. No unit tests currently exist.

### BEFORE CHANGING CODE
1. Read docs/README.md
2. Read docs/PROJECT_CONTEXT.md
3. Read docs/ARCHITECTURE.md
4. Read docs/REALITY_CHECK.md
5. Read docs/STATUS.md
6. Inspect the relevant source code.
7. Make a plan.
