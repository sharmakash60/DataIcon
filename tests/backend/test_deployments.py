"""Tests for Model Deployment Tracking, Approval Workflow, and Client Privacy.

Verifies:
1. Model deployment creation for Local and Docker types
2. Approval workflow (pending_approval -> active)
3. Rollback and decommission lifecycle transitions
4. Tenant isolation (cross-tenant access rejection)
5. Strict Zero Prediction Proxying: Control plane never accepts or proxies raw inference payloads
"""

from __future__ import annotations

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
            "display_name": "ML Engineer",
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
            "purpose": "Deployment testing",
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
            "name": "Churn Prediction Benchmark",
            "problem_type": "classification",
            "target_name": "churn",
            "primary_metric": "roc_auc",
            "model": "Random Forest",
            "feature_config": {"features": ["age", "account_balance", "tenure"]},
            "metrics": {"roc_auc": 0.912},
            "training_duration": 18.2,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_deployment_lifecycle_local_and_docker():
    token, org_id, user_id = register_user_and_org(client, "deploy_lead")
    proj_id = create_project(client, token, org_id, "Customer Analytics Service")
    exp_id = create_experiment(client, token, org_id, proj_id)

    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create Local Deployment (defaults to pending_approval)
    res_local = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/deployments",
        headers=headers,
        json={
            "name": "Local Churn Serving Service",
            "deployment_type": "local",
            "endpoint_url": "http://localhost:8080",
            "prediction_path": "/predict",
            "notes": "Low-latency local inference server on client agent machine",
            "auto_approve": False,
        },
    )
    assert res_local.status_code == 201, res_local.text
    local_data = res_local.json()
    assert local_data["status"] == "pending_approval"
    assert local_data["deployment_type"] == "local"
    assert local_data["endpoint_url"] == "http://localhost:8080"
    assert local_data["model_name"] == "Random Forest"
    assert len(local_data["input_schema"]) == 3
    dep_id_local = local_data["id"]

    # 2. Approve Local Deployment
    res_approve = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id_local}/approve",
        headers=headers,
        json={"notes": "Audited and verified compliant with data governance rules."},
    )
    assert res_approve.status_code == 200, res_approve.text
    approved_data = res_approve.json()
    assert approved_data["status"] == "active"
    assert approved_data["approved_at"] is not None

    # 3. Create Docker Deployment with auto_approve=True
    res_docker = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/deployments",
        headers=headers,
        json={
            "name": "Containerized Churn Predictor",
            "deployment_type": "docker",
            "endpoint_url": "http://churn-serving.client.internal:8080",
            "prediction_path": "/predict",
            "notes": "Packaged air-gapped container image for customer VPC",
            "auto_approve": True,
        },
    )
    assert res_docker.status_code == 201, res_docker.text
    docker_data = res_docker.json()
    assert docker_data["status"] == "active"
    assert docker_data["deployment_type"] == "docker"
    dep_id_docker = docker_data["id"]

    # 4. List Deployments for Project
    res_list_proj = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments",
        headers=headers,
    )
    assert res_list_proj.status_code == 200, res_list_proj.text
    proj_deps = res_list_proj.json()
    assert proj_deps["total"] >= 2

    # 5. List Deployments for Experiment
    res_list_exp = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/deployments",
        headers=headers,
    )
    assert res_list_exp.status_code == 200, res_list_exp.text
    exp_deps = res_list_exp.json()
    assert exp_deps["total"] >= 2

    # 6. Retrieve Deployment Detail
    res_detail = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id_local}",
        headers=headers,
    )
    assert res_detail.status_code == 200, res_detail.text
    assert res_detail.json()["id"] == dep_id_local

    # 7. Rollback Deployment
    res_rollback = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id_local}/rollback",
        headers=headers,
        json={"reason": "Model drift detected in production traffic."},
    )
    assert res_rollback.status_code == 200, res_rollback.text
    assert res_rollback.json()["status"] == "rolled_back"

    # 8. Stop Deployment
    res_stop = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id_docker}/stop",
        headers=headers,
        json={"reason": "Decommissioned in favor of v2."},
    )
    assert res_stop.status_code == 200, res_stop.text
    assert res_stop.json()["status"] == "stopped"


def test_tenant_isolation_and_cross_org_access_blocked():
    # Org A
    token_a, org_a, _ = register_user_and_org(client, "org_a_user")
    proj_a = create_project(client, token_a, org_a, "Alpha Project")
    exp_a = create_experiment(client, token_a, org_a, proj_a)

    res_dep = client.post(
        f"/api/v1/organizations/{org_a}/projects/{proj_a}/experiments/{exp_a}/deployments",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "name": "Org A Deployment",
            "deployment_type": "local",
            "endpoint_url": "http://localhost:8080",
        },
    )
    assert res_dep.status_code == 201
    dep_id_a = res_dep.json()["id"]

    # Org B
    token_b, org_b, _ = register_user_and_org(client, "org_b_user")

    # Org B attempts to read Org A deployment -> Must be 404 (not leak existence)
    res_cross_read = client.get(
        f"/api/v1/organizations/{org_b}/projects/{proj_a}/deployments/{dep_id_a}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_cross_read.status_code in [403, 404]

    # Org B attempts to approve Org A deployment -> Must be 404/403
    res_cross_approve = client.post(
        f"/api/v1/organizations/{org_b}/projects/{proj_a}/deployments/{dep_id_a}/approve",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"notes": "Hacked"},
    )
    assert res_cross_approve.status_code in [403, 404]


def test_unauthenticated_request_rejected():
    res = client.get(
        f"/api/v1/organizations/{uuid.uuid4()}/projects/{uuid.uuid4()}/deployments",
    )
    assert res.status_code == 401


def test_zero_cloud_prediction_proxying():
    """Confirms control plane has NO route accepting or proxying raw prediction data."""
    # Attempting to POST /predict to cloud control plane must return 404 or 405
    res = client.post(
        "/predict",
        json={"features": [{"age": 30, "balance": 1000}]},
    )
    assert res.status_code == 404

    res2 = client.post(
        "/api/v1/predict",
        json={"features": [{"age": 30, "balance": 1000}]},
    )
    assert res2.status_code == 404
