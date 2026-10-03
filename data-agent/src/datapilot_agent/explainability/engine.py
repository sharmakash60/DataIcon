"""Explainability Engine — orchestrates SHAP, permutation importance, and error analysis.

All computation happens locally in the Client Data Plane.
Produces an ExplainabilityReport that is validated before any transmission.
"""

from __future__ import annotations

import warnings
from datetime import UTC, datetime
from typing import Any, List, Optional

import numpy as np

from datapilot_agent.explainability.schema import (
    ExplainabilityReport,
    ProvenanceSource,
    SCHEMA_VERSION,
)
from datapilot_agent.explainability.shap_explainer import compute_shap_global
from datapilot_agent.explainability.error_analysis import (
    compute_error_analysis,
    compute_permutation_importance,
)


def explain_model(
    model: Any,
    X_eval: "np.ndarray",
    y_true: "np.ndarray",
    feature_names: List[str],
    experiment_id: str,
    model_name: str,
    problem_type: str,
    target_name: str,
    primary_metric: str,
    overall_metric_value: float,
    experiment_run_id: Optional[str] = None,
    class_labels: Optional[List[str]] = None,
    n_shap_background: int = 100,
    n_permutation_repeats: int = 10,
    random_seed: int = 42,
) -> ExplainabilityReport:
    """Run the full explainability pipeline for a trained model.

    Args:
        model: Trained sklearn-compatible estimator.
        X_eval: Evaluation feature matrix (numpy). Never included in output.
        y_true: True labels/targets (numpy). Never included in output.
        feature_names: Column names for X_eval.
        experiment_id: UUID string of the parent experiment.
        model_name: Human-readable model name.
        problem_type: 'binary_classification' | 'multiclass_classification' | 'regression'.
        target_name: Name of the target column.
        primary_metric: Primary evaluation metric name.
        overall_metric_value: Pre-computed primary metric value on eval set.
        experiment_run_id: Optional UUID of the specific ExperimentRun.
        class_labels: Optional list of class label strings.
        n_shap_background: Number of background samples for KernelExplainer fallback.
        n_permutation_repeats: Number of permutation repeats.
        random_seed: RNG seed for reproducibility.

    Returns:
        ExplainabilityReport — all numeric values are model_derived,
        all text fields are empty until AI narrative is separately added.
    """
    # 1. SHAP global + local
    global_shap, local_explanations = compute_shap_global(
        model=model,
        X_eval=X_eval,
        feature_names=feature_names,
        problem_type=problem_type,
        n_background=n_shap_background,
        max_local_samples=20,
    )

    # 2. Permutation importance
    def _scorer(est, X, y):
        from sklearn.metrics import roc_auc_score, r2_score, mean_squared_error  # type: ignore
        try:
            if hasattr(est, "predict_proba"):
                proba = est.predict_proba(X)[:, 1]
                return float(roc_auc_score(y, proba))
            else:
                preds = est.predict(X)
                return float(r2_score(y, preds))
        except Exception:
            return 0.0

    perm_imp = compute_permutation_importance(
        model=model,
        X_eval=X_eval,
        y_eval=y_true,
        feature_names=feature_names,
        metric_name=primary_metric,
        scorer_fn=_scorer,
        n_repeats=n_permutation_repeats,
        random_state=random_seed,
    )

    # 3. Error analysis
    error_analysis = compute_error_analysis(
        model=model,
        X_eval=X_eval,
        y_true=y_true,
        feature_names=feature_names,
        problem_type=problem_type,
        primary_metric=primary_metric,
        overall_metric_value=overall_metric_value,
        class_labels=class_labels,
    )

    report = ExplainabilityReport(
        schema_version=SCHEMA_VERSION,
        experiment_id=experiment_id,
        experiment_run_id=experiment_run_id,
        model_name=model_name,
        problem_type=problem_type,
        target_name=target_name,
        primary_metric=primary_metric,
        primary_metric_value=overall_metric_value,
        n_eval_samples=X_eval.shape[0],
        explained_at=datetime.now(UTC).isoformat(),
        global_shap=global_shap,
        permutation_importance=perm_imp,
        local_explanations=local_explanations,
        error_analysis=error_analysis,
        ai_narrative=None,       # not set here — added separately by the control plane
        user_assumptions=[],
    )

    return report
