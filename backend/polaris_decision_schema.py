"""POLARIS Decision Schema Definitions.

Defines Pydantic models for vessel state, ice conditions, weather, operational constraints,
and normalized decision outputs.
"""
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Input Schema Categories
# -----------------------------------------------------------------------------

class NavigationState(BaseModel):
    vessel_name: str = Field(..., description="Vessel identifier")
    ice_class: str = Field(..., description="Polar Class capability (e.g. 'PC6', 'PC3', 'OpenWater')")
    position_x: float = Field(..., description="Local grid X coordinate in km")
    position_y: float = Field(..., description="Local grid Y coordinate in km")
    vessel_speed_knots: float = Field(..., description="Current vessel speed in knots")
    heading_deg: float = Field(..., description="Heading direction in degrees (0-360)")
    destination_x: float = Field(..., description="Destination X coordinate in km")
    destination_y: float = Field(..., description="Destination Y coordinate in km")
    distance_to_destination_km: float = Field(..., description="Remaining distance in km")


class IceConditions(BaseModel):
    sea_ice_concentration: float = Field(..., ge=0.0, le=1.0, description="Sea ice concentration fraction (0.0 to 1.0)")
    ice_thickness_m: float = Field(..., ge=0.0, description="Estimated ice thickness in meters")
    nearest_iceberg_distance_m: float = Field(..., ge=0.0, description="Distance to nearest detected iceberg in meters")
    nearest_iceberg_radius_m: float = Field(10.0, ge=0.0, description="Radius of nearest iceberg in meters")
    route_segment_blocked: bool = Field(False, description="Whether projected route intersects iceberg safety zone")


class EnvironmentalState(BaseModel):
    wind_speed_knots: float = Field(..., ge=0.0, description="Wind speed in knots")
    wind_direction_deg: float = Field(..., ge=0.0, le=360.0, description="Wind direction in degrees")
    current_speed_knots: float = Field(..., ge=0.0, description="Ocean current speed in knots")
    visibility_nautical_miles: float = Field(..., ge=0.0, description="Visibility distance in nautical miles")
    water_temperature_c: float = Field(-1.8, description="Sea surface water temperature in Celsius")


class OperationalConstraints(BaseModel):
    icebreaker_escort_available: bool = Field(False, description="Whether an icebreaker escort vessel is nearby and available")
    fuel_remaining_percent: float = Field(100.0, ge=0.0, le=100.0, description="Fuel level percentage")
    emergency_status: bool = Field(False, description="Whether ship is in emergency/distress state")


class PolarisDecisionInput(BaseModel):
    navigation: NavigationState
    ice: IceConditions
    environment: EnvironmentalState
    operational: OperationalConstraints

    def to_laya_state(self) -> Dict[str, Any]:
        """Convert structured POLARIS state to flat key-value dictionary for Laya evaluation."""
        return {
            "vessel_name": self.navigation.vessel_name,
            "ice_class": self.navigation.ice_class,
            "speed_knots": f"{self.navigation.vessel_speed_knots:.1f} kts",
            "position": f"({self.navigation.position_x:.1f}, {self.navigation.position_y:.1f})",
            "remaining_distance": f"{self.navigation.distance_to_destination_km:.1f} km",
            "sea_ice_concentration": f"{self.ice.sea_ice_concentration * 100:.0f}% ({self.ice.sea_ice_concentration:.2f})",
            "ice_thickness": f"{self.ice.ice_thickness_m:.1f} m",
            "nearest_iceberg_distance": f"{self.ice.nearest_iceberg_distance_m:.0f} m",
            "route_segment_blocked": "BLOCKED" if self.ice.route_segment_blocked else "CLEAR",
            "wind": f"{self.environment.wind_speed_knots:.0f} kts at {self.environment.wind_direction_deg:.0f}°",
            "visibility": f"{self.environment.visibility_nautical_miles:.1f} NM",
            "escort_available": "YES" if self.operational.icebreaker_escort_available else "NO",
            "emergency_status": "CRITICAL EMERGENCY" if self.operational.emergency_status else "NORMAL"
        }


# -----------------------------------------------------------------------------
# Decision Output Categories
# -----------------------------------------------------------------------------

class NormalizedDecisionOutput(BaseModel):
    route_action: str = Field(..., description="Recommended navigation action: 'continue', 'slow_down', 'reroute', 'hold_position', 'request_escort', 'emergency_response'")
    route_action_confidence: float = Field(..., description="Confidence / probability score for recommended action")
    hazard_severity_score: float = Field(..., description="Hazard severity score (0.0=low, 1.0=moderate, 2.0=critical)")
    escort_required_prob: float = Field(..., description="Probability (0.0 to 1.0) that icebreaker escort is required")
    human_review_required: bool = Field(..., description="Flag requiring human officer triage due to high risk or low model confidence")
    human_review_reasons: List[str] = Field(default_factory=list, description="Reasons for requiring human officer intervention")
    laya_routing_model: Optional[str] = Field(None, description="Laya model checkpoint selected ('english', 'multilingual')")
    laya_routing_reason: Optional[str] = Field(None, description="Script/language routing explanation")
