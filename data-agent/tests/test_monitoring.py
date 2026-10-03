"""Comprehensive Unit & Security Tests for DataPilot Model Monitoring Engine.

Verifies:
1. Latency percentiles (p50, p90, p95, p99) and throughput calculations
2. Error count and error rate spike alerting
3. Prediction distribution tracking (class proportions and regression quantiles)
4. Statistical feature drift (KS-test, numeric & categorical PSI)
5. Aggregate dataset-level data drift detection
6. Ground truth performance evaluation and degradation alerts
7. Local REST endpoints (GET /monitoring/metrics, POST /monitoring/ground-truth, GET /monitoring/alerts)
8. Export Gatekeeper enforcement ensuring zero raw rows or values in monitoring export
"""

from __future__ import annotations

import json
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier

from datapilot_agent.automl.preprocessing import TabularPreprocessor
from datapilot_agent.export_gate import ExportGate, PermittedExportType, SecurityLeakException
from datapilot_agent.monitoring.drift import (
    calculate_categorical_psi,
    calculate_ks_test,
    calculate_psi,
    compute_dataset_drift,
    compute_feature_drift,
)
from datapilot_agent.monitoring.engine import ModelMonitoringEngine
from datapilot_agent.monitoring.evaluator import PerformanceEvaluator
from datapilot_agent.monitoring.schema import GroundTruthSubmission
from datapilot_agent.serving.artifact import ModelArtifactBundle
from datapilot_agent.serving.predictor import LocalPredictor
from datapilot_agent.serving.schema import FeatureFieldSchema
from datapilot_agent.serving.server import create_serving_app


@pytest.fixture
def baseline_dataframe() -> pd.DataFrame:
    np.random.seed(42)
    n = 200
    return pd.DataFrame(
        {
            "age": np.random.normal(40, 10, size=n),
            "balance": np.random.normal(50000, 15000, size=n),
            "tier": np.random.choice(["bronze", "silver", "gold"], size=n, p=[0.5, 0.3, 0.2]),
        }
    )


@pytest.fixture
def monitoring_engine(baseline_dataframe: pd.DataFrame) -> ModelMonitoringEngine:
    schema = [
        FeatureFieldSchema(name="age", dtype="numeric"),
        FeatureFieldSchema(name="balance", dtype="numeric"),
        FeatureFieldSchema(name="tier", dtype="categorical"),
    ]
    return ModelMonitoringEngine(
        model_name="Customer Churn Predictor",
        model_version="v1.0.0",
        problem_type="classification",
        feature_schema=schema,
        baseline_data=baseline_dataframe,
        baseline_metrics={"accuracy": 0.90, "f1": 0.88},
        primary_metric="accuracy",
        latency_p95_threshold_ms=100.0,
        error_rate_threshold=0.10,
    )


# --- Test 1: Latency & Throughput Tracking ---
def test_latency_and_throughput(monitoring_engine: ModelMonitoringEngine):
    for i in range(20):
        monitoring_engine.record_inference(
            request_id=f"req_{i}",
            features={"age": 35, "balance": 45000, "tier": "silver"},
            prediction=0,
            latency_ms=10.0 + (i * 2.0),
        )

    snapshot = monitoring_engine.compute_snapshot(window_seconds=10.0)
    assert snapshot.total_requests == 20
    assert snapshot.latency.min_ms == 10.0
    assert snapshot.latency.max_ms == 48.0
    assert snapshot.latency.p50_ms >= 25.0
    assert snapshot.throughput_rps > 0.0
    assert snapshot.error_rate == 0.0


# --- Test 2: Error Rate & Error Spike Alerts ---
def test_error_rate_and_alert(monitoring_engine: ModelMonitoringEngine):
    # 5 successful inferences + 5 errors (50% error rate > 10% threshold)
    for i in range(5):
        monitoring_engine.record_inference(
            request_id=f"ok_{i}",
            features={"age": 30},
            prediction=0,
            latency_ms=15.0,
            is_error=False,
        )
    for i in range(5):
        monitoring_engine.record_inference(
            request_id=f"err_{i}",
            features={"age": 30},
            prediction=None,
            latency_ms=0.0,
            is_error=True,
            error_type="ValueError",
        )

    snapshot = monitoring_engine.compute_snapshot(window_seconds=60.0)
    assert snapshot.total_requests == 10
    assert snapshot.error_count == 5
    assert snapshot.error_rate == 0.5

    # Verify error spike alert triggered
    error_alerts = [a for a in snapshot.alerts if a.alert_type == "error_spike"]
    assert len(error_alerts) == 1
    assert error_alerts[0].severity == "critical"
    assert "Error rate elevated" in error_alerts[0].message


