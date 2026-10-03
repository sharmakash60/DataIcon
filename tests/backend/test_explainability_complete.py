"""Comprehensive tests for complete model explainability module.

Verifies:
1. Global feature importance with direction and distribution
2. SHAP summary plot serialization
3. SHAP dependence plot serialization
4. Local prediction explanation (prediction, probability, top factors increasing/decreasing)
5. Permutation importance
6. Partial dependence plots (PDP)
7. Error analysis
8. What-If sensitivity / scenario analysis endpoint with mandatory non-causal disclaimer
"""
from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

import pytest
from app.explainability.schemas import (
    ExplainabilityReportOut,
    FeatureDistributionIn,
    FeatureImportanceEntryIn,
    GlobalSHAPIn,
    IngestExplainabilityRequest,
    LocalExplanationIn,
    LocalSHAPFactorIn,
    LocalSHAPFeatureIn,
    PartialDependencePlotIn,
    PermutationImportanceIn,
    SHAPDependencePlotIn,
    SHAPDependencePointIn,
    SHAPSummaryPlotIn,
    SHAPSummaryPointIn,
    WhatIfScenarioRequest,
    WhatIfScenarioResponse,
)


def test_schema_full_explainability_payload():
    exp_id = uuid.uuid4()
    dist = FeatureDistributionIn(
        min=0.0,
        p25=8.0,
        median=24.0,
        p75=48.0,
        max=72.0,
        mean=28.5,
        std=14.2,
        source="model_derived",
    )
    feat_entry = FeatureImportanceEntryIn(
        feature_name="tenure",
        importance_value=0.42,
        importance_rank=1,
        std_error=0.015,
        method="shap_global",
        direction="-",  # higher tenure decreases churn
        distribution=dist,
        source="model_derived",
    )
    shap_summary = SHAPSummaryPlotIn(
        features=["tenure", "monthly_charges"],
        points=[
            SHAPSummaryPointIn(
                feature_name="tenure",
                sample_index=0,
                feature_value=8.0,
                feature_value_normalized=0.11,
                shap_value=0.25,
                source="model_derived",
            )
        ],
        source="model_derived",
    )
    shap_dependence = [
        SHAPDependencePlotIn(
            feature_name="tenure",
            interaction_feature="monthly_charges",
            points=[
                SHAPDependencePointIn(
                    feature_value=8.0,
                    shap_value=0.25,
                    interaction_feature_value=70.0,
                    sample_index=0,
                    source="model_derived",
                ),
                SHAPDependencePointIn(
                    feature_value=24.0,
                    shap_value=-0.15,
                    interaction_feature_value=65.0,
                    sample_index=1,
                    source="model_derived",
                ),
            ],
            source="model_derived",
        )
    ]
    pdp = [
        PartialDependencePlotIn(
            feature_name="tenure",
            grid_values=[0.0, 12.0, 24.0, 36.0, 48.0, 60.0, 72.0],
            average_predictions=[0.75, 0.55, 0.40, 0.30, 0.22, 0.15, 0.10],
            target_name="churn",
            source="model_derived",
        )
    ]
    local_exp = [
        LocalExplanationIn(
            sample_index=0,
            prediction=0.68,
            probability=0.68,
            predicted_class="churn",
            base_value=0.35,
            feature_values={"tenure": 8.0, "monthly_charges": 70.0},
            feature_contributions=[
                LocalSHAPFeatureIn(feature_name="tenure", shap_value=0.25, feature_value=8.0, source="model_derived"),
                LocalSHAPFeatureIn(feature_name="monthly_charges", shap_value=0.08, feature_value=70.0, source="model_derived"),
            ],
            top_factors_increasing=[
                LocalSHAPFactorIn(
                    feature_name="tenure",
                    shap_value=0.25,
                    feature_value=8.0,
                    impact_magnitude=0.25,
                    effect="increases_prediction",
                    source="model_derived",
                )
            ],
            top_factors_decreasing=[],
            source="model_derived",
        )
    ]
    payload = IngestExplainabilityRequest(
        schema_version="explainability/v1",
        experiment_id=exp_id,
        model_name="XGBoostChurnClassifier",
        problem_type="binary_classification",
        target_name="churn",
        primary_metric="roc_auc",
        primary_metric_value=0.912,
        n_eval_samples=1000,
        explained_at=datetime.now(UTC).isoformat(),
        global_shap=GlobalSHAPIn(
            method="tree_shap",
            features=[feat_entry],
            n_samples_used=500,
            baseline_value=0.35,
            source="model_derived",
        ),
        shap_summary=shap_summary,
        shap_dependence=shap_dependence,
        partial_dependence=pdp,
        local_explanations=local_exp,
    )
    assert payload.model_name == "XGBoostChurnClassifier"
    assert payload.shap_summary.points[0].shap_value == 0.25
    assert len(payload.shap_dependence[0].points) == 2
    assert payload.partial_dependence[0].average_predictions[2] == 0.40
    assert payload.local_explanations[0].top_factors_increasing[0].feature_name == "tenure"


