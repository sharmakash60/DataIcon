"""TEST-01: Authenticated HTTP integration tests — explainability & senior_report routers.

These tests exercise the real FastAPI application via ``TestClient`` against a
freshly migrated ephemeral Postgres database.  They require:

  - A reachable Postgres server (connection details from the ``Settings`` object).
  - ``RUN_INTEGRATION=1`` env var (same guard used by all other integration tests).

Coverage:
  Explainability router
    * POST  .../explainability  — 401 without token
    * POST  .../explainability  — 403 for wrong organization (cross-tenant)
    * POST  .../explainability  — 404 for missing experiment
    * POST  .../explainability  — 400 when experiment_id mismatch
    * POST  .../explainability  — 201 happy path (model-derived facts stored)
    * GET   .../explainability  — 200 list returns ingested record
    * GET   .../explainability/{id} — 200 round-trip field integrity
    * GET   .../explainability  — 401 without token
    * GET   .../explainability  — 403 for wrong organization

  Senior report router
    * GET   .../reports         — 401 without token
    * GET   .../reports         — 403 for wrong organization
    * GET   .../reports         — 404 for missing experiment
    * POST  .../reports         — 401 without token
    * POST  .../reports         — 403 for wrong organization
    * POST  .../reports         — 404 for missing experiment
    * POST  .../reports         — 201 generates all 18 sections (deterministic)
    * GET   .../reports         — 200 list returns generated report summary
    * GET   .../reports/{id}    — 200 round-trip section count
    * GET   .../reports/{id}    — 403 cross-tenant isolation
"""
from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.config import Settings
from app.enums import ProjectClassification
from app.main import create_app

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "backend" / "alembic.ini"


def _migrate(engine, target: str = "head") -> None:
    cfg = Config(str(_ALEMBIC_INI))
    with engine.begin() as conn:
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, target)


def _register(client: TestClient, email: str, org: str) -> tuple[str, str]:
    """Register a user; return (access_token, org_id)."""
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "display_name": email.split("@")[0],
            "organization_name": org,
        },
    )
    assert res.status_code == 201, res.text
    data = res.json()
    return data["access_token"], data["organizations"][0]["organization_id"]


