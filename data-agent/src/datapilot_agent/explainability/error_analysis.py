"""Permutation importance and error analysis (runs entirely inside the Client Data Plane).

PRIVACY CONTRACT:
- Only aggregated statistics leave this module.
- No raw rows, no individual prediction values are included in exports.
"""

from __future__ import annotations

import warnings
from typing import Any, List, Optional

import numpy as np

from datapilot_agent.explainability.schema import (
    ConfusionMatrixCell,
    ErrorAnalysis,
    ErrorSegment,
    FeatureImportanceEntry,
    PermutationImportanceResult,
    ProvenanceSource,
    ResidualStats,
)


# ─── Permutation Importance ───────────────────────────────────────────────────

def compute_permutation_importance(
    model: Any,
    X_eval: "np.ndarray",
    y_eval: "np.ndarray",
    feature_names: List[str],
    metric_name: str,
    scorer_fn: Any,           # callable(y_true, y_pred) -> float
    n_repeats: int = 10,
    random_state: int = 42,
) -> Optional[PermutationImportanceResult]:
    """Compute permutation importance locally.

    Returns None on failure (model remains usable).
    """
    try:
        from sklearn.inspection import permutation_importance as sklearn_pi  # type: ignore
    except ImportError:
        warnings.warn("scikit-learn not available for permutation importance.", stacklevel=2)
        return None

    try:
        result = sklearn_pi(
            model,
            X_eval,
            y_eval,
            scoring=scorer_fn,
            n_repeats=n_repeats,
            random_state=random_state,
        )
    except Exception as e:
        warnings.warn(f"Permutation importance failed: {e}", stacklevel=2)
        return None

    importances_mean = result.importances_mean
    importances_std = result.importances_std
    ranked_idx = np.argsort(importances_mean)[::-1]

    features = []
    for rank, idx in enumerate(ranked_idx, start=1):
        fn = feature_names[idx] if idx < len(feature_names) else f"feature_{idx}"
        features.append(
            FeatureImportanceEntry(
                feature_name=fn,
                importance_value=float(importances_mean[idx]),
                importance_rank=rank,
                std_error=float(importances_std[idx]),
                method="permutation",
                source=ProvenanceSource.MODEL_DERIVED,
            )
        )

    return PermutationImportanceResult(
        features=features,
        metric_used=metric_name,
        n_repeats=n_repeats,
        n_samples_evaluated=X_eval.shape[0],
        source=ProvenanceSource.MODEL_DERIVED,
    )


# ─── Error Analysis ───────────────────────────────────────────────────────────

def _confusion_matrix_cells(y_true: np.ndarray, y_pred: np.ndarray, labels: List[str]) -> List[ConfusionMatrixCell]:
    try:
        from sklearn.metrics import confusion_matrix  # type: ignore
        cm = confusion_matrix(y_true, y_pred, labels=list(range(len(labels))))
        total = cm.sum()
        cells = []
        for i, actual in enumerate(labels):
            for j, predicted in enumerate(labels):
                count = int(cm[i, j])
                cells.append(ConfusionMatrixCell(
                    actual_label=actual,
                    predicted_label=predicted,
                    count=count,
                    rate=count / total if total > 0 else 0.0,
                    source=ProvenanceSource.MODEL_DERIVED,
                ))
        return cells
    except Exception:
        return []


def _residual_stats(y_true: np.ndarray, y_pred: np.ndarray) -> ResidualStats:
    residuals = y_true - y_pred
    return ResidualStats(
        mean_residual=float(np.mean(residuals)),
        std_residual=float(np.std(residuals)),
        mae=float(np.mean(np.abs(residuals))),
        rmse=float(np.sqrt(np.mean(residuals ** 2))),
        max_error=float(np.max(np.abs(residuals))),
        source=ProvenanceSource.MODEL_DERIVED,
    )


