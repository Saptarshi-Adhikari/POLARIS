# Unique Selling Proposition (USP)

## CURRENT USP
*(What is demonstrably working in the current repository)*
A zero-latency, fully interactive, browser-based simulation engine that visualizes dynamic pathfinding around drifting hazards in real-time.
- **Evidence:** `src/js/main.js` runs a `requestAnimationFrame` loop at 60fps updating `VectorField`, `Iceberg`, and `Ship` states without network overhead.

## DEMONSTRATION USP
*(What can be shown during a hackathon demo)*
An intuitive "What-If" simulator that allows users to instantly manipulate extreme weather variables (e.g., "Storm Mode") and watch the ship's autonomous navigation system intelligently reroute around emergent threats.
- **Evidence:** `src/js/ui/uiController.js` hooks up sliders and a "Storm Event" button directly to the physics parameters in `src/js/simulation/vectorField.js`.

## TARGET USP
*(What the complete scientific/product system is intended to become)*
An AI-driven operational digital twin that ingests live satellite data to provide predictive, fuel-optimizing routing for vessels in the most dangerous polar environments on Earth.
- **Evidence:** UI Placeholders exist (e.g., `Mode A // Real Satellite Data` button in `index.html`), but no backend implementation exists.

## USP GAP
*(What is missing between current implementation and target)*
- **Data Ingestion:** No backend to fetch satellite/weather APIs.
- **True AI:** No trained ML models for trajectory prediction.
- **Scientific Accuracy:** The physics engine is a visual approximation, not a scientific hydrodynamic model.
