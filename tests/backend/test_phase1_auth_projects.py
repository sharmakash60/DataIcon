import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.config import Settings
from app.enums import ProjectClassification, Role
from app.main import create_app

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]


@pytest.fixture
def test_db():
    settings = Settings()
    base_url = make_url(str(settings.database_url))
    name = f"datapilot_phase1_test_{uuid.uuid4().hex}"
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.exec_driver_sql(f'CREATE DATABASE "{name}"')
    url = base_url.set(database=name)
    engine = create_engine(url)

    # Run migrations
    config = Config(str(Path(__file__).resolve().parents[2] / "backend" / "alembic.ini"))
    with engine.begin() as conn:
        config.attributes["connection"] = conn
        command.upgrade(config, "head")

    test_settings = Settings(database_url=url.render_as_string(hide_password=False))
    app = create_app(test_settings)
    try:
        with TestClient(app) as client:
            yield client
    finally:
        engine.dispose()
        with admin.connect() as conn:
            conn.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')
        admin.dispose()


def test_auth_registration_and_login(test_db):
    client = test_db

    # 1. Password length check (< 8 chars) -> 422 Unprocessable Entity
    short_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user1@example.com",
            "password": "short",
            "display_name": "User One",
            "organization_name": "Org One",
        },
    )
    assert short_res.status_code == 422

    # Password complexity check (no number/symbol) -> 400 Bad Request
    weak_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user1@example.com",
            "password": "onlylettershere",
            "display_name": "User One",
            "organization_name": "Org One",
        },
    )
    assert weak_res.status_code == 400
    assert "at least one number or special character" in weak_res.text

    # 2. Successful Registration
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user1@example.com",
            "password": "Password123!",
            "display_name": "User One",
            "organization_name": "Acme Corp",
        },
    )
    assert reg_res.status_code == 201
    data = reg_res.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["email"] == "user1@example.com"
    assert len(data["organizations"]) == 1
    assert data["organizations"][0]["role"] == Role.OWNER.value
    org_id = data["organizations"][0]["organization_id"]

    # 3. Duplicate Registration Rejection
    dup_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user1@example.com",
            "password": "Password123!",
            "display_name": "User One",
            "organization_name": "Another Corp",
        },
    )
    assert dup_res.status_code == 400

    # 4. Login with valid credentials
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "user1@example.com", "password": "Password123!"},
    )
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    refresh_tok = login_res.json()["refresh_token"]

    # 5. Login with invalid credentials returns generic 401
    bad_login = client.post(
        "/api/v1/auth/login",
        json={"email": "user1@example.com", "password": "WrongPassword99!"},
    )
    assert bad_login.status_code == 401
    assert bad_login.json()["detail"] == "Invalid email or password"

    # 6. /me endpoint
    headers = {"Authorization": f"Bearer {token}"}
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    assert me_res.json()["user"]["email"] == "user1@example.com"
    assert me_res.json()["organizations"][0]["organization_id"] == org_id

    # 7. Refresh token rotation
    ref_res = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
    assert ref_res.status_code == 200
    new_refresh = ref_res.json()["refresh_token"]
    assert new_refresh != refresh_tok

    # Old refresh token should now be rejected
    stale_ref = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
    assert stale_ref.status_code == 401

    # 8. Logout revokes active tokens
    logout_res = client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    after_logout_ref = client.post("/api/v1/auth/refresh", json={"refresh_token": new_refresh})
    assert after_logout_ref.status_code == 401


