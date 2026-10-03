"""Model Monitoring Engine.

Coordinates:
- Local prediction and ground truth collection
- Feature and dataset drift computation against baseline
- Latency percentiles, throughput, and error rate tracking
- Prediction distribution calculation
- Model performance evaluation on matched ground truth
- Multi-dimensional alerting (drift, latency spike, error spike, performance degradation)
- Strict Export Gatekeeper enforcement ensuring zero raw data rows escape
"""

from __future__ import annotations

import datetime
import logging
from typing import Any, Dict, List, Optional, Sequence
import numpy as np
import pandas as pd

from datapilot_agent.export_gate import ExportGate, PermittedExportType
from datapilot_agent.monitoring.collector import PredictionCollector
from datapilot_agent.monitoring.drift import compute_dataset_drift, compute_feature_drift
from datapilot_agent.monitoring.evaluator import PerformanceEvaluator
from datapilot_agent.monitoring.schema import (
    AggregateMonitoringSnapshot,
    DataDriftSummary,
    FeatureDriftResult,
    FeatureFieldSchema,
    GroundTruthSubmission,
    LatencySummary,
    MonitoringAlert,
    PerformanceMetrics,
    PredictionDistribution,
)

logger = logging.getLogger("datapilot_agent.monitoring.engine")


class ModelMonitoringEngine:
    """Orchestrates local model telemetry, drift detection, and performance evaluation."""

    def __init__(
        self,
        model_name: str,
        model_version: str = "v1.0.0",
        problem_type: str = "classification",
        feature_schema: Optional[List[FeatureFieldSchema]] = None,
        baseline_data: Optional[pd.DataFrame] = None,
        baseline_metrics: Optional[Dict[str, float]] = None,
        primary_metric: str = "accuracy",
        latency_p95_threshold_ms: float = 500.0,
        error_rate_threshold: float = 0.05,
        deployment_id: Optional[str] = None,
    ):
        self.model_name = model_name
        self.model_version = model_version
        self.problem_type = problem_type
        self.feature_schema = feature_schema or []
        self.baseline_data = baseline_data
        self.baseline_metrics = baseline_metrics or {}
        self.primary_metric = primary_metric
        self.latency_p95_threshold_ms = latency_p95_threshold_ms
        self.error_rate_threshold = error_rate_threshold
        self.deployment_id = deployment_id

        self.collector = PredictionCollector()
        self.evaluator = PerformanceEvaluator(
            problem_type=self.problem_type,
            baseline_metrics=self.baseline_metrics,
            primary_metric=self.primary_metric,
        )
        self.export_gate = ExportGate()

        # Cache baseline feature values for fast drift comparison
        self._baseline_feature_cache: Dict[str, Sequence[Any]] = {}
        if self.baseline_data is not None and not self.baseline_data.empty:
            for col in self.baseline_data.columns:
                self._baseline_feature_cache[col] = self.baseline_data[col].dropna().tolist()

    def record_inference(
        self,
        request_id: str,
        features: Dict[str, Any],
        prediction: Any,
        latency_ms: float,
        probabilities: Optional[Dict[str, float]] = None,
        is_error: bool = False,
        error_type: Optional[str] = None,
    ) -> None:
        """Record an individual inference call into local client memory."""
        self.collector.record_prediction(
            request_id=request_id,
            features=features,
            prediction=prediction,
            latency_ms=latency_ms,
            probabilities=probabilities,
            is_error=is_error,
            error_type=error_type,
        )

    def record_ground_truth(self, request_id: str, actual: Any) -> bool:
        """Match actual outcome to recorded inference locally."""
        return self.collector.record_ground_truth(request_id, actual)

    def record_ground_truth_batch(self, submissions: List[GroundTruthSubmission]) -> int:
        """Batch match actual outcomes locally."""
        return self.collector.record_ground_truth_batch(submissions)

    def compute_snapshot(
        self,
        window_seconds: Optional[float] = None,
        validate_gate: bool = True,
    ) -> AggregateMonitoringSnapshot:
        """Compute authoritative aggregate monitoring snapshot over recent inference window."""
        records = self.collector.get_records(window_seconds)
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        period_end = now_utc.isoformat()

        effective_window = window_seconds or 3600.0
        period_start = (now_utc - datetime.timedelta(seconds=effective_window)).isoformat()

        total_requests = len(records)
        alerts: List[MonitoringAlert] = []

        # 1. Latency summary
        if total_requests > 0:
            latencies = np.array([r.latency_ms for r in records if r.latency_ms is not None])
            if len(latencies) > 0:
                lat_summary = LatencySummary(
                    mean_ms=round(float(np.mean(latencies)), 2),
                    min_ms=round(float(np.min(latencies)), 2),
                    max_ms=round(float(np.max(latencies)), 2),
                    p50_ms=round(float(np.percentile(latencies, 50)), 2),
                    p90_ms=round(float(np.percentile(latencies, 90)), 2),
                    p95_ms=round(float(np.percentile(latencies, 95)), 2),
                    p99_ms=round(float(np.percentile(latencies, 99)), 2),
                )
            else:
                lat_summary = LatencySummary(mean_ms=0.0, min_ms=0.0, max_ms=0.0, p50_ms=0.0, p90_ms=0.0, p95_ms=0.0, p99_ms=0.0)
        else:
            lat_summary = LatencySummary(mean_ms=0.0, min_ms=0.0, max_ms=0.0, p50_ms=0.0, p90_ms=0.0, p95_ms=0.0, p99_ms=0.0)

        # Check Latency Alert
        if lat_summary.p95_ms > self.latency_p95_threshold_ms:
            alerts.append(
                MonitoringAlert(
                    alert_type="latency_spike",
                    severity="warning" if lat_summary.p95_ms < self.latency_p95_threshold_ms * 2 else "critical",
                    message=(
                        f"P95 Latency spike detected: {lat_summary.p95_ms}ms "
                        f"(threshold: {self.latency_p95_threshold_ms}ms)."
                    ),
                    metric_name="latency_p95_ms",
                    threshold=self.latency_p95_threshold_ms,
                    current_value=lat_summary.p95_ms,
                )
            )

        # 2. Throughput & Error Rate
        throughput = round(total_requests / effective_window, 3) if effective_window > 0 else 0.0
        error_count = sum(1 for r in records if r.is_error)
        error_rate = round(error_count / total_requests, 4) if total_requests > 0 else 0.0

        # Check Error Rate Alert
        if error_rate > self.error_rate_threshold and total_requests >= 5:
            alerts.append(
                MonitoringAlert(
                    alert_type="error_spike",
                    severity="critical" if error_rate > self.error_rate_threshold * 2 else "warning",
                    message=f"Error rate elevated to {round(error_rate * 100, 1)}% (threshold: {round(self.error_rate_threshold * 100, 1)}%).",
                    metric_name="error_rate",
                    threshold=self.error_rate_threshold,
                    current_value=error_rate,
                )
            )

        # 3. Prediction Distribution
        valid_predictions = [r.prediction for r in records if not r.is_error and r.prediction is not None]
        if self.problem_type == "classification":
            str_preds = [str(p) for p in valid_predictions]
            counts = pd.Series(str_preds).value_counts().to_dict() if str_preds else {}
            proportions = {k: round(v / len(str_preds), 4) for k, v in counts.items()} if str_preds else {}
            pred_dist = PredictionDistribution(
                total_predictions=len(valid_predictions),
                class_counts=counts,
                class_proportions=proportions,
            )
        else:  # Regression
            num_preds = np.array([float(p) for p in valid_predictions if p is not None])
            if len(num_preds) > 0:
                q_dict = {
                    "p10": round(float(np.percentile(num_preds, 10)), 2),
                    "p25": round(float(np.percentile(num_preds, 25)), 2),
                    "p50": round(float(np.percentile(num_preds, 50)), 2),
                    "p75": round(float(np.percentile(num_preds, 75)), 2),
                    "p90": round(float(np.percentile(num_preds, 90)), 2),
                }
                pred_dist = PredictionDistribution(
                    total_predictions=len(num_preds),
                    quantiles=q_dict,
                    mean=round(float(np.mean(num_preds)), 2),
                    std=round(float(np.std(num_preds)), 2),
                )
            else:
                pred_dist = PredictionDistribution(total_predictions=0)

        # 4. Feature Drift & Dataset Data Drift
        feature_drifts: List[FeatureDriftResult] = []
        if total_requests >= 5 and self._baseline_feature_cache:
            # Build current window DataFrame
            feature_dicts = [r.features for r in records if not r.is_error]
            curr_df = pd.DataFrame(feature_dicts)

            for feat_name, base_vals in self._baseline_feature_cache.items():
                if feat_name in curr_df.columns:
                    curr_vals = curr_df[feat_name].dropna().tolist()
                    if len(curr_vals) >= 5:
                        # Determine dtype
                        dtype = "numeric"
                        schema_match = next((f for f in self.feature_schema if f.name == feat_name), None)
                        if schema_match and schema_match.dtype == "categorical":
                            dtype = "categorical"
                        elif not np.issubdtype(np.array(curr_vals).dtype, np.number):
                            dtype = "categorical"

                        f_drift = compute_feature_drift(feat_name, base_vals, curr_vals, dtype=dtype)
                        feature_drifts.append(f_drift)

                        if f_drift.drift_detected:
                            alerts.append(
                                MonitoringAlert(
                                    alert_type="feature_drift",
                                    severity=f_drift.severity,
                                    message=(
                                        f"Drift detected in feature '{feat_name}' ({f_drift.method} "
                                        f"stat: {f_drift.statistic:.4f}, p-val: {f_drift.p_value})."
                                    ),
                                    feature_name=feat_name,
                                    metric_name=f"{f_drift.method}_statistic",
                                    threshold=0.1 if f_drift.method == "psi" else 0.05,
                                    current_value=f_drift.statistic,
                                )
                            )

            data_drift = compute_dataset_drift(feature_drifts)
            if data_drift.dataset_drift_detected:
                alerts.append(
                    MonitoringAlert(
                        alert_type="data_drift",
                        severity="critical" if data_drift.drift_share >= 0.5 else "warning",
                        message=(
                            f"Dataset-level data drift detected: {round(data_drift.drift_share * 100, 1)}% "
                            f"of features drifted ({data_drift.drifted_features_count}/{data_drift.total_features_count})."
                        ),
                        metric_name="drift_share",
                        threshold=0.33,
                        current_value=data_drift.drift_share,
                    )
                )
        else:
            data_drift = DataDriftSummary(
                drifted_features_count=0,
                total_features_count=len(self.feature_schema),
                drift_share=0.0,
                dataset_drift_detected=False,
            )

        # 5. Ground Truth Performance Evaluation
        y_true, y_pred, y_prob = self.collector.get_matched_ground_truth(window_seconds)
        perf_metrics, perf_alerts = self.evaluator.evaluate(y_true, y_pred, y_prob)
        alerts.extend(perf_alerts)

        snapshot = AggregateMonitoringSnapshot(
            deployment_id=self.deployment_id,
            model_name=self.model_name,
            model_version=self.model_version,
            period_start=period_start,
            period_end=period_end,
            window_seconds=effective_window,
            total_requests=total_requests,
            throughput_rps=throughput,
            error_count=error_count,
            error_rate=error_rate,
            latency=lat_summary,
            prediction_distribution=pred_dist,
            feature_drifts=feature_drifts,
            data_drift=data_drift,
            performance=perf_metrics,
            alerts=alerts,
        )

        # Validate through export gatekeeper
        if validate_gate:
            self.export_gate.validate_and_sanitize(
                PermittedExportType.MONITORING_METRICS,
                snapshot.model_dump(),
            )

        return snapshot
