"""Unit tests for classification and regression metrics."""

import numpy as np
import pytest

from datapilot_agent.automl.metrics import (
    compute_classification_metrics,
    compute_regression_metrics,
    evaluate_model,
    is_higher_better,
)
from datapilot_agent.automl.schemas import MLProblemType


def test_classification_metrics():
    y_true = np.array([0, 1, 0, 1, 0, 1, 1, 0])
    y_pred = np.array([0, 1, 0, 0, 0, 1, 1, 1])
    y_prob = np.array([
        [0.9, 0.1],
        [0.2, 0.8],
        [0.85, 0.15],
        [0.6, 0.4],
        [0.7, 0.3],
        [0.1, 0.9],
        [0.15, 0.85],
        [0.45, 0.55],
    ])

    metrics = evaluate_model(MLProblemType.CLASSIFICATION, y_true, y_pred, y_prob)

    assert "accuracy" in metrics
    assert "f1" in metrics
    assert "precision" in metrics
    assert "recall" in metrics
    assert "roc_auc" in metrics
    assert "pr_auc" in metrics
    assert "log_loss" in metrics

    assert 0.0 <= metrics["accuracy"] <= 1.0
    assert 0.0 <= metrics["roc_auc"] <= 1.0


def test_regression_metrics():
    y_true = np.array([10.0, 20.0, 30.0, 40.0])
    y_pred = np.array([11.0, 19.0, 32.0, 38.0])

    metrics = evaluate_model(MLProblemType.REGRESSION, y_true, y_pred)

    assert "rmse" in metrics
    assert "mae" in metrics
    assert "r2" in metrics
    assert "mse" in metrics
    assert "mape" in metrics

    assert metrics["rmse"] > 0
    assert metrics["mae"] > 0
    assert metrics["r2"] > 0.9


def test_metric_direction():
    assert is_higher_better("roc_auc") is True
    assert is_higher_better("pr_auc") is True
    assert is_higher_better("r2") is True
    assert is_higher_better("rmse") is False
    assert is_higher_better("mae") is False
    assert is_higher_better("log_loss") is False
