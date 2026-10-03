"""Pydantic schemas for explainability reports.

PROVENANCE RULES (enforced here):
  - Numeric model-derived fields cannot be set by the LLM narrative endpoint.
  - ai_narrative fields are validated to have source='ai_generated'.
  - user_assumptions have source='user_assumption'.
  - No raw data rows are accepted in any schema.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, field_validator


# ─── Provenance ───────────────────────────────────────────────────────────────

ProvenanceLiteral = Literal["model_derived", "ai_generated", "user_assumption"]


# ─── Feature Distribution & Direction ────────────────────────────────────────

class FeatureDistributionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min: float
    p25: Optional[float] = None
    median: Optional[float] = None
    p75: Optional[float] = None
    max: float
    mean: Optional[float] = None
    std: Optional[float] = None
    histogram: Optional[List[Dict[str, Any]]] = None
    source: Literal["model_derived"] = "model_derived"


# ─── Feature Importance ───────────────────────────────────────────────────────

class FeatureImportanceEntryIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    importance_value: float
    importance_rank: int
    std_error: Optional[float] = None
    method: str
    direction: Optional[str] = None  # "+", "-", "non-linear", "mixed", "positive", "negative"
    distribution: Optional[FeatureDistributionIn] = None
    source: Literal["model_derived"] = "model_derived"


# ─── SHAP Summary Plot ────────────────────────────────────────────────────────

class SHAPSummaryPointIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    sample_index: int
    feature_value: float
    feature_value_normalized: float  # 0.0 (low) to 1.0 (high)
    shap_value: float
    source: Literal["model_derived"] = "model_derived"


class SHAPSummaryPlotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: List[str]
    points: List[SHAPSummaryPointIn] = Field(default_factory=list)
    source: Literal["model_derived"] = "model_derived"


# ─── SHAP Dependence Plot ─────────────────────────────────────────────────────

class SHAPDependencePointIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_value: float
    shap_value: float
    interaction_feature_value: Optional[float] = None
    sample_index: Optional[int] = None
    source: Literal["model_derived"] = "model_derived"


class SHAPDependencePlotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    interaction_feature: Optional[str] = None
    points: List[SHAPDependencePointIn] = Field(default_factory=list)
    source: Literal["model_derived"] = "model_derived"


# ─── Partial Dependence Plot (PDP) ────────────────────────────────────────────

class PartialDependencePlotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    grid_values: List[float]
    average_predictions: List[float]
    ice_lines: Optional[List[List[float]]] = None
    target_name: Optional[str] = None
    source: Literal["model_derived"] = "model_derived"


class GlobalSHAPIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    method: str
    features: List[FeatureImportanceEntryIn]
    n_samples_used: int
    baseline_value: Optional[float] = None
    summary_plot: Optional[SHAPSummaryPlotIn] = None
    dependence_plots: Optional[List[SHAPDependencePlotIn]] = None
    source: Literal["model_derived"] = "model_derived"


class PermutationImportanceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    features: List[FeatureImportanceEntryIn]
    metric_used: str
    n_repeats: int
    n_samples_evaluated: int
    source: Literal["model_derived"] = "model_derived"


# ─── Local Explanations ───────────────────────────────────────────────────────

class LocalSHAPFeatureIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    shap_value: float
    feature_value: Optional[Any] = None
    source: Literal["model_derived"] = "model_derived"


class LocalSHAPFactorIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    shap_value: float
    feature_value: Optional[Any] = None
    impact_magnitude: float
    effect: Literal["increases_prediction", "decreases_prediction"]
    source: Literal["model_derived"] = "model_derived"


class LocalExplanationIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sample_index: int
    prediction: float
    probability: Optional[float] = None
    predicted_class: Optional[str] = None
    base_value: float
    feature_contributions: List[LocalSHAPFeatureIn]
    feature_values: Optional[Dict[str, Any]] = None
    top_factors_increasing: Optional[List[LocalSHAPFactorIn]] = None
    top_factors_decreasing: Optional[List[LocalSHAPFactorIn]] = None
    source: Literal["model_derived"] = "model_derived"


# ─── Error Analysis ───────────────────────────────────────────────────────────

class ConfusionMatrixCellIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    predicted_label: str
    actual_label: str
    count: int
    rate: float
    source: Literal["model_derived"] = "model_derived"


class ErrorSegmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_name: str
    segment_label: str
    n_samples: int
    error_rate: float
    primary_metric_value: float
    delta_from_overall: float
    source: Literal["model_derived"] = "model_derived"


class ResidualStatsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mean_residual: float
    std_residual: float
    mae: float
    rmse: float
    max_error: float
    source: Literal["model_derived"] = "model_derived"


class ErrorAnalysisIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    problem_type: str
    overall_error_rate: Optional[float] = None
    overall_metric_value: float
    confusion_matrix: Optional[List[ConfusionMatrixCellIn]] = None
    residual_stats: Optional[ResidualStatsIn] = None
    worst_segments: List[ErrorSegmentIn] = Field(default_factory=list)
    best_segments: List[ErrorSegmentIn] = Field(default_factory=list)
    source: Literal["model_derived"] = "model_derived"


# ─── What-If Scenario Analysis ───────────────────────────────────────────────

class WhatIfScenarioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sample_index: Optional[int] = None
    baseline_features: Optional[Dict[str, Any]] = Field(default_factory=dict)
    modified_features: Dict[str, Any] = Field(..., description="Modified feature key-values")


class WhatIfFeatureShift(BaseModel):
    feature_name: str
    original_value: Any
    new_value: Any
    estimated_impact: float
    direction: Literal["increases_prediction", "decreases_prediction", "neutral"]


class WhatIfScenarioResponse(BaseModel):
    baseline_prediction: float
    scenario_prediction: float
    delta: float
    baseline_probability: Optional[float] = None
    scenario_probability: Optional[float] = None
    feature_shifts: List[WhatIfFeatureShift]
    top_factors_increasing: List[LocalSHAPFactorIn]
    top_factors_decreasing: List[LocalSHAPFactorIn]
    disclaimer: str = (
        "⚠️ MODEL SENSITIVITY / SCENARIO ANALYSIS — NOT CAUSAL EVIDENCE: "
        "This simulation projects model output variations based on statistical correlations "
        "in the trained model distribution. It does NOT establish causal inference or guarantee "
        "that an intervention in the real world will produce this outcome."
    )
    method: str = "marginal_shap_interpolation"
    source: Literal["model_derived"] = "model_derived"


# ─── AI Narrative ─────────────────────────────────────────────────────────────

class AINarrativeIn(BaseModel):
    """LLM-generated contextual text. Provenance must be 'ai_generated'.
    
    CRITICAL: The control plane LLM service populates this.
    It MUST NOT contain numeric model facts — only qualitative explanation.
    """
    model_config = ConfigDict(extra="forbid")
    global_importance_narrative: str = ""
    error_analysis_narrative: str = ""
    business_context_narrative: str = ""
    source: Literal["ai_generated"] = "ai_generated"
    model_used: str = ""
    generated_at: str = ""
    warning: str = (
        "AI-generated text. Not a substitute for quantitative model facts. "
        "Numeric values in this report are model-derived and authoritative."
    )


# ─── User Assumptions ─────────────────────────────────────────────────────────

class UserAssumptionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(min_length=1, max_length=200)
    value: str = Field(min_length=1, max_length=1000)
    source: Literal["user_assumption"] = "user_assumption"


# ─── Ingest Request ───────────────────────────────────────────────────────────

class IngestExplainabilityRequest(BaseModel):
    """Full permitted explainability ingestion contract from Client Data Agent."""
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="explainability/v1", max_length=32)
    experiment_id: uuid.UUID
    experiment_run_id: Optional[uuid.UUID] = None
    model_name: str = Field(min_length=1, max_length=160)
    problem_type: str = Field(min_length=1, max_length=64)
    target_name: str = Field(min_length=1, max_length=160)
    primary_metric: str = Field(min_length=1, max_length=64)
    primary_metric_value: float
    n_eval_samples: int = Field(ge=1)
    explained_at: str = Field(min_length=10, max_length=64)

    # Model-derived facts — all sources enforced to 'model_derived' by sub-schemas
    global_shap: Optional[GlobalSHAPIn] = None
    permutation_importance: Optional[PermutationImportanceIn] = None
    shap_summary: Optional[SHAPSummaryPlotIn] = None
    shap_dependence: Optional[List[SHAPDependencePlotIn]] = None
    partial_dependence: Optional[List[PartialDependencePlotIn]] = None
    local_explanations: List[LocalExplanationIn] = Field(
        default_factory=list,
        max_length=20,   # hard cap prevents bulk data export
        description="Max 20 local explanations permitted per report",
    )
    error_analysis: Optional[ErrorAnalysisIn] = None

    # User-provided assumptions
    user_assumptions: List[UserAssumptionIn] = Field(default_factory=list, max_length=50)

    @field_validator("local_explanations")
    @classmethod
    def cap_local_explanations(cls, v: list) -> list:
        if len(v) > 20:
            raise ValueError("local_explanations cannot exceed 20 entries.")
        return v


# ─── AI Narrative Update Request ──────────────────────────────────────────────

class AddNarrativeRequest(BaseModel):
    """Request to add an AI-generated narrative to an existing report.
    
    SECURITY: The LLM can only populate narrative text fields.
    It cannot modify any model-derived numeric facts.
    """
    model_config = ConfigDict(extra="forbid")
    user_context: str = Field(
        default="",
        max_length=2000,
        description="Optional user-provided business context to guide the LLM",
    )
    user_assumptions: List[UserAssumptionIn] = Field(default_factory=list, max_length=20)


# ─── Out Schemas ──────────────────────────────────────────────────────────────

class ExplainabilityReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    experiment_id: uuid.UUID
    experiment_run_id: Optional[uuid.UUID] = None
    schema_version: str
    model_name: str
    problem_type: str
    target_name: str
    primary_metric: str
    primary_metric_value: float
    n_eval_samples: int
    explained_at: str
    # All JSON blobs returned as parsed dicts
    global_shap: Optional[Dict[str, Any]] = None
    permutation_importance: Optional[Dict[str, Any]] = None
    shap_summary: Optional[Dict[str, Any]] = None
    shap_dependence: Optional[List[Dict[str, Any]]] = None
    partial_dependence: Optional[List[Dict[str, Any]]] = None
    local_explanations: List[Dict[str, Any]] = Field(default_factory=list)
    error_analysis: Optional[Dict[str, Any]] = None
    # AI narrative — clearly labelled in every response
    ai_narrative: Optional[Dict[str, Any]] = None
    ai_narrative_warning: str = (
        "AI-generated text is qualitative context only. "
        "All numeric values are model-derived facts and are authoritative."
    )
    user_assumptions: List[Dict[str, Any]] = Field(default_factory=list)
    provenance_verified: bool
    created_at: datetime
    updated_at: datetime
