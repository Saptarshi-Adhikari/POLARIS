# UI Redesign Plan

## Target Concept
**ANTARCTIC NAVIGATION CONSOLE**
A minimal, professional, scientifically credible interface where the map dominates 90% of the viewport.

## 1. Components to Remove
- The entire right sidebar ("AI NAVIGATOR TELEMETRY"). Fake confidence scores and system risk percentages must be deleted.
- The "Real Satellite Data" and "Synthetic Data" buttons from the top bar.
- The left sidebar ("ENVIRONMENTAL CONTROLS"). Sliders will be moved to a collapsible/minimal strip.
- Decorative sci-fi elements (neon glows, excessive monospace data dumps).

## 2. Target Visual Hierarchy
1. **The Map (90% width/height):** A stylized representation of Antarctica.
2. **The Route & Vessel (Overlay):** Clear visual indicators of current position and safe path.
3. **Top Bar (Minimal):** Simply "Astralis Nav-OS", Simulation Status, and UTC clock.
4. **Bottom Control Strip:** Play/pause, speed multipliers, and a toggle for "Environment settings" (which opens a small popup rather than a persistent sidebar).
5. **Contextual Panel:** A floating, glass-morphic div that only appears when a user clicks the vessel or an iceberg on the canvas.

## 3. Map Redesign (Option C: Procedural/Stylized Geometry)
Since we cannot pull in heavy external tile servers reliably, we will update `canvasRenderer.js` to draw a stylized, recognizable Antarctic coastline using static bezier curves or a simplified landmass polygon array, colored in dark ice/land tones to contrast with the ocean. 

## 4. Vessel Redesign (Canvas Pseudo-3D)
The green triangle in `canvasRenderer.js` will be replaced with a multi-layered canvas drawing (or an imported SVG if available) that looks like a top-down polar research vessel (white/orange color scheme, subtle drop shadow, deck structure), rotating precisely to match its heading.

## 5. Ice and Risk Representation
- **Icebergs:** Rendered with slight jagged edges and shadows, no longer just generic hexagons.
- **Risk Field:** Instead of a global red overlay, risk will be visually restricted to the immediate radius around icebergs.

## 6. Simulation Logic Preservation
- `aiNavigator.js`, `vectorField.js`, and `iceberg.js` will remain functionally untouched.
- `main.js` update loop will remain untouched.
- Only the DOM in `index.html`, the drawing routines in `canvasRenderer.js`, and the event bindings in `uiController.js` will be rewritten.
