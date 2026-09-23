"""POLARIS Domain Scenario Pipeline Schemas & Provenance Data Models.

Defines the complete canonical dataset schema, field-level provenance records, expert review models,
consensus tracking, and data quality validation structures.
"""
from enum import Enum
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class SourceType(str, Enum):
    REAL_OBSERVATION = "REAL_OBSERVATION"
    REAL_REANALYSIS = "REAL_REANALYSIS"
    REAL_SOURCE_DERIVED = "REAL_SOURCE_DERIVED"
    REAL_SOURCE_DERIVED_SIMULATED = "REAL_SOURCE_DERIVED_SIMULATED"
    SIMULATED = "SIMULATED"
    SYNTHETIC = "SYNTHETIC"
    EXPERT_ANNOTATION = "EXPERT_ANNOTATION"
    RULE_BASELINE = "RULE_BASELINE"
    MIXED = "MIXED"


class DataState(str, Enum):
    OBSERVED = "OBSERVED"
    REANALYSIS = "REANALYSIS"
    SOURCE_DERIVED = "SOURCE_DERIVED"
    MODELLED = "MODELLED"
    SIMULATED = "SIMULATED"
    EXPERT_LABEL = "EXPERT_LABEL"


class LabelSource(str, Enum):
    EXPERT = "EXPERT"
    EXPERIMENTAL_RULE_BASELINE = "EXPERIMENTAL_RULE_BASELINE"
    VERIFIED_RULE = "VERIFIED_RULE"
    EXISTING_SYSTEM = "EXISTING_SYSTEM"
    SIMULATION_OUTCOME = "SIMULATION_OUTCOME"
    RULE_BASELINE = "EXPERIMENTAL_RULE_BASELINE"
    CONSENSUS = "CONSENSUS"
    UNKNOWN = "UNKNOWN"


class ReviewerStatus(str, Enum):
    UNREVIEWED = "UNREVIEWED"
    PENDING_REVIEW = "PENDING_REVIEW"
    ACCEPTED = "ACCEPTED"
    MODIFIED = "MODIFIED"
    REJECTED = "REJECTED"
    AMBIGUOUS = "AMBIGUOUS"


class DatasetSplit(str, Enum):
    TRAIN = "TRAIN"
    VALIDATION = "VALIDATION"
    TEST = "TEST"
    BENCHMARK_HOLDOUT = "BENCHMARK_HOLDOUT"


class ProvenanceDetail(BaseModel):
    provider: str = Field(..., description="Data provider (e.g., USNIC, ECMWF ERA5, Copernicus CMEMS, POLARIS Engine)")
    dataset_name: str = Field(..., description="Name of dataset or source module")
    record_id: Optional[str] = Field(None, description="Unique record identifier from provider")
    observed_at: Optional[str] = Field(None, description="ISO timestamp of observation/reanalysis")
    data_state: DataState = Field(..., description="Data processing state")
    derivation_method: Optional[str] = Field(None, description="Derivation or simulation transformation description")


class FieldLevelProvenance(BaseModel):
    iceberg_position: ProvenanceDetail
    iceberg_dimensions: ProvenanceDetail
    sea_ice_concentration: ProvenanceDetail
    wind_conditions: ProvenanceDetail
    current_conditions: ProvenanceDetail
    visibility_conditions: ProvenanceDetail
    vessel_kinematics: ProvenanceDetail
    route_blockage_status: ProvenanceDetail


class SourceAnchor(BaseModel):
    provider: str
    dataset: str
    record_id: Optional[str] = None
    observation_timestamp: Optional[str] = None


class ScenarioProvenance(BaseModel):
    source_type: SourceType = Field(..., description="Primary scenario composition source type")
    navigation_source: ProvenanceDetail
    ice_source: ProvenanceDetail
    environment_source: ProvenanceDetail
    field_provenance: Optional[FieldLevelProvenance] = None
    source_anchor: Optional[SourceAnchor] = None
    generation_seed: Optional[int] = Field(None, description="RNG seed used for simulation reproducibility")


class LabelEvidence(BaseModel):
    route_blocked: bool
    nearest_iceberg_distance_m: float
    sea_ice_concentration: float
    visibility_nautical_miles: float
    alternate_route_available: bool
    emergency_status_active: bool
    evidence_reference: Optional[str] = Field(None, description="Reference citation or safety rule anchor")


class IndividualAnnotation(BaseModel):
    reviewer_id: str
    selected_action: str
    confidence: float
    rationale: str
    additional_info_needed: Optional[str] = Field(None, description="Additional information that would alter decision")
    driving_evidence_factors: List[str] = Field(default_factory=list, description="Key factors driving expert choice")
    review_status: ReviewerStatus = Field(ReviewerStatus.MODIFIED, description="Status assigned by reviewer")
    reviewed_at: str


class DecisionLabel(BaseModel):
    selected_action: str = Field(..., description="Selected route action label")
    hazard_severity_score: float = Field(..., description="Hazard severity score (0.0 - 2.0)")
    escort_required: bool = Field(..., description="Whether icebreaker escort is required")
    human_review_required: bool = Field(..., description="Whether human review is mandated")
    label_source: LabelSource = Field(LabelSource.EXPERIMENTAL_RULE_BASELINE, description="Origin of the label")
    label_confidence: float = Field(1.0, ge=0.0, le=1.0, description="Confidence in the label assignment")
    label_reason: str = Field(..., description="Rationale for the label assignment")
    evidence: LabelEvidence = Field(..., description="Structured domain evidence supporting the decision")
    reviewer_status: ReviewerStatus = Field(ReviewerStatus.UNREVIEWED, description="Expert review status")
    reviewer_notes: Optional[str] = Field(None, description="Reviewer feedback or notes")
    reviewer_id: Optional[str] = Field(None, description="Identifier of primary expert reviewer")
    individual_annotations: List[IndividualAnnotation] = Field(default_factory=list, description="Multi-reviewer annotations")
    consensus_action: Optional[str] = Field(None, description="Consensus action if multiple reviewers agree")
    disagreement_flag: bool = Field(False, description="Flagged true if expert annotations conflict")


class ReviewPackageItem(BaseModel):
    scenario_id: str
    priority_rank: int
    priority_category: str
    scenario_family: str
    source_type: SourceType
    state: Dict[str, Any]
    baseline_action: str
    evidence: LabelEvidence
    reviewer_status: ReviewerStatus
    candidate_actions: List[str] = ["continue", "slow_down", "reroute", "hold_position", "request_escort", "emergency_response"]
    reviewer_id: Optional[str] = None
    selected_action: Optional[str] = None
    rationale: Optional[str] = None


class PolarisDomainScenario(BaseModel):
    scenario_id: str = Field(..., description="Unique scenario ID e.g. POLARIS_SCENARIO_0001")
    episode_id: str = Field(..., description="Episode/Run identifier for split integrity grouping")
    timestamp: str = Field(..., description="Scenario ISO creation timestamp")
    scenario_family: str = Field(..., description="Scenario family name e.g. HEAVY_ICE_ESCORT_REQUEST")
    provenance: ScenarioProvenance = Field(..., description="Complete data provenance record")
    state: Dict[str, Any] = Field(..., description="POLARIS decision input state matching PolarisDecisionInput schema")
    decision_label: DecisionLabel = Field(..., description="Target decision label and evidence")
    dataset_split: DatasetSplit = Field(DatasetSplit.TRAIN, description="Assigned dataset split")
