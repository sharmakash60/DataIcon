"""Comprehensive Automated RBAC & Tenant Security Test Suite.

Proves with hard assertions:
1. Baseline role permissions across all 6 roles (Owner, Admin, Data Scientist, Analyst, Viewer, Security Auditor).
2. Proper HTTP 403 Forbidden enforcement on unauthorized actions.
3. Proper HTTP 401 Unauthorized enforcement on unauthenticated actions.
4. Project-level membership isolation (Project A access != Project B access).
5. Cross-tenant isolation (Org A identities strictly isolated from Org B resources).
6. Anti-privilege escalation (No self-promotion, admin cannot demote/remove owner, non-owner cannot grant owner).
"""

from __future__ import annotations

import uuid
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.permissions import Permissions, ROLE_PERMISSIONS
from app.enums import Role

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _unique_email(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}@example.com"


def register_org(client: TestClient, org_name: str, owner_prefix: str = "owner") -> dict:
    """Register a new organization and return {token, org_id, user_id, email, password}."""
    email = _unique_email(owner_prefix)
    password = "StrongPassword123!"
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": f"{owner_prefix.title()} User",
            "organization_name": org_name,
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return {
        "token": data["access_token"],
        "org_id": data["organizations"][0]["organization_id"],
        "user_id": data["user"]["id"],
        "email": email,
        "password": password,
    }


def create_user_with_role(client: TestClient, org_id: str, owner_token: str, role: Role) -> dict:
    """Registers a distinct user, adds them to org_id with role, and logs in."""
    email = _unique_email(role.value)
    password = "UserPassword123!"
    # 1. Register standalone account
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": f"{role.value.title()} Tester",
            "organization_name": f"DummyOrg {uuid.uuid4().hex[:6]}",
        },
    )
    assert reg.status_code == 201, reg.text

    # 2. Add as member in target organization using owner_token
    add = client.post(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"email": email, "role": role.value},
    )
    assert add.status_code == 201, add.text
    member_data = add.json()

    # 3. Log in as this user to get a fresh token with correct org memberships
    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert login.status_code == 200, login.text
    login_data = login.json()

    return {
        "token": login_data["access_token"],
        "user_id": login_data["user"]["id"],
        "member_id": member_data["id"],
        "email": email,
        "role": role.value,
    }


# =========================================================================
# 1. UNFAIR ACCESS & UNAUTHENTICATED ENFORCEMENT
# =========================================================================

def test_unauthenticated_requests_return_401(client):
    """Verify that unauthenticated calls return 401."""
    random_org_id = str(uuid.uuid4())
    random_proj_id = str(uuid.uuid4())

    res = client.get(f"/api/v1/organizations/{random_org_id}/projects")
    assert res.status_code == 401

    res = client.post(
        f"/api/v1/organizations/{random_org_id}/projects",
        json={"name": "No Auth Proj"},
    )
    assert res.status_code == 401

    res = client.get(f"/api/v1/organizations/{random_org_id}/audit-events")
    assert res.status_code == 401


# =========================================================================
# 2. BASELINE 6-ROLE PERMISSION MATRIX ENFORCEMENT
# =========================================================================

