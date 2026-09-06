# Routing & Multi-Strategy Pathfinding

**Classification:** MULTI-STRATEGY A* / WEB WORKER OFFLOADED.

## Pathfinding Architecture
Routing is calculated via `src/js/ai/aiNavigator.js` and offloaded to a Web Worker (`src/js/workers/routeWorker.js`).

- **Grid Resolution:** Discrete 2D grid overlaid on continuous canvas space.
- **Offloaded Pathfinding:** Route calculations execute asynchronously in `routeWorker.js` to eliminate main thread UI freeze.
- **Fallback Protection:** 2.5s timeout timer & `onerror` handler in `aiNavigator.js` fall back to synchronous pathfinding if the Web Worker fails or hangs.
- **Storm Prevention Guard:** `pendingWorkerRequestId` prevents redundant calculation dispatches while a worker request is active.
- **Strategy Candidate Evaluation:** `computeRouteStrategy()` generates 4 candidate modes (`FASTEST`, `BALANCED`, `SAFEST`, `FUEL_EFFICIENT`), passed to `DecisionEngine` for weighted multi-factor scoring.
- **Multi-Route Choice UI:** `src/js/ui/routeComparisonUI.js` renders candidate cards (`ROUTE A` to `ROUTE D`) and AI recommendation callout box.

