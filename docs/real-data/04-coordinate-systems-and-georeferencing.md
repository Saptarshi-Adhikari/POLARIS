# 04 — POLARIS Coordinate Systems & Georeferencing

## 1. Coordinate Space Definitions

POLARIS operates across three distinct coordinate spaces:

```
  1. Geographic Space          (Latitude -90..90°, Longitude -180..180°)
          ↓
  2. POLARIS World Space       (X: 0..3600, Y: 0..2400 simulation units)
          ↓
  3. Canvas Screen Space       (X: 0..clientWidth, Y: 0..clientHeight pixels)
```

---

## 2. POLARIS Simulation World Coordinates `[CURRENT]`

- **Dimensions**: `WORLD_W = 3600`, `WORLD_H = 2400`.
- **Origin**: Top-left corner `(0, 0)`.
- **Direction**:
  - `+X`: Increases Eastward.
  - `+Y`: Increases Southward.
- **Usage**: All physics updates (`Ship`, `Iceberg`), A* pathfinding (`AINavigator`), vector field hydrodynamics (`VectorField`), and collision checks execute strictly in WORLD coordinates.

---

## 3. Geographic Coordinate Transformation Boundary (`geoTransform.js`)

Geographic latitude/longitude degrees cannot be directly used in grid search or Nomoto steering calculations because 1 degree of longitude narrows dramatically near the poles ($\cos(\text{lat})$ scaling).

POLARIS projects geographic coordinates into simulation units via `DEFAULT_ANTARCTIC_BBOX`:

- **Latitude Min**: `-78.0°S` (Maps to World $Y = 2400$)
- **Latitude Max**: `-60.0°S` (Maps to World $Y = 0$)
- **Longitude Min**: `-75.0°W` (Maps to World $X = 0$)
- **Longitude Max**: `-35.0°W` (Maps to World $X = 3600$)

### Transformation Equations

#### `geoToWorld(lat, lon)`
$$\text{normX} = \frac{\text{lon} - \text{lonMin}}{\text{lonMax} - \text{lonMin}}$$
$$\text{normY} = \frac{\text{latMax} - \text{lat}}{\text{latMax} - \text{latMin}}$$
$$X = \text{normX} \times 3600, \quad Y = \text{normY} \times 2400$$

#### `worldToGeo(x, y)`
$$\text{normX} = \frac{X}{3600}, \quad \text{normY} = \frac{Y}{2400}$$
$$\text{lon} = \text{lonMin} + \text{normX} \times (\text{lonMax} - \text{lonMin})$$
$$\text{lat} = \text{latMax} - \text{normY} \times (\text{latMax} - \text{latMin})$$

---

## 4. Special High-Latitude Considerations

1. **Antimeridian Crossing ($\pm 180^\circ$)**: Longitude calculations near $180^\circ$ require modular arithmetic $(\text{lon} + 360) \pmod{360}$ to prevent wrapping jumps.
2. **Polar Distortion**: Distance scaling in regional Antarctic bounding boxes applies latitude compensation factor $\cos(\text{lat}_{\text{center}})$.
3. **Finite Precision**: All transformed coordinates are checked via `validateGeoCoordinates(lat, lon)` to reject `NaN` or unfinite values before simulation injection.
