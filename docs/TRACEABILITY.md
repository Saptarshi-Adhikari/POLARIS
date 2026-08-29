# Traceability Matrix

Every product claim mapped to source code evidence.

| Product Claim | Evidence File | Function/Class | Status |
|---|---|---|---|
| Dynamic route calculation | `src/js/ai/aiNavigator.js` | `evaluate()` | Implemented |
| Iceberg collision avoidance | `src/js/ai/aiNavigator.js` | `recalculateRoute()` | Implemented |
| Interactive weather | `src/js/ui/uiController.js` | `setupSliders()` | Implemented |
| Ocean current simulation | `src/js/simulation/vectorField.js` | `updateGrid()` | Simulated |
| Iceberg drift physics | `src/js/simulation/iceberg.js` | `update()` | Simulated |
| AI forecasting | `src/js/ui/uiController.js` | `showIcebergInspector()` | Mocked / Fake |
| Satellite Data Ingestion | `index.html` | `#mode-live-btn` | Not Implemented (UI only) |
| System Risk Calculation | `src/js/ui/uiController.js` | `updateTelemetry()` | Simulated (Heuristic) |
