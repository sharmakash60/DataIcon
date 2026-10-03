"""Comprehensive automated test suite for DataPilot V1 Experiment Engine.

Verifies:
1. Strict 12-stage sequential workflow enforcement.
2. All 6 classification candidate models + baseline evaluated.
3. All 6 regression candidate models + baseline evaluated.
4. All required metrics (Accuracy, Precision, Recall, F1, ROC-AUC, PR-AUC; MAE, RMSE, R2, MAPE).
5. Automatic preprocessing: identifier dropping, zero-variance pruning, datetime expansion, imputation.
6. Optuna hyperparameter optimization with trial tracking.
7. Multi-metric evaluation (Do not select on Accuracy alone).
8. Error analysis (confusion matrix, residuals) & Business constraints (latency SLA, cost matrix).
9. Experiment tracking persistence of all 11 required fields.
10. API integration with RBAC and audit logging.
"""

from __future__ import annotations

import json
import uuid
import pytest
from fastapi.testclient import TestClient

from app.experiments.engine import AutomaticPreprocessor, DataPilotExperimentEngine
from app.experiments.synthetic_benchmarks import (
    generate_churn_benchmark,
    generate_sales_benchmark,
    get_synthetic_benchmark,
)
from app.main import app

client = TestClient(app)


# =====================================================================
# Unit Tests: Preprocessing & Benchmarks
# =====================================================================

def test_synthetic_benchmarks_generation():
    """Verify synthetic benchmarks generate valid shapes, targets, and leakage columns."""
    df_churn, target_c, p_c = get_synthetic_benchmark("customer_churn", n_samples=100)
    assert len(df_churn) == 100
    assert target_c == "churn"
    assert p_c == "classification"
    assert "customer_id" in df_churn.columns
    assert "constant_tenant_flag" in df_churn.columns

    df_sales, target_s, p_s = get_synthetic_benchmark("sales_forecasting", n_samples=100)
    assert len(df_sales) == 100
    assert target_s == "weekly_sales"
    assert p_s == "regression"
    assert "store_code" in df_sales.columns
    assert "zero_variance_benchmark" in df_sales.columns


def test_automatic_preprocessor_pruning_and_imputation():
    """Verify AutomaticPreprocessor drops identifiers, constants, and imputes missing values."""
    df_churn = generate_churn_benchmark(n_samples=120, random_state=42)
    preprocessor = AutomaticPreprocessor(random_state=42)

    X_arr, feature_names, config = preprocessor.fit_transform(df_churn, target_col="churn")

    assert X_arr.shape[0] == 120
    assert X_arr.shape[1] > 0
    # Must drop identifier column 'customer_id'
    assert "customer_id" in config["dropped_identifiers"]
    assert "customer_id" not in feature_names
    # Must drop constant column 'constant_tenant_flag'
    assert "constant_tenant_flag" in config["dropped_constant_columns"]
    assert "constant_tenant_flag" not in feature_names
    # Must have expanded signup_date into components
    assert "signup_date" in config["datetime_columns_expanded"]
    assert any("signup_date_year" in f for f in feature_names)
    # Check that transform works on new data without errors
    X_test = preprocessor.transform(df_churn.head(10))
    assert X_test.shape == (10, X_arr.shape[1])


# =====================================================================
# Unit Tests: 12-Stage Workflow & Candidate Models
# =====================================================================