def test_rbac_six_roles_permission_matrix(client):
    """Create all 6 roles in one org and verify permissions against protected APIs."""
    org = register_org(client, "RBAC Matrix Test Corp", "owner")
    org_id = org["org_id"]
    owner_token = org["token"]

    admin = create_user_with_role(client, org_id, owner_token, Role.ADMIN)
    ds = create_user_with_role(client, org_id, owner_token, Role.DATA_SCIENTIST)
    analyst = create_user_with_role(client, org_id, owner_token, Role.ANALYST)
    viewer = create_user_with_role(client, org_id, owner_token, Role.VIEWER)
    auditor = create_user_with_role(client, org_id, owner_token, Role.SECURITY_AUDITOR)

    # --- PROJECT CREATION (PROJECT_CREATE) ---
    # Allowed: Owner, Admin, Data Scientist
    # Forbidden (403): Analyst, Viewer, Security Auditor
    for u in [org, admin, ds]:
        res = client.post(
            f"/api/v1/organizations/{org_id}/projects",
            headers={"Authorization": f"Bearer {u['token']}"},
            json={"name": f"Proj by {u.get('role', 'owner')}_{uuid.uuid4().hex[:4]}"},
        )
        assert res.status_code == 201, f"Expected 201 for {u.get('role', 'owner')}: {res.text}"

    for u in [analyst, viewer, auditor]:
        res = client.post(
            f"/api/v1/organizations/{org_id}/projects",
            headers={"Authorization": f"Bearer {u['token']}"},
            json={"name": "Forbidden Project"},
        )
        assert res.status_code == 403, f"Expected 403 for {u['role']}, got {res.status_code}"

    # Create a baseline project for downstream tests
    base_proj_res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Baseline ML Initiative"},
    )
    assert base_proj_res.status_code == 201
    proj_id = base_proj_res.json()["id"]

    # Assign DS, Analyst, Viewer to this project so they have project-level access
    for u in [ds, analyst, viewer]:
        client.post(
            f"/api/v1/organizations/{org_id}/projects/{proj_id}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"user_id": u["user_id"], "role": Role.DATA_SCIENTIST.value},
        )

    # --- EXPERIMENT CREATION (EXPERIMENT_CREATE) ---
    # Allowed: Owner, Data Scientist (with project access)
    # Forbidden (403): Admin, Analyst, Viewer, Security Auditor
    exp_payload = {
        "name": "Benchmark Run 1",
        "dataset_version": "v1.0",
        "dataset_fingerprint": "fp_12345",
        "problem_type": "binary_classification",
        "target_name": "converted",
        "primary_metric": "roc_auc",
    }
    for u in [org, ds]:
        res = client.post(
            f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments",
            headers={"Authorization": f"Bearer {u['token']}"},
            json={**exp_payload, "name": f"Exp by {u.get('role', 'owner')}"},
        )
        assert res.status_code == 201, f"Expected 201 for {u.get('role', 'owner')}: {res.text}"

    for u in [admin, analyst, viewer, auditor]:
        res = client.post(
            f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments",
            headers={"Authorization": f"Bearer {u['token']}"},
            json={**exp_payload, "name": "Forbidden Exp"},
        )
        assert res.status_code == 403, f"Expected 403 for {u['role']}, got {res.status_code}"

    # --- AUDIT LOG ACCESS (AUDIT_LOG_VIEW) ---
    # Allowed: Owner, Admin, Security Auditor
    # Forbidden (403): Data Scientist, Analyst, Viewer
    for u in [org, admin, auditor]:
        res = client.get(
            f"/api/v1/organizations/{org_id}/audit-events",
            headers={"Authorization": f"Bearer {u['token']}"},
        )
        assert res.status_code == 200, f"Expected 200 for {u.get('role', 'owner')}: {res.text}"

    for u in [ds, analyst, viewer]:
        res = client.get(
            f"/api/v1/organizations/{org_id}/audit-events",
            headers={"Authorization": f"Bearer {u['token']}"},
        )
        assert res.status_code == 403, f"Expected 403 for {u['role']}, got {res.status_code}"

    # --- MEMBERS VIEW (MEMBERS_VIEW) ---
    # Allowed: Owner, Admin, Security Auditor
    # Forbidden (403): Data Scientist, Analyst, Viewer
    for u in [org, admin, auditor]:
        res = client.get(
            f"/api/v1/organizations/{org_id}/members",
            headers={"Authorization": f"Bearer {u['token']}"},
        )
        assert res.status_code == 200, f"Expected 200 for {u.get('role', 'owner')}: {res.text}"

    for u in [ds, analyst, viewer]:
        res = client.get(
            f"/api/v1/organizations/{org_id}/members",
            headers={"Authorization": f"Bearer {u['token']}"},
        )
        assert res.status_code == 403, f"Expected 403 for {u['role']}, got {res.status_code}"

    # --- MEMBERS INVITE (MEMBERS_INVITE) ---
    # Allowed: Owner, Admin
    # Forbidden (403): Data Scientist, Analyst, Viewer, Security Auditor
    for u in [org, admin]:
        inv_email = _unique_email("new_invite")
        client.post(
            "/api/v1/auth/register",
            json={
                "email": inv_email,
                "password": "StrongPassword123!",
                "display_name": "New Invited User",
                "organization_name": f"Dummy {uuid.uuid4().hex[:4]}",
            },
        )
        res = client.post(
            f"/api/v1/organizations/{org_id}/members",
            headers={"Authorization": f"Bearer {u['token']}"},
            json={"email": inv_email, "role": Role.VIEWER.value},
        )
        assert res.status_code == 201, f"Expected 201 for {u.get('role', 'owner')}: {res.text}"

    for u in [ds, analyst, viewer, auditor]:
        res = client.post(
            f"/api/v1/organizations/{org_id}/members",
            headers={"Authorization": f"Bearer {u['token']}"},
            json={"email": _unique_email("forbidden_invite"), "role": Role.VIEWER.value},
        )
        assert res.status_code == 403, f"Expected 403 for {u['role']}, got {res.status_code}"


# =========================================================================
# 3. PROJECT-LEVEL ACCESS ISOLATION
# =========================================================================

