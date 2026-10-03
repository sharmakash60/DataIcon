"""Tests for Experiment Management System: 17 required fields, tracking, and multi-experiment comparison."""

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
    """Helper to create a project and return project_id."""
    res = client.post(
        f"/api/v1/organizations/{org_id}/projects",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": name,
            "purpose": "Experiment tracking testing",
            "classification": "internal",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


def test_experiment_creation_and_all_17_fields():
    token, org_id, _ = register_user_and_org(client, "exp_lead")
    proj_id = create_project(client, token, org_id, "Fraud Scoring Service")

    payload = {
        "name": "Fraud Model v1.2 - Random Forest",
        "dataset_version": "v2.1",
        "dataset_fingerprint": "sha256:4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
        "problem_formulation": {
            "business_objective": "Detect high-value card payment fraud",
            "prediction_objective": "Flag transactions with >80% risk",
            "problem_type": "binary_classification",
            "target_name": "is_fraud",
            "primary_metric": "pr_auc",
            "positive_class": "fraud",
        },
        "preprocessing_config": {
            "numeric_imputation": "median",
            "scaling": "standard_scaler",
            "categorical_encoding": "one_hot",
            "datetime_features": ["hour", "dayofweek", "is_weekend"],
        },
        "feature_config": {
            "input_features": ["amount", "merchant_category", "tx_hour", "velocity_6h"],
            "features": ["amount", "merchant_category", "tx_hour", "velocity_6h"],
            "target": "is_fraud",
        },
        "model": "Random Forest Classifier",
        "hyperparameters": {
            "n_estimators": 250,
            "max_depth": 12,
            "min_samples_split": 4,
            "criterion": "gini",
        },
        "validation_strategy": "5-fold StratifiedKFold (seed=42)",
        "metrics": {
            "pr_auc": 0.892,
            "roc_auc": 0.945,
            "f1": 0.864,
            "precision": 0.881,
            "recall": 0.847,
        },
        "training_duration": 18.45,
        "environment_info": {
            "os": "Linux 6.6.1-amd64",
            "python_version": "3.12.3",
            "scikit_learn_version": "1.5.0",
            "cpu_cores": 8,
        },
        "random_seed": 42,
        "model_artifact_reference": "client_models/fraud_rf_v2_1.joblib",
        "status": "completed",
    }

    # 1. Create experiment
    create_res = client.post(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
    )
    assert create_res.status_code == 201, create_res.text
    created = create_res.json()

    # Verify all 17 required fields exist and match exactly
    assert "id" in created and created["id"] is not None  # 1. experiment ID
    assert created["project_id"] == proj_id  # 2. project ID
    assert created["dataset_version"] == "v2.1"  # 3. dataset version
    assert created["dataset_fingerprint"] == payload["dataset_fingerprint"]  # 4. dataset fingerprint
    assert created["problem_formulation"]["target_name"] == "is_fraud"  # 5. problem formulation
    assert created["preprocessing_config"]["numeric_imputation"] == "median"  # 6. preprocessing config
    assert created["feature_config"]["target"] == "is_fraud"  # 7. feature configuration
    assert created["model"] == "Random Forest Classifier"  # 8. model
    assert created["hyperparameters"]["n_estimators"] == 250  # 9. hyperparameters
    assert created["validation_strategy"] == "5-fold StratifiedKFold (seed=42)"  # 10. validation strategy
    assert created["metrics"]["pr_auc"] == 0.892  # 11. metrics
    assert created["training_duration"] == 18.45  # 12. training duration
    assert created["environment_info"]["python_version"] == "3.12.3"  # 13. environment info
    assert created["random_seed"] == 42  # 14. random seed
    assert created["model_artifact_reference"] == "client_models/fraud_rf_v2_1.joblib"  # 15. artifact reference
    assert created["status"] == "completed"  # 16. status
    assert "created_at" in created and created["created_at"] is not None  # 17. created timestamp

    exp_id = created["id"]

    # 2. Retrieve single experiment and check fields
    get_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/{exp_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_res.status_code == 200, get_res.text
    single = get_res.json()
    assert single["id"] == exp_id
    assert single["dataset_fingerprint"] == payload["dataset_fingerprint"]
    assert single["metrics"]["pr_auc"] == 0.892


def test_multi_experiment_comparison():
    token, org_id, _ = register_user_and_org(client, "compare_lead")
    proj_id = create_project(client, token, org_id, "Customer Churn Prediction")

    # Create 3 experiments with different models and metrics
    exp1_payload = {
        "name": "Exp 1 - Random Forest",
        "dataset_version": "v1.0",
        "dataset_fingerprint": "sha256:abc123sharedfingerprint",
        "problem_formulation": {"problem_type": "binary_classification", "target": "churn", "primary_metric": "roc_auc"},
        "preprocessing_config": {"scaler": "standard", "imputer": "median"},
        "feature_config": {"features": ["tenure", "monthly_charges", "total_charges"]},
        "model": "Random Forest",
        "hyperparameters": {"n_estimators": 100, "max_depth": 6, "learning_rate": None},
        "validation_strategy": "5-fold StratifiedKFold",
        "metrics": {"roc_auc": 0.885, "pr_auc": 0.792, "log_loss": 0.342},
        "training_duration": 4.5,
        "environment_info": {"python": "3.12"},
        "random_seed": 42,
        "model_artifact_reference": "models/rf_churn.joblib",
        "status": "completed",
    }
    exp2_payload = {
        "name": "Exp 2 - XGBoost",
        "dataset_version": "v1.0",
        "dataset_fingerprint": "sha256:abc123sharedfingerprint",
        "problem_formulation": {"problem_type": "binary_classification", "target": "churn", "primary_metric": "roc_auc"},
        "preprocessing_config": {"scaler": "standard", "imputer": "median"},
        "feature_config": {"features": ["tenure", "monthly_charges", "total_charges"]},
        "model": "XGBoost",
        "hyperparameters": {"n_estimators": 150, "max_depth": 6, "learning_rate": 0.05},
        "validation_strategy": "5-fold StratifiedKFold",
        "metrics": {"roc_auc": 0.912, "pr_auc": 0.835, "log_loss": 0.285},
        "training_duration": 3.8,
        "environment_info": {"python": "3.12"},
        "random_seed": 42,
        "model_artifact_reference": "models/xgb_churn.joblib",
        "status": "completed",
    }
    exp3_payload = {
        "name": "Exp 3 - LightGBM",
        "dataset_version": "v1.0",
        "dataset_fingerprint": "sha256:abc123sharedfingerprint",
        "problem_formulation": {"problem_type": "binary_classification", "target": "churn", "primary_metric": "roc_auc"},
        "preprocessing_config": {"scaler": "standard", "imputer": "median"},
        "feature_config": {"features": ["tenure", "monthly_charges", "total_charges"]},
        "model": "LightGBM",
        "hyperparameters": {"n_estimators": 200, "max_depth": -1, "learning_rate": 0.03},
        "validation_strategy": "5-fold StratifiedKFold",
        "metrics": {"roc_auc": 0.908, "pr_auc": 0.828, "log_loss": 0.292},
        "training_duration": 2.1,
        "environment_info": {"python": "3.12"},
        "random_seed": 42,
        "model_artifact_reference": "models/lgb_churn.joblib",
        "status": "completed",
    }

    id1 = client.post(f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments", headers={"Authorization": f"Bearer {token}"}, json=exp1_payload).json()["id"]
    id2 = client.post(f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments", headers={"Authorization": f"Bearer {token}"}, json=exp2_payload).json()["id"]
    id3 = client.post(f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments", headers={"Authorization": f"Bearer {token}"}, json=exp3_payload).json()["id"]

    # 1. Compare all 3 experiments
    comp_res = client.get(
        f"/api/v1/organizations/{org_id}/projects/{proj_id}/experiments/compare?experiment_ids={id1},{id2},{id3}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert comp_res.status_code == 200, comp_res.text
    comp = comp_res.json()

    assert len(comp["experiments"]) == 3
    exp_models = {e["id"]: e["model"] for e in comp["experiments"]}
    assert exp_models[id1] == "Random Forest"
    assert exp_models[id2] == "XGBoost"
    assert exp_models[id3] == "LightGBM"

    # 2. Check metric comparisons & best winner determination
    metrics_map = {m["metric_name"]: m for m in comp["metric_comparisons"]}
    assert "roc_auc" in metrics_map
    assert "log_loss" in metrics_map

    # For roc_auc (higher is better): XGBoost (0.912) should win
    assert metrics_map["roc_auc"]["direction"] == "higher_is_better"
    assert metrics_map["roc_auc"]["best_experiment_id"] == id2
    assert metrics_map["roc_auc"]["best_value"] == 0.912

    # For log_loss (lower is better): XGBoost (0.285) should win
    assert metrics_map["log_loss"]["direction"] == "lower_is_better"
    assert metrics_map["log_loss"]["best_experiment_id"] == id2
    assert metrics_map["log_loss"]["best_value"] == 0.285

    # 3. Check hyperparameter differences
    assert "n_estimators" in comp["hyperparameter_differences"]
    assert comp["hyperparameter_differences"]["n_estimators"][id1] == 100
    assert comp["hyperparameter_differences"]["n_estimators"][id2] == 150
    assert comp["hyperparameter_differences"]["n_estimators"][id3] == 200

    # 4. Check dataset consistency (all had same version and fingerprint)
    assert comp["dataset_consistency"]["is_consistent"] is True


def test_comparison_tenant_isolation_and_validation():
    # Org A
    token_a, org_a, _ = register_user_and_org(client, "org_a_user")
    proj_a = create_project(client, token_a, org_a, "Alpha Project")
    exp_a_id = client.post(
        f"/api/v1/organizations/{org_a}/projects/{proj_a}/experiments",
        headers={"Authorization": f"Bearer {token_a}"},
        json={
            "name": "Alpha Exp",
            "model": "Model Alpha",
            "metrics": {"score": 0.8},
        },
    ).json()["id"]

    # Org B
    token_b, org_b, _ = register_user_and_org(client, "org_b_user")
    proj_b = create_project(client, token_b, org_b, "Beta Project")
    exp_b_id = client.post(
        f"/api/v1/organizations/{org_b}/projects/{proj_b}/experiments",
        headers={"Authorization": f"Bearer {token_b}"},
        json={
            "name": "Beta Exp",
            "model": "Model Beta",
            "metrics": {"score": 0.85},
        },
    ).json()["id"]

    # Cross-tenant compare attempt by Org B trying to include Org A's experiment ID
    res = client.get(
        f"/api/v1/organizations/{org_b}/projects/{proj_b}/experiments/compare?experiment_ids={exp_b_id},{exp_a_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    # Must reject safely (404 Not Found)
    assert res.status_code == 404, res.text

    # Validation: Less than 2 experiment IDs
    res_bad = client.get(
        f"/api/v1/organizations/{org_b}/projects/{proj_b}/experiments/compare?experiment_ids={exp_b_id}",
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert res_bad.status_code == 400
