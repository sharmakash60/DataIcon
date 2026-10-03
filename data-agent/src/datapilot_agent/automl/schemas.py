"""Pydantic schemas and contracts for AutoML.

Strictly validates input configurations and outbound export payloads.
All export payloads enforce extra='forbid' to guarantee that raw rows or features
cannot accidentally slip through.
"""

from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class MLProblemType(str, Enum):
    CLASSIFICATION = "classification"
    REGRESSION = "regression"


class ModelName(str, Enum):
    # Baselines
    BASELINE = "baseline"
    # Classification
    LOGISTIC_REGRESSION = "logistic_regression"
    RANDOM_FOREST_CLASSIFIER = "random_forest_classifier"
    XGBOOST_CLASSIFIER = "xgboost_classifier"
    LIGHTGBM_CLASSIFIER = "lightgbm_classifier"
    CATBOOST_CLASSIFIER = "catboost_classifier"
    # Regression
    LINEAR_REGRESSION = "linear_regression"
    RANDOM_FOREST_REGRESSOR = "random_forest_regressor"
    XGBOOST_REGRESSOR = "xgboost_regressor"
    LIGHTGBM_REGRESSOR = "lightgbm_regressor"
    CATBOOST_REGRESSOR = "catboost_regressor"


class PrimaryMetric(str, Enum):
    # Classification
    ROC_AUC = "roc_auc"
    PR_AUC = "pr_auc"
    F1 = "f1"
    PRECISION = "precision"
    RECALL = "recall"
    ACCURACY = "accuracy"
    LOG_LOSS = "log_loss"
    # Regression
    RMSE = "rmse"
    MAE = "mae"
    R2 = "r2"
    MSE = "mse"
    MAPE = "mape"


class ValidationStrategy(str, Enum):
    K_FOLD = "k_fold"
    STRATIFIED_K_FOLD = "stratified_k_fold"


class AutoMLConfig(BaseModel):
    """Configuration for AutoML execution."""
    model_config = ConfigDict(extra="forbid")

    problem_type: MLProblemType
    target_column: str
    feature_columns: Optional[List[str]] = None
    primary_metric: Optional[PrimaryMetric] = None
    validation_strategy: ValidationStrategy = ValidationStrategy.STRATIFIED_K_FOLD
    n_splits: int = Field(default=5, ge=2, le=10)
    random_seed: int = 42
    algorithms: Optional[List[ModelName]] = None
    tune_hyperparameters: bool = True
    optuna_trials: int = Field(default=15, ge=1, le=100)
    optuna_timeout_seconds: Optional[int] = Field(default=120, ge=5)
    include_baseline: bool = True


class ModelBenchmarkResult(BaseModel):
    """Benchmark metrics for a single model across cross-validation."""
    model_config = ConfigDict(extra="forbid")

    model_name: str
    algorithm_key: ModelName
    is_baseline: bool
    hyperparameters: Dict[str, Any]
    cv_scores: List[float]
    mean_cv_score: float
    std_cv_score: float
    metrics: Dict[str, float]
    training_time_seconds: float
    inference_latency_ms: float


class TuningTrialResult(BaseModel):
    """Result of an individual Optuna trial."""
    model_config = ConfigDict(extra="forbid")

    trial_number: int
    model_name: str
    parameters: Dict[str, Any]
    score: float
    state: str
    duration_seconds: float


class LeaderboardEntry(BaseModel):
    """Ranked leaderboard summary."""
    model_config = ConfigDict(extra="forbid")

    rank: int
    model_name: str
    algorithm_key: ModelName
    is_baseline: bool
    primary_metric_name: str
    primary_metric_score: float
    std_score: float
    training_time_seconds: float
    inference_latency_ms: float
    is_best_model: bool


class ExperimentResultPayload(BaseModel):
    """Permitted experiment metadata and metrics to store in the platform.

    Notice: Under no circumstances does this payload contain raw dataset rows,
    raw target vectors, or un-aggregated feature matrices.
    """
    model_config = ConfigDict(extra="forbid")

    experiment_name: str
    problem_type: MLProblemType
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
    leaderboard: List[LeaderboardEntry]
    benchmarks: List[ModelBenchmarkResult]
    tuning_trials: List[TuningTrialResult]
    total_execution_time_seconds: float
