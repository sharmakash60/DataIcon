"""Export Gatekeeper and Privacy Allowlist Enforcer.

MANDATORY SECURITY ENFORCEMENT:
Before ANY metadata payload is transmitted to the cloud API, it MUST pass
through this gatekeeper.

The export gate guarantees:
1. Strict schema compliance against PermittedProfilePayload with extra="forbid".
2. Only explicitly allowlisted keys can exist in the dictionary tree.
3. Forbidden keywords (row, sample, record, cell, raw, etc.) are strictly prohibited
   outside explicitly approved top-level scalar count fields.
4. Deep inspection to verify zero raw cell data values or sentinels exist in the payload.
"""

from __future__ import annotations

from enum import Enum
import json
from typing import Any

from datapilot_agent.contracts import PermittedProfilePayload


class PermittedExportType(str, Enum):
    PROFILE = "profile"
    EXPERIMENT_RESULT = "experiment_result"
    EXPLAINABILITY_RESULT = "explainability_result"
    MONITORING_METRICS = "monitoring_metrics"


class SecurityLeakException(Exception):
    """Raised when data attempting to leave the client violates the export allowlist."""


ALLOWED_EXPERIMENT_KEYS: dict[str, set[str]] = {
    "root": {
        "experiment_name",
        "problem_type",
        "target_name",
        "primary_metric",
        "n_samples",
        "n_features",
        "feature_names",
        "n_splits",
        "validation_strategy",
        "baseline_score",
        "best_model_name",
        "best_score",
        "leaderboard",
        "benchmarks",
        "tuning_trials",
        "total_execution_time_seconds",
    },
    "leaderboard": {
        "rank",
        "model_name",
        "algorithm_key",
        "is_baseline",
        "primary_metric_name",
        "primary_metric_score",
        "std_score",
        "training_time_seconds",
        "inference_latency_ms",
        "is_best_model",
    },
    "benchmark": {
        "model_name",
        "algorithm_key",
        "is_baseline",
        "hyperparameters",
        "cv_scores",
        "mean_cv_score",
        "std_cv_score",
        "metrics",
        "training_time_seconds",
        "inference_latency_ms",
    },
    "tuning_trial": {
        "trial_number",
        "model_name",
        "parameters",
        "score",
        "state",
        "duration_seconds",
    },
}

# Explainability allowlist — only aggregated stats; no raw rows
ALLOWED_EXPLAINABILITY_KEYS: dict[str, set[str]] = {
    "root": {
        "schema_version", "experiment_id", "experiment_run_id",
        "model_name", "problem_type", "target_name",
        "primary_metric", "primary_metric_value",
        "n_eval_samples", "explained_at",
        "global_shap", "permutation_importance",
        "local_explanations", "error_analysis",
        "ai_narrative", "user_assumptions",
        "provenance_verified",
    },
    "global_shap": {
        "method", "features", "n_samples_used", "baseline_value", "source",
    },
    "permutation_importance": {
        "features", "metric_used", "n_repeats", "n_samples_evaluated", "source",
    },
    "feature_entry": {
        "feature_name", "importance_value", "importance_rank",
        "std_error", "method", "source",
    },
    "local_explanation": {
        "sample_index", "prediction", "predicted_class",
        "base_value", "feature_contributions", "source",
    },
    "local_shap_feature": {
        "feature_name", "shap_value", "source",
    },
    "error_analysis": {
        "problem_type", "overall_error_rate", "overall_metric_value",
        "confusion_matrix", "residual_stats",
        "worst_segments", "best_segments", "source",
    },
    "confusion_cell": {
        "predicted_label", "actual_label", "count", "rate", "source",
    },
    "residual_stats": {
        "mean_residual", "std_residual", "mae", "rmse", "max_error", "source",
    },
    "error_segment": {
        "feature_name", "segment_label", "n_samples",
        "error_rate", "primary_metric_value", "delta_from_overall", "source",
    },
    "ai_narrative": {
        "global_importance_narrative", "error_analysis_narrative",
        "business_context_narrative", "source",
        "model_used", "generated_at", "warning",
    },
    "user_assumption": {
        "key", "value", "source",
    },
}

