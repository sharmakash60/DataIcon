"""Tests for Client Data Plane explainability engine and export gate.

Verifies:
1. explain_model produces valid ExplainabilityReport
2. Global SHAP feature importance calculation
3. Local SHAP explanations (hard cap at <= 20 samples)
4. Permutation importance calculation
5. Error analysis (classification & regression)
6. Strict provenance tagging: model_derived
7. ExportGate validation & zero raw dataset leakage
"""
from __future__ import annotations

import uuid
import numpy as np
import pandas as pd
import pytest
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

from datapilot_agent.explainability.engine import explain_model
from datapilot_agent.explainability.schema import ExplainabilityReport, ProvenanceSource
from datapilot_agent.export_gate import (
    ExportGate,
    PermittedExportType,
    SecurityLeakException,
)


@pytest.fixture
def classification_data():
    np.random.seed(42)
    n = 100
    X = pd.DataFrame({
        "age": np.random.randint(18, 70, size=n).astype(float),
        "income": np.random.exponential(50000, size=n),
        "tenure": np.random.uniform(0, 10, size=n),
    })
    y = pd.Series((X["age"] > 40).astype(int), name="churn")
    clf = RandomForestClassifier(n_estimators=10, random_state=42)
    clf.fit(X, y)
    return clf, X, y


@pytest.fixture
def regression_data():
    np.random.seed(42)
    n = 100
    X = pd.DataFrame({
        "sqft": np.random.uniform(500, 3000, size=n),
        "bedrooms": np.random.randint(1, 5, size=n).astype(float),
    })
    y = pd.Series(X["sqft"] * 150 + X["bedrooms"] * 10000 + np.random.normal(0, 5000, size=n), name="price")
    reg = RandomForestRegressor(n_estimators=10, random_state=42)
    reg.fit(X, y)
    return reg, X, y


def test_classification_explainability_report(classification_data):
    clf, X, y = classification_data
    exp_id = str(uuid.uuid4())

    report = explain_model(
        model=clf,
        X_eval=X.to_numpy(),
        y_true=y.to_numpy(),
        feature_names=list(X.columns),
        experiment_id=exp_id,
        model_name="RandomForestClassifier",
        problem_type="binary_classification",
        target_name="churn",
        primary_metric="roc_auc",
        overall_metric_value=0.92,
        class_labels=["stay", "churn"],
    )

    assert isinstance(report, ExplainabilityReport)
    assert report.provenance_verified is True
    assert report.model_name == "RandomForestClassifier"
    assert report.problem_type == "binary_classification"

    # Global SHAP
    assert report.global_shap is not None
    assert report.global_shap.source == ProvenanceSource.MODEL_DERIVED
    assert len(report.global_shap.features) == 3
    assert report.global_shap.features[0].importance_rank == 1

    # Permutation Importance
    assert report.permutation_importance is not None
    assert report.permutation_importance.source == ProvenanceSource.MODEL_DERIVED
    assert len(report.permutation_importance.features) == 3

    # Local SHAP: must be <= 20
    assert len(report.local_explanations) <= 20
    for local in report.local_explanations:
        assert local.source == ProvenanceSource.MODEL_DERIVED
        assert len(local.feature_contributions) == 3

    # Error Analysis
    assert report.error_analysis is not None
    assert report.error_analysis.source == ProvenanceSource.MODEL_DERIVED
    assert report.error_analysis.confusion_matrix is not None
    assert len(report.error_analysis.confusion_matrix) > 0

    # AI narrative should be empty on initial client generation
    assert report.ai_narrative is None


def test_regression_explainability_report(regression_data):
    reg, X, y = regression_data
    exp_id = str(uuid.uuid4())

    report = explain_model(
        model=reg,
        X_eval=X.to_numpy(),
        y_true=y.to_numpy(),
        feature_names=list(X.columns),
        experiment_id=exp_id,
        model_name="RandomForestRegressor",
        problem_type="regression",
        target_name="price",
        primary_metric="rmse",
        overall_metric_value=4820.5,
    )

    assert isinstance(report, ExplainabilityReport)
    assert report.problem_type == "regression"
    assert report.error_analysis is not None
    assert report.error_analysis.residual_stats is not None
    assert report.error_analysis.residual_stats.rmse >= 0


