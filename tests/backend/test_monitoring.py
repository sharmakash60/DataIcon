"""Tests for Model Monitoring Control Plane Telemetry, Ingestion & Alerting.

Verifies:
1. Aggregate monitoring snapshot ingestion (zero raw data payload)
2. Statistical drift and performance metric persistence
3. Multi-dimensional alert creation and resolution workflow
4. Schema validation strictly forbidding extra/raw fields (Pydantic extra="forbid")
5. Tenant isolation (cross-tenant access rejected)
6. Unauthenticated requests rejected (401)
"""

from __future__ import annotations

import datetime
import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

pytestmark = [
    pytest.mark.integration,
]


def register_user_and_org(client: TestClient, email_prefix: str) -> tuple[str, str, str]:
    """Helper to register user, organization, and return (token, org_id, user_id)."""
    unique = uuid.uuid4().hex[:8]
    email = f"{email_prefix}_{unique}@example.com"
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "StrongPassword123!",
            "display_name": "Monitoring Engineer",
            "organization_name": f"Org {unique}",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    token = data["access_token"]
    org_id = data["organizations"][0]["organization_id"]
    user_id = data["user"]["id"]
    return token, org_id, user_id


def create_project(client: TestClient, token: str, org_id: str, name: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": name,
            "purpose": "Monitoring test suite",
            "classification": "restricted",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_experiment(client: TestClient, token: str, org_id: str, proj_id: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Production Fraud Classifier",
            "problem_type": "classification",
            "target_name": "is_fraud",
            "primary_metric": "roc_auc",
            "model": "XGBoost",
            "feature_config": {"features": ["amount", "hour", "merchant_risk"]},
            "metrics": {"roc_auc": 0.945},
            "training_duration": 22.4,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def create_active_deployment(client: TestClient, token: str, org_id: str, proj_id: str, exp_id: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/deployments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Live Fraud Scoring",
            "deployment_type": "local",
            "endpoint_url": "http://localhost:8080",
            "prediction_path": "/predict",
            "auto_approve": True,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_ingest_aggregate_monitoring_snapshot_and_alerts():
    token, org_id, user_id = register_user_and_org(client, "mon_lead")
    proj_id = create_project(client, token, org_id, "Fraud Detection Project")
    exp_id = create_experiment(client, token, org_id, proj_id)
    dep_id = create_active_deployment(client, token, org_id, proj_id, exp_id)

    headers = {"Authorization": f"Bearer {token}"}
    monitoring_base = f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id}/monitoring"

    now = datetime.datetime.now(datetime.timezone.utc)
    one_hour_ago = now - datetime.timedelta(hours=1)

    payload = {
        "period_start": one_hour_ago.isoformat(),
        "period_end": now.isoformat(),
        "window_seconds": 3600.0,
        "total_requests": 250,
        "throughput_rps": 4.16,
        "error_count": 2,
        "error_rate": 0.008,
        "latency": {
            "mean_ms": 14.2,
            "min_ms": 6.1,
            "max_ms": 89.5,
            "p50_ms": 12.0,
            "p90_ms": 22.4,
            "p95_ms": 31.8,
            "p99_ms": 55.0,
        },
        "prediction_distribution": {
            "total_predictions": 250,
            "class_counts": {"0": 235, "1": 15},
            "class_proportions": {"0": 0.94, "1": 0.06},
            "quantiles": {"0.5": 0.0},
        },
        "feature_drifts": [
            {
                "feature_name": "amount",
                "dtype": "numerical",
                "method": "ks_test",
                "statistic": 0.28,
                "p_value": 0.0004,
                "drift_detected": True,
                "severity": "critical",
                "baseline_stats": {"mean": 120.0, "p50": 85.0},
                "current_stats": {"mean": 380.0, "p50": 240.0},
            },
            {
                "feature_name": "merchant_risk",
                "dtype": "numerical",
                "method": "ks_test",
                "statistic": 0.05,
                "p_value": 0.72,
                "drift_detected": False,
                "severity": "none",
                "baseline_stats": {"mean": 0.4},
                "current_stats": {"mean": 0.42},
            },
        ],
        "data_drift": {
            "drifted_features_count": 1,
            "total_features_count": 2,
            "drift_share": 0.50,
            "dataset_drift_detected": True,
            "method": "aggregate_share",
        },
        "performance": {
            "sample_count": 50,
            "metrics": {"roc_auc": 0.88, "accuracy": 0.94},
            "evaluated_at": now.isoformat(),
        },
        "alerts": [
            {
                "alert_type": "feature_drift",
                "severity": "critical",
                "message": "Critical drift detected in feature 'amount' (p-value: 0.0004)",
                "feature_name": "amount",
                "metric_name": "ks_statistic",
                "threshold": 0.05,
                "current_value": 0.28,
                "timestamp": now.isoformat(),
            },
            {
                "alert_type": "data_drift",
                "severity": "warning",
                "message": "Dataset drift detected: 50.0% of features drifted",
                "metric_name": "drift_share",
                "threshold": 0.333,
                "current_value": 0.50,
                "timestamp": now.isoformat(),
            },
        ],
    }

    # 1. Ingest Snapshot
    res_ingest = client.post(f"{monitoring_base}/metrics", headers=headers, json=payload)
    assert res_ingest.status_code == 201, res_ingest.text
    snap_data = res_ingest.json()
    assert snap_data["total_requests"] == 250
    assert snap_data["data_drift_detected"] is True
    assert snap_data["data_drift_score"] == 0.50
    assert snap_data["metrics"]["roc_auc"] == 0.88

    # 2. List snapshots
    res_list = client.get(f"{monitoring_base}/metrics", headers=headers)
    assert res_list.status_code == 200, res_list.text
    list_data = res_list.json()
    assert list_data["total"] >= 1
    assert list_data["items"][0]["id"] == snap_data["id"]

    # 3. List alerts
    res_alerts = client.get(f"{monitoring_base}/alerts?unresolved_only=true", headers=headers)
    assert res_alerts.status_code == 200, res_alerts.text
    alerts_data = res_alerts.json()
    assert alerts_data["total"] == 2
    alert_ids = [a["id"] for a in alerts_data["items"]]
    assert len(alert_ids) == 2

    # 4. Resolve an alert
    first_alert_id = alert_ids[0]
    res_resolve = client.post(
        f"{monitoring_base}/alerts/{first_alert_id}/resolve",
        headers=headers,
        json={"notes": "Investigated transaction surge from holiday promotion."},
    )
    assert res_resolve.status_code == 200, res_resolve.text
    resolved_alert = res_resolve.json()
    assert resolved_alert["is_resolved"] is True
    assert resolved_alert["resolved_by_user_id"] == user_id

    # 5. Verify unresolved list now has 1
    res_alerts_unresolved = client.get(f"{monitoring_base}/alerts?unresolved_only=true", headers=headers)
    assert res_alerts_unresolved.json()["total"] == 1


def test_strict_no_raw_or_extra_keys_rejection():
    """Verify that attempting to transmit raw data or unapproved fields is rejected with 422."""
    token, org_id, user_id = register_user_and_org(client, "mon_leak_test")
    proj_id = create_project(client, token, org_id, "Privacy Gate Project")
    exp_id = create_experiment(client, token, org_id, proj_id)
    dep_id = create_active_deployment(client, token, org_id, proj_id, exp_id)

    headers = {"Authorization": f"Bearer {token}"}
    monitoring_base = f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id}/monitoring"

    now = datetime.datetime.now(datetime.timezone.utc)

    # Payload containing unauthorized raw data field
    poisoned_payload = {
        "period_start": now.isoformat(),
        "period_end": now.isoformat(),
        "window_seconds": 60.0,
        "total_requests": 10,
        "throughput_rps": 0.16,
        "error_count": 0,
        "error_rate": 0.0,
        "latency": {
            "mean_ms": 10.0, "min_ms": 5.0, "max_ms": 20.0,
            "p50_ms": 10.0, "p90_ms": 15.0, "p95_ms": 18.0, "p99_ms": 20.0,
        },
        "prediction_distribution": {"total_predictions": 10},
        "feature_drifts": [],
        "data_drift": {
            "drifted_features_count": 0,
            "total_features_count": 0,
            "drift_share": 0.0,
            "dataset_drift_detected": False,
        },
        # FORBIDDEN: Raw data rows
        "raw_prediction_payloads": [{"user_ssn": "123-45-6789", "amount": 100.0}],
    }

    res = client.post(f"{monitoring_base}/metrics", headers=headers, json=poisoned_payload)
    assert res.status_code == 422  # Rejected by Pydantic extra="forbid"


def test_monitoring_tenant_isolation_and_unauthenticated():
    token_a, org_a, _ = register_user_and_org(client, "tenant_mon_a")
    proj_a = create_project(client, token_a, org_a, "Org A Project")
    exp_a = create_experiment(client, token_a, org_a, proj_a)
    dep_a = create_active_deployment(client, token_a, org_a, proj_a, exp_a)

    token_b, org_b, _ = register_user_and_org(client, "tenant_mon_b")

    monitoring_url = f"/api/v1/organizations/{org_a}/projects/{proj_a}/deployments/{dep_a}/monitoring/metrics"

    # Tenant B attempts to read Tenant A's metrics
    res_b = client.get(monitoring_url, headers={"Authorization": f"Bearer {token_b}"})
    assert res_b.status_code in (403, 404)

    # Unauthenticated request
    res_unauth = client.get(monitoring_url)
    assert res_unauth.status_code == 401
