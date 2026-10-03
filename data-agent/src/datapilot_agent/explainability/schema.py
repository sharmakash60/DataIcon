"""Versioned explainability result schema.

PROVENANCE CONTRACT:
  Every value carries a 'source' tag:
    - 'model_derived'      : numeric facts computed directly from the trained model/data
    - 'ai_generated'       : narrative text produced by an LLM (never numeric facts)
    - 'user_assumption'    : business context provided by the end user

  The LLM MUST NOT produce or override any numeric model facts.
  Only 'ai_generated' narrative fields are permitted to come from an LLM.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


SCHEMA_VERSION = "explainability/v1"


class ProvenanceSource(str, Enum):
    MODEL_DERIVED = "model_derived"
    AI_GENERATED = "ai_generated"
    USER_ASSUMPTION = "user_assumption"


# ─── Global Feature Importance ───────────────────────────────────────────────

class FeatureImportanceEntry(BaseModel):
    """Single feature importance value with strict provenance tag."""
    model_config = ConfigDict(extra="forbid")

    feature_name: str
    importance_value: float                 # always model_derived
    importance_rank: int
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED
    method: str                             # "shap_global" | "permutation"
    std_error: Optional[float] = None


class GlobalFeatureImportance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: str                             # "shap_global" | "permutation"
    features: List[FeatureImportanceEntry]
    n_samples_used: int                     # how many rows were used for SHAP (NOT the rows themselves)
    baseline_value: Optional[float] = None  # mean model output (SHAP base value)
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


# ─── Local (Per-Sample) SHAP Explanation ─────────────────────────────────────

class LocalSHAPFeature(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature_name: str
    shap_value: float
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


class LocalExplanation(BaseModel):
    """SHAP explanation for a single prediction.

    IMPORTANT: raw_input_values is never included.  Only SHAP values and feature names.
    """
    model_config = ConfigDict(extra="forbid")

    sample_index: int                       # row index within the evaluation dataset (not the data itself)
    prediction: float                       # model output value
    predicted_class: Optional[str] = None
    base_value: float                       # SHAP expected value
    feature_contributions: List[LocalSHAPFeature]
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


# ─── Permutation Importance ───────────────────────────────────────────────────

class PermutationImportanceResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    features: List[FeatureImportanceEntry]  # method="permutation"
    metric_used: str
    n_repeats: int
    n_samples_evaluated: int
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


# ─── Error Analysis ───────────────────────────────────────────────────────────

class ConfusionMatrixCell(BaseModel):
    model_config = ConfigDict(extra="forbid")

    predicted_label: str
    actual_label: str
    count: int
    rate: float
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


class ErrorSegment(BaseModel):
    """Performance on a particular slice of the evaluation data.
    
    Contains no raw rows — only aggregated metrics per feature-value bucket.
    """
    model_config = ConfigDict(extra="forbid")

    feature_name: str
    segment_label: str                      # e.g., "high" / "low" / category name
    n_samples: int
    error_rate: float                       # error rate in this segment
    primary_metric_value: float
    delta_from_overall: float               # +/- difference from global metric
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


class ResidualStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mean_residual: float
    std_residual: float
    mae: float
    rmse: float
    max_error: float
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


class ErrorAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")

    problem_type: str
    overall_error_rate: Optional[float] = None    # classification
    overall_metric_value: float
    confusion_matrix: Optional[List[ConfusionMatrixCell]] = None
    residual_stats: Optional[ResidualStats] = None
    worst_segments: List[ErrorSegment] = Field(default_factory=list)
    best_segments: List[ErrorSegment] = Field(default_factory=list)
    source: ProvenanceSource = ProvenanceSource.MODEL_DERIVED


# ─── AI-generated Narrative ───────────────────────────────────────────────────

class AIExplanationNarrative(BaseModel):
    """LLM-generated contextual explanation.

    STRICT RULES:
    - This block is purely narrative / qualitative text.
    - It MUST NOT contain numeric claims about model metrics, SHAP values, or accuracy.
    - It MUST be displayed with a clear 'AI-Generated' provenance label.
    - It is grounded in the numeric facts from this same report; the LLM cannot override them.
    """
    model_config = ConfigDict(extra="forbid")

    global_importance_narrative: str = ""
    error_analysis_narrative: str = ""
    business_context_narrative: str = ""    # may incorporate user_assumption context
    source: ProvenanceSource = ProvenanceSource.AI_GENERATED
    model_used: str = ""
    generated_at: str = ""
    warning: str = (
        "AI-generated text. Not a substitute for quantitative model facts. "
        "Numeric values in this report are model-derived and authoritative."
    )


# ─── User Assumptions ────────────────────────────────────────────────────────

class UserAssumption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str
    value: str
    source: ProvenanceSource = ProvenanceSource.USER_ASSUMPTION


# ─── Root Report ─────────────────────────────────────────────────────────────

class ExplainabilityReport(BaseModel):
    """Full explainability report exported from Client Data Plane.

    EXPORT POLICY:
    - Only aggregated model-derived statistics are present.
    - No raw data rows, no training samples, no individual cell values.
    - LLM narratives are tagged ai_generated and cannot be used to modify numeric facts.
    """
    model_config = ConfigDict(extra="forbid")

    schema_version: str = SCHEMA_VERSION
    experiment_id: str
    experiment_run_id: Optional[str] = None    # which specific model run
    model_name: str
    problem_type: str
    target_name: str
    primary_metric: str
    primary_metric_value: float
    n_eval_samples: int                        # count only — no actual samples
    explained_at: str                          # ISO8601 timestamp

    # Model-derived facts (always authoritative)
    global_shap: Optional[GlobalFeatureImportance] = None
    permutation_importance: Optional[PermutationImportanceResult] = None
    local_explanations: List[LocalExplanation] = Field(
        default_factory=list,
        description="SHAP explanations for a limited set of representative samples (max 20)."
    )
    error_analysis: Optional[ErrorAnalysis] = None

    # AI-generated narrative (clearly labelled, never overrides numeric facts)
    ai_narrative: Optional[AIExplanationNarrative] = None

    # User-provided business assumptions
    user_assumptions: List[UserAssumption] = Field(default_factory=list)
    provenance_verified: bool = True

    # Hard upper bound on local explanations to prevent bulk data export
    _MAX_LOCAL_EXPLANATIONS: int = 20

    def to_export_dict(self) -> dict[str, Any]:
        """Convert report to JSON-serializable dictionary for export gate validation."""
        return self.model_dump(mode="json")