# --- Test 3: Prediction Distribution ---
def test_prediction_distribution_classification(monitoring_engine: ModelMonitoringEngine):
    for _ in range(7):
        monitoring_engine.record_inference("id", {}, prediction=0, latency_ms=5.0)
    for _ in range(3):
        monitoring_engine.record_inference("id", {}, prediction=1, latency_ms=5.0)

    snapshot = monitoring_engine.compute_snapshot()
    dist = snapshot.prediction_distribution
    assert dist.total_predictions == 10
    assert dist.class_counts == {"0": 7, "1": 3}
    assert dist.class_proportions == {"0": 0.7, "1": 0.3}


# --- Test 4: Statistical Feature Drift & Dataset Drift ---
def test_statistical_drift_algorithms():
    np.random.seed(42)
    # Identical distributions -> KS stat ~ 0, p-val ~ 1, PSI ~ 0
    base = np.random.normal(50, 10, size=500)
    curr_same = np.random.normal(50, 10, size=500)

    ks_stat_same, p_val_same = calculate_ks_test(base, curr_same)
    psi_same = calculate_psi(base, curr_same)

    assert ks_stat_same < 0.15
    assert p_val_same > 0.05
    assert psi_same < 0.1

    # Shifted distribution -> Significant drift
    curr_shifted = np.random.normal(85, 10, size=500)
    ks_stat_drift, p_val_drift = calculate_ks_test(base, curr_shifted)
    psi_drift = calculate_psi(base, curr_shifted)

    assert ks_stat_drift > 0.5
    assert p_val_drift < 0.001
    assert psi_drift > 0.25

    # Categorical PSI
    cat_base = ["A"] * 80 + ["B"] * 20
    cat_drifted = ["A"] * 10 + ["B"] * 90
    cat_psi = calculate_categorical_psi(cat_base, cat_drifted)
    assert cat_psi > 0.5


def test_feature_and_data_drift_engine(monitoring_engine: ModelMonitoringEngine):
    np.random.seed(42)
    # Inject heavily drifted age (shifted from mean 40 to mean 85)
    for i in range(50):
        monitoring_engine.record_inference(
            request_id=f"drift_{i}",
            features={
                "age": float(np.random.normal(85, 5)),
                "balance": float(np.random.normal(50000, 15000)),
                "tier": "gold",
            },
            prediction=1,
            latency_ms=12.0,
        )

    snapshot = monitoring_engine.compute_snapshot(window_seconds=60.0)

    age_drift = next((f for f in snapshot.feature_drifts if f.feature_name == "age"), None)
    assert age_drift is not None
    assert age_drift.drift_detected is True
    assert age_drift.severity == "critical"

    # Verify drift alert generated
    drift_alerts = [a for a in snapshot.alerts if a.alert_type == "feature_drift" and a.feature_name == "age"]
    assert len(drift_alerts) == 1


# --- Test 5: Ground Truth Performance & Degradation Alert ---
def test_ground_truth_performance_evaluation(monitoring_engine: ModelMonitoringEngine):
    # Record 10 predictions: all predicted as 1
    for i in range(10):
        monitoring_engine.record_inference(
            request_id=f"eval_req_{i}",
            features={"age": 30},
            prediction=1,
            latency_ms=10.0,
            probabilities={"0": 0.2, "1": 0.8},
        )

    # Ingest actual ground truth: only 4 actually were 1, 6 were 0 -> accuracy = 40% (baseline is 90%)
    submissions = [
        GroundTruthSubmission(request_id=f"eval_req_{i}", actual=1 if i < 4 else 0)
        for i in range(10)
    ]
    matched = monitoring_engine.record_ground_truth_batch(submissions)
    assert matched == 10

    snapshot = monitoring_engine.compute_snapshot()
    assert snapshot.performance is not None
    assert snapshot.performance.sample_count == 10
    assert snapshot.performance.metrics["accuracy"] == 0.40

    # Primary metric dropped from 0.90 to 0.40 (> 15% drop) -> Verify performance_drop alert
    perf_alerts = [a for a in snapshot.alerts if a.alert_type == "performance_drop"]
    assert len(perf_alerts) == 1
    assert perf_alerts[0].severity == "critical"
    assert "degraded by" in perf_alerts[0].message


