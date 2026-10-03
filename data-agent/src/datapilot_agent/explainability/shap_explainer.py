"""SHAP-based feature importance explainer (runs entirely inside the Client Data Plane).

PRIVACY CONTRACT:
- Only SHAP value *statistics* (mean absolute, rank, std) leave this module.
- Individual SHAP value vectors for each sample are available locally for
  visualization but are capped at MAX_LOCAL_SAMPLES before export.
- Raw dataset rows are NEVER included in any output.
"""

from __future__ import annotations

import warnings
from datetime import UTC, datetime
from typing import Any, List, Optional

import numpy as np

from datapilot_agent.explainability.schema import (
    ExplainabilityReport,
    FeatureImportanceEntry,
    GlobalFeatureImportance,
    LocalExplanation,
    LocalSHAPFeature,
    ProvenanceSource,
    SCHEMA_VERSION,
)

MAX_LOCAL_SAMPLES = 20  # hard cap — prevents bulk data export


def _try_import_shap():
    try:
        import shap  # type: ignore
        return shap
    except ImportError:
        return None


def compute_shap_global(
    model: Any,
    X_eval: "np.ndarray",
    feature_names: List[str],
    problem_type: str,
    n_background: int = 100,
    max_local_samples: int = MAX_LOCAL_SAMPLES,
) -> tuple[Optional[GlobalFeatureImportance], List[LocalExplanation]]:
    """Compute SHAP global and local (per-sample) importances.

    Returns (GlobalFeatureImportance, [LocalExplanation, ...]).
    The local explanation list is capped at max_local_samples.
    Raw X_eval rows are never included in any returned object.
    """
    shap_mod = _try_import_shap()
    if shap_mod is None:
        warnings.warn("shap not installed; skipping SHAP computation.", stacklevel=2)
        return None, []

    n_rows, n_cols = X_eval.shape
    n_background_actual = min(n_background, n_rows)
    background = X_eval[:n_background_actual]

    try:
        # Try TreeExplainer first (works for RF, XGB, LGB, CatBoost)
        explainer = shap_mod.TreeExplainer(model)
        shap_values = explainer.shap_values(X_eval)
        ev = explainer.expected_value
        if hasattr(ev, "__len__"):
            base_value = float(ev[1] if len(ev) > 1 else ev[0])
        else:
            base_value = float(ev)
    except Exception:
        try:
            # Fallback: KernelExplainer (model-agnostic, slower)
            explainer = shap_mod.KernelExplainer(
                model.predict_proba if hasattr(model, "predict_proba") else model.predict,
                background,
            )
            shap_values = explainer.shap_values(X_eval[:min(50, n_rows)])
            ev = explainer.expected_value
            if hasattr(ev, "__len__"):
                base_value = float(ev[1] if len(ev) > 1 else ev[0])
            else:
                base_value = float(ev)
        except Exception as e:
            warnings.warn(f"SHAP computation failed: {e}", stacklevel=2)
            return None, []

    # Handle list or ndarray returns from SHAP
    if isinstance(shap_values, list):
        if len(shap_values) == 2:
            sv = np.array(shap_values[1])
        elif len(shap_values) > 0:
            sv = np.array(shap_values[0])
        else:
            sv = np.array([])
    else:
        sv = np.array(shap_values)

    if sv.ndim == 3:
        # (n_samples, n_features, n_classes) or (n_samples, n_classes, n_features)
        if sv.shape[1] == len(feature_names):
            if sv.shape[2] == 2:
                sv = sv[:, :, 1]
            else:
                sv = np.mean(np.abs(sv), axis=2)
        elif sv.shape[2] == len(feature_names):
            if sv.shape[1] == 2:
                sv = sv[:, 1, :]
            else:
                sv = np.mean(np.abs(sv), axis=1)

    if sv.ndim == 1:
        sv = sv.reshape(1, -1)

    # ── Global importance: mean(|SHAP|) per feature ───────────────────────────
    mean_abs_shap = np.mean(np.abs(sv), axis=0)
    std_shap = np.std(np.abs(sv), axis=0)
    ranked_idx = np.argsort(mean_abs_shap)[::-1]

    features = []
    for rank, idx in enumerate(ranked_idx, start=1):
        fn = feature_names[idx] if idx < len(feature_names) else f"feature_{idx}"
        features.append(
            FeatureImportanceEntry(
                feature_name=fn,
                importance_value=float(mean_abs_shap[idx]),
                importance_rank=rank,
                std_error=float(std_shap[idx]),
                method="shap_global",
                source=ProvenanceSource.MODEL_DERIVED,
            )
        )

    global_shap = GlobalFeatureImportance(
        method="shap_global",
        features=features,
        n_samples_used=sv.shape[0],
        baseline_value=base_value,
        source=ProvenanceSource.MODEL_DERIVED,
    )

    # ── Local explanations: capped at max_local_samples ───────────────────────
    # Select representative samples: worst + best predictions only (not raw rows).
    X_sub = X_eval[: sv.shape[0]]
    try:
        preds = model.predict_proba(X_sub)[:, 1] if hasattr(model, "predict_proba") else model.predict(X_sub)
    except Exception:
        preds = np.zeros(sv.shape[0])

    n_local = min(max_local_samples, sv.shape[0])
    # Interleave highest and lowest confidence samples for diversity
    sorted_by_conf = np.argsort(preds)
    low_conf_idx = sorted_by_conf[: n_local // 2]
    high_conf_idx = sorted_by_conf[-(n_local - n_local // 2):]
    sample_indices = np.unique(np.concatenate([low_conf_idx, high_conf_idx]))[:max_local_samples]

    local_explanations: List[LocalExplanation] = []
    for sample_idx in sample_indices:
        row_shap = sv[sample_idx]
        contribs = [
            LocalSHAPFeature(
                feature_name=feature_names[fi] if fi < len(feature_names) else f"feature_{fi}",
                shap_value=float(row_shap[fi]),
                source=ProvenanceSource.MODEL_DERIVED,
            )
            for fi in range(len(row_shap))
        ]
        local_explanations.append(
            LocalExplanation(
                sample_index=int(sample_idx),
                prediction=float(preds[sample_idx]),
                base_value=base_value,
                feature_contributions=contribs,
                source=ProvenanceSource.MODEL_DERIVED,
            )
        )

    return global_shap, local_explanations
