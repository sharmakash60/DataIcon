"""Comprehensive tests for Client Data Plane Model Serving & Deployment.

Verifies:
1. Local model artifact serialization and integrity verification
2. LocalPredictor inference (classification and regression)
3. Input handling (single dict, list of dicts, missing feature handling)
4. REST Prediction API (POST /predict, GET /health, GET /metadata)
5. Local API key authentication enforcement
6. DockerPackager generating complete deployment bundle
7. Strict Zero-Cloud-Egress verification: prediction requests/responses never leave local boundary
"""

from __future__ import annotations

import json
from pathlib import Path
from fastapi.testclient import TestClient
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

from datapilot_agent.automl.preprocessing import TabularPreprocessor
from datapilot_agent.serving.artifact import (
    ModelArtifactBundle,
    load_model_artifact,
    save_model_artifact,
)
from datapilot_agent.serving.docker_packager import DockerPackager
from datapilot_agent.serving.predictor import LocalPredictor
from datapilot_agent.serving.schema import FeatureFieldSchema
from datapilot_agent.serving.server import create_serving_app


@pytest.fixture
def synthetic_classification_bundle(tmp_path: Path) -> ModelArtifactBundle:
    """Creates and fits a real TabularPreprocessor and RandomForestClassifier."""
    np.random.seed(42)
    n = 100
    df = pd.DataFrame(
        {
            "age": np.random.randint(18, 70, size=n),
            "income": np.random.normal(50000, 15000, size=n),
            "tier": np.random.choice(["bronze", "silver", "gold"], size=n),
            "churn": np.random.choice([0, 1], size=n, p=[0.7, 0.3]),
        }
    )

    X = df[["age", "income", "tier"]]
    y = df["churn"]

    pre = TabularPreprocessor()
    X_proc = pre.fit_transform(X)

    clf = RandomForestClassifier(n_estimators=10, random_state=42)
    clf.fit(X_proc, y)

    schema = [
        FeatureFieldSchema(name="age", dtype="numeric", example=35),
        FeatureFieldSchema(name="income", dtype="numeric", example=55000.0),
        FeatureFieldSchema(name="tier", dtype="categorical", example="silver"),
    ]

    return ModelArtifactBundle(
        model=clf,
        preprocessor=pre,
        model_name="Random Forest Churn Predictor",
        model_version="v1.0.0",
        problem_type="classification",
        target_name="churn",
        primary_metric="roc_auc",
        feature_names=["age", "income", "tier"],
        feature_schema=schema,
        classes=[0, 1],
        metrics={"roc_auc": 0.88, "accuracy": 0.84},
    )


@pytest.fixture
def synthetic_regression_bundle() -> ModelArtifactBundle:
    """Creates and fits a real TabularPreprocessor and RandomForestRegressor."""
    np.random.seed(42)
    n = 100
    df = pd.DataFrame(
        {
            "sqft": np.random.randint(500, 3500, size=n),
            "bedrooms": np.random.randint(1, 5, size=n),
            "price": np.random.normal(300000, 50000, size=n),
        }
    )

    X = df[["sqft", "bedrooms"]]
    y = df["price"]

    pre = TabularPreprocessor()
    X_proc = pre.fit_transform(X)

    reg = RandomForestRegressor(n_estimators=10, random_state=42)
    reg.fit(X_proc, y)

    schema = [
        FeatureFieldSchema(name="sqft", dtype="numeric", example=1200),
        FeatureFieldSchema(name="bedrooms", dtype="numeric", example=3),
    ]

    return ModelArtifactBundle(
        model=reg,
        preprocessor=pre,
        model_name="House Price Predictor",
        model_version="v1.2.0",
        problem_type="regression",
        target_name="price",
        primary_metric="rmse",
        feature_names=["sqft", "bedrooms"],
        feature_schema=schema,
        metrics={"rmse": 45200.0, "r2": 0.81},
    )


# --- Test 1: Artifact Serialization ---
def test_save_and_load_artifact(tmp_path: Path, synthetic_classification_bundle: ModelArtifactBundle):
    artifact_path = save_model_artifact(synthetic_classification_bundle, tmp_path)
    assert artifact_path.exists()

    meta_json = tmp_path / "metadata.json"
    assert meta_json.exists()
    with open(meta_json, "r", encoding="utf-8") as f:
        meta = json.load(f)
    assert meta["model_name"] == "Random Forest Churn Predictor"
    assert meta["problem_type"] == "classification"

    loaded = load_model_artifact(tmp_path)
    assert loaded.model_name == synthetic_classification_bundle.model_name
    assert loaded.problem_type == "classification"
    assert loaded.feature_names == ["age", "income", "tier"]


# --- Test 2: Local Predictor Inference ---
def test_local_predictor_classification(synthetic_classification_bundle: ModelArtifactBundle):
    predictor = LocalPredictor(synthetic_classification_bundle)

    # Test single record dictionary
    single_req = {"age": 45, "income": 62000.0, "tier": "gold"}
    res = predictor.predict(single_req)

    assert len(res.predictions) == 1
    assert res.predictions[0] in [0, 1]
    assert res.probabilities is not None
    assert len(res.probabilities) == 1
    assert "0" in res.probabilities[0] and "1" in res.probabilities[0]
    assert res.latency_ms > 0
    assert res.model_name == "Random Forest Churn Predictor"

    # Test batch list of records
    batch_req = [
        {"age": 25, "income": 30000.0, "tier": "bronze"},
        {"age": 55, "income": 95000.0, "tier": "silver"},
    ]
    batch_res = predictor.predict(batch_req)
    assert len(batch_res.predictions) == 2
    assert len(batch_res.probabilities) == 2


