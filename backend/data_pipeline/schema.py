"""
ASTRALIS Nav-OS — Versioned Canonical Track Schema
===================================================
Defines canonical row schema for sequential iceberg & sea-ice observations.
Includes schema validation, provenance tagging, and coordinate definitions.
"""

from typing import Dict, Any, List

SCHEMA_VERSION = "1.0.0"

REQUIRED_FIELDS = [
    "schema_version",
    "data_provenance",
    "source_dataset",
    "track_id",
    "timestamp_utc",
    "time_index",
    "latitude",
    "longitude",
    "x_m",
    "y_m",
    "velocity_x_mps",
    "velocity_y_mps",
    "speed_mps",
    "wind_u10_mps",
    "wind_v10_mps",
    "ocean_current_u_mps",
    "ocean_current_v_mps",
    "sea_ice_concentration",
    "sea_surface_temperature_c",
    "wave_height_m",
    "iceberg_radius_m",
    "iceberg_area_m2",
    "iceberg_draft_m",
    "observation_confidence",
    "position_uncertainty_m",
    "is_interpolated",
    "is_synthetic"
]

PROVENANCE_TYPES = ["synthetic", "real", "mixed", "unknown"]


def validate_row(row: Dict[str, Any]) -> List[str]:
    """Validates a single observation row against the canonical schema."""
    errors = []

    for field in REQUIRED_FIELDS:
        if field not in row:
            errors.append(f"Missing required field: '{field}'")

    if row.get("data_provenance") not in PROVENANCE_TYPES:
        errors.append(f"Invalid provenance: {row.get('data_provenance')}")

    sea_ice = row.get("sea_ice_concentration", 0.0)
    if not isinstance(sea_ice, (int, float)) or not (0.0 <= sea_ice <= 1.0):
        errors.append(f"Invalid sea_ice_concentration: {sea_ice} (must be in [0, 1])")

    radius = row.get("iceberg_radius_m", 0.0)
    if not isinstance(radius, (int, float)) or radius <= 0:
        errors.append(f"Invalid iceberg_radius_m: {radius}")

    return errors