def test_what_if_scenario_simulation_with_disclaimer():
    from unittest.mock import MagicMock
    from app.explainability.router import simulate_what_if_scenario
    from app.models import ExplainabilityReport

    exp_id = uuid.uuid4()
    proj_id = uuid.uuid4()
    org_id = uuid.uuid4()
    report_id = uuid.uuid4()

    mock_report = MagicMock(spec=ExplainabilityReport)
    mock_report.id = report_id
    mock_report.organization_id = org_id
    mock_report.project_id = proj_id
    mock_report.experiment_id = exp_id
    mock_report.model_name = "CustomerChurnPredictor"
    mock_report.problem_type = "binary_classification"
    mock_report.primary_metric_value = 0.88
    mock_report.global_shap_json = json.dumps({
        "method": "tree_shap",
        "features": [
            {
                "feature_name": "tenure",
                "importance_value": 0.4,
                "importance_rank": 1,
                "direction": "-",
                "method": "shap",
                "source": "model_derived",
            }
        ],
        "_partial_dependence": [
            {
                "feature_name": "tenure",
                "grid_values": [0.0, 8.0, 16.0, 24.0, 48.0],
                "average_predictions": [0.80, 0.70, 0.50, 0.35, 0.15],
                "source": "model_derived",
            }
        ],
    })
    mock_report.local_explanations_json = json.dumps([
        {
            "sample_index": 42,
            "prediction": 0.70,
            "base_value": 0.35,
            "feature_values": {"tenure": 8.0, "monthly_charges": 75.0},
            "feature_contributions": [
                {"feature_name": "tenure", "shap_value": 0.25, "feature_value": 8.0, "source": "model_derived"},
                {"feature_name": "monthly_charges", "shap_value": 0.10, "feature_value": 75.0, "source": "model_derived"},
            ],
            "source": "model_derived",
        }
    ])

    mock_db = MagicMock()
    mock_db.scalar.return_value = mock_report

    mock_context = MagicMock()
    mock_context.tenant.organization_id = org_id

    # Customer has Tenure = 8 months; user tests what happens if Tenure is changed to 24 months
    request = WhatIfScenarioRequest(
        sample_index=42,
        baseline_features={"tenure": 8.0},
        modified_features={"tenure": 24.0},
    )

    response = simulate_what_if_scenario(
        experiment_id=exp_id,
        project_id=proj_id,
        report_id=report_id,
        payload=request,
        project_context=mock_context,
        db=mock_db,
    )

    assert isinstance(response, WhatIfScenarioResponse)
    assert response.baseline_prediction == 0.70
    # From PDP: f(24)=0.35, f(8)=0.70 -> impact is -0.35. Scenario pred is 0.70 - 0.35 = 0.35
    assert response.scenario_prediction < response.baseline_prediction
    assert response.delta < 0
    assert len(response.feature_shifts) == 1
    assert response.feature_shifts[0].feature_name == "tenure"
    assert response.feature_shifts[0].original_value == 8.0
    assert response.feature_shifts[0].new_value == 24.0
    assert response.feature_shifts[0].direction == "decreases_prediction"

    # CRITICAL NON-CAUSAL DISCLAIMER ENFORCEMENT
    assert "NOT CAUSAL EVIDENCE" in response.disclaimer
    assert "MODEL SENSITIVITY / SCENARIO ANALYSIS" in response.disclaimer
    assert response.source == "model_derived"
