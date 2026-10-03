"""Unit tests for Optuna hyperparameter tuning in Client Data Plane."""

import numpy as np
import pytest

from datapilot_agent.automl.schemas import MLProblemType, ModelName
from datapilot_agent.automl.tuning import HyperparameterTuner


def test_optuna_tuning_random_forest():
    np.random.seed(42)
    X_train = np.random.randn(50, 4)
    y_train = (X_train[:, 0] + X_train[:, 1] > 0).astype(int)

    X_val = np.random.randn(20, 4)
    y_val = (X_val[:, 0] + X_val[:, 1] > 0).astype(int)

    tuner = HyperparameterTuner(
        problem_type=MLProblemType.CLASSIFICATION,
        primary_metric="roc_auc",
        n_trials=5,
        timeout_seconds=20,
        random_seed=42,
    )

    best_params, best_score, trials = tuner.tune(
        ModelName.RANDOM_FOREST_CLASSIFIER,
        X_train,
        y_train,
        X_val,
        y_val,
    )

    assert isinstance(best_params, dict)
    assert len(trials) == 5
    assert all(t.state in ["COMPLETE", "FAIL"] for t in trials)
    assert best_score >= 0.0
