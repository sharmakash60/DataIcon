"""Tests for Senior Data Scientist Report Generator.

Verifies:
1. All 23 standard report sections are generated deterministically.
2. Verified artifacts (metrics, dataset size, model names, SHAP, trials) are preserved accurately.
3. Strict provenance tagging distinguishes:
   - [MEASURED RESULT]
   - [AI INTERPRETATION]
   - [USER-PROVIDED ASSUMPTION]
4. Sequential report versioning (v1, v2, ...).
5. Multi-format support: Markdown, HTML, and binary PDF exports.
6. Strict Pydantic schema validation (extra='forbid').
"""
from __future__ import annotations

import json
import pytest

from app.reports.formatters import build_report_html, build_report_pdf
from app.reports.generator import _build_deterministic_sections, _render_full_markdown
from app.reports.schemas import GenerateReportRequest, ReportSectionOut, SeniorReportDetailOut


EXPECTED_SECTIONS = [
    (1, "executive_summary", "1. Executive Summary"),
    (2, "business_understanding", "2. Business Understanding"),
    (3, "problem_formulation", "3. Problem Formulation"),
    (4, "dataset_overview", "4. Dataset Overview"),
    (5, "data_quality", "5. Data Quality"),
    (6, "privacy_classification", "6. Privacy/Data Classification"),
    (7, "leakage_analysis", "7. Leakage Analysis"),
    (8, "exploratory_analysis", "8. Exploratory Analysis"),
    (9, "feature_engineering", "9. Feature Engineering"),
    (10, "baseline", "10. Baseline"),
    (11, "experiment_methodology", "11. Experiment Methodology"),
    (12, "models_evaluated", "12. Models Evaluated"),
    (13, "cross_validation", "13. Cross Validation"),
    (14, "hyperparameter_optimization", "14. Hyperparameter Optimization"),
    (15, "model_comparison", "15. Model Comparison"),
    (16, "recommended_candidate", "16. Recommended Candidate"),
    (17, "explainability", "17. Explainability"),
    (18, "error_analysis", "18. Error Analysis"),
    (19, "risk_analysis", "19. Risk Analysis"),
    (20, "limitations", "20. Limitations"),
    (21, "deployment_recommendation", "21. Deployment Recommendation"),
    (22, "monitoring_recommendation", "22. Monitoring Recommendation"),
    (23, "reproducibility_information", "23. Reproducibility Information"),
]


