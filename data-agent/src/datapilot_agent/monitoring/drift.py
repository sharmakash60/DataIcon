"""Statistical Drift Detection Engine for DataPilot Client Monitoring.

Calculates:
- Population Stability Index (PSI) for numeric and categorical distributions
- Two-Sample Kolmogorov-Smirnov (KS) test for numeric continuous variables
- Aggregate Dataset Data Drift score across all input features
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Sequence, Tuple
import numpy as np
import pandas as pd

from datapilot_agent.monitoring.schema import DataDriftSummary, FeatureDriftResult

logger = logging.getLogger("datapilot_agent.monitoring.drift")


def calculate_psi(
    baseline: np.ndarray,
    current: np.ndarray,
    num_buckets: int = 10,
    epsilon: float = 1e-4,
) -> float:
    """Calculate Population Stability Index (PSI) between baseline and current numeric samples."""
    b_clean = baseline[~np.isnan(baseline)]
    c_clean = current[~np.isnan(current)]

    if len(b_clean) == 0 or len(c_clean) == 0:
        return 0.0

    # Determine quantile bin edges from baseline
    quantiles = np.linspace(0, 100, num_buckets + 1)
    try:
        bin_edges = np.percentile(b_clean, quantiles)
    except Exception:
        return 0.0

    # Ensure strictly increasing edges to prevent duplicate bins
    bin_edges = np.unique(bin_edges)
    if len(bin_edges) < 2:
        # Uniform or constant data
        return 0.0

    bin_edges[0] = -np.inf
    bin_edges[-1] = np.inf

    # Compute frequencies in bins
    b_counts, _ = np.histogram(b_clean, bins=bin_edges)
    c_counts, _ = np.histogram(c_clean, bins=bin_edges)

    b_pct = b_counts / len(b_clean)
    c_pct = c_counts / len(c_clean)

    # Apply smoothing epsilon
    b_pct = np.clip(b_pct, epsilon, 1.0)
    c_pct = np.clip(c_pct, epsilon, 1.0)

    # Normalize back to sum = 1
    b_pct = b_pct / np.sum(b_pct)
    c_pct = c_pct / np.sum(c_pct)

    # PSI = sum((Actual% - Expected%) * ln(Actual% / Expected%))
    psi_value = np.sum((c_pct - b_pct) * np.log(c_pct / b_pct))
    return round(float(np.maximum(0.0, psi_value)), 4)


def calculate_categorical_psi(
    baseline: Sequence[Any],
    current: Sequence[Any],
    epsilon: float = 1e-4,
) -> float:
    """Calculate Population Stability Index (PSI) between two categorical distributions."""
    b_series = pd.Series(list(baseline)).dropna()
    c_series = pd.Series(list(current)).dropna()

    if len(b_series) == 0 or len(c_series) == 0:
        return 0.0

    all_categories = set(b_series.unique()).union(set(c_series.unique()))
    if not all_categories:
        return 0.0

    b_freq = b_series.value_counts(normalize=True).to_dict()
    c_freq = c_series.value_counts(normalize=True).to_dict()

    b_probs = np.array([b_freq.get(cat, epsilon) for cat in all_categories])
    c_probs = np.array([c_freq.get(cat, epsilon) for cat in all_categories])

    b_probs = np.clip(b_probs, epsilon, 1.0)
    c_probs = np.clip(c_probs, epsilon, 1.0)

    b_probs = b_probs / np.sum(b_probs)
    c_probs = c_probs / np.sum(c_probs)

    psi_val = np.sum((c_probs - b_probs) * np.log(c_probs / b_probs))
    return round(float(np.maximum(0.0, psi_val)), 4)


def calculate_ks_test(baseline: np.ndarray, current: np.ndarray) -> Tuple[float, float]:
    """Calculate Two-Sample Kolmogorov-Smirnov test statistic and approximate p-value."""
    b_clean = baseline[~np.isnan(baseline)]
    c_clean = current[~np.isnan(current)]

    n1 = len(b_clean)
    n2 = len(c_clean)
    if n1 == 0 or n2 == 0:
        return 0.0, 1.0

    # Sort samples to compute empirical cumulative distribution functions (ECDF)
    all_vals = np.sort(np.concatenate([b_clean, c_clean]))
    b_cdf = np.searchsorted(np.sort(b_clean), all_vals, side="right") / n1
    c_cdf = np.searchsorted(np.sort(c_clean), all_vals, side="right") / n2

    ks_stat = float(np.max(np.abs(b_cdf - c_cdf)))

    # Compute asymptotic Kolmogorov p-value
    en = np.sqrt(n1 * n2 / (n1 + n2))
    lambda_val = (en + 0.12 + 0.11 / en) * ks_stat

    # Kolmogorov distribution approximation: 2 * sum_{j=1..100} (-1)^(j-1) * exp(-2 * j^2 * lambda^2)
    p_val = 1.0
    if lambda_val > 0.0:
        j = np.arange(1, 101)
        terms = 2.0 * ((-1) ** (j - 1)) * np.exp(-2.0 * (j ** 2) * (lambda_val ** 2))
        p_val = float(np.clip(np.sum(terms), 0.0, 1.0))

    return round(ks_stat, 4), round(p_val, 4)


def compute_feature_drift(
    feature_name: str,
    baseline_vals: Sequence[Any],
    current_vals: Sequence[Any],
    dtype: str = "numeric",
) -> FeatureDriftResult:
    """Evaluate drift for a single feature between baseline and production window."""
    if dtype == "numeric":
        b_arr = np.array(baseline_vals, dtype=float)
        c_arr = np.array(current_vals, dtype=float)

        ks_stat, p_val = calculate_ks_test(b_arr, c_arr)
        psi_val = calculate_psi(b_arr, c_arr)

        # Baseline summary stats (zero raw values)
        b_clean = b_arr[~np.isnan(b_arr)]
        c_clean = c_arr[~np.isnan(c_arr)]

        b_stats: Dict[str, Any] = {
            "mean": round(float(np.mean(b_clean)), 2) if len(b_clean) > 0 else 0.0,
            "std": round(float(np.std(b_clean)), 2) if len(b_clean) > 0 else 0.0,
            "p50": round(float(np.percentile(b_clean, 50)), 2) if len(b_clean) > 0 else 0.0,
        }
        c_stats: Dict[str, Any] = {
            "mean": round(float(np.mean(c_clean)), 2) if len(c_clean) > 0 else 0.0,
            "std": round(float(np.std(c_clean)), 2) if len(c_clean) > 0 else 0.0,
            "p50": round(float(np.percentile(c_clean, 50)), 2) if len(c_clean) > 0 else 0.0,
        }

        drift_detected = bool(p_val < 0.05 or psi_val >= 0.1)
        if psi_val >= 0.2 or (p_val < 0.01 and ks_stat >= 0.25):
            severity = "critical"
        elif drift_detected:
            severity = "warning"
        else:
            severity = "none"

        return FeatureDriftResult(
            feature_name=feature_name,
            dtype="numeric",
            method="ks_test",
            statistic=ks_stat,
            p_value=p_val,
            drift_detected=drift_detected,
            severity=severity,
            baseline_stats=b_stats,
            current_stats=c_stats,
        )

    else:  # Categorical
        b_list = list(baseline_vals)
        c_list = list(current_vals)
        psi_val = calculate_categorical_psi(b_list, c_list)

        b_series = pd.Series(b_list).dropna()
        c_series = pd.Series(c_list).dropna()

        b_stats = b_series.value_counts(normalize=True).head(5).round(3).to_dict()
        c_stats = c_series.value_counts(normalize=True).head(5).round(3).to_dict()

        drift_detected = bool(psi_val >= 0.1)
        if psi_val >= 0.2:
            severity = "critical"
        elif drift_detected:
            severity = "warning"
        else:
            severity = "none"

        return FeatureDriftResult(
            feature_name=feature_name,
            dtype="categorical",
            method="psi",
            statistic=psi_val,
            p_value=None,
            drift_detected=drift_detected,
            severity=severity,
            baseline_stats={"top_classes": b_stats},
            current_stats={"top_classes": c_stats},
        )


def compute_dataset_drift(
    feature_drifts: List[FeatureDriftResult],
    drift_share_threshold: float = 0.33,
) -> DataDriftSummary:
    """Compute dataset-level aggregate data drift based on fraction of drifted features."""
    total = len(feature_drifts)
    if total == 0:
        return DataDriftSummary(
            drifted_features_count=0,
            total_features_count=0,
            drift_share=0.0,
            dataset_drift_detected=False,
        )

    drifted_count = sum(1 for f in feature_drifts if f.drift_detected)
    drift_share = round(drifted_count / total, 4)
    dataset_drift = drift_share >= drift_share_threshold

    return DataDriftSummary(
        drifted_features_count=drifted_count,
        total_features_count=total,
        drift_share=drift_share,
        dataset_drift_detected=dataset_drift,
        method="aggregate_share",
    )