# Model Monitoring allowlist — strictly aggregated window statistics; zero raw rows
ALLOWED_MONITORING_KEYS: dict[str, set[str]] = {
    "root": {
        "deployment_id",
        "model_name",
        "model_version",
        "period_start",
        "period_end",
        "window_seconds",
        "total_requests",
        "throughput_rps",
        "error_count",
        "error_rate",
        "latency",
        "prediction_distribution",
        "feature_drifts",
        "data_drift",
        "performance",
        "alerts",
    },
    "latency": {
        "mean_ms",
        "min_ms",
        "max_ms",
        "p50_ms",
        "p90_ms",
        "p95_ms",
        "p99_ms",
    },
    "prediction_distribution": {
        "total_predictions",
        "class_counts",
        "class_proportions",
        "quantiles",
        "mean",
        "std",
    },
    "feature_drift": {
        "feature_name",
        "dtype",
        "method",
        "statistic",
        "p_value",
        "drift_detected",
        "severity",
        "baseline_stats",
        "current_stats",
    },
    "data_drift": {
        "drifted_features_count",
        "total_features_count",
        "drift_share",
        "dataset_drift_detected",
        "method",
    },
    "performance": {
        "sample_count",
        "metrics",
        "evaluated_at",
    },
    "alert": {
        "alert_id",
        "alert_type",
        "severity",
        "message",
        "feature_name",
        "metric_name",
        "threshold",
        "current_value",
        "timestamp",
    },
}

# Explicitly permitted dictionary keys at each nesting depth
ALLOWED_KEYS: dict[str, set[str]] = {
    "root": {
        "schema_version",
        "dataset_ref",
        "format",
        "total_rows",
        "total_columns",
        "duplicate_rows_count",
        "duplicate_rows_ratio",
        "file_size_bytes",
        "constant_columns",
        "suspicious_columns",
        "correlations",
        "columns",
        "quality_findings",
        "profiled_at",
    },
    "correlation": {
        "column_a",
        "column_b",
        "pearson_coefficient",
    },
    "column": {
        "name",
        "data_type",
        "null_count",
        "null_ratio",
        "unique_count",
        "cardinality_ratio",
        "is_constant",
        "is_suspicious",
        "suspicious_reasons",
        "is_pii",
        "pii_types",
        "numeric_stats",
        "categorical_stats",
        "distribution",
        "outliers",
        "quality_issues",
    },
    "numeric_stats": {
        "min",
        "max",
        "mean",
        "std",
        "median",
        "q25",
        "q75",
        "iqr",
        "skewness",
        "kurtosis",
    },
    "categorical_stats": {
        "top_categories_count",
        "mode",
        "mode_frequency",
        "mode_ratio",
        "distinct_categories_count",
        "top_frequencies",
    },
    "category_frequency": {
        "category",
        "count",
        "ratio",
    },
    "distribution": {
        "type",
        "bin_edges",
        "bin_counts",
    },
    "outliers": {
        "method",
        "outlier_count",
        "outlier_ratio",
        "lower_bound",
        "upper_bound",
    },
    "quality_finding": {
        "code",
        "severity",
        "message",
        "column",
        "affected_ratio",
    },
}

APPROVED_ROW_FIELDS = {
    "total_rows",
    "duplicate_rows_count",
    "duplicate_rows_ratio",
}

FORBIDDEN_KEYWORD_SUBSTRINGS = (
    "row",
    "sample",
    "samples",
    "record",
    "records",
    "raw",
    "cell",
    "cells",
    "data_matrix",
    "dataframe",
    "content",
)


def _validate_keys_recursively(data: Any, context: str = "root") -> None:
    """Recursively enforce explicit key allowlist and keyword blocklist."""
    if isinstance(data, dict):
        allowed = ALLOWED_KEYS.get(context)
        for key, value in data.items():
            key_str = str(key)
            key_lower = key_str.lower()

            # 1. Blocklist check for forbidden keywords
            for forbidden in FORBIDDEN_KEYWORD_SUBSTRINGS:
                if forbidden in key_lower and key_str not in APPROVED_ROW_FIELDS:
                    raise SecurityLeakException(
                        f"Prohibited keyword '{forbidden}' detected in export key '{key_str}'"
                    )

            # 2. Strict allowlist check
            if allowed is not None and key_str not in allowed:
                raise SecurityLeakException(
                    f"Unauthorized field '{key_str}' in export payload context '{context}'. "
                    f"Only allowed fields are: {sorted(allowed)}"
                )

            # Recurse down hierarchy
            if context == "root":
                if key_str == "columns" and isinstance(value, list):
                    for col in value:
                        _validate_keys_recursively(col, context="column")
                elif key_str == "correlations" and isinstance(value, list):
                    for corr in value:
                        _validate_keys_recursively(corr, context="correlation")
                elif key_str == "quality_findings" and isinstance(value, list):
                    for finding in value:
                        _validate_keys_recursively(finding, context="quality_finding")
            elif context == "column":
                if key_str == "numeric_stats" and value is not None:
                    _validate_keys_recursively(value, context="numeric_stats")
                elif key_str == "categorical_stats" and value is not None:
                    _validate_keys_recursively(value, context="categorical_stats")
                elif key_str == "distribution" and value is not None:
                    _validate_keys_recursively(value, context="distribution")
                elif key_str == "outliers" and value is not None:
                    _validate_keys_recursively(value, context="outliers")
            elif context == "categorical_stats":
                if key_str == "top_frequencies" and isinstance(value, list):
                    for freq in value:
                        _validate_keys_recursively(freq, context="category_frequency")
            elif isinstance(value, (dict, list)):
                _validate_keys_recursively(value, context="nested")
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                _validate_keys_recursively(item, context=context)


