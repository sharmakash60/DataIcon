"""End-to-end tests for AutoMLEngine in Client Data Plane."""

import numpy as np
import pandas as pd
import pytest

from datapilot_agent.automl.engine import AutoMLEngine
from datapilot_agent.automl.schemas import (
    AutoMLConfig,
    MLProblemType,
    ModelName,
    PrimaryMetric,
)


def test_automl_classification_full_pipeline():
    np.random.seed(42)
    n = 80
    df = pd.DataFrame({
        "account_age_months": np.random.randint(1, 60, n),
        "monthly_charges": np.random.uniform(20.0, 120.0, n),
        "contract_type": np.random.choice(["month-to-month", "one-year", "two-year"], n),
        "paperless_billing": np.random.choice(["Yes", "No"], n),
        "churn": np.random.choice([0, 1], n),
    })

    config = AutoMLConfig(
        problem_type=MLProblemType.CLASSIFICATION,
        target_column="churn",
        primary_metric=PrimaryMetric.ROC_AUC,
        n_splits=3,
        tune_hyperparameters=True,
        optuna_trials=4,
        optuna_timeout_seconds=15,
        random_seed=42,
    )

    engine = AutoMLEngine(config)
    result = engine.run(df, experiment_name="Customer Churn Benchmark")

    # Assertions on experiment summary
    assert result.experiment_name == "Customer Churn Benchmark"
    assert result.problem_type == MLProblemType.CLASSIFICATION
    assert result.target_name == "churn"
    assert result.primary_metric == "roc_auc"
    assert result.n_samples == 80
    assert result.n_features == 4

    # Assertions on leaderboard
    assert len(result.leaderboard) >= 6  # 5 models + baseline + tuned
    assert result.leaderboard[0].rank == 1
    assert result.leaderboard[0].is_best_model is True
    assert result.best_model_name == result.leaderboard[0].model_name

    # Check Optuna tuning trials were recorded
    assert len(result.tuning_trials) > 0


def test_automl_regression_full_pipeline():
    np.random.seed(42)
    n = 80
    df = pd.DataFrame({
        "sqft": np.random.uniform(500, 3500, n),
        "bedrooms": np.random.randint(1, 5, n),
        "neighborhood": np.random.choice(["Downtown", "Suburbs", "Rural"], n),
        "price": np.random.uniform(100_000, 800_000, n),
    })

    config = AutoMLConfig(
        problem_type=MLProblemType.REGRESSION,
        target_column="price",
        primary_metric=PrimaryMetric.RMSE,
        n_splits=3,
        tune_hyperparameters=True,
        optuna_trials=4,
        optuna_timeout_seconds=15,
        random_seed=42,
    )

    engine = AutoMLEngine(config)
    result = engine.run(df, experiment_name="Housing Price Regression")

    assert result.problem_type == MLProblemType.REGRESSION
    assert result.target_name == "price"
    assert result.primary_metric == "rmse"
    assert len(result.leaderboard) >= 6
    assert result.best_score > 0.0
