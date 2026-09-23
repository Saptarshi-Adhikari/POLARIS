# POLARIS Laya Training Requirements Specification

This document defines the formal data requirements, structure, and provenance rules for building a legitimate POLARIS maritime decision training dataset.

---

## 1. Required Training Example Schema

Every POLARIS training example must be formatted as a JSON record containing full telemetry state, ground-truth expert decision labels, and label provenance metadata:

```json
{
  "scenario_id": "POLARIS_SCENARIO_2026_0012",
  "provenance": {
    "source": "simulation | expert_annotation | historical_log",
    "annotator_id": "CAPT_OFFICER_04",
    "confidence_rating": "high | medium",
    "timestamp": "2026-09-22T22:30:00Z"
  },
  "state": {
    "vessel_name": "R/V POLARIS Sentinel",
    "ice_class": "PC6",
    "speed_knots": "14.0 kts",
    "position": "(12.0, 25.0)",
    "remaining_distance": "75.0 km",
    "sea_ice_concentration": "40% (0.40)",
    "ice_thickness": "0.5 m",
    "nearest_iceberg_distance": "1200 m",
    "route_segment_blocked": "CLEAR",
    "wind": "22 kts at 90°",
    "visibility": "4.5 NM",
    "escort_available": "NO",
    "emergency_status": "NORMAL"
  },
  "decisions": {
    "route_action": {
      "type": "choice",
      "label": "slow_down"
    },
    "hazard_severity": {
      "type": "score",
      "label": 0.8
    },
    "escort_required": {
      "type": "noul",
      "label": 0.20
    },
    "human_review_required": {
      "type": "noul",
      "label": 0.0
    }
  },
  "rationale": "Moderate 40% sea ice concentration with reduced visibility requires reducing speed from 18 kts to 14 kts to maintain safe maneuverability margin."
}
```

---

## 2. Telemetry Input Fields & Options

### Mandatory State Fields
- **`vessel_name`**: Vessel string identifier.
- **`ice_class`**: Polar Class capability (`PC1` through `PC7`, `OpenWater`).
- **`speed_knots`**: Vessel speed in knots.
- **`position`**: Coordinates `(x, y)` in local grid km.
- **`remaining_distance`**: Distance to waypoint in km.
- **`sea_ice_concentration`**: Sea ice concentration formatted string and numerical fraction (0.0 to 1.0).
- **`ice_thickness`**: Ice thickness in meters.
- **`nearest_iceberg_distance`**: Distance to nearest iceberg in meters.
- **`route_segment_blocked`**: `CLEAR` or `BLOCKED`.
- **`wind`**: Wind speed and direction.
- **`visibility`**: Visibility distance in nautical miles.
- **`escort_available`**: `YES` or `NO`.
- **`emergency_status`**: `NORMAL` or `CRITICAL EMERGENCY`.

### Decision Target Labels
1. **`route_action`** (`choice`): Must be exactly one of:
   - `continue`
   - `slow_down`
   - `reroute`
   - `hold_position`
   - `request_escort`
   - `emergency_response`
2. **`hazard_severity`** (`score`): Ordinal float between 0.0 (low hazard) and 2.0 (critical hazard).
3. **`escort_required`** (`noul`): Binary ground truth float (0.0 = No, 1.0 = Yes).
4. **`human_review_required`** (`noul`): Binary ground truth float (0.0 = No, 1.0 = Yes).

---

## 3. Dataset Composition & Split Strategy

### Recommended Split Ratio
- **Train Set:** 70% of scenarios.
- **Validation Set:** 15% of scenarios.
- **Test Set:** 15% of scenarios.

### Required Scenario Diversity
To prevent model decision collapse, the dataset must include balanced representation across:
1. Open water / clear channel operations (20%).
2. Moderate sea ice caution / speed reduction (20%).
3. Iceberg exclusion zone avoidance & rerouting (20%).
4. Dense multi-year pack ice / escort requests (15%).
5. Blizzard / zero-visibility hold position scenarios (15%).
6. Emergency vessel distress / hull damage (10%).

---

## 4. Provenance & Annotation Standards

- **Label Origin:** Every training instance must record a `label_type` (`expert_annotation`, `historical_log`, `simulation_physics`).
- **Conflict Resolution:** If multiple master mariners provide conflicting decision labels for the same scenario state, the example must be flagged for consensus review before inclusion in training splits.