def test_tenant_isolation_and_rbac(test_db):
    client = test_db

    # Register User A in Org A
    res_a = client.post(
        "/api/v1/auth/register",
        json={
            "email": "alice@org-a.com",
            "password": "Password123!",
            "display_name": "Alice",
            "organization_name": "Org A",
        },
    )
    token_a = res_a.json()["access_token"]
    org_a_id = res_a.json()["organizations"][0]["organization_id"]

    # Register User B in Org B
    res_b = client.post(
        "/api/v1/auth/register",
        json={
            "email": "bob@org-b.com",
            "password": "Password123!",
            "display_name": "Bob",
            "organization_name": "Org B",
        },
    )
    token_b = res_b.json()["access_token"]
    org_b_id = res_b.json()["organizations"][0]["organization_id"]

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Alice creates Project in Org A
    proj_a = client.post(
        f"/api/v1/organizations/{org_a_id}/projects",
        headers=headers_a,
        json={
            "name": "Fraud Detection",
            "purpose": "Detect transaction fraud",
            "classification": ProjectClassification.CONFIDENTIAL.value,
        },
    )
    assert proj_a.status_code == 201
    proj_a_id = proj_a.json()["id"]

    # CROSS-TENANT NEGATIVE TEST 1:
    # Bob (Org B) cannot list projects of Org A (returns 403 Forbidden)
    cross_list = client.get(
        f"/api/v1/organizations/{org_a_id}/projects",
        headers=headers_b,
    )
    assert cross_list.status_code == 403

    # CROSS-TENANT NEGATIVE TEST 2:
    # Bob (Org B) cannot get Project A directly (returns 403 Forbidden)
    cross_get = client.get(
        f"/api/v1/organizations/{org_a_id}/projects/{proj_a_id}",
        headers=headers_b,
    )
    assert cross_get.status_code == 403

    # CROSS-TENANT NEGATIVE TEST 3:
    # Bob trying to pass Bob's Org B with Project A's ID returns 404 (IDOR safe)
    idor_attempt = client.get(
        f"/api/v1/organizations/{org_b_id}/projects/{proj_a_id}",
        headers=headers_b,
    )
    assert idor_attempt.status_code == 404

    # Alice registers Charlie and adds him to Org A as a Viewer
    res_c = client.post(
        "/api/v1/auth/register",
        json={
            "email": "charlie@org-a.com",
            "password": "Password123!",
            "display_name": "Charlie",
            "organization_name": "Charlie Personal Org",
        },
    )
    token_c = res_c.json()["access_token"]
    headers_c = {"Authorization": f"Bearer {token_c}"}

    add_member = client.post(
        f"/api/v1/organizations/{org_a_id}/members",
        headers=headers_a,
        json={"email": "charlie@org-a.com", "role": Role.VIEWER.value},
    )
    assert add_member.status_code == 201

    # RBAC NEGATIVE TEST:
    # Charlie is a Viewer in Org A -> Charlie can read projects
    charlie_read = client.get(
        f"/api/v1/organizations/{org_a_id}/projects/{proj_a_id}",
        headers=headers_c,
    )
    assert charlie_read.status_code == 200

    # Charlie as Viewer CANNOT create a project (403 Forbidden)
    charlie_create = client.post(
        f"/api/v1/organizations/{org_a_id}/projects",
        headers=headers_c,
        json={"name": "Unauthorized Project"},
    )
    assert charlie_create.status_code == 403

    # Charlie as Viewer CANNOT delete a project (403 Forbidden)
    charlie_delete = client.delete(
        f"/api/v1/organizations/{org_a_id}/projects/{proj_a_id}",
        headers=headers_c,
    )
    assert charlie_delete.status_code == 403

    # Alice as Owner CAN update the project
    alice_update = client.patch(
        f"/api/v1/organizations/{org_a_id}/projects/{proj_a_id}",
        headers=headers_a,
        json={"purpose": "Updated fraud purpose"},
    )
    assert alice_update.status_code == 200
    assert alice_update.json()["purpose"] == "Updated fraud purpose"

    # Alice as Owner CAN read audit events for Org A
    audit_res = client.get(
        f"/api/v1/organizations/{org_a_id}/audit-events",
        headers=headers_a,
    )
    assert audit_res.status_code == 200
    events = audit_res.json()["items"]
    assert len(events) > 0
    actions = [e["action"] for e in events]
    assert "project.create" in actions
    assert "project.update" in actions

    # Charlie as Viewer CANNOT read audit logs (403 Forbidden)
    charlie_audit = client.get(
        f"/api/v1/organizations/{org_a_id}/audit-events",
        headers=headers_c,
    )
    assert charlie_audit.status_code == 403

    # Alice deletes the project
    del_res = client.delete(
        f"/api/v1/organizations/{org_a_id}/projects/{proj_a_id}",
        headers=headers_a,
    )
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"


def test_project_validation_and_token_rejection(test_db):
    client = test_db

    # Register user
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "dev@corp.com",
            "password": "Password123!",
            "display_name": "Dev User",
            "organization_name": "Dev Corp",
        },
    )
    token = reg.json()["access_token"]
    org_id = reg.json()["organizations"][0]["organization_id"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Unauthenticated request rejected with 401
    unauth = client.get(f"/api/v1/organizations/{org_id}/projects")
    assert unauth.status_code == 401

    # 2. Invalid token rejected with 401
    bad_token = client.get(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )
    assert bad_token.status_code == 401

    # 3. Blank project name rejected with 400
    blank_name = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers=headers,
        json={"name": "   "},
    )
    assert blank_name.status_code == 400

    # 4. Create project
    p1 = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers=headers,
        json={"name": "Churn Prediction"},
    )
    assert p1.status_code == 201

    # 5. Duplicate project name in same org rejected with 400
    dup_p = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers=headers,
        json={"name": "Churn Prediction"},
    )
    assert dup_p.status_code == 400
    assert "already exists" in dup_p.text

    # 6. Pagination check
    list_res = client.get(
        f"/api/v1/organizations/{org_id}/projects?limit=10&offset=0",
        headers=headers,
    )
    assert list_res.status_code == 200
    assert list_res.json()["total"] == 1
    assert len(list_res.json()["items"]) == 1

