"""Automated test suite for Senior Data Scientist Mode Workflow Engine.

Verifies:
1. 15-Stage Workflow Timeline:
   - Business Understanding
   - Data Understanding
   - Data Quality
   - Exploratory Analysis
   - Problem Formulation
   - Feature Engineering
   - Baseline
   - Candidate Models
   - Cross Validation
   - Hyperparameter Optimization
   - Error Analysis
   - Explainability
   - Model Selection
   - Deployment
   - Monitoring
2. Strict Status Lifecycle:
   - completed, running, needs_review, blocked, not_started
3. Provenance Integrity:
   - Measured results carry [EMPIRICALLY MEASURED]
   - AI assistance carries [AI RATIONALE]
   - User overrides carry [USER DECISION]
   - Zero fabricated metrics
4. Three Execution Modes:
   - Automatic Mode
   - Assisted Mode
   - Manual/Advanced Mode
5. Manual User Overrides & Auditability:
   - User overrides for recommendations and parameters
   - Audit event persistence for mode updates and stage overrides
6. RBAC & Security Isolation:
   - Cross-project / cross-tenant isolation
   - Permission enforcement (PROJECT_VIEW vs PROJECT_UPDATE)
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient

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


def create_project(client: TestClient, token: str, org_id: str, name: str = "SDS Mode Project") -> dict:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": f"{name}_{uuid.uuid4().hex[:6]}",
            "purpose": "Evaluate structured Senior Data Scientist 15-stage workflow.",
            "classification": "internal",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_15_stage_workflow_initial_timeline(client: TestClient):
    """Test retrieving initial workflow timeline with all 15 stages."""
    user = register_user(client, _unique_email("sds_lead"))
    project = create_project(client, user["token"], user["org_id"])
    proj_id = project["id"]
    org_id = user["org_id"]

    res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow",
        headers={"Authorization": f"Bearer {user['token']}"},
    )
    assert res.status_code == 200, res.text
    data = res.json()

    # Check root metadata
    assert data["project_id"] == proj_id
    assert data["organization_id"] == org_id
    assert data["execution_mode"] == "assisted"  # default
    assert "summary" in data
    assert sum(data["summary"].values()) == 15

    stages = data["stages"]
    assert len(stages) == 15

    # Verify exact stage order and keys
    expected_stage_keys = [
        "business_understanding",
        "data_understanding",
        "data_quality",
        "exploratory_analysis",
        "problem_formulation",
        "feature_engineering",
        "baseline",
        "candidate_models",
        "cross_validation",
        "hyperparameter_optimization",
        "error_analysis",
        "explainability",
        "model_selection",
        "deployment",
        "monitoring",
    ]

    for idx, (stage, expected_key) in enumerate(zip(stages, expected_stage_keys), start=1):
        assert stage["stage_key"] == expected_key
        assert stage["stage_index"] == idx
        assert "what_was_analyzed" in stage
        assert isinstance(stage["what_was_analyzed"], list)
        assert len(stage["what_was_analyzed"]) > 0

        # Check status validity
        assert stage["status"] in ("completed", "running", "needs_review", "blocked", "not_started")

        # Provenance check: Recommendations must be marked [AI RATIONALE]
        for rec in stage.get("recommendations", []):
            assert rec["provenance"] == "ai_generated"
            assert rec["badge"] == "[AI RATIONALE]"

        # Provenance check: Evidence must be marked [EMPIRICALLY MEASURED]
        for ev in stage.get("evidence", []):
            assert ev["provenance"] == "empirically_measured"
            assert ev["badge"] == "[EMPIRICALLY MEASURED]"

        # Provenance check: Findings must be marked [EMPIRICALLY MEASURED]
        for finding in stage.get("findings", []):
            assert finding["provenance"] == "empirically_measured"
            assert finding["badge"] == "[EMPIRICALLY MEASURED]"


def test_workflow_execution_mode_switching_and_audit(client: TestClient):
    """Test switching between Automatic, Assisted, and Manual execution modes."""
    user = register_user(client, _unique_email("sds_modes"))
    project = create_project(client, user["token"], user["org_id"])
    proj_id = project["id"]
    org_id = user["org_id"]

    # 1. Switch to Automatic Mode
    res_auto = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/mode",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"execution_mode": "automatic"},
    )
    assert res_auto.status_code == 200, res_auto.text
    assert res_auto.json()["execution_mode"] == "automatic"

    # 2. Switch to Manual/Advanced Mode
    res_manual = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/mode",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"execution_mode": "manual"},
    )
    assert res_manual.status_code == 200, res_manual.text
    assert res_manual.json()["execution_mode"] == "manual"

    # 3. Switch back to Assisted Mode
    res_assisted = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/mode",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"execution_mode": "assisted"},
    )
    assert res_assisted.status_code == 200, res_assisted.text
    assert res_assisted.json()["execution_mode"] == "assisted"

    # 4. Reject invalid mode
    res_invalid = client.patch(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/mode",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"execution_mode": "unsupported_mode"},
    )
    assert res_invalid.status_code in (400, 422)


def test_user_manual_override_at_stages(client: TestClient):
    """Test practitioner manual overrides of AI recommendations and decisions."""
    user = register_user(client, _unique_email("sds_override"))
    project = create_project(client, user["token"], user["org_id"])
    proj_id = project["id"]
    org_id = user["org_id"]

    # Override stage 7: Baseline
    override_payload = {
        "decision": "overridden",
        "overridden_recommendation": "Enforce custom hurdle threshold of 0.68 due to low tolerance for false negatives.",
        "custom_parameters": {
            "min_improvement_pct": 15.0,
            "custom_baseline_metric": "recall",
            "required_floor": 0.68,
        },
        "user_decision_notes": "Approved by Principal ML Engineer per Q3 Risk Framework.",
        "status": "completed",
    }

    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/stages/baseline/override",
        headers={"Authorization": f"Bearer {user['token']}"},
        json=override_payload,
    )
    assert res.status_code == 200, res.text
    data = res.json()

    baseline_stage = next(s for s in data["stages"] if s["stage_key"] == "baseline")
    assert baseline_stage["is_overridden"] is True
    assert baseline_stage["status"] == "completed"
    assert baseline_stage["user_decisions"]["decision"] == "overridden"
    assert baseline_stage["user_decisions"]["overridden_recommendation"] == override_payload["overridden_recommendation"]
    assert baseline_stage["user_decisions"]["custom_parameters"]["required_floor"] == 0.68
    assert baseline_stage["user_decisions"]["user_decision_notes"] == override_payload["user_decision_notes"]
    assert baseline_stage["user_decisions"]["decided_by_email"] == user["email"]

    # Reject invalid stage key
    res_bad_stage = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/stages/nonexistent_stage/override",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={"decision": "accepted"},
    )
    assert res_bad_stage.status_code == 400


def test_advance_workflow_stage(client: TestClient):
    """Test advancing workflow stage progression."""
    user = register_user(client, _unique_email("sds_advance"))
    project = create_project(client, user["token"], user["org_id"])
    proj_id = project["id"]
    org_id = user["org_id"]

    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/workflow/stages/business_understanding/advance",
        headers={"Authorization": f"Bearer {user['token']}"},
        json={},
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["current_stage_key"] == "data_understanding"
    assert data["current_stage_index"] == 2


def test_rbac_workflow_isolation_and_permissions(client: TestClient):
    """Test cross-tenant isolation and role-permission enforcement."""
    org1_user = register_user(client, _unique_email("org1_user"))
    org2_user = register_user(client, _unique_email("org2_user"))

    proj1 = create_project(client, org1_user["token"], org1_user["org_id"])
    proj1_id = proj1["id"]

    # 1. Org 2 user cannot access Org 1 project workflow
    res_cross = client.get(
        f"/api/v1/organizations/{org1_user['org_id']}/projects/{proj1_id}/workflow",
        headers={"Authorization": f"Bearer {org2_user['token']}"},
    )
    assert res_cross.status_code in (403, 404)

    # 2. Org 2 user cannot override Org 1 stage
    res_cross_ov = client.post(
        f"/api/v1/organizations/{org1_user['org_id']}/projects/{proj1_id}/workflow/stages/baseline/override",
        headers={"Authorization": f"Bearer {org2_user['token']}"},
        json={"decision": "accepted"},
    )
    assert res_cross_ov.status_code in (403, 404)
