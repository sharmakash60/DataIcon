"""Backend Integration Tests for Platform Experiments and Model Tracking APIs."""

import os
from pathlib import Path
import uuid
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.engine.url import make_url

from app.config import Settings
from app.main import create_app
from app.models import Experiment, ExperimentRun, ExperimentTrial

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]


@pytest.fixture
def test_db():
    settings = Settings()
    base_url = make_url(str(settings.database_url))
    name = f"datapilot_exp_test_{uuid.uuid4().hex}"
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


def test_automl_experiment_ingest_and_retrieval(test_db):
    client = test_db

    # 1. Register organization & user
    reg = client.post(
        "/api/v1/auth/register",
        json={
            "email": "lead_ds@biotech.org",
            "password": "StrongPassword2026!",
            "display_name": "Dr. Lead DS",
            "organization_name": "Biotech Labs",
        },
    )
    assert reg.status_code == 201
    auth_data = reg.json()
    token = auth_data["access_token"]
    org_id = auth_data["organizations"][0]["organization_id"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Create Project
    proj = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        json={"name": "Tumor Classification", "classification": "confidential"},
        headers=headers,
    )
    assert proj.status_code == 201
    project_id = proj.json()["id"]

    # 3. Ingest AutoML Experiment Results (from local Client Data Plane)
    payload = {
        "experiment_name": "V1 Benchmark - 5 Algorithms + Baseline",
        "problem_type": "classification",
        "target_name": "malignant",
        "primary_metric": "roc_auc",
        "n_samples": 569,
        "n_features": 30,
        "feature_names": ["mean_radius", "mean_texture", "mean_perimeter"],
        "n_splits": 5,
        "validation_strategy": "stratified_k_fold",
        "baseline_score": 0.50,
        "best_model_name": "XGBoost (Tuned)",
        "best_score": 0.985,
        "leaderboard": [
            {
                "rank": 1,
                "model_name": "XGBoost (Tuned)",
                "algorithm_key": "xgboost_classifier",
                "is_baseline": False,
                "primary_metric_name": "roc_auc",
                "primary_metric_score": 0.985,
                "std_score": 0.008,
                "training_time_seconds": 0.12,
                "inference_latency_ms": 0.05,
                "is_best_model": True,
            },
            {
                "rank": 2,
                "model_name": "Random Forest",
                "algorithm_key": "random_forest_classifier",
                "is_baseline": False,
                "primary_metric_name": "roc_auc",
                "primary_metric_score": 0.978,
                "std_score": 0.010,
                "training_time_seconds": 0.25,
                "inference_latency_ms": 0.08,
                "is_best_model": False,
            },
            {
                "rank": 3,
                "model_name": "Baseline (Dummy)",
                "algorithm_key": "baseline",
                "is_baseline": True,
                "primary_metric_name": "roc_auc",
                "primary_metric_score": 0.500,
                "std_score": 0.000,
                "training_time_seconds": 0.001,
                "inference_latency_ms": 0.001,
                "is_best_model": False,
            },
        ],
        "benchmarks": [
            {
                "model_name": "XGBoost (Tuned)",
                "algorithm_key": "xgboost_classifier",
                "is_baseline": False,
                "hyperparameters": {"n_estimators": 60, "max_depth": 4},
                "cv_scores": [0.98, 0.99, 0.985, 0.98, 0.99],
                "mean_cv_score": 0.985,
                "std_cv_score": 0.008,
                "metrics": {"roc_auc": 0.985, "accuracy": 0.96, "f1": 0.95},
                "training_time_seconds": 0.12,
                "inference_latency_ms": 0.05,
            },
            {
                "model_name": "Random Forest",
                "algorithm_key": "random_forest_classifier",
                "is_baseline": False,
                "hyperparameters": {"n_estimators": 50},
                "cv_scores": [0.97, 0.98, 0.98, 0.975, 0.985],
                "mean_cv_score": 0.978,
                "std_cv_score": 0.010,
                "metrics": {"roc_auc": 0.978, "accuracy": 0.95, "f1": 0.94},
                "training_time_seconds": 0.25,
                "inference_latency_ms": 0.08,
            },
        ],
        "tuning_trials": [
            {
                "trial_number": 0,
                "model_name": "xgboost_classifier",
                "parameters": {"n_estimators": 30, "max_depth": 3},
                "score": 0.975,
                "state": "COMPLETE",
                "duration_seconds": 0.15,
            },
            {
                "trial_number": 1,
                "model_name": "xgboost_classifier",
                "parameters": {"n_estimators": 60, "max_depth": 4},
                "score": 0.985,
                "state": "COMPLETE",
                "duration_seconds": 0.18,
            },
        ],
        "total_execution_time_seconds": 4.5,
    }

    ingest_res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{project_id}/experiments/ingest",
        json=payload,
        headers=headers,
    )
    assert ingest_res.status_code == 201
    exp_data = ingest_res.json()
    assert exp_data["name"] == "V1 Benchmark - 5 Algorithms + Baseline"
    assert exp_data["best_model_name"] == "XGBoost (Tuned)"
    assert exp_data["best_score"] == 0.985
    assert len(exp_data["runs"]) == 2
    assert len(exp_data["trials"]) == 2

    exp_id = exp_data["id"]

    # 4. List experiments
    list_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{project_id}/experiments",
        headers=headers,
    )
    assert list_res.status_code == 200
    items = list_res.json()
    assert len(items) == 1
    assert items[0]["id"] == exp_id

    # 5. Get Experiment Detail
    detail_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{project_id}/experiments/{exp_id}",
        headers=headers,
    )
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["id"] == exp_id
    assert detail["runs"][0]["model_name"] == "XGBoost (Tuned)"
    assert detail["runs"][0]["metrics"]["accuracy"] == 0.96


def test_experiments_tenant_isolation(test_db):
    client = test_db

    # Org A
    reg_a = client.post(
        "/api/v1/auth/register",
        json={
            "email": "alice@corp-a.com",
            "password": "Password123!",
            "display_name": "Alice A",
            "organization_name": "Corp A",
        },
    )
    token_a = reg_a.json()["access_token"]
    org_a = reg_a.json()["organizations"][0]["organization_id"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    proj_a = client.post(
        f"/api/v1/organizations/{org_a}/projects",
        json={"name": "Project A"},
        headers=headers_a,
    ).json()["id"]

    exp_a = client.post(
        f"/api/v1/organizations/{org_a}/projects/{proj_a}/experiments",
        json={
            "name": "Experiment A",
            "problem_type": "classification",
            "target_name": "target",
            "primary_metric": "roc_auc",
        },
        headers=headers_a,
    ).json()["id"]

    # Org B
    reg_b = client.post(
        "/api/v1/auth/register",
        json={
            "email": "bob@corp-b.com",
            "password": "Password123!",
            "display_name": "Bob B",
            "organization_name": "Corp B",
        },
    )
    token_b = reg_b.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Bob attempts to access Alice's experiment
    cross_access = client.get(
        f"/api/v1/organizations/{org_a}/projects/{proj_a}/experiments/{exp_a}",
        headers=headers_b,
    )
    assert cross_access.status_code == 403

    cross_list = client.get(
        f"/api/v1/organizations/{org_a}/projects/{proj_a}/experiments",
        headers=headers_b,
    )
    assert cross_list.status_code == 403