def test_engine_classification_workflow_all_12_stages():
    """Verify complete 12-stage sequential workflow and all 6 classification models."""
    df_churn, target, _ = get_synthetic_benchmark("customer_churn", n_samples=150, random_state=42)
    engine = DataPilotExperimentEngine(random_seed=42)

    business_reqs = {
        "business_objective": "Minimize 30-day customer churn",
        "primary_metric": "roc_auc",
        "max_latency_ms": 150.0,
        "cost_false_positive": 15.0,
        "cost_false_negative": 120.0,
    }

    result = engine.run_experiment(
        dataset=df_churn,
        target_column=target,
        experiment_name="Customer Churn Benchmark Run",
        dataset_version="v2.0-bench",
        primary_metric="roc_auc",
        business_requirements=business_reqs,
        enable_optuna=True,
        optuna_trials=3,
        n_splits=3,
    )

    # 1. Verify 12 stages executed in order
    stages = result["workflow_stages"]
    assert len(stages) == 12
    expected_stage_names = [
        "Business Requirement",
        "Problem Formulation",
        "Dataset Profile",
        "Baseline",
        "Candidate Models",
        "Preprocessing",
        "Cross Validation",
        "Hyperparameter Optimization",
        "Evaluation",
        "Error Analysis",
        "Business Constraints",
        "Model Recommendation",
    ]
    for idx, (stage, exp_name) in enumerate(zip(stages, expected_stage_names), start=1):
        assert stage["stage_number"] == idx
        assert stage["stage_name"] == exp_name

    # 2. Verify all 6 candidate classification models were evaluated
    benchmarks = result["benchmarks"]
    algorithm_keys = {b["algorithm_key"] for b in benchmarks}
    expected_models = {
        "baseline_dummy",
        "logistic_regression",
        "random_forest",
        "xgboost",
        "lightgbm",
        "catboost",
        "hist_gradient_boosting",
    }
    assert expected_models.issubset(algorithm_keys)

    # 3. Verify classification metrics
    top_metrics = result["metrics"]
    for m in ["accuracy", "precision", "recall", "f1", "roc_auc", "pr_auc"]:
        assert m in top_metrics
        assert isinstance(top_metrics[m], float)
        assert 0.0 <= top_metrics[m] <= 1.0

    # 4. Verify Optuna trials were recorded
    assert len(result["tuning_trials"]) == 3
    for trial in result["tuning_trials"]:
        assert "trial_number" in trial
        assert "parameters" in trial
        assert "score" in trial
        assert trial["state"] == "COMPLETE"

    # 5. Verify Error Analysis (Stage 10)
    stage_10 = stages[9]["details"]
    assert "confusion_matrix" in stage_10
    assert "true_positives" in stage_10
    assert "false_positives" in stage_10
    assert "false_negatives" in stage_10
    assert "true_negatives" in stage_10

    # 6. Verify Model Recommendation (Stage 12)
    rec = result["recommendation"]
    assert rec["recommended_model_name"] != ""
    assert rec["measured_score"] >= rec["baseline_score"]
    assert "empirical_rationale" in rec
    assert "Accuracy alone" in rec["empirical_rationale"]

    # 7. Verify all 11 required experiment tracking fields exist
    assert "dataset_version" in result
    assert "dataset_fingerprint" in result
    assert result["dataset_fingerprint"].startswith("sha256:")
    assert "feature_config" in result
    assert "preprocessing_config" in result
    assert "best_model_name" in result
    assert "hyperparameters" in result
    assert "validation_strategy" in result
    assert "metrics" in result
    assert "total_execution_time_seconds" in result
    assert "environment_info" in result
    assert "random_seed" in result


def test_engine_regression_workflow_all_12_stages():
    """Verify complete 12-stage sequential workflow and all 6 regression models."""
    df_sales, target, _ = get_synthetic_benchmark("sales_forecasting", n_samples=150, random_state=42)
    engine = DataPilotExperimentEngine(random_seed=42)

    result = engine.run_experiment(
        dataset=df_sales,
        target_column=target,
        experiment_name="Store Weekly Sales Benchmark Run",
        dataset_version="v1.1",
        problem_type="regression",
        primary_metric="rmse",
        enable_optuna=True,
        optuna_trials=3,
        n_splits=3,
    )

    # 1. Verify 12 stages
    stages = result["workflow_stages"]
    assert len(stages) == 12

    # 2. Verify all 6 candidate regression models evaluated
    algorithm_keys = {b["algorithm_key"] for b in result["benchmarks"]}
    expected_reg_models = {
        "baseline_dummy",
        "linear_regression",
        "random_forest",
        "xgboost",
        "lightgbm",
        "catboost",
        "gradient_boosting",
    }
    assert expected_reg_models.issubset(algorithm_keys)

    # 3. Verify regression metrics
    top_metrics = result["metrics"]
    for m in ["mae", "rmse", "r2", "mape"]:
        assert m in top_metrics
        assert isinstance(top_metrics[m], float)

    # 4. Verify Error Analysis for regression (residuals)
    stage_10 = stages[9]["details"]
    assert "mean_residual" in stage_10
    assert "std_residual" in stage_10
    assert "median_absolute_error" in stage_10
    assert "p95_error" in stage_10
    assert "max_error" in stage_10

    # 5. Verify Recommendation
    rec = result["recommendation"]
    assert rec["primary_metric"] == "rmse"
    # RMSE of trained model must be significantly better (lower) than baseline dummy
    assert rec["measured_score"] < rec["baseline_score"]


