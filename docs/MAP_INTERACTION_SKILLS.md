# Map Interaction Skills

## Available Tools Used

| Tool / Skill | Purpose in This Implementation |
|---|---|
| **cursor-ide-browser MCP** | Browser runtime verification — navigate, click UI, pan/zoom canvas, capture screenshots |
| **browser_navigate** | Load dev server at `http://localhost:5173` |
| **browser_snapshot** | Inspect DOM for navigation panel buttons and debug HUD |
| **browser_click** | Click SET START, SET DESTINATION, CALCULATE ROUTE, etc. |
| **browser_press_key** | Toggle debug HUD (D key), hold Space for pan |
| **browser_scroll** | Mouse wheel zoom testing |
| **browser_take_screenshot** | Evidence capture for verification docs |

## Skills Referenced

- `docs/ANTIGRAVITY_SKILLS.md` — browser_subagent, chrome-devtools-plugin (not directly available; using cursor-ide-browser instead)
- Workspace rule: graphify rebuild after code changes

## Implementation Modules

| Module | Role |
|---|---|
| `src/js/render/camera.js` | Centralized camera (x, y, zoom, clamp, follow) |
| `src/js/render/canvasRenderer.js` | World→screen projection, pan/zoom input, markers |
| `src/js/main.js` | Navigation state, route workflow, validation |
| `src/js/ui/uiController.js` | Navigation panel event bindings |
| `src/js/ai/aiNavigator.js` | A* in world coords, manual route calc |
