# Forensic AI/ML Audit

**CONCLUSION:** There are NO trained ML models, NO neural networks, and NO inference engines in this repository.

## Feature Audit Table

| Feature | Claimed as AI | Actual implementation | Real ML? | Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **AI Navigator** | Yes | A* Pathfinding Algorithm | No | `aiNavigator.js` |
| **System Risk Score**| Yes | Heuristic Math | No | `uiController.js` updates |
| **Trajectory Forecast**| Yes | Linear Extrapolation | No | `uiController.js` (Inspector) |
| **Synthetic Data Engine**| Yes | Randomized Strings | No | `uiController.js` (Drawer) |

## Future Architecture (Planned)
In a future phase, the application is intended to integrate with:
- **IceNet:** For probabilistic sea-ice forecasting.
- **OpenDrift:** For accurate trajectory modeling of icebergs based on HYCOM currents.
- **AI4SeaIce:** For SAR image segmentation.

*These do not currently exist in the codebase.*