@pytest.fixture
def sample_artifacts():
    return {
        "report_version": 2,
        "project": {
            "name": "Customer Retention Platform",
            "purpose": "Predict customer churn within 30 days",
            "classification": "restricted",
        },
        "requirement": {
            "business_objective": "Reduce churn rate by 15% across enterprise accounts",
            "prediction_objective": "Predict customer churn probability within next 30 days",
            "prediction_horizon": "30 days",
            "primary_metric": "roc_auc",
            "secondary_metrics": ["f1", "precision", "recall"],
            "business_constraints": ["Decision latency under 50ms", "Zero PII in cloud control plane"],
        },
        "experiment": {
            "id": "exp-00000000-0000-0000-0000-000000000001",
            "name": "Churn Prediction AutoML Benchmark",
            "problem_type": "binary_classification",
            "target_name": "churn",
            "primary_metric": "roc_auc",
            "dataset_version": "v2.1",
            "dataset_fingerprint": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "validation_strategy": "5-fold StratifiedKFold",
            "random_seed": 42,
            "n_samples": 12500,
            "n_features": 24,
            "total_execution_time": 48.5,
            "best_model_name": "CatBoostClassifier",
            "best_score": 0.9345,
            "baseline_score": 0.5210,
            "problem_formulation": {"target": "churn", "metric": "roc_auc"},
            "preprocessing_config": {"imputer": "median", "scaler": "standard"},
            "feature_config": {"excluded_features": ["user_id"]},
            "metrics": {"roc_auc": 0.9345, "f1": 0.8621},
            "environment_info": {
                "python_version": "3.12.2",
                "os": "Linux",
                "execution_plane": "Client Data Plane (Air-Gapped)",
            },
        },
        "baseline_run": {
            "model_name": "LogisticRegression",
            "algorithm_key": "logistic_regression",
            "mean_cv_score": 0.5210,
            "std_cv_score": 0.0120,
            "training_time_seconds": 1.1,
            "inference_latency_ms": 0.5,
        },
        "runs": [
            {
                "rank": 1,
                "model_name": "CatBoostClassifier",
                "algorithm_key": "catboost",
                "is_baseline": False,
                "mean_cv_score": 0.9345,
                "std_cv_score": 0.0082,
                "training_time_seconds": 12.4,
                "inference_latency_ms": 3.8,
                "metrics": {"roc_auc": 0.9345},
                "cv_scores": [0.931, 0.938, 0.929, 0.941, 0.933],
                "hyperparameters": {"iterations": 500, "depth": 6, "learning_rate": 0.05},
            },
            {
                "rank": 2,
                "model_name": "XGBoostClassifier",
                "algorithm_key": "xgboost",
                "is_baseline": False,
                "mean_cv_score": 0.9280,
                "std_cv_score": 0.0095,
                "training_time_seconds": 9.2,
                "inference_latency_ms": 4.1,
                "metrics": {"roc_auc": 0.9280},
                "cv_scores": [0.925, 0.931, 0.922, 0.935, 0.927],
                "hyperparameters": {"n_estimators": 300, "max_depth": 5},
            },
            {
                "rank": 3,
                "model_name": "LogisticRegression",
                "algorithm_key": "logistic_regression",
                "is_baseline": True,
                "mean_cv_score": 0.5210,
                "std_cv_score": 0.0120,
                "training_time_seconds": 1.1,
                "inference_latency_ms": 0.5,
                "metrics": {"roc_auc": 0.5210},
                "cv_scores": [0.518, 0.524, 0.515, 0.526, 0.521],
                "hyperparameters": {"C": 1.0},
            },
        ],
        "trials": [
            {
                "trial_number": 1,
                "model_name": "CatBoostClassifier",
                "score": 0.9345,
                "duration_seconds": 2.5,
                "parameters": {"depth": 6, "learning_rate": 0.05},
            },
            {
                "trial_number": 2,
                "model_name": "CatBoostClassifier",
                "score": 0.9120,
                "duration_seconds": 2.1,
                "parameters": {"depth": 4, "learning_rate": 0.01},
            },
        ],
        "profile": {
            "total_rows": 12500,
            "total_columns": 24,
            "file_size_bytes": 2048500,
            "quality_findings": [
                {"code": "missing_values", "column": "account_notes", "severity": "warning", "message": "12% missing"}
            ],
            "correlations": [
                {"column_a": "tenure", "column_b": "monthly_charges", "coefficient": 0.42}
            ],
            "columns": [],
        },
        "explainability": {
            "global_shap": {
                "features": [
                    {"feature_name": "contract_type", "importance_value": 0.48, "importance_rank": 1, "std_error": 0.02},
                    {"feature_name": "monthly_charges", "importance_value": 0.32, "importance_rank": 2, "std_error": 0.015},
                ]
            },
            "permutation_importance": {
                "features": [
                    {"feature_name": "contract_type", "importance_value": 0.15, "importance_rank": 1}
                ]
            },
            "error_analysis": {
                "confusion_matrix": [
                    {"actual_label": "0", "predicted_label": "0", "count": 1000, "rate": 0.8},
                    {"actual_label": "1", "predicted_label": "1", "count": 200, "rate": 0.16},
                ],
                "worst_segments": [
                    {"feature_name": "contract_type", "segment_label": "Month-to-month", "n_samples": 400, "error_rate": 0.22, "delta_from_overall": 0.08}
                ],
            },
            "user_assumptions": [
                {"key": "Target Cost", "value": "Customer acquisition cost is $500"}
            ],
            "explained_at": "2026-09-26T14:00:00Z",
        },
    }


def test_all_23_sections_generated(sample_artifacts):
    sections = _build_deterministic_sections(sample_artifacts)
    assert len(sections) == 23

    for expected_num, expected_key, expected_title in EXPECTED_SECTIONS:
        sec = next((s for s in sections if s.section_number == expected_num), None)
        assert sec is not None, f"Missing section {expected_num}: {expected_title}"
        assert sec.key == expected_key
        assert expected_title in sec.title
        assert len(sec.content_markdown) > 50


def test_provenance_tagging_distinction(sample_artifacts):
    sections = _build_deterministic_sections(sample_artifacts)

    # Check that tags exist
    all_content = "\n".join(s.content_markdown for s in sections)
    assert "[MEASURED RESULT]" in all_content
    assert "[AI INTERPRETATION]" in all_content
    assert "[USER-PROVIDED ASSUMPTION]" in all_content

    # Specific section provenance
    biz = next(s for s in sections if s.key == "business_understanding")
    assert biz.source == "user_assumption"
    assert "[USER-PROVIDED ASSUMPTION]" in biz.content_markdown

    baseline_sec = next(s for s in sections if s.key == "baseline")
    assert baseline_sec.source == "measured_result"
    assert "[MEASURED RESULT]" in baseline_sec.content_markdown

    risk_sec = next(s for s in sections if s.key == "risk_analysis")
    assert risk_sec.source == "ai_interpretation"
    assert "[AI INTERPRETATION]" in risk_sec.content_markdown


