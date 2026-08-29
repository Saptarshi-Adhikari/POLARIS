# Data Provenance

| Data | Source | Real/Simulated | Generated Where | Used By | Refresh |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Ocean Currents** | `vectorField.js` | Simulated (Math) | Client CPU | Canvas Render | 60Hz |
| **Wind Speed** | `uiController.js` Slider | User Input | Client DOM | Physics Engine | On Change |
| **Iceberg Coordinates** | `main.js` | Hardcoded Demo Data | Client Memory | AI / Canvas | N/A |
| **Ship Route** | `aiNavigator.js` | Derived Data (A*) | Client CPU | Ship / Canvas | Periodic |
| **Synthetic Logs** | `uiController.js` | Random Fake Data | Client CPU | UI Output | On Click |
| **Satellite Imagery** | None | Not Implemented | N/A | N/A | N/A |
