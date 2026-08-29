# Interactive Map Implementation

## Overview

The ASTRALIS canvas is now a fully interactive navigation map with camera pan/zoom, start/destination selection, A* route generation, and follow-ship mode — all while preserving world-space as the authoritative coordinate system.

## Architecture

```
World Space (3600×2400)
    └── Camera (x, y, zoom) — viewport only
            └── Screen Space (CSS pixels)
```

### Key Module: `src/js/render/camera.js`

Centralized `Camera` class with:
- `worldToScreen()` / `screenToWorld()`
- `zoomAt()` — cursor-centered zoom
- `panByScreenDelta()` — pan from screen drag
- `clampToWorld()` — boundary enforcement accounting for zoom
- `updateFollow()` — smooth ship tracking with safe-zone

### Input Bindings

| Input | Action |
|---|---|
| Mouse wheel | Cursor-centered zoom (disables follow) |
| Space + left drag | Pan viewport |
| Middle mouse drag | Pan viewport |
| Normal click (planning mode) | Place start/destination in world coords |
| Normal click (default) | Select/drag icebergs |

### Navigation Workflow

1. **SET START** → click map → start marker placed (world coords)
2. **SET DEST** → click map → destination marker placed
3. **CALCULATE ROUTE** → A* runs in world space, attaches to `ship.routeWaypoints`
4. **PLACE VESSEL** → teleports ship to start, resets velocity/route index
5. **START NAVIGATION** → places vessel + enables autopilot + follow ship

### UI Panel

Left-side Navigation panel (`#nav-panel`) with status indicators, zoom readout, and all control buttons matching the Antarctic Navigation Console aesthetic.

### Debug HUD (D key)

Shows: FPS, dt, zoom, camera x/y, ship world pos, mouse world pos, start/dest coords, waypoint index, follow mode.

## Files Changed

| File | Change |
|---|---|
| `src/js/render/camera.js` | **NEW** — centralized camera system |
| `src/js/render/canvasRenderer.js` | Zoom, pan, markers, camera integration |
| `src/js/main.js` | Navigation state, validation, workflow methods |
| `src/js/ui/uiController.js` | Navigation panel event bindings |
| `src/js/ai/aiNavigator.js` | Manual `calculateRoute()`, no auto-reroute on pan/zoom |
| `index.html` | Navigation panel + debug HUD fields |

## Design Decisions

- A* only runs on explicit **CALCULATE ROUTE** click or during active navigation hazard reroute
- Pan/zoom never modifies simulation entity positions
- Route waypoints stored exclusively in world coordinates
- Follow ship disabled automatically on manual pan/zoom