def test_local_predictor_missing_features(synthetic_classification_bundle: ModelArtifactBundle):
    predictor = LocalPredictor(synthetic_classification_bundle)

    # Provide only age (income and tier missing)
    partial_req = {"age": 30}
    res = predictor.predict(partial_req)

    assert len(res.predictions) == 1
    assert len(res.warnings) > 0
    assert "Features missing" in res.warnings[0]


def test_local_predictor_regression(synthetic_regression_bundle: ModelArtifactBundle):
    predictor = LocalPredictor(synthetic_regression_bundle)

    req = {"sqft": 1800, "bedrooms": 3}
    res = predictor.predict(req)

    assert len(res.predictions) == 1
    assert isinstance(res.predictions[0], float)
    assert res.probabilities is None  # Regression has no class probabilities


# --- Test 3: REST API (POST /predict, GET /health, GET /metadata) ---
def test_serving_rest_api(synthetic_classification_bundle: ModelArtifactBundle):
    predictor = LocalPredictor(synthetic_classification_bundle)
    app = create_serving_app(predictor=predictor, api_key="secret-token-123")
    client = TestClient(app)

    # 1. Health Probe
    health_resp = client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "healthy"
    assert health_resp.json()["model_loaded"] is True

    # 2. Metadata Endpoint
    meta_resp = client.get("/metadata")
    assert meta_resp.status_code == 200
    data = meta_resp.json()
    assert data["model_name"] == "Random Forest Churn Predictor"
    assert len(data["feature_names"]) == 3

    # 3. Predict Endpoint without Auth (Should fail with 401)
    unauth_resp = client.post(
        "/predict",
        json={"features": {"age": 35, "income": 50000, "tier": "silver"}},
    )
    assert unauth_resp.status_code == 401

    # 4. Predict Endpoint with Valid Auth Header
    auth_resp = client.post(
        "/predict",
        headers={"X-API-Key": "secret-token-123"},
        json={"features": {"age": 35, "income": 50000, "tier": "silver"}},
    )
    assert auth_resp.status_code == 200
    body = auth_resp.json()
    assert "predictions" in body
    assert len(body["predictions"]) == 1
    assert body["model_name"] == "Random Forest Churn Predictor"
    assert body["latency_ms"] >= 0.0

    # 5. Invalid Feature Type Error Handling
    err_resp = client.post(
        "/predict",
        headers={"X-API-Key": "secret-token-123"},
        json={"features": "invalid-non-dict-string"},
    )
    assert err_resp.status_code == 422 or err_resp.status_code == 400


# --- Test 4: Docker Packager ---
def test_docker_packager(tmp_path: Path, synthetic_classification_bundle: ModelArtifactBundle):
    packager = DockerPackager(synthetic_classification_bundle)
    out_dir = tmp_path / "docker_bundle"
    packager.package(out_dir)

    assert (out_dir / "Dockerfile").exists()
    assert (out_dir / "docker-compose.yml").exists()
    assert (out_dir / "requirements.txt").exists()
    assert (out_dir / "model_bundle.joblib").exists()
    assert (out_dir / "metadata.json").exists()
    assert (out_dir / "server.py").exists()
    assert (out_dir / "README.md").exists()
    assert (out_dir / "test_client.py").exists()

    dockerfile_content = (out_dir / "Dockerfile").read_text(encoding="utf-8")
    assert "EXPOSE 8080" in dockerfile_content
    assert "HEALTHCHECK" in dockerfile_content
    assert "useradd -r -g datapilot" in dockerfile_content


# --- Test 5: Zero Raw Prediction Data Egress ---
def test_zero_raw_prediction_data_egress(synthetic_classification_bundle: ModelArtifactBundle, monkeypatch):
    """Verifies that running predictions makes zero network requests to any remote cloud."""
    import urllib.request
    import httpx

    def blocked_network_call(*args, **kwargs):
        raise AssertionError("CRITICAL SECURITY VIOLATION: Prediction code attempted network egress!")

    monkeypatch.setattr(urllib.request, "urlopen", blocked_network_call)
    monkeypatch.setattr(httpx, "post", blocked_network_call)
    monkeypatch.setattr(httpx, "get", blocked_network_call)

    predictor = LocalPredictor(synthetic_classification_bundle)
    app = create_serving_app(predictor=predictor)
    client = TestClient(app)

    # Sending inference request inside client environment
    resp = client.post(
        "/predict",
        json={"features": [{"age": 28, "income": 40000, "tier": "bronze"}]},
    )
    assert resp.status_code == 200
    assert resp.json()["predictions"] == [0] or resp.json()["predictions"] == [1]


# --- Test 6: SEC-02 Tampering Rejection ---
def test_tampered_model_artifact_signature_rejected(tmp_path: Path, synthetic_classification_bundle: ModelArtifactBundle):
    """Verifies that an artifact tampered after signing fails HMAC verification and is rejected."""
    artifact_path = save_model_artifact(synthetic_classification_bundle, tmp_path)
    assert artifact_path.exists()
    assert (tmp_path / "model_bundle.joblib.sig").exists()

    # Tamper with the binary file
    with open(artifact_path, "ab") as f:
        f.write(b"CORRUPTED_BYTES")

    import pytest
    with pytest.raises(ValueError, match="Cryptographic HMAC verification failed"):
        load_model_artifact(tmp_path)