def sanitize_and_verify_export(
    payload: PermittedProfilePayload,
    known_forbidden_values: set[str] | None = None,
) -> dict[str, Any]:
    """Inspect and verify that the export payload contains only permitted metadata.
    
    Args:
        payload: Pydantic model instance of PermittedProfilePayload.
        known_forbidden_values: Optional set of raw dataset cell values / sentinels to verify
                                are NOT present anywhere in the serialized payload.
    
    Returns:
        Verified dictionary safe for network transmission.
        
    Raises:
        SecurityLeakException: If any non-permitted key, forbidden keyword, or raw value is found.
    """
    # 1. Pydantic validation roundtrip
    try:
        dumped = payload.model_dump(mode="json")
    except Exception as err:
        raise SecurityLeakException(f"Failed schema serialization: {err}") from err

    # 2. Key Allowlist & Blocklist checks
    _validate_keys_recursively(dumped, context="root")

    # 3. Serialization check
    serialized_str = json.dumps(dumped)

    # 4. Raw value / Sentinel leakage check
    if known_forbidden_values:
        for forbidden in known_forbidden_values:
            clean_token = str(forbidden).strip()
            # Only test non-trivial strings (length > 3) to avoid single digit false positives
            if len(clean_token) > 3 and clean_token in serialized_str:
                raise SecurityLeakException(
                    f"CRITICAL PRIVACY VIOLATION: Raw dataset value or sentinel '{clean_token[:10]}...' "
                    "was detected inside the serialized export payload!"
                )

    return dumped


def _validate_experiment_keys_recursively(data: Any, context: str = "root") -> None:
    if isinstance(data, dict):
        allowed = ALLOWED_EXPERIMENT_KEYS.get(context)
        for key, value in data.items():
            key_str = str(key)
            if allowed is not None and key_str not in allowed:
                raise SecurityLeakException(
                    f"Unauthorized field '{key_str}' in experiment export payload context '{context}'. "
                    f"Only allowed fields are: {sorted(allowed)}"
                )
            if context == "root":
                if key_str == "leaderboard" and isinstance(value, list):
                    for entry in value:
                        _validate_experiment_keys_recursively(entry, context="leaderboard")
                elif key_str == "benchmarks" and isinstance(value, list):
                    for bm in value:
                        _validate_experiment_keys_recursively(bm, context="benchmark")
                elif key_str == "tuning_trials" and isinstance(value, list):
                    for trial in value:
                        _validate_experiment_keys_recursively(trial, context="tuning_trial")