# --- Test 6: Local Serving API Monitoring Endpoints ---
def test_serving_monitoring_endpoints(baseline_dataframe: pd.DataFrame):
    pre = TabularPreprocessor()
    X = baseline_dataframe[["age", "balance"]]
    y = np.random.choice([0, 1], size=len(baseline_dataframe))
    X_proc = pre.fit_transform(X)

    clf = RandomForestClassifier(n_estimators=5, random_state=42)
    clf.fit(X_proc, y)

    bundle = ModelArtifactBundle(
        model=clf,
        preprocessor=pre,
        model_name="Serving Monitor Test",
        model_version="v1.0.0",
        problem_type="classification",
        target_name="target",
        primary_metric="accuracy",
        feature_names=["age", "balance"],
        feature_schema=[
            FeatureFieldSchema(name="age", dtype="numeric"),
            FeatureFieldSchema(name="balance", dtype="numeric"),
        ],
        metrics={"accuracy": 0.85},
    )

    predictor = LocalPredictor(bundle)
    app = create_serving_app(predictor=predictor)
    client = TestClient(app)

    # 1. Send predictions through POST /predict
    for i in range(6):
        res = client.post(
            "/predict",
            json={"features": {"age": 30 + i, "balance": 40000}, "request_id": f"srv_{i}"},
        )
        assert res.status_code == 200

    # 2. Query GET /monitoring/metrics
    metrics_res = client.get("/monitoring/metrics")
    assert metrics_res.status_code == 200
    metrics_data = metrics_res.json()
    assert metrics_data["total_requests"] == 6
    assert metrics_data["model_name"] == "Serving Monitor Test"
    assert "latency" in metrics_data
    assert "prediction_distribution" in metrics_data

    # 3. Post Ground Truth
    gt_res = client.post(
        "/monitoring/ground-truth",
        json=[{"request_id": "srv_0", "actual": 1}, {"request_id": "srv_1", "actual": 0}],
    )
    assert gt_res.status_code == 200
    assert gt_res.json()["matched_count"] == 2

    # 4. Query GET /monitoring/alerts
    alerts_res = client.get("/monitoring/alerts")
    assert alerts_res.status_code == 200
    assert isinstance(alerts_res.json(), list)


# --- Test 7: Export Gatekeeper Zero Raw Data Privacy Enforcement ---
def test_export_gate_blocks_raw_data_leakage(monitoring_engine: ModelMonitoringEngine):
    for i in range(10):
        monitoring_engine.record_inference(
            request_id=f"gate_test_{i}",
            features={"age": 25 + i, "balance": 30000},
            prediction=0,
            latency_ms=8.0,
        )

    snapshot = monitoring_engine.compute_snapshot(validate_gate=True)
    payload_dict = snapshot.model_dump()

    # 1. Valid snapshot passes gate
    gate = ExportGate()
    verified = gate.validate_and_sanitize(PermittedExportType.MONITORING_METRICS, payload_dict)
    assert verified["total_requests"] == 10

    # 2. Injecting unauthorized field or raw data rows must be blocked
    leaky_payload = payload_dict.copy()
    leaky_payload["raw_rows"] = [{"age": 25, "balance": 30000}]
    with pytest.raises(SecurityLeakException):
        gate.validate_and_sanitize(PermittedExportType.MONITORING_METRICS, leaky_payload)

    # 3. Injecting raw data records must be blocked
    leaky_payload_2 = payload_dict.copy()
    leaky_payload_2["sample_records"] = [1, 2, 3]
    with pytest.raises(SecurityLeakException):
        gate.validate_and_sanitize(PermittedExportType.MONITORING_METRICS, leaky_payload_2)