def _create_project(client: TestClient, token: str, org_id: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": f"Test project {uuid.uuid4().hex[:6]}",
            "purpose": "Integration test",
            "classification": ProjectClassification.INTERNAL.value,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _create_experiment(client: TestClient, token: str, org_id: str, project_id: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{project_id}/experiments",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "AutoML Benchmark",
            "problem_type": "binary_classification",
            "target_name": "churn",
            "primary_metric": "roc_auc",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def _make_explainability_payload(exp_id: str) -> dict:
    feature = {
        "feature_name": "contract_type",
        "importance_value": 0.48,
        "importance_rank": 1,
        "std_error": 0.02,
        "method": "shap_global",
        "source": "model_derived",
    }
    return {
        "schema_version": "explainability/v1",
        "experiment_id": exp_id,
        "experiment_run_id": None,
        "model_name": "RandomForest",
        "problem_type": "binary_classification",
        "target_name": "churn",
        "primary_metric": "roc_auc",
        "primary_metric_value": 0.87,
        "n_eval_samples": 500,
        "explained_at": datetime.now(UTC).isoformat(),
        "global_shap": {
            "method": "shap_global",
            "features": [feature],
            "n_samples_used": 300,
            "baseline_value": 0.42,
            "source": "model_derived",
        },
        "permutation_importance": {
            "features": [feature],
            "metric_used": "roc_auc",
            "n_repeats": 10,
            "n_samples_evaluated": 500,
            "source": "model_derived",
        },
        "local_explanations": [],
        "error_analysis": {
            "problem_type": "binary_classification",
            "overall_metric_value": 0.87,
            "overall_error_rate": 0.10,
            "confusion_matrix": [
                {"actual_label": "0", "predicted_label": "0", "count": 900, "rate": 0.90, "source": "model_derived"},
                {"actual_label": "1", "predicted_label": "1", "count": 70, "rate": 0.70, "source": "model_derived"},
            ],
            "worst_segments": [],
            "best_segments": [],
            "source": "model_derived",
        },
        "user_assumptions": [
            {"key": "CAC", "value": "$500", "source": "user_assumption"}
        ],
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def test_db():
    """Ephemeral Postgres DB per module — migrated to head, torn down on exit."""
    settings = Settings()
    base_url = make_url(str(settings.database_url))
    name = f"datapilot_test_http_{uuid.uuid4().hex}"
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.exec_driver_sql(f'CREATE DATABASE "{name}"')
    url = base_url.set(database=name)
    engine = create_engine(url)
    _migrate(engine)
    test_settings = Settings(database_url=url.render_as_string(hide_password=False))
    app = create_app(test_settings)
    with TestClient(app) as client:
        yield client
    engine.dispose()
    with admin.connect() as conn:
        conn.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')
    admin.dispose()


@pytest.fixture(scope="module")
def ctx(test_db):
    """Registers a primary user + creates org/project/experiment. Returns context dict."""
    client = test_db
    token, org_id = _register(client, "ds@example.com", "DataPilot Test Org")
    project_id = _create_project(client, token, org_id)
    exp_id = _create_experiment(client, token, org_id, project_id)
    return {
        "token": token,
        "org_id": org_id,
        "project_id": project_id,
        "exp_id": exp_id,
        "headers": {"Authorization": f"Bearer {token}"},
    }


@pytest.fixture(scope="module")
def outsider_token(test_db):
    """Token for a user from a different organisation."""
    token, _ = _register(test_db, "outsider@other.com", "Other Org")
    return token


# ---------------------------------------------------------------------------
# Explainability router HTTP tests
# ---------------------------------------------------------------------------

class TestExplainabilityHttpRouter:
    def _url(self, ctx, suffix=""):
        return (
            f"/api/v1/organizations/{ctx['org_id']}"
            f"/projects/{ctx['project_id']}"
            f"/experiments/{ctx['exp_id']}/explainability"
            + suffix
        )

    # Auth / access-control
    def test_ingest_requires_auth(self, test_db, ctx):
        res = test_db.post(self._url(ctx), json=_make_explainability_payload(ctx["exp_id"]))
        assert res.status_code == 401

    def test_ingest_wrong_org_returns_403(self, test_db, ctx, outsider_token):
        res = test_db.post(
            self._url(ctx),
            headers={"Authorization": f"Bearer {outsider_token}"},
            json=_make_explainability_payload(ctx["exp_id"]),
        )
        assert res.status_code == 403

    def test_ingest_missing_experiment_returns_404(self, test_db, ctx):
        fake_exp = str(uuid.uuid4())
        url = (
            f"/api/v1/organizations/{ctx['org_id']}"
            f"/projects/{ctx['project_id']}"
            f"/experiments/{fake_exp}/explainability"
        )
        res = test_db.post(url, headers=ctx["headers"], json=_make_explainability_payload(fake_exp))
        assert res.status_code == 404

    def test_ingest_experiment_id_mismatch_returns_400(self, test_db, ctx):
        payload = _make_explainability_payload(str(uuid.uuid4()))  # deliberate mismatch
        res = test_db.post(self._url(ctx), headers=ctx["headers"], json=payload)
        assert res.status_code == 400

    # Happy path — run before list/get tests so they can reference the inserted record
    def test_ingest_happy_path_201(self, test_db, ctx):
        payload = _make_explainability_payload(ctx["exp_id"])
        res = test_db.post(self._url(ctx), headers=ctx["headers"], json=payload)
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["model_name"] == "RandomForest"
        assert abs(data["primary_metric_value"] - 0.87) < 1e-6
        assert data["provenance_verified"] is True
        # Persist ID for subsequent tests
        ctx["expl_id"] = data["id"]

    def test_list_returns_ingested_record(self, test_db, ctx):
        res = test_db.get(self._url(ctx), headers=ctx["headers"])
        assert res.status_code == 200
        assert ctx["expl_id"] in [r["id"] for r in res.json()]

    def test_get_single_round_trip(self, test_db, ctx):
        res = test_db.get(self._url(ctx, f"/{ctx['expl_id']}"), headers=ctx["headers"])
        assert res.status_code == 200
        assert res.json()["model_name"] == "RandomForest"

    def test_list_requires_auth(self, test_db, ctx):
        res = test_db.get(self._url(ctx))
        assert res.status_code == 401

    def test_list_wrong_org_returns_403(self, test_db, ctx, outsider_token):
        res = test_db.get(self._url(ctx), headers={"Authorization": f"Bearer {outsider_token}"})
        assert res.status_code == 403


# ---------------------------------------------------------------------------
# Senior report router HTTP tests
# ---------------------------------------------------------------------------

class TestSeniorReportHttpRouter:
    def _url(self, ctx, suffix=""):
        return (
            f"/api/v1/organizations/{ctx['org_id']}"
            f"/projects/{ctx['project_id']}"
            f"/experiments/{ctx['exp_id']}/reports"
            + suffix
        )

    def _missing_exp_url(self, ctx):
        return (
            f"/api/v1/organizations/{ctx['org_id']}"
            f"/projects/{ctx['project_id']}"
            f"/experiments/{uuid.uuid4()}/reports"
        )

    # Auth / access-control — list
    def test_list_requires_auth(self, test_db, ctx):
        res = test_db.get(self._url(ctx))
        assert res.status_code == 401

    def test_list_wrong_org_returns_403(self, test_db, ctx, outsider_token):
        res = test_db.get(self._url(ctx), headers={"Authorization": f"Bearer {outsider_token}"})
        assert res.status_code == 403

    def test_list_missing_experiment_returns_404(self, test_db, ctx):
        res = test_db.get(self._missing_exp_url(ctx), headers=ctx["headers"])
        assert res.status_code == 404

    # Auth / access-control — create
    def test_create_requires_auth(self, test_db, ctx):
        res = test_db.post(self._url(ctx), json={"title": "Report"})
        assert res.status_code == 401

    def test_create_wrong_org_returns_403(self, test_db, ctx, outsider_token):
        res = test_db.post(
            self._url(ctx),
            headers={"Authorization": f"Bearer {outsider_token}"},
            json={"title": "Report"},
        )
        assert res.status_code == 403

    def test_create_missing_experiment_returns_404(self, test_db, ctx):
        res = test_db.post(
            self._missing_exp_url(ctx),
            headers=ctx["headers"],
            json={"title": "Report"},
        )
        assert res.status_code == 404

    # Happy path
    def test_create_generates_23_sections(self, test_db, ctx):
        res = test_db.post(
            self._url(ctx),
            headers=ctx["headers"],
            json={"title": "Senior DS Report: Churn", "include_ai_synthesis": False},
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["provenance_verified"] is True
        assert len(data["sections"]) == 23
        section_keys = {s["key"] for s in data["sections"]}
        expected = {
            "executive_summary", "business_understanding", "problem_formulation",
            "dataset_overview", "data_quality", "privacy_classification",
            "leakage_analysis", "exploratory_analysis", "feature_engineering",
            "baseline", "experiment_methodology", "models_evaluated",
            "cross_validation", "hyperparameter_optimization", "model_comparison",
            "recommended_candidate", "explainability", "error_analysis",
            "risk_analysis", "limitations", "deployment_recommendation",
            "monitoring_recommendation", "reproducibility_information",
        }
        assert section_keys == expected
        ctx["report_id"] = data["id"]

    def test_list_returns_created_report(self, test_db, ctx):
        res = test_db.get(self._url(ctx), headers=ctx["headers"])
        assert res.status_code == 200
        assert ctx["report_id"] in [r["id"] for r in res.json()]

    def test_get_single_23_sections(self, test_db, ctx):
        res = test_db.get(self._url(ctx, f"/{ctx['report_id']}"), headers=ctx["headers"])
        assert res.status_code == 200
        assert len(res.json()["sections"]) == 23

    def test_get_single_cross_tenant_rejected(self, test_db, ctx, outsider_token):
        res = test_db.get(
            self._url(ctx, f"/{ctx['report_id']}"),
            headers={"Authorization": f"Bearer {outsider_token}"},
        )
        assert res.status_code == 403
