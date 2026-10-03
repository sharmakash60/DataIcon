"""Pydantic schemas for Experiments, Runs, and Trials in the Control Plane."""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class CreateExperimentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    dataset_version: str = Field(default="v1.0", max_length=64)
    dataset_fingerprint: str = Field(default="unknown", max_length=128)
    problem_formulation: Dict[str, Any] = Field(default_factory=dict)
    preprocessing_config: Dict[str, Any] = Field(default_factory=dict)
    feature_config: Dict[str, Any] = Field(default_factory=dict)
    model: str = Field(default="Model", min_length=1, max_length=160)
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    validation_strategy: str = Field(default="5-fold StratifiedKFold", max_length=160)
    metrics: Dict[str, float] = Field(default_factory=dict)
    training_duration: float = Field(default=0.0, ge=0.0)
    environment_info: Dict[str, Any] = Field(default_factory=dict)
    random_seed: int = Field(default=42)
    model_artifact_reference: Optional[str] = Field(default=None, max_length=255)
    status: str = Field(default="completed", max_length=32)

    # Optional problem specs if problem_formulation not given
    problem_type: Optional[str] = None
    target_name: Optional[str] = None
    primary_metric: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RecordExperimentRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_name: str = Field(min_length=1, max_length=160)
    algorithm_key: str = Field(min_length=1, max_length=64)
    is_baseline: bool = False
    rank: Optional[int] = None
    mean_cv_score: float
    std_cv_score: float = 0.0
    training_time_seconds: float = 0.0
    inference_latency_ms: float = 0.0
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, float] = Field(default_factory=dict)
    cv_scores: List[float] = Field(default_factory=list)
    status: str = "completed"


class RecordExperimentTrialRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trial_number: int
    model_name: str = Field(min_length=1, max_length=160)
    parameters: Dict[str, Any] = Field(default_factory=dict)
    score: float
    state: str = "COMPLETE"
    duration_seconds: float = 0.0


class IngestAutoMLExperimentPayload(BaseModel):
    """Full permitted AutoML experiment ingestion contract from Client Data Agent."""
    model_config = ConfigDict(extra="forbid")

    experiment_name: str = Field(min_length=1, max_length=160)
    problem_type: str
    target_name: str
    primary_metric: str
    n_samples: int
    n_features: int
    feature_names: List[str]
    n_splits: int
    validation_strategy: str
    baseline_score: float
    best_model_name: str
    best_score: float
    leaderboard: List[Dict[str, Any]]
    benchmarks: List[Dict[str, Any]]
    tuning_trials: List[Dict[str, Any]]
    total_execution_time_seconds: float


class ExperimentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    experiment_id: uuid.UUID
    model_name: str
    algorithm_key: str
    is_baseline: bool
    rank: Optional[int]
    mean_cv_score: float
    std_cv_score: float
    training_time_seconds: float
    inference_latency_ms: float
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    metrics: Dict[str, float] = Field(default_factory=dict)
    cv_scores: List[float] = Field(default_factory=list)
    status: str
    created_at: datetime


class ExperimentTrialOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    experiment_id: uuid.UUID
    trial_number: int
    model_name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    score: float
    state: str
    duration_seconds: float
    created_at: datetime


class ExperimentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    name: str
    dataset_version: str
    dataset_fingerprint: str
    problem_formulation: Dict[str, Any] = Field(default_factory=dict)
    preprocessing_config: Dict[str, Any] = Field(default_factory=dict)
    feature_config: Dict[str, Any] = Field(default_factory=dict)
    model: str
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    validation_strategy: str
    metrics: Dict[str, float] = Field(default_factory=dict)
    training_duration: float = 0.0
    environment_info: Dict[str, Any] = Field(default_factory=dict)
    random_seed: int = 42
    model_artifact_reference: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime

    # Additional metadata & compatibility fields
    problem_type: str
    target_name: str
    primary_metric: str
    best_model_name: Optional[str] = None
    best_score: Optional[float] = None
    baseline_score: Optional[float] = None
    n_samples: Optional[int] = None
    n_features: Optional[int] = None
    total_execution_time_seconds: Optional[float] = None
    decision: str = "candidate"
    decision_notes: Optional[str] = None
    decision_by: Optional[str] = None
    decision_at: Optional[str] = None
    mean_cv_score: Optional[float] = None
    std_cv_score: Optional[float] = None
    cv_scores: List[float] = Field(default_factory=list)
    inference_latency_ms: Optional[float] = None
    memory_usage_mb: Optional[float] = None
    model_complexity: Dict[str, Any] = Field(default_factory=dict)
    explainability: Dict[str, Any] = Field(default_factory=dict)
    visualizations: Dict[str, Any] = Field(default_factory=dict)
    composite_utility_score: Dict[str, Any] = Field(default_factory=dict)


class UpdateExperimentDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: str = Field(pattern="^(candidate|approved|rejected)$")
    notes: Optional[str] = Field(default="", max_length=1000)


class RunExperimentWorkflowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    dataset_version: str = Field(default="v1.0", max_length=64)
    benchmark_name: Optional[str] = Field(default="customer_churn", max_length=64)
    target_column: Optional[str] = None
    problem_type: Optional[str] = None
    primary_metric: Optional[str] = None
    business_requirements: Dict[str, Any] = Field(default_factory=dict)
    enable_optuna: bool = False
    optuna_trials: int = Field(default=8, ge=1, le=50)
    n_splits: int = Field(default=5, ge=2, le=10)
    random_seed: int = Field(default=42)


class ExperimentDetailOut(ExperimentOut):
    runs: List[ExperimentRunOut] = Field(default_factory=list)
    trials: List[ExperimentTrialOut] = Field(default_factory=list)
    workflow_stages: List[Dict[str, Any]] = Field(default_factory=list)
    recommendation: Dict[str, Any] = Field(default_factory=dict)


class MetricComparison(BaseModel):
    metric_name: str
    values: Dict[str, Optional[float]]
    best_experiment_id: Optional[str] = None
    best_value: Optional[float] = None
    direction: str = "higher_is_better"


class ExperimentComparisonResponse(BaseModel):
    experiments: List[ExperimentOut]
    metric_comparisons: List[MetricComparison]
    hyperparameter_differences: Dict[str, Dict[str, Any]]
    dataset_consistency: Dict[str, Any]
    recommendation_summary: Optional[Dict[str, Any]] = None
    model_summaries: List[Dict[str, Any]] = Field(default_factory=list)