def _error_segments(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    X_eval: np.ndarray,
    feature_names: List[str],
    overall_metric: float,
    problem_type: str,
    top_n_features: int = 5,
    n_bins: int = 3,
) -> tuple[List[ErrorSegment], List[ErrorSegment]]:
    """Compute per-segment error rates for top features.  No raw rows are returned."""
    from sklearn.metrics import roc_auc_score, mean_squared_error  # type: ignore

    is_classification = "classification" in problem_type
    all_segments: List[ErrorSegment] = []

    for feat_idx in range(min(top_n_features, X_eval.shape[1])):
        col = X_eval[:, feat_idx]
        fn = feature_names[feat_idx] if feat_idx < len(feature_names) else f"feature_{feat_idx}"
        unique_vals = np.unique(col)

        if len(unique_vals) <= n_bins:
            # Categorical-like: one segment per value
            bins = [(fn, str(v), col == v) for v in unique_vals]
        else:
            # Numeric: cut into n_bins quantile-based buckets
            percentiles = np.linspace(0, 100, n_bins + 1)
            edges = np.percentile(col, percentiles)
            labels_map = {0: "low", 1: "mid", 2: "high"}
            bins = []
            for bi in range(n_bins):
                mask = (col >= edges[bi]) & (col <= edges[bi + 1]) if bi < n_bins - 1 else col >= edges[bi]
                bins.append((fn, labels_map.get(bi, f"bin_{bi}"), mask))

        for fn_name, seg_label, mask in bins:
            n_seg = int(np.sum(mask))
            if n_seg < 5:
                continue
            y_t = y_true[mask]
            y_p = y_pred[mask]
            try:
                if is_classification:
                    if len(np.unique(y_t)) < 2:
                        continue
                    metric_val = float(roc_auc_score(y_t, y_p))
                    error_rate = float(np.mean(y_t != (y_p >= 0.5).astype(int)))
                else:
                    metric_val = float(-np.sqrt(mean_squared_error(y_t, y_p)))  # negative RMSE
                    error_rate = float(np.mean(np.abs(y_t - y_p)))

                all_segments.append(ErrorSegment(
                    feature_name=fn_name,
                    segment_label=seg_label,
                    n_samples=n_seg,
                    error_rate=error_rate,
                    primary_metric_value=metric_val,
                    delta_from_overall=metric_val - overall_metric,
                    source=ProvenanceSource.MODEL_DERIVED,
                ))
            except Exception:
                continue

    all_segments.sort(key=lambda s: s.delta_from_overall)
    worst = all_segments[:5]
    best = list(reversed(all_segments[-5:]))
    return worst, best


def compute_error_analysis(
    model: Any,
    X_eval: np.ndarray,
    y_true: np.ndarray,
    feature_names: List[str],
    problem_type: str,
    primary_metric: str,
    overall_metric_value: float,
    class_labels: Optional[List[str]] = None,
) -> Optional[ErrorAnalysis]:
    """Compute error analysis — classification confusion matrix or regression residuals + segment analysis."""
    try:
        if hasattr(model, "predict_proba"):
            y_pred_proba = model.predict_proba(X_eval)
            y_pred_class = model.predict(X_eval)
        else:
            y_pred_proba = model.predict(X_eval)
            y_pred_class = y_pred_proba

        is_classification = "classification" in problem_type
        confusion = None
        residuals = None
        overall_error = None

        if is_classification:
            labels = class_labels or [str(i) for i in range(len(np.unique(y_true)))]
            confusion = _confusion_matrix_cells(y_true, y_pred_class, labels)
            overall_error = float(np.mean(y_true != y_pred_class))
            score_for_segments = y_pred_proba[:, 1] if y_pred_proba.ndim == 2 else y_pred_proba
        else:
            y_pred_vals = y_pred_proba if y_pred_proba.ndim == 1 else y_pred_proba.flatten()
            residuals = _residual_stats(y_true.astype(float), y_pred_vals)
            score_for_segments = y_pred_vals

        worst_segs, best_segs = _error_segments(
            y_true, score_for_segments, X_eval, feature_names,
            overall_metric_value, problem_type,
        )

        return ErrorAnalysis(
            problem_type=problem_type,
            overall_error_rate=overall_error,
            overall_metric_value=overall_metric_value,
            confusion_matrix=confusion,
            residual_stats=residuals,
            worst_segments=worst_segs,
            best_segments=best_segs,
            source=ProvenanceSource.MODEL_DERIVED,
        )
    except Exception as e:
        warnings.warn(f"Error analysis failed: {e}", stacklevel=2)
        return None
