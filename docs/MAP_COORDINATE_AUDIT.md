# Map Coordinate System Audit

## Authoritative World Space

| Constant | Value | Usage |
|---|---|---|
| `WORLD_WIDTH` | 3600 | All entity x positions |
| `WORLD_HEIGHT` | 2400 | All entity y positions |

Defined in `src/js/render/camera.js` and `src/js/main.js` (`WORLD_W`, `WORLD_H`).

## Coordinate Pipeline

```
WORLD SPACE (authoritative)
    │
    ▼  Camera viewport (x, y, zoom) — viewport ONLY, never modifies entities
    │
SCREEN SPACE (CSS pixels on canvas)
```

### Conversion Formulas

```javascript
// worldToScreen
screenX = (worldX - camera.x) * zoom
screenY = (worldY - camera.y) * zoom

// screenToWorld
worldX = screenX / zoom + camera.x
worldY = screenY / zoom + camera.y
```

Implemented in `Camera.worldToScreen()` / `Camera.screenToWorld()` in `camera.js`.
`CanvasRenderer` delegates to `this.camera`.

### Canvas Transform (rendering)

```javascript
ctx.scale(zoom, zoom);
ctx.translate(-camera.x, -camera.y);
// All draw calls use world coordinates directly
```

## Entity Coordinate Usage

| Component | Coordinate System | Notes |
|---|---|---|
| `Ship` (x, y, vx, vy) | World | Physics integration in world space |
| `Iceberg` (x, y) | World | Drift physics in world space |
| `VectorField` | World | Grid spans 0..3600 × 0..2400 |
| `AINavigator` A* grid | World | Cell centres emitted as world waypoints |
| `ship.routeWaypoints` | World | Never cached in screen space |
| Camera (x, y, zoom) | Viewport | Does NOT modify any simulation object |

## Input Handling

| Action | Flow |
|---|---|
| Click placement | screen → `screenToWorld()` → validate → store world coords |
| Pan (Space+drag / middle mouse) | screen delta → `camera.panByScreenDelta()` |
| Wheel zoom | cursor-centred via `camera.zoomAt()` |
| Iceberg drag | screen → world → update `iceberg.x/y` in world space |
| Follow ship | camera targets `ship.x/y` in world space |

## Camera Boundaries

```javascript
visibleWidth  = viewportWidth  / zoom
visibleHeight = viewportHeight / zoom
camera.x ∈ [0, max(0, WORLD_WIDTH  - visibleWidth)]
camera.y ∈ [0, max(0, WORLD_HEIGHT - visibleHeight)]
```

## Anti-Patterns Avoided

- ❌ Mixing screen coords in ship/iceberg physics
- ❌ Caching route waypoints in screen space
- ❌ Triggering A* on pan/zoom events
- ❌ Modifying entity positions when camera moves

## Files Audited

- `src/js/main.js` — WORLD_W/H constants, navigation state in world coords
- `src/js/render/camera.js` — centralized conversions
- `src/js/render/canvasRenderer.js` — render transform, input routing
- `src/js/simulation/ship.js` — world physics only
- `src/js/simulation/iceberg.js` — world physics only
- `src/js/simulation/vectorField.js` — world grid
- `src/js/ai/aiNavigator.js` — A* in world grid
