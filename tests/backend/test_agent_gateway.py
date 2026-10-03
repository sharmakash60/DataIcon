"""Backend integration tests for Client Data Agent Gateway and Dataset Profiling."""

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine import make_url

from app.config import Settings
from app.main import create_app
from app.models import ProfileSummary

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]


@pytest.fixture
def test_db():
    settings = Settings()
    base_url = make_url(str(settings.database_url))
    name = f"datapilot_agent_test_{uuid.uuid4().hex}"
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
            client.test_engine = engine
            yield client
    finally:
        engine.dispose()
        with admin.connect() as conn:
            conn.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')
        admin.dispose()


def test_agent_lifecycle_and_profiling_flow(test_db):
    client = test_db

    # 1. Register User & Org
    reg_res = client.post(
        "/api/v1/auth/register",
        json={
            "email": "corp_admin@example.com",
            "password": "SecurePassword123!",
            "display_name": "Corp Admin",
            "organization_name": "Healthcare Analytics",
        },
    )
    assert reg_res.status_code == 201
    user_token = reg_res.json()["access_token"]
    org_id = reg_res.json()["organizations"][0]["organization_id"]
    auth_headers = {"Authorization": f"Bearer {user_token}"}

    # 2. Create Project
    proj_res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        json={
            "name": "Clinical Profiling",
            "slug": "clinical-profiling",
            "description": "Local clinical dataset analysis",
            "classification": "confidential",
        },
        headers=auth_headers,
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # 3. Org Admin creates Agent Enrollment Token
    token_res = client.post(
        f"/api/v1/organizations/{org_id}/agent-tokens",
        headers=auth_headers,
    )
    assert token_res.status_code == 201
    enrollment_token = token_res.json()["token"]

    # 4. Agent enrolls with enrollment token
    enroll_res = client.post(
        "/agent/v1/enroll",
        json={
            "enrollment_token": enrollment_token,
            "approved_name": "lab-onprem-agent-01",
            "runtime_version": "0.2.0",
            "capabilities": ["csv", "parquet", "excel", "profiling"],
        },
    )
    assert enroll_res.status_code == 201
    agent_data = enroll_res.json()
    agent_id = agent_data["agent_id"]
    agent_token = agent_data["agent_token"]
    agent_headers = {"Authorization": f"Bearer {agent_token}"}

    # 5. Agent sends Heartbeat
    hb_res = client.post("/agent/v1/heartbeat", headers=agent_headers)
    assert hb_res.status_code == 200
    assert hb_res.json()["status"] == "ok"

    # 6. Agent registers a local dataset (Opaque reference only, NO raw paths or data)
    opaque_ref = "ds_ref_778899aabbcc"
    reg_ds_res = client.post(
        "/agent/v1/dataset-registrations",
        json={
            "project_id": proj_id,
            "opaque_local_ref": opaque_ref,
            "approved_alias": "patient_records",
            "format": "csv",
        },
        headers=agent_headers,
    )
    assert reg_ds_res.status_code == 201
    dataset_id = reg_ds_res.json()["dataset_id"]

    # 7. Org user queues a profile job for this dataset
    job_create_res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/profile-jobs",
        json={"dataset_id": dataset_id},
        headers=auth_headers,
    )
    assert job_create_res.status_code == 201
    job_id = job_create_res.json()["job_id"]

    # 8. Agent claims job
    claim_res = client.post("/agent/v1/jobs/claim", headers=agent_headers)
    assert claim_res.status_code == 200
    claimed = claim_res.json()
    assert claimed["job_id"] == job_id
    assert claimed["operation"] == "profile_dataset"
    assert claimed["payload"]["dataset_ref"] == opaque_ref
    lease_token = claimed["lease_token"]

    # 9. Agent submits permitted profile results
    profile_payload = {
        "schema_version": "1.0.0",
        "dataset_ref": opaque_ref,
        "format": "csv",
        "total_rows": 500,
        "total_columns": 3,
        "duplicate_rows_count": 0,
        "duplicate_rows_ratio": 0.0,
        "file_size_bytes": 10240,
        "constant_columns": [],
        "suspicious_columns": ["patient_email"],
        "correlations": [
            {"column_a": "patient_id", "column_b": "visit_cost", "pearson_coefficient": 0.12}
        ],
        "columns": [
            {
                "name": "patient_id",
                "data_type": "integer",
                "null_count": 0,
                "null_ratio": 0.0,
                "unique_count": 500,
                "cardinality_ratio": 1.0,
                "is_constant": False,
                "is_suspicious": False,
                "suspicious_reasons": [],
                "is_pii": False,
                "pii_types": [],
                "numeric_stats": {"min": 1.0, "max": 500.0, "mean": 250.5, "std": 144.3, "median": 250.5},
                "categorical_stats": None,
                "distribution": {"type": "histogram", "bin_edges": [1.0, 250.0, 500.0], "bin_counts": [250, 250]},
                "outliers": {"method": "iqr", "outlier_count": 0, "outlier_ratio": 0.0, "lower_bound": 1.0, "upper_bound": 500.0},
                "quality_issues": [],
            },
            {
                "name": "patient_email",
                "data_type": "string",
                "null_count": 5,
                "null_ratio": 0.01,
                "unique_count": 495,
                "cardinality_ratio": 0.99,
                "is_constant": False,
                "is_suspicious": True,
                "suspicious_reasons": ["CONFIDENTIAL_PII"],
                "is_pii": True,
                "pii_types": ["EMAIL"],
                "numeric_stats": None,
                "categorical_stats": {
                    "top_categories_count": 1,
                    "mode": "<PII_REDACTED>",
                    "mode_frequency": 1,
                    "mode_ratio": 0.002,
                    "distinct_categories_count": 495,
                    "top_frequencies": [{"category": "<PII_REDACTED>", "count": 1, "ratio": 0.002}],
                },
                "distribution": None,
                "outliers": None,
                "quality_issues": [],
            },
            {
                "name": "visit_cost",
                "data_type": "float",
                "null_count": 0,
                "null_ratio": 0.0,
                "unique_count": 80,
                "cardinality_ratio": 0.16,
                "is_constant": False,
                "is_suspicious": False,
                "suspicious_reasons": [],
                "is_pii": False,
                "pii_types": [],
                "numeric_stats": {"min": 50.0, "max": 1200.0, "mean": 320.0, "std": 150.0, "median": 280.0},
                "categorical_stats": None,
                "distribution": {"type": "histogram", "bin_edges": [50.0, 500.0, 1200.0], "bin_counts": [400, 100]},
                "outliers": {"method": "iqr", "outlier_count": 5, "outlier_ratio": 0.01, "lower_bound": 50.0, "upper_bound": 1000.0},
                "quality_issues": [],
            },
        ],
        "quality_findings": [
            {
                "code": "PII_PRESENT",
                "severity": "medium",
                "message": "Column 'patient_email' contains PII patterns (EMAIL).",
                "column": "patient_email",
                "affected_ratio": 0.99,
            }
        ],
        "profiled_at": datetime.now(UTC).isoformat(),
    }

    submit_res = client.post(
        f"/agent/v1/jobs/{job_id}/results",
        json={
            "lease_token": lease_token,
            "profile": profile_payload,
        },
        headers=agent_headers,
    )
    assert submit_res.status_code == 200
    assert submit_res.json()["status"] == "accepted"

    # 10. Verify via user API
    get_profile_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/datasets/{dataset_id}/profiles",
        headers=auth_headers,
    )
    assert get_profile_res.status_code == 200
    saved_profile = get_profile_res.json()
    assert saved_profile["total_rows"] == 500
    assert saved_profile["total_columns"] == 3

    # 11. CRITICAL DATABASE ASSERTION:
    # Query database directly and verify zero raw data / row values exist in profile_summaries
    with client.test_engine.connect() as conn:
        row = conn.execute(
            select(ProfileSummary).where(ProfileSummary.job_id == uuid.UUID(job_id))
        ).one()
        stored_payload = row.permitted_payload
        assert "patient_id" in stored_payload
        assert "patient_email" in stored_payload
        # Prove no raw data row contents or records
        assert "row_" not in stored_payload
        assert "records" not in stored_payload
        assert "sample" not in stored_payload


