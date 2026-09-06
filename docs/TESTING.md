# Testing Audit

**Status:** AUTOMATED UNIT & INTEGRATION SUITE ACTIVE (Vitest).

- **Test Framework:** `vitest`
- **Test files:** 33+ test files under `tests/`
- **Test command:** `npx vitest run` / `npm run test`
- **Build command:** `npm run build` (Vite build)
- **Key Test Suites:**
  - `tests/worker_checks.test.js`: Web Worker initialization, fallback logic, and message passing.
  - `tests/worker_timeout_fallback.test.js`: 2.5s timer timeout and synchronous pathfinding fallback execution.
  - `tests/worker_request_storm.test.js`: Verifies `pendingWorkerRequestId` storm prevention guard.
  - `tests/route_comparison_ui.test.js`: Multi-route choice cards rendering (`ROUTE A` to `ROUTE D`) and recommendation callout.
  - `tests/radar_view_rendering.test.js`: PPI Radar canvas rendering mode and info panel positioning.
  - `tests/decision_engine.test.js`: Rule-based decision engine scoring across candidate strategies.
  - `tests/compound_fixes_audit.test.js`: Cross-functional verification of navigation, UI, and fallback behaviors.
  - `tests/sea_ice_grid.test.js`: Continuous sea-ice concentration grid interpolation and trend extrapolation.

## Verification Workflow
Run unit tests locally before pushing to Vercel/GitHub CI:
```bash
npx vitest run
```