def test_export_gate_passes_valid_report(classification_data):
    clf, X, y = classification_data
    exp_id = str(uuid.uuid4())

    report = explain_model(
        model=clf,
        X_eval=X.to_numpy(),
        y_true=y.to_numpy(),
        feature_names=list(X.columns),
        experiment_id=exp_id,
        model_name="RandomForestClassifier",
        problem_type="binary_classification",
        target_name="churn",
        primary_metric="roc_auc",
        overall_metric_value=0.92,
        class_labels=["stay", "churn"],
    )

    gate = ExportGate()
    payload = report.to_export_dict()

    sanitized = gate.validate_and_sanitize(
        export_type=PermittedExportType.EXPLAINABILITY_RESULT,
        payload_dict=payload,
    )
    assert sanitized["model_name"] == "RandomForestClassifier"
    assert sanitized["provenance_verified"] is True


def test_export_gate_blocks_raw_data_leakage(classification_data):
    clf, X, y = classification_data
    exp_id = str(uuid.uuid4())

    report = explain_model(
        model=clf,
        X_eval=X.to_numpy(),
        y_true=y.to_numpy(),
        feature_names=list(X.columns),
        experiment_id=exp_id,
        model_name="RandomForestClassifier",
        problem_type="binary_classification",
        target_name="churn",
        primary_metric="roc_auc",
        overall_metric_value=0.92,
        class_labels=["stay", "churn"],
    )

    gate = ExportGate()
    payload = report.to_export_dict()
    # Inject forbidden raw data field
    payload["raw_training_rows"] = X.to_dict(orient="records")

    with pytest.raises(SecurityLeakException):
        gate.validate_and_sanitize(
            export_type=PermittedExportType.EXPLAINABILITY_RESULT,
            payload_dict=payload,
        )


def test_export_gate_blocks_excessive_local_explanations(classification_data):
    clf, X, y = classification_data
    exp_id = str(uuid.uuid4())

    report = explain_model(
        model=clf,
        X_eval=X.to_numpy(),
        y_true=y.to_numpy(),
        feature_names=list(X.columns),
        experiment_id=exp_id,
        model_name="RandomForestClassifier",
        problem_type="binary_classification",
        target_name="churn",
        primary_metric="roc_auc",
        overall_metric_value=0.92,
        class_labels=["stay", "churn"],
    )

    gate = ExportGate()
    payload = report.to_export_dict()
    # Inject > 20 local explanations
    fake_local = payload["local_explanations"][0] if payload["local_explanations"] else {
        "sample_index": 0, "prediction": 0.5, "predicted_class": None, "base_value": 0.5,
        "feature_contributions": [], "source": "model_derived",
    }
    payload["local_explanations"] = [fake_local for _ in range(25)]

    with pytest.raises(SecurityLeakException, match="local_explanations exceeds"):
        gate.validate_and_sanitize(
            export_type=PermittedExportType.EXPLAINABILITY_RESULT,
            payload_dict=payload,
        )


def test_export_gate_blocks_forged_provenance(classification_data):
    clf, X, y = classification_data
    exp_id = str(uuid.uuid4())

    report = explain_model(
        model=clf,
        X_eval=X.to_numpy(),
        y_true=y.to_numpy(),
        feature_names=list(X.columns),
        experiment_id=exp_id,
        model_name="RandomForestClassifier",
        problem_type="binary_classification",
        target_name="churn",
        primary_metric="roc_auc",
        overall_metric_value=0.92,
        class_labels=["stay", "churn"],
    )

    gate = ExportGate()
    payload = report.to_export_dict()
    # Forged source: AI narrative claims to be model_derived
    payload["ai_narrative"] = {
        "source": "model_derived",  # FORGED
        "global_importance_narrative": "text",
        "error_analysis_narrative": "text",
        "business_context_narrative": "text",
        "model_used": "fake",
        "generated_at": "2026-09-26T00:00:00Z",
        "warning": "warning",
    }

    with pytest.raises(SecurityLeakException, match="ai_generated"):
        gate.validate_and_sanitize(
            export_type=PermittedExportType.EXPLAINABILITY_RESULT,
            payload_dict=payload,
        )
