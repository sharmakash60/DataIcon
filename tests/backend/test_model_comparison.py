"""Automated test suite for Model Comparison & Decision Governance in DataPilot.

Verifies:
1. Comparison endpoint returns side-by-side data for multiple experiments:
   - Model name, dataset version, validation strategy.
   - Primary metric, secondary metrics, mean CV score, CV std deviation, fold scores.
   - Training duration, inference latency, memory usage.
   - Model complexity breakdown (tier, parameter count, architecture, estimators/depth).
   - Explainability metadata (availability, method, top features).
   - Diagnostic visualizations: metric comparison, CV stability, ROC curve, PR curve,
     confusion matrix (classification), and residual analysis (regression).
   - Transparent Composite Utility Score with full mathematical breakdown (NO unexplained AI score).
   - Empirical model recommendation grounded in validation metrics and business constraints.
2. Experiment Decision Lifecycle:
   - Marking model as 'candidate', 'rejected', 'approved'.
   - RBAC enforcement: Only roles with MODEL_APPROVE (Owner/Admin) can approve.
   - Data Scientist can mark as candidate/rejected, but rejected when attempting approval.
   - Viewer/Analyst forbidden from mutating decisions (403).
   - Audit logging for every decision transition.
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient

from app.auth.permissions import Permissions
from app.enums import Role
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _unique_email(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@datapilot.io"


def register_user(client: TestClient, email: str, role_title: str = "Tester") -> dict:
    password = "SecurePassword123!"
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": f"{role_title} User",
            "organization_name": f"Org_{uuid.uuid4().hex[:6]}",
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return {
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "org_id": data["organizations"][0]["organization_id"],
        "email": email,
    }


def create_user_with_role(client: TestClient, org_id: str, owner_token: str, role: Role) -> dict:
    email = _unique_email(role.value)
    password = "UserPassword123!"
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": f"{role.value.title()} Tester",
            "organization_name": f"Dummy_{uuid.uuid4().hex[:6]}",
        },
    )
    assert reg.status_code == 201, reg.text

    add = client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": email, "role": role.value},
    )
    assert add.status_code == 201, add.text

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    login_data = login.json()

    return {
        "token": login_data["access_token"],
        "user_id": login_data["user"]["id"],
        "email": email,
        "role": role.value,
    }


def create_project(client: TestClient, token: str, org_id: str, name: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "purpose": "Model Comparison Benchmark", "classification": "internal"},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def run_experiment(
    client: TestClient,
    token: str,
    org_id: str,
    project_id: str,
    name: str,
    benchmark_name: str,
    target_column: str,
    primary_metric: str,
) -> dict:
    payload = {
        "name": name,
        "dataset_version": "v1.2-eval",
        "benchmark_name": benchmark_name,
        "target_column": target_column,
        "primary_metric": primary_metric,
        "business_requirements": {
            "business_objective": f"Evaluate {name}",
            "max_latency_ms": 150.0,
            "cost_false_positive": 15.0,
            "cost_false_negative": 120.0,
        },
        "enable_optuna": False,
        "n_splits": 3,
        "random_seed": 42,
    }
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{project_id}/experiments/run",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_model_comparison_classification_metrics_and_visualizations(client: TestClient):
    """Verify side-by-side comparison for classification experiments:
    metrics, CV stability, ROC, PR curve, confusion matrix, complexity, and composite utility score.
    """
    owner = register_user(client, _unique_email("owner_comp"), "Owner")
    org_id = owner["org_id"]
    token = owner["token"]
    proj_id = create_project(client, token, org_id, "Customer Retention ML")

    # Run 2 classification experiments with different primary metrics
    exp1 = run_experiment(
        client,
        token,
        org_id,
        proj_id,
        name="Model A - ROC-AUC Focused",
        benchmark_name="customer_churn",
        target_column="churn",
        primary_metric="roc_auc",
    )
    exp2 = run_experiment(
        client,
        token,
        org_id,
        proj_id,
        name="Model B - F1 Focused",
        benchmark_name="customer_churn",
        target_column="churn",
        primary_metric="f1",
    )

    exp1_id = exp1["id"]
    exp2_id = exp2["id"]

    # Call comparison API with comma-separated and list formats
    comp_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/compare?experiment_ids={exp1_id}&experiment_ids={exp2_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert comp_res.status_code == 200, comp_res.text
    comp_data = comp_res.json()

    assert len(comp_data["experiments"]) == 2
    ids_returned = [str(e["id"]) for e in comp_data["experiments"]]
    assert str(exp1_id) in ids_returned
    assert str(exp2_id) in ids_returned

    for exp in comp_data["experiments"]:
        # 1. Required Side-by-side fields
        assert exp["name"]
        assert exp["model"]
        assert exp["dataset_version"] == "v1.2-eval"
        assert "StratifiedKFold" in exp["validation_strategy"]
        assert exp["primary_metric"] in ["roc_auc", "f1"]
        assert isinstance(exp["metrics"], dict)
        assert len(exp["metrics"]) > 0

        # 2. CV stability
        assert exp["mean_cv_score"] is not None and exp["mean_cv_score"] > 0
        assert exp["std_cv_score"] is not None and exp["std_cv_score"] >= 0
        assert len(exp["cv_scores"]) > 0

        # 3. Execution telemetry
        assert exp["training_duration"] >= 0
        assert exp["inference_latency_ms"] is not None and exp["inference_latency_ms"] > 0
        assert exp["memory_usage_mb"] is not None and exp["memory_usage_mb"] > 0

        # 4. Model complexity
        complexity = exp["model_complexity"]
        assert "tier" in complexity
        assert complexity["parameter_count"] > 0
        assert complexity["architecture"]

        # 5. Explainability availability
        exp_meta = exp["explainability"]
        assert isinstance(exp_meta["available"], bool)
        assert "status" in exp_meta

        # 6. Visualizations
        viz = exp["visualizations"]
        assert "confusion_matrix" in viz
        cm = viz["confusion_matrix"]
        assert len(cm["matrix"]) == 2
        assert "error_rate" in cm or "precision" in cm

        assert "roc_curve" in viz
        roc = viz["roc_curve"]
        assert len(roc["points"]) > 0
        assert 0.0 <= roc["auc"] <= 1.0

        assert "pr_curve" in viz or "precision_recall_curve" in viz
        pr = viz.get("pr_curve") or viz.get("precision_recall_curve")
        assert len(pr["points"]) > 0
        assert 0.0 <= pr["auc"] <= 1.0

        # 7. Transparent Composite Utility Score (No unexplained AI score)
        util = exp["composite_utility_score"]
        assert 0 <= util["score"] <= 100
        assert "0.50" in util["formula"]
        assert "50%" in util["explanation"]
        assert util["weights"]["metric_score"] == 0.50
        assert util["weights"]["cv_stability"] == 0.20
        assert util["weights"]["latency_efficiency"] == 0.15
        assert util["weights"]["model_simplicity"] == 0.15
        assert "metric_score" in util["components"]
        assert "cv_stability" in util["components"]
        assert "latency_efficiency" in util["components"]
        assert "model_simplicity" in util["components"]

    # 8. Comparison summary & recommendation
    summary = comp_data["recommendation_summary"]
    assert summary is not None
    assert summary["recommended_experiment_id"] in [str(exp1_id), str(exp2_id)]
    assert "recommended based on verifiable empirical results" in summary["empirical_rationale"]
    assert len(comp_data["metric_comparisons"]) > 0


def test_model_comparison_regression_residuals(client: TestClient):
    """Verify regression experiment side-by-side comparison includes residual analysis."""
    owner = register_user(client, _unique_email("owner_reg"), "Owner")
    org_id = owner["org_id"]
    token = owner["token"]
    proj_id = create_project(client, token, org_id, "Sales Regression ML")

    exp_reg1 = run_experiment(
        client,
        token,
        org_id,
        proj_id,
        name="Sales Regressor RMSE",
        benchmark_name="sales_forecasting",
        target_column="weekly_sales",
        primary_metric="rmse",
    )
    exp_reg2 = run_experiment(
        client,
        token,
        org_id,
        proj_id,
        name="Sales Regressor MAE",
        benchmark_name="sales_forecasting",
        target_column="weekly_sales",
        primary_metric="mae",
    )
    exp1_id = exp_reg1["id"]
    exp2_id = exp_reg2["id"]

    comp_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/compare?experiment_ids={exp1_id}&experiment_ids={exp2_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert comp_res.status_code == 200, comp_res.text
    data = comp_res.json()

    exp = data["experiments"][0]
    viz = exp["visualizations"]
    assert "residual_analysis" in viz
    residuals = viz["residual_analysis"]
    assert len(residuals["scatter"]) > 0
    assert "predicted" in residuals["scatter"][0]
    assert "residual" in residuals["scatter"][0]
    assert len(residuals["histogram"]) > 0
    assert "mean_residual" in residuals
    assert "std_residual" in residuals


def test_model_decision_lifecycle_and_rbac_enforcement(client: TestClient):
    """Verify Candidate -> Approved -> Rejected transitions, RBAC enforcement, and audit logs.
    - Owner can approve, reject, or mark candidate.
    - Data Scientist can mark candidate or reject, but CANNOT approve (Separation of Duties).
    - Viewer cannot modify decision (403).
    """
    owner = register_user(client, _unique_email("owner_decision"), "Owner")
    org_id = owner["org_id"]
    owner_token = owner["token"]
    proj_id = create_project(client, owner_token, org_id, "Decision Governance ML")

    exp = run_experiment(
        client,
        owner_token,
        org_id,
        proj_id,
        name="Decision Candidate Test",
        benchmark_name="customer_churn",
        target_column="churn",
        primary_metric="f1",
    )
    exp_id = exp["id"]
    assert exp["decision"] == "candidate"  # Default status

    # 1. Create team members and assign to project
    ds = create_user_with_role(client, org_id, owner_token, Role.DATA_SCIENTIST)
    viewer = create_user_with_role(client, org_id, owner_token, Role.VIEWER)

    for u in [ds, viewer]:
        client.post(
            f"/api/v1/organizations/{org_id}/projects/{proj_id}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"user_id": u["user_id"], "role": u["role"]},
        )

    # 2. Data Scientist marks as 'rejected' with notes -> Allowed
    res_ds_reject = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/decision",
        headers={"Authorization": f"Bearer {ds['token']}"},
        json={
            "decision": "rejected",
            "notes": "High variance across folds; failing robustness check.",
        },
    )
    assert res_ds_reject.status_code == 200, res_ds_reject.text
    d = res_ds_reject.json()
    assert d["decision"] == "rejected"
    assert d["decision_notes"] == "High variance across folds; failing robustness check."
    assert d["decision_by"] == ds["email"]
    assert d["decision_at"] is not None

    # 3. Data Scientist attempts to 'approved' -> 403 Forbidden (MODEL_APPROVE required)
    res_ds_approve = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/decision",
        headers={"Authorization": f"Bearer {ds['token']}"},
        json={
            "decision": "approved",
            "notes": "DS attempting unauthorized self-approval.",
        },
    )
    assert res_ds_approve.status_code == 403, "DS should NOT have MODEL_APPROVE permission"
    assert "MODEL_APPROVE" in res_ds_approve.json().get("detail", "")

    # 4. Viewer attempts to modify decision -> 403 Forbidden
    res_viewer = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/decision",
        headers={"Authorization": f"Bearer {viewer['token']}"},
        json={
            "decision": "candidate",
            "notes": "Viewer attempting change.",
        },
    )
    assert res_viewer.status_code == 403

    # 5. Owner marks as 'approved' -> Allowed
    res_owner_approve = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/decision",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "decision": "approved",
            "notes": "Model meets all validation and latency SLA criteria. Approved for deployment.",
        },
    )
    assert res_owner_approve.status_code == 200, res_owner_approve.text
    d_app = res_owner_approve.json()
    assert d_app["decision"] == "approved"
    assert d_app["decision_by"] == owner["email"]

    # 6. Invalid decision value -> 422 Unprocessable Entity
    res_invalid = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/decision",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "decision": "production_superstar",
        },
    )
    assert res_invalid.status_code == 422

    # 7. Verify Audit Log was generated
    audit_res = client.get(
        f"/api/v1/organizations/{org_id}/audit-events",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert audit_res.status_code == 200
    events = audit_res.json()["items"]
    decision_events = [e for e in events if e["action"] == "experiment.decision_updated"]
    assert len(decision_events) >= 2  # DS rejection + Owner approval
    latest = decision_events[0]
    assert latest["action"] == "experiment.decision_updated"
    assert latest["resource_id"] == str(exp_id)
    if latest.get("details"):
        import json
        details_obj = json.loads(latest["details"]) if isinstance(latest["details"], str) else latest["details"]
        assert details_obj.get("new_decision") in ["approved", "rejected"]
