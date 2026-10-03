"""Pydantic schemas for Business Requirement Engine and Problem Formulation."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, model_validator


class MLProblemType(str, Enum):
    BINARY_CLASSIFICATION = "binary_classification"
    MULTICLASS_CLASSIFICATION = "multiclass_classification"
    REGRESSION = "regression"
    TIME_SERIES_FORECASTING = "time_series_forecasting"


class RequirementStatus(str, Enum):
    DRAFT = "draft"
    REVIEWED = "reviewed"
    APPROVED = "approved"
    REJECTED = "rejected"


class ExtractedRequirementPayload(BaseModel):
    """Structured extraction payload produced by the LLM or heuristic engine and strictly validated.
    
    Guarantees that free-form LLM outputs conform to typed tabular ML specifications.
    """
    business_objective: str = Field(
        min_length=3,
        max_length=1000,
        description="High-level commercial or operational goal",
    )
    ml_objective: str = Field(
        min_length=3,
        max_length=1000,
        description="Specific machine learning prediction task",
    )
    prediction_objective: str | None = Field(
        default=None,
        description="Backward-compatible alias for ml_objective",
    )
    target: str = Field(
        min_length=1,
        max_length=160,
        description="Target variable name or conceptual entity to predict",
    )
    target_name: str | None = Field(
        default=None,
        description="Backward-compatible alias for target",
    )
    prediction_horizon: str | None = Field(
        default=None,
        max_length=160,
        description="Lead time or forecast horizon (e.g. '30 days', 'next quarter')",
    )
    candidate_problem_type: MLProblemType = Field(
        description="Tabular ML problem category",
    )
    ml_problem_type: MLProblemType | None = Field(
        default=None,
        description="Backward-compatible alias for candidate_problem_type",
    )
    primary_metric: str = Field(
        min_length=1,
        max_length=64,
        description="Recommended primary optimization metric (e.g. recall, roc_auc, rmse, log_loss)",
    )
    secondary_metrics: list[str] = Field(
        default_factory=list,
        description="Supporting diagnostic and business metrics",
    )
    business_constraints: list[str] = Field(
        default_factory=list,
        description="Operational constraints (e.g. latency, cost of false positive, explainability)",
    )
    cost_of_false_positives: str | None = Field(
        default=None,
        max_length=1000,
        description="Business cost, friction, or wasted expenditure resulting from false positive predictions",
    )
    cost_of_false_negatives: str | None = Field(
        default=None,
        max_length=1000,
        description="Business loss, churn, fraud, or missed opportunity resulting from false negative predictions",
    )
    expected_prediction_frequency: str | None = Field(
        default=None,
        max_length=64,
        description="Operational scoring frequency (e.g. 'daily batch', 'weekly batch', 'real-time API')",
    )
    business_priority: str | None = Field(
        default=None,
        max_length=255,
        description="Explicit business priority (e.g. 'Minimize false negatives (High Recall)', 'High Precision')",
    )
    suggested_positive_class: str | None = Field(
        default=None,
        max_length=160,
        description="Label considered positive in binary classification (e.g. 'churn', 'fraud')",
    )
    confidence_score: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Heuristic or LLM confidence score for this formulation",
    )
    assumptions: list[str] = Field(
        default_factory=list,
        description="Explicit assumptions made while extracting requirements (never silently assume)",
    )
    missing_requirements: list[str] = Field(
        default_factory=list,
        description="Business requirements not explicitly supplied in the input and requiring user review",
    )

    model_config = {"extra": "forbid"}

    @model_validator(mode="before")
    @classmethod
    def sync_aliases(cls, data: dict) -> dict:
        if not isinstance(data, dict):
            return data
        # Sync ml_objective and prediction_objective
        if "prediction_objective" in data and "ml_objective" not in data:
            data["ml_objective"] = data["prediction_objective"]
        elif "ml_objective" in data and "prediction_objective" not in data:
            data["prediction_objective"] = data["ml_objective"]

        # Sync target and target_name
        if "target_name" in data and "target" not in data:
            data["target"] = data["target_name"]
        elif "target" in data and "target_name" not in data:
            data["target_name"] = data["target"]

        # Sync candidate_problem_type and ml_problem_type
        if "ml_problem_type" in data and "candidate_problem_type" not in data:
            data["candidate_problem_type"] = data["ml_problem_type"]
        elif "candidate_problem_type" in data and "ml_problem_type" not in data:
            data["ml_problem_type"] = data["candidate_problem_type"]

        return data


class ExtractRequirementRequest(BaseModel):
    """Natural language business problem description submitted by the user."""
    problem_description: str = Field(
        min_length=3,
        max_length=5000,
        description="Natural language business problem description",
    )
    llm_json_override: str | None = Field(
        default=None,
        description="Optional raw JSON output from LLM for schema validation",
    )
    strict_target: bool = Field(
        default=False,
        description="If True, rejects formulation when target is missing rather than flagging it",
    )


class RequirementUpdateRequest(BaseModel):
    """User edit payload for reviewing, editing, and refining extracted requirements."""
    business_objective: str = Field(min_length=3, max_length=1000)
    ml_objective: str = Field(min_length=3, max_length=1000)
    prediction_objective: str | None = None
    target: str = Field(min_length=1, max_length=160)
    target_name: str | None = None
    prediction_horizon: str | None = Field(default=None, max_length=160)
    candidate_problem_type: MLProblemType = MLProblemType.BINARY_CLASSIFICATION
    ml_problem_type: MLProblemType | None = None
    primary_metric: str = Field(min_length=1, max_length=64)
    secondary_metrics: list[str] = Field(default_factory=list)
    business_constraints: list[str] = Field(default_factory=list)
    cost_of_false_positives: str | None = Field(default=None, max_length=1000)
    cost_of_false_negatives: str | None = Field(default=None, max_length=1000)
    expected_prediction_frequency: str | None = Field(default=None, max_length=64)
    business_priority: str | None = Field(default=None, max_length=255)
    suggested_positive_class: str | None = Field(default=None, max_length=160)
    assumptions: list[str] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)
    status: RequirementStatus = Field(default=RequirementStatus.DRAFT)
    review_notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def sync_update_aliases(cls, data: dict) -> dict:
        if not isinstance(data, dict):
            return data
        if "prediction_objective" in data and "ml_objective" not in data:
            data["ml_objective"] = data["prediction_objective"]
        elif "ml_objective" in data and "prediction_objective" not in data:
            data["prediction_objective"] = data["ml_objective"]

        if "target_name" in data and "target" not in data:
            data["target"] = data["target_name"]
        elif "target" in data and "target_name" not in data:
            data["target_name"] = data["target"]

        if "ml_problem_type" in data and "candidate_problem_type" not in data:
            data["candidate_problem_type"] = data["ml_problem_type"]
        elif "candidate_problem_type" in data and "ml_problem_type" not in data:
            data["ml_problem_type"] = data["candidate_problem_type"]

        return data


class ConfirmRequirementRequest(BaseModel):
    """Confirmation request to approve requirements and generate versioned Problem Formulation."""
    review_notes: str | None = Field(default=None, max_length=2000)


class RejectRequirementRequest(BaseModel):
    """Rejection payload for a requirement formulation."""
    reason: str = Field(
        min_length=3,
        max_length=1000,
        description="Mandatory rationale for rejecting this requirement formulation",
    )


class BusinessRequirementOut(BaseModel):
    """Public API output representation of a BusinessRequirement record."""
    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    created_by_user_id: uuid.UUID
    natural_language_input: str
    business_objective: str
    ml_objective: str
    prediction_objective: str
    target: str
    target_name: str
    prediction_horizon: str | None
    candidate_problem_type: str
    ml_problem_type: str
    primary_metric: str
    secondary_metrics: list[str]
    business_constraints: list[str]
    cost_of_false_positives: str | None
    cost_of_false_negatives: str | None
    expected_prediction_frequency: str | None
    business_priority: str | None
    suggested_positive_class: str | None
    confidence_score: float
    assumptions: list[str]
    missing_requirements: list[str]
    status: str
    review_notes: str | None
    reviewed_by_user_id: uuid.UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProblemFormulationOut(BaseModel):
    """Public API output representation of a confirmed, versioned Problem Formulation object."""
    id: uuid.UUID
    version: int
    organization_id: uuid.UUID
    project_id: uuid.UUID
    requirement_id: uuid.UUID | None
    business_objective: str
    ml_objective: str
    target: str
    prediction_horizon: str | None
    candidate_problem_type: str
    primary_metric: str
    secondary_metrics: list[str]
    business_constraints: list[str]
    cost_of_false_positives: str | None
    cost_of_false_negatives: str | None
    expected_prediction_frequency: str | None
    business_priority: str | None
    assumptions: list[str]
    status: str
    confirmed_by_user_id: uuid.UUID | None
    confirmed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