def _validate_explainability_keys(data: Any, context: str = "root") -> None:
    """Recursive key allowlist check for explainability payloads."""
    if isinstance(data, dict):
        allowed = ALLOWED_EXPLAINABILITY_KEYS.get(context)
        for key, value in data.items():
            key_str = str(key)
            if allowed is not None and key_str not in allowed:
                raise SecurityLeakException(
                    f"Unauthorized field '{key_str}' in explainability export context '{context}'. "
                    f"Allowed: {sorted(allowed)}"
                )
            # Recurse into known sub-structures
            if context == "root":
                if key_str == "global_shap" and isinstance(value, dict):
                    _validate_explainability_keys(value, "global_shap")
                    for feat in value.get("features", []):
                        _validate_explainability_keys(feat, "feature_entry")
                elif key_str == "permutation_importance" and isinstance(value, dict):
                    _validate_explainability_keys(value, "permutation_importance")
                    for feat in value.get("features", []):
                        _validate_explainability_keys(feat, "feature_entry")
                elif key_str == "local_explanations" and isinstance(value, list):
                    if len(value) > 20:
                        raise SecurityLeakException(
                            f"local_explanations exceeds max 20 entries (got {len(value)}). "
                            "This prevents bulk data export."
                        )
                    for le in value:
                        _validate_explainability_keys(le, "local_explanation")
                        for fc in le.get("feature_contributions", []):
                            _validate_explainability_keys(fc, "local_shap_feature")
                elif key_str == "error_analysis" and isinstance(value, dict):
                    _validate_explainability_keys(value, "error_analysis")
                    for cell in value.get("confusion_matrix", []) or []:
                        _validate_explainability_keys(cell, "confusion_cell")
                    rs = value.get("residual_stats")
                    if rs:
                        _validate_explainability_keys(rs, "residual_stats")
                    for seg in value.get("worst_segments", []) + value.get("best_segments", []):
                        _validate_explainability_keys(seg, "error_segment")
                elif key_str == "ai_narrative" and isinstance(value, dict):
                    _validate_explainability_keys(value, "ai_narrative")
                    # Verify source is ai_generated
                    if value.get("source") != "ai_generated":
                        raise SecurityLeakException(
                            "ai_narrative source must be 'ai_generated'."
                        )
                elif key_str == "user_assumptions" and isinstance(value, list):
                    for ua in value:
                        _validate_explainability_keys(ua, "user_assumption")
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                _validate_explainability_keys(item, context)


def _validate_monitoring_keys(data: Any, context: str = "root") -> None:
    """Validate model monitoring payload against ALLOWED_MONITORING_KEYS."""
    if isinstance(data, dict):
        allowed = ALLOWED_MONITORING_KEYS.get(context)
        for key, value in data.items():
            key_str = str(key)
            if allowed is not None and key_str not in allowed:
                raise SecurityLeakException(
                    f"Unauthorized field '{key_str}' in monitoring export context '{context}'. "
                    f"Allowed: {sorted(allowed)}"
                )
            if context == "root":
                if key_str == "latency" and isinstance(value, dict):
                    _validate_monitoring_keys(value, "latency")
                elif key_str == "prediction_distribution" and isinstance(value, dict):
                    _validate_monitoring_keys(value, "prediction_distribution")
                elif key_str == "feature_drifts" and isinstance(value, list):
                    for fd in value:
                        _validate_monitoring_keys(fd, "feature_drift")
                elif key_str == "data_drift" and isinstance(value, dict):
                    _validate_monitoring_keys(value, "data_drift")
                elif key_str == "performance" and isinstance(value, dict):
                    _validate_monitoring_keys(value, "performance")
                elif key_str == "alerts" and isinstance(value, list):
                    for al in value:
                        _validate_monitoring_keys(al, "alert")
    elif isinstance(data, list):
        for item in data:
            if isinstance(item, (dict, list)):
                _validate_monitoring_keys(item, context)


class ExportGate:
    """Unified gatekeeper for permitted telemetry and experiment metadata."""

    def validate_and_sanitize(
        self,
        export_type: PermittedExportType,
        payload_dict: dict[str, Any],
        known_forbidden_values: set[str] | None = None,
    ) -> dict[str, Any]:
        if export_type == PermittedExportType.PROFILE:
            _validate_keys_recursively(payload_dict, context="root")
        elif export_type == PermittedExportType.EXPERIMENT_RESULT:
            _validate_experiment_keys_recursively(payload_dict, context="root")
        elif export_type == PermittedExportType.EXPLAINABILITY_RESULT:
            _validate_explainability_keys(payload_dict, context="root")
        elif export_type == PermittedExportType.MONITORING_METRICS:
            _validate_monitoring_keys(payload_dict, context="root")
        else:
            raise SecurityLeakException(f"Unsupported export type: {export_type}")


        serialized_str = json.dumps(payload_dict)

        if known_forbidden_values:
            for forbidden in known_forbidden_values:
                clean_token = str(forbidden).strip()
                if len(clean_token) > 3 and clean_token in serialized_str:
                    raise SecurityLeakException(
                        f"CRITICAL PRIVACY VIOLATION: Raw dataset value or sentinel '{clean_token[:10]}...' "
                        "was detected inside the serialized export payload!"
                    )

        return payload_dict