def test_project_level_membership_isolation(client):
    """Verify that a Data Scientist in Project A cannot access Project B."""
    org = register_org(client, "Project Isolation Org", "proj_owner")
    org_id = org["org_id"]
    owner_token = org["token"]

    ds = create_user_with_role(client, org_id, owner_token, Role.DATA_SCIENTIST)

    # Owner creates Project A and Project B
    res_a = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Project A"},
    )
    assert res_a.status_code == 201
    proj_a_id = res_a.json()["id"]

    res_b = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Project B"},
    )
    assert res_b.status_code == 201
    proj_b_id = res_b.json()["id"]

    # Assign DS only to Project A
    assign_res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_a_id}/members",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"user_id": ds["user_id"], "role": Role.DATA_SCIENTIST.value},
    )
    assert assign_res.status_code == 201

    # DS lists projects -> should only see Project A
    list_res = client.get(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {ds['token']}"},
    )
    assert list_res.status_code == 200
    listed_ids = [p["id"] for p in list_res.json()["items"]]
    assert proj_a_id in listed_ids
    assert proj_b_id not in listed_ids, "Unassigned Project B must NOT be visible in projects list"

    # DS attempts to access Project B details directly -> 403 Forbidden
    direct_b = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_b_id}",
        headers={"Authorization": f"Bearer {ds['token']}"},
    )
    assert direct_b.status_code == 403, f"Expected 403 for unassigned Project B, got {direct_b.status_code}"

    # DS attempts to create an experiment in Project B -> 403 Forbidden
    exp_in_b = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_b_id}/experiments",
        headers={"Authorization": f"Bearer {ds['token']}"},
        json={
            "name": "Intruder Exp",
            "dataset_version": "v1.0",
            "dataset_fingerprint": "fp_x",
            "problem_type": "binary_classification",
            "target_name": "y",
            "primary_metric": "accuracy",
        },
    )
    assert exp_in_b.status_code == 403, f"Expected 403 for unassigned Project B experiment create, got {exp_in_b.status_code}"

    # DS CAN access Project A
    direct_a = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_a_id}",
        headers={"Authorization": f"Bearer {ds['token']}"},
    )
    assert direct_a.status_code == 200


# =========================================================================
# 4. CROSS-TENANT ISOLATION
# =========================================================================

def test_cross_tenant_isolation(client):
    """Verify that users from Organization A cannot access Organization B resources."""
    org_a = register_org(client, "Tenant Alpha", "alpha_owner")
    org_b = register_org(client, "Tenant Beta", "beta_owner")

    a_admin = create_user_with_role(client, org_a["org_id"], org_a["token"], Role.ADMIN)
    a_ds = create_user_with_role(client, org_a["org_id"], org_a["token"], Role.DATA_SCIENTIST)
    a_viewer = create_user_with_role(client, org_a["org_id"], org_a["token"], Role.VIEWER)

    # Beta creates Project in Beta
    b_proj_res = client.post(
        f"/api/v1/organizations/{org_b['org_id']}/projects",
        headers={"Authorization": f"Bearer {org_b['token']}"},
        json={"name": "Beta Classified Initiative"},
    )
    assert b_proj_res.status_code == 201
    b_proj_id = b_proj_res.json()["id"]

    # All Alpha users attempting to access Beta's project -> 403 Forbidden
    for u in [org_a, a_admin, a_ds, a_viewer]:
        res = client.get(
            f"/api/v1/organizations/{org_b['org_id']}/projects/{b_proj_id}",
            headers={"Authorization": f"Bearer {u['token']}"},
        )
        assert res.status_code == 403, f"Cross-tenant leak: expected 403, got {res.status_code}"

    # Alpha Admin attempting to list Beta's audit logs -> 403 Forbidden
    res = client.get(
        f"/api/v1/organizations/{org_b['org_id']}/audit-events",
        headers={"Authorization": f"Bearer {a_admin['token']}"},
    )
    assert res.status_code == 403

    # Alpha Admin attempting to invite user to Beta -> 403 Forbidden
    res = client.post(
        f"/api/v1/organizations/{org_b['org_id']}/members",
        headers={"Authorization": f"Bearer {a_admin['token']}"},
        json={"email": "hacker@example.com", "role": "admin"},
    )
    assert res.status_code == 403


# =========================================================================
# 5. ANTI-PRIVILEGE ESCALATION
# =========================================================================

