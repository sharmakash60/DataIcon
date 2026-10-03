"""Model evaluation metrics computation.

Supports comprehensive classification and regression metrics.
"""

from typing import Any, Dict, Optional
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    mean_absolute_percentage_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)

from .schemas import MLProblemType, PrimaryMetric


def compute_classification_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: Optional[np.ndarray] = None,
) -> Dict[str, float]:
    """Calculate comprehensive classification metrics."""
    metrics: Dict[str, float] = {}

    metrics["accuracy"] = float(accuracy_score(y_true, y_pred))

    is_binary = len(np.unique(y_true)) <= 2
    average = "binary" if is_binary else "macro"

    try:
        metrics["f1"] = float(f1_score(y_true, y_pred, average=average, zero_division=0))
    except Exception:
        metrics["f1"] = 0.0

    try:
        metrics["precision"] = float(precision_score(y_true, y_pred, average=average, zero_division=0))
    except Exception:
        metrics["precision"] = 0.0

    try:
        metrics["recall"] = float(recall_score(y_true, y_pred, average=average, zero_division=0))
    except Exception:
        metrics["recall"] = 0.0

    if y_prob is not None:
        try:
            if is_binary:
                # Expecting 1D array of positive class probability or 2D [n_samples, 2]
                prob = y_prob[:, 1] if y_prob.ndim == 2 and y_prob.shape[1] == 2 else y_prob
                metrics["roc_auc"] = float(roc_auc_score(y_true, prob))
                metrics["pr_auc"] = float(average_precision_score(y_true, prob))
            else:
                metrics["roc_auc"] = float(roc_auc_score(y_true, y_prob, multi_class="ovr", average="macro"))
                metrics["pr_auc"] = float(average_precision_score(y_true, y_prob, average="macro"))
        except Exception:
            metrics["roc_auc"] = 0.5
            metrics["pr_auc"] = 0.0

        try:
            metrics["log_loss"] = float(log_loss(y_true, y_prob))
        except Exception:
            metrics["log_loss"] = 1.0

    return metrics


def compute_regression_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
) -> Dict[str, float]:
    """Calculate comprehensive regression metrics."""
    metrics: Dict[str, float] = {}

    mse = float(mean_squared_error(y_true, y_pred))
    metrics["mse"] = mse
    metrics["rmse"] = float(np.sqrt(mse))
    metrics["mae"] = float(mean_absolute_error(y_true, y_pred))

    try:
        metrics["r2"] = float(r2_score(y_true, y_pred))
    except Exception:
        metrics["r2"] = 0.0

    try:
        metrics["mape"] = float(mean_absolute_percentage_error(y_true, y_pred))
    except Exception:
        metrics["mape"] = 0.0

    return metrics


def evaluate_model(
    problem_type: MLProblemType,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: Optional[np.ndarray] = None,
) -> Dict[str, float]:
    """Uniform evaluation interface."""
    if problem_type == MLProblemType.CLASSIFICATION:
        return compute_classification_metrics(y_true, y_pred, y_prob)
    else:
        return compute_regression_metrics(y_true, y_pred)


def is_higher_better(metric_name: str) -> bool:
    """Check if metric optimization direction is maximize."""
    m = metric_name.lower()
    return m in ["roc_auc", "pr_auc", "f1", "precision", "recall", "accuracy", "r2"]