def test_verified_artifacts_accurately_represented(sample_artifacts):
    sections = _build_deterministic_sections(sample_artifacts)

    # 1. Executive Summary check
    exec_sec = next(s for s in sections if s.key == "executive_summary")
    assert "CatBoostClassifier" in exec_sec.content_markdown
    assert "0.9345" in exec_sec.content_markdown
    assert "0.5210" in exec_sec.content_markdown
    assert "12500" in exec_sec.content_markdown
    assert "v2" in exec_sec.content_markdown

    # 4. Dataset overview check
    ds_sec = next(s for s in sections if s.key == "dataset_overview")
    assert "v2.1" in ds_sec.content_markdown
    assert "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" in ds_sec.content_markdown

    # 10. Baseline check
    base_sec = next(s for s in sections if s.key == "baseline")
    assert "LogisticRegression" in base_sec.content_markdown
    assert "0.5210" in base_sec.content_markdown

    # 12. Models Evaluated check
    models_sec = next(s for s in sections if s.key == "models_evaluated")
    assert "CatBoostClassifier" in models_sec.content_markdown
    assert "XGBoostClassifier" in models_sec.content_markdown
    assert "LogisticRegression" in models_sec.content_markdown

    # 13. Cross Validation check
    cv_sec = next(s for s in sections if s.key == "cross_validation")
    assert "0.9345" in cv_sec.content_markdown
    assert "0.9310, 0.9380" in cv_sec.content_markdown

    # 15. Model Comparison Leaderboard table check
    bm_sec = next(s for s in sections if s.key == "model_comparison")
    assert "CatBoostClassifier" in bm_sec.content_markdown
    assert "XGBoostClassifier" in bm_sec.content_markdown
    assert "LogisticRegression (Baseline)" in bm_sec.content_markdown
    assert "0.9345" in bm_sec.content_markdown

    # 17. Explainability SHAP table check
    shap_sec = next(s for s in sections if s.key == "explainability")
    assert "contract_type" in shap_sec.content_markdown
    assert "monthly_charges" in shap_sec.content_markdown
    assert "0.4800" in shap_sec.content_markdown

    # 18. Error analysis check
    err_sec = next(s for s in sections if s.key == "error_analysis")
    assert "Month-to-month" in err_sec.content_markdown
    assert "22.0%" in err_sec.content_markdown

    # 23. Reproducibility Information check
    repro_sec = next(s for s in sections if s.key == "reproducibility_information")
    assert "3.12.2" in repro_sec.content_markdown
    assert "42" in repro_sec.content_markdown


def test_markdown_rendering(sample_artifacts):
    sections = _build_deterministic_sections(sample_artifacts)
    md = _render_full_markdown("Senior DS Report: Retention Model", sections)

    assert "# Senior DS Report: Retention Model" in md
    assert "## Table of Contents" in md
    for _, _, title in EXPECTED_SECTIONS:
        assert title in md
    assert "Strict Provenance Guarantee" in md


def test_html_rendering(sample_artifacts):
    sections = _build_deterministic_sections(sample_artifacts)
    sections_raw = [s.model_dump(mode="json") for s in sections]
    html = build_report_html(
        report_title="Senior DS Report: Retention Model",
        executive_summary=sections[0].content_markdown,
        sections=sections_raw,
        metadata={"version": 2, "project_name": "Customer Retention Platform", "created_at": "2026-09-29"},
    )
    assert "<!DOCTYPE html>" in html
    assert "Customer Retention Platform" in html
    assert "Table of Contents (23 Standard Sections)" in html
    assert "✓ MEASURED RESULT" in html
    assert "✦ AI INTERPRETATION" in html
    assert "👤 USER ASSUMPTION" in html


def test_pdf_rendering(sample_artifacts):
    sections = _build_deterministic_sections(sample_artifacts)
    sections_raw = [s.model_dump(mode="json") for s in sections]
    pdf_bytes = build_report_pdf(
        report_title="Senior DS Report: Retention Model",
        executive_summary=sections[0].content_markdown,
        sections=sections_raw,
        metadata={"version": 2, "project_name": "Customer Retention Platform", "created_at": "2026-09-29"},
    )
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF-1.4")
    assert b"%%EOF" in pdf_bytes


def test_generate_request_schema_strictness():
    req = GenerateReportRequest(title="Custom Title", include_ai_synthesis=False)
    assert req.title == "Custom Title"
    assert req.include_ai_synthesis is False

    with pytest.raises(Exception):
        GenerateReportRequest(title="Invalid", unknown_extra_field="rejected")