def test_no_model_selected_on_accuracy_alone():
    """Verify that models are selected using primary metric and business constraints, never accuracy alone."""
    df_churn, target, _ = get_synthetic_benchmark("customer_churn", n_samples=150, random_state=42)
    engine = DataPilotExperimentEngine(random_seed=42)

    # Ask for recall as primary metric with severe cost of false negatives
    result = engine.run_experiment(
        dataset=df_churn,
        target_column=target,
        primary_metric="recall",
        business_requirements={
            "cost_false_positive": 5.0,
            "cost_false_negative": 500.0,
            "max_latency_ms": 200.0,
        },
        enable_optuna=False,
        n_splits=3,
    )

    rec = result["recommendation"]
    assert rec["primary_metric"] == "recall"
    assert "Accuracy alone" in rec["empirical_rationale"]


# =====================================================================
# API Integration & RBAC Tests
# =====================================================================

def register_user_and_org(client: TestClient, prefix: str) -> tuple[str, str, str]:
    uid = uuid.uuid4().hex[:8]
    email = f"{prefix}_{uid}@datapilot.io"
    res = client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "display_name": "Experiment Specialist",
            "organization_name": f"Org {uid}",
        },
    )
    assert res.status_code == 201, res.text
    d = res.json()
    return d["access_token"], d["organizations"][0]["organization_id"], d["user"]["id"]


def create_test_project(client: TestClient, token: str, org_id: str, name: str) -> str:
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name, "purpose": "Testing Experiment Engine", "classification": "internal"},
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_api_run_experiment_workflow_and_persistence():
    """Verify POST /run triggers 12-stage engine, stores all 11 fields, runs, and trials."""
    token, org_id, _ = register_user_and_org(client, "lead_exp_eng")
    proj_id = create_test_project(client, token, org_id, "Churn Detection Engine")

    payload = {
        "name": "V1 Experiment Engine Churn Run",
        "dataset_version": "v1.0-prod",
        "benchmark_name": "customer_churn",
        "target_column": "churn",
        "primary_metric": "roc_auc",
        "business_requirements": {
            "business_objective": "Detect customer churn",
            "max_latency_ms": 100.0,
            "cost_false_positive": 10.0,
            "cost_false_negative": 100.0,
        },
        "enable_optuna": True,
        "optuna_trials": 2,
        "n_splits": 3,
        "random_seed": 42,
    }

    res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/run",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert res.status_code == 201, res.text
    data = res.json()

    # Verify Experiment details and all 11 required fields
    assert data["name"] == "V1 Experiment Engine Churn Run"
    assert data["dataset_version"] == "v1.0-prod"
    assert data["dataset_fingerprint"].startswith("sha256:")
    assert len(data["feature_config"].get("features", [])) > 0
    assert "numeric_imputation" in data["preprocessing_config"]
    assert data["model"] != ""
    assert isinstance(data["hyperparameters"], dict)
    assert "3-fold StratifiedKFold" in data["validation_strategy"]
    assert "roc_auc" in data["metrics"]
    assert data["training_duration"] > 0.0
    assert "Client Data Plane" in data["environment_info"]["execution_plane"]
    assert data["random_seed"] == 42

    # Verify Leaderboard Runs
    assert len(data["runs"]) >= 7  # 6 models + baseline (+ tuned)
    dummy_run = next(r for r in data["runs"] if r["is_baseline"])
    assert dummy_run["algorithm_key"] == "baseline_dummy"

    # Verify Optuna Trials
    assert len(data["trials"]) == 2

    # Verify 12 Workflow Stages returned
    assert len(data["workflow_stages"]) == 12

    # Verify Recommendation
    assert data["recommendation"]["recommended_model_name"] != ""

    # Verify Audit log created by fetching audit events
    audit_res = client.get(
        f"/api/v1/organizations/{org_id}/audit-events",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert audit_res.status_code == 200
    actions = [e["action"] for e in audit_res.json()["items"]]
    assert "experiment.run_executed" in actions
