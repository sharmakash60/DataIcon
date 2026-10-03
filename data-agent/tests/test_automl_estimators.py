"""Unit tests for all 10 supported estimators and baselines."""

import numpy as np
import pytest

from datapilot_agent.automl.estimators import create_estimator
from datapilot_agent.automl.schemas import MLProblemType, ModelName


@pytest.mark.parametrize("algo_key", [
    ModelName.BASELINE,
    ModelName.LOGISTIC_REGRESSION,
    ModelName.RANDOM_FOREST_CLASSIFIER,
    ModelName.XGBOOST_CLASSIFIER,
    ModelName.LIGHTGBM_CLASSIFIER,
    ModelName.CATBOOST_CLASSIFIER,
])
def test_all_classification_estimators(algo_key):
    np.random.seed(42)
    X = np.random.randn(50, 4)
    y = np.random.choice([0, 1], 50)

    estimator = create_estimator(algo_key, MLProblemType.CLASSIFICATION)
    estimator.fit(X, y)

    preds = estimator.predict(X[:5])
    assert len(preds) == 5

    probs = estimator.predict_proba(X[:5])
    if probs is not None:
        assert probs.shape[0] == 5
        assert probs.shape[1] == 2
        # Probabilities sum to ~1.0
        np.testing.assert_allclose(probs.sum(axis=1), np.ones(5), atol=1e-4)


@pytest.mark.parametrize("algo_key", [
    ModelName.BASELINE,
    ModelName.LINEAR_REGRESSION,
    ModelName.RANDOM_FOREST_REGRESSOR,
    ModelName.XGBOOST_REGRESSOR,
    ModelName.LIGHTGBM_REGRESSOR,
    ModelName.CATBOOST_REGRESSOR,
])
def test_all_regression_estimators(algo_key):
    np.random.seed(42)
    X = np.random.randn(50, 4)
    y = np.random.randn(50) * 10 + 20

    estimator = create_estimator(algo_key, MLProblemType.REGRESSION)
    estimator.fit(X, y)

    preds = estimator.predict(X[:5])
    assert len(preds) == 5
    assert isinstance(preds[0], (float, np.floating))
