"""Security and Privacy Tests: Proves ZERO raw data leakage in AutoML exports."""

import json
import numpy as np
import pandas as pd
import pytest

from datapilot_agent.automl.engine import AutoMLEngine
from datapilot_agent.automl.schemas import AutoMLConfig, MLProblemType
from datapilot_agent.export_gate import (
    ExportGate,
    PermittedExportType,
    SecurityLeakException,
)


def test_zero_raw_training_data_in_automl_export():
    """Verify that private customer records and sentinels never appear in exported experiment metadata."""
    secret_sentinel = "CONFIDENTIAL_PASSPORT_NUMBER_999888_DO_NOT_EGRESS"

    # Synthetic dataset containing explicit confidential string
    df = pd.DataFrame({
        "customer_id": [f"ID_{i}" for i in range(50)],
        "secret_token": [f"{secret_sentinel}_{i}" for i in range(50)],
        "metric_a": np.random.randn(50),
        "target": np.random.choice([0, 1], 50),
    })

    config = AutoMLConfig(
        problem_type=MLProblemType.CLASSIFICATION,
        target_column="target",
        feature_columns=["metric_a"],  # Only metric_a selected
        n_splits=2,
        tune_hyperparameters=False,
    )

    engine = AutoMLEngine(config)
    result = engine.run(df, "Zero Leakage Experiment")

    # Serialize payload to JSON string
    serialized_payload = json.dumps(result.model_dump())

    # Assert secret sentinel string is completely absent
    assert secret_sentinel not in serialized_payload
    assert "CONFIDENTIAL" not in serialized_payload
    assert "PASSPORT" not in serialized_payload

    # Run explicit ExportGate inspection
    gate = ExportGate()
    verified_dict = gate.validate_and_sanitize(
        PermittedExportType.EXPERIMENT_RESULT,
        result.model_dump(),
        known_forbidden_values={secret_sentinel},
    )
    assert verified_dict is not None


def test_export_gate_blocks_injected_raw_rows():
    """Assert ExportGate aborts if someone attempts to inject raw data rows into experiment metadata."""
    gate = ExportGate()

    tampered_payload = {
        "experiment_name": "Tampered Experiment",
        "problem_type": "classification",
        "target_name": "target",
        "primary_metric": "roc_auc",
        "n_samples": 100,
        "n_features": 2,
        "feature_names": ["f1", "f2"],
        "n_splits": 5,
        "validation_strategy": "stratified_k_fold",
        "baseline_score": 0.5,
        "best_model_name": "Random Forest",
        "best_score": 0.85,
        "leaderboard": [],
        "benchmarks": [],
        "tuning_trials": [],
        "total_execution_time_seconds": 1.2,
        # ILLEGAL INJECTION OF RAW TRAINING DATA:
        "raw_training_rows": [{"f1": 1.2, "f2": 3.4}],
    }

    with pytest.raises(SecurityLeakException) as exc_info:
        gate.validate_and_sanitize(
            PermittedExportType.EXPERIMENT_RESULT,
            tampered_payload,
        )

    assert "Unauthorized field 'raw_training_rows'" in str(exc_info.value)
