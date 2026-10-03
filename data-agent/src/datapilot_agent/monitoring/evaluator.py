"""Model Performance Evaluator on Ground Truth Data.

Computes production metrics when actual outcomes become available.
Compares production metrics against baseline experiment scores and triggers degradation alerts.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
)

from datapilot_agent.monitoring.schema import MonitoringAlert, PerformanceMetrics

logger = logging.getLogger("datapilot_agent.monitoring.evaluator")


class PerformanceEvaluator:
    """Evaluates production model performance when ground truth is provided."""

    def __init__(
        self,
        problem_type: str = "classification",
        baseline_metrics: Optional[Dict[str, float]] = None,
        primary_metric: str = "accuracy",
        degradation_threshold: float = 0.15,  # 15% drop triggers alert
    ):
        self.problem_type = problem_type
        self.baseline_metrics = baseline_metrics or {}
        self.primary_metric = primary_metric
        self.degradation_threshold = degradation_threshold

    def evaluate(
        self,
        y_true: List[Any],
        y_pred: List[Any],
        y_prob: Optional[List[Dict[str, float]]] = None,
    ) -> Tuple[Optional[PerformanceMetrics], List[MonitoringAlert]]:
        """Calculate performance metrics and detect degradation."""
        if not y_true or not y_pred or len(y_true) != len(y_pred):
            return None, []

        sample_count = len(y_true)
        if sample_count < 2:
            return None, []

        metrics: Dict[str, float] = {}
        alerts: List[MonitoringAlert] = []

        try:
            if self.problem_type == "classification":
                # Convert classes to strings for uniform comparison
                y_t = [str(v) for v in y_true]
                y_p = [str(v) for v in y_pred]

                metrics["accuracy"] = round(float(accuracy_score(y_t, y_p)), 4)
                metrics["precision"] = round(float(precision_score(y_t, y_p, average="weighted", zero_division=0)), 4)
                metrics["recall"] = round(float(recall_score(y_t, y_p, average="weighted", zero_division=0)), 4)
                metrics["f1"] = round(float(f1_score(y_t, y_p, average="weighted", zero_division=0)), 4)

                # ROC-AUC if probabilities provided
                if y_prob and len(y_prob) == sample_count:
                    try:
                        classes = sorted(list(set(y_t)))
                        if len(classes) == 2:
                            pos_class = classes[1]
                            prob_pos = [p.get(pos_class, 0.5) for p in y_prob]
                            metrics["roc_auc"] = round(float(roc_auc_score(y_t, prob_pos)), 4)
                    except Exception as exc:
                        logger.debug("ROC-AUC computation skipped: %s", exc)

            else:  # Regression
                y_t_num = np.array(y_true, dtype=float)
                y_p_num = np.array(y_pred, dtype=float)

                mse = float(mean_squared_error(y_t_num, y_p_num))
                metrics["rmse"] = round(float(np.sqrt(mse)), 4)
                metrics["mae"] = round(float(mean_absolute_error(y_t_num, y_p_num)), 4)
                metrics["r2"] = round(float(r2_score(y_t_num, y_p_num)), 4)

        except Exception as exc:
            logger.error("Failed to compute performance metrics: %s", exc)
            return None, []

        perf = PerformanceMetrics(sample_count=sample_count, metrics=metrics)

        # Check performance degradation against baseline
        if self.primary_metric in metrics and self.primary_metric in self.baseline_metrics:
            base_score = self.baseline_metrics[self.primary_metric]
            curr_score = metrics[self.primary_metric]

            lower_is_better = self.primary_metric.lower() in {"rmse", "mae", "mse", "loss"}
            degradation = 0.0

            if lower_is_better:
                if base_score > 0 and curr_score > base_score:
                    degradation = (curr_score - base_score) / base_score
            else:
                if base_score > 0 and curr_score < base_score:
                    degradation = (base_score - curr_score) / base_score

            if degradation >= self.degradation_threshold:
                severity = "critical" if degradation >= 0.25 else "warning"
                alerts.append(
                    MonitoringAlert(
                        alert_type="performance_drop",
                        severity=severity,
                        message=(
                            f"Model primary metric '{self.primary_metric}' degraded by "
                            f"{round(degradation * 100, 1)}% from baseline ({base_score:.4f} -> {curr_score:.4f})."
                        ),
                        metric_name=self.primary_metric,
                        threshold=round(base_score, 4),
                        current_value=round(curr_score, 4),
                    )
                )

        return perf, alerts