def test_agent_gateway_security_negative_cases(test_db):
    client = test_db

    # 1. Invalid enrollment token -> 401
    bad_enroll = client.post(
        "/agent/v1/enroll",
        json={
            "enrollment_token": "non_existent_token_12345",
            "approved_name": "rogue-agent",
            "runtime_version": "0.2.0",
        },
    )
    assert bad_enroll.status_code == 401

    # 2. Missing/invalid bearer token on heartbeat -> 401
    bad_hb = client.post(
        "/agent/v1/heartbeat",
        headers={"Authorization": "Bearer totally_bogus_token"},
    )
    assert bad_hb.status_code == 401

    # 3. Create two distinct orgs to test tenant isolation
    reg_a = client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin_a@example.com",
            "password": "Password123!",
            "display_name": "Admin A",
            "organization_name": "Org Alpha",
        },
    )
    assert reg_a.status_code == 201
    token_a = reg_a.json()["access_token"]
    org_a_id = reg_a.json()["organizations"][0]["organization_id"]

    reg_b = client.post(
        "/api/v1/auth/register",
        json={
            "email": "admin_b@example.com",
            "password": "Password123!",
            "display_name": "Admin B",
            "organization_name": "Org Beta",
        },
    )
    assert reg_b.status_code == 201
    token_b = reg_b.json()["access_token"]
    org_b_id = reg_b.json()["organizations"][0]["organization_id"]

    # Create project in Org A
    proj_a = client.post(
        f"/api/v1/organizations/{org_a_id}/projects",
        json={"name": "Alpha Project", "slug": "alpha-proj"},
        headers={"Authorization": f"Bearer {token_a}"},
    ).json()["id"]

    # Enroll agent in Org B
    token_b_enroll = client.post(
        f"/api/v1/organizations/{org_b_id}/agent-tokens",
        headers={"Authorization": f"Bearer {token_b}"},
    ).json()["token"]

    agent_b_res = client.post(
        "/agent/v1/enroll",
        json={
            "enrollment_token": token_b_enroll,
            "approved_name": "beta-agent",
            "runtime_version": "0.2.0",
        },
    )
    agent_b_token = agent_b_res.json()["agent_token"]
    agent_b_headers = {"Authorization": f"Bearer {agent_b_token}"}

    # Cross-tenant attack: Agent from Org B tries to register dataset into Org A's project -> 404
    cross_reg = client.post(
        "/agent/v1/dataset-registrations",
        json={
            "project_id": proj_a,
            "opaque_local_ref": "ref_attack",
            "approved_alias": "attack_ds",
            "format": "csv",
        },
        headers=agent_b_headers,
    )
    assert cross_reg.status_code == 404