def test_self_privilege_escalation_is_blocked(client):
    """Verify that users cannot promote themselves or tamper with permissions."""
    org = register_org(client, "Privilege Escalation Defense Org", "def_owner")
    org_id = org["org_id"]
    owner_token = org["token"]
    owner_member_id = org["user_id"]

    admin = create_user_with_role(client, org_id, owner_token, Role.ADMIN)
    ds = create_user_with_role(client, org_id, owner_token, Role.DATA_SCIENTIST)
    viewer = create_user_with_role(client, org_id, owner_token, Role.VIEWER)

    # 1. Data Scientist tries to make themselves Owner -> 403 Forbidden
    res = client.patch(
        f"/api/v1/organizations/{org_id}/members/{ds['member_id']}",
        headers={"Authorization": f"Bearer {ds['token']}"},
        json={"role": "owner"},
    )
    assert res.status_code == 403, "Data Scientist must NOT be able to modify roles"

    # 2. Viewer tries to make themselves Admin -> 403 Forbidden
    res = client.patch(
        f"/api/v1/organizations/{org_id}/members/{viewer['member_id']}",
        headers={"Authorization": f"Bearer {viewer['token']}"},
        json={"role": "admin"},
    )
    assert res.status_code == 403, "Viewer must NOT be able to modify roles"

    # 3. Admin tries to change their own role -> 403 Forbidden
    res = client.patch(
        f"/api/v1/organizations/{org_id}/members/{admin['member_id']}",
        headers={"Authorization": f"Bearer {admin['token']}"},
        json={"role": "owner"},
    )
    assert res.status_code == 403, "Admin cannot promote themselves to Owner"

    # 4. Admin tries to promote DS to Owner -> 403 Forbidden (Only Owner can grant Owner)
    res = client.patch(
        f"/api/v1/organizations/{org_id}/members/{ds['member_id']}",
        headers={"Authorization": f"Bearer {admin['token']}"},
        json={"role": "owner"},
    )
    assert res.status_code == 403, "Admin cannot grant Owner role"

    # 5. Admin tries to demote or remove the Owner -> 403 Forbidden
    # Fetch owner's membership id
    members = client.get(
        f"/api/v1/organizations/{org_id}/members",
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()
    owner_mem = next(m for m in members if m["role"] == "owner")

    demote_res = client.patch(
        f"/api/v1/organizations/{org_id}/members/{owner_mem['id']}",
        headers={"Authorization": f"Bearer {admin['token']}"},
        json={"role": "viewer"},
    )
    assert demote_res.status_code == 403, "Admin cannot demote Owner"

    remove_res = client.delete(
        f"/api/v1/organizations/{org_id}/members/{owner_mem['id']}",
        headers={"Authorization": f"Bearer {admin['token']}"},
    )
    assert remove_res.status_code == 403, "Admin cannot remove Owner"


# =========================================================================
# 6. MODEL APPROVAL & SEPARATION OF DUTIES
# =========================================================================

def test_model_approval_permissions(client):
    """Verify that MODEL_APPROVE is enforced on deployment approval."""
    org = register_org(client, "Approval Governance Org", "gov_owner")
    org_id = org["org_id"]
    owner_token = org["token"]

    admin = create_user_with_role(client, org_id, owner_token, Role.ADMIN)
    ds = create_user_with_role(client, org_id, owner_token, Role.DATA_SCIENTIST)
    viewer = create_user_with_role(client, org_id, owner_token, Role.VIEWER)

    # Create project and assign DS and Viewer
    proj_res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={"name": "Governance Project"},
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    for u in [ds, viewer]:
        client.post(
            f"/api/v1/organizations/{org_id}/projects/{proj_id}/members",
            headers={"Authorization": f"Bearer {owner_token}"},
            json={"user_id": u["user_id"], "role": Role.DATA_SCIENTIST.value},
        )

    # Create baseline experiment
    exp_res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": "Governance Benchmark",
            "dataset_version": "v1.0",
            "dataset_fingerprint": "fp_gov",
            "problem_type": "binary_classification",
            "target_name": "approved",
            "primary_metric": "f1",
        },
    )
    assert exp_res.status_code == 201
    exp_id = exp_res.json()["id"]

    # Create deployment in pending_approval state
    dep_res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}/deployments",
        headers={"Authorization": f"Bearer {owner_token}"},
        json={
            "name": "High Stakes Production Service",
            "deployment_type": "local",
            "endpoint_url": "http://localhost:8080",
            "prediction_path": "/predict",
        },
    )
    assert dep_res.status_code == 201
    dep_id = dep_res.json()["id"]

    # Viewer tries to approve -> 403 Forbidden
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id}/approve",
        headers={"Authorization": f"Bearer {viewer['token']}"},
        json={"notes": "Viewer approval attempt"},
    )
    assert res.status_code == 403, f"Viewer must not approve deployments (got {res.status_code})"

    # Data Scientist tries to approve -> 403 Forbidden (requires MODEL_APPROVE, restricted from DS)
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id}/approve",
        headers={"Authorization": f"Bearer {ds['token']}"},
        json={"notes": "DS approval attempt"},
    )
    assert res.status_code == 403, f"Data Scientist must not approve deployment (got {res.status_code})"

    # Admin CAN approve
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/deployments/{dep_id}/approve",
        headers={"Authorization": f"Bearer {admin['token']}"},
        json={"notes": "Admin approval authorized"},
    )
    assert res.status_code == 200, f"Admin must be able to approve (got {res.status_code})"
    assert res.json()["status"] == "active"
