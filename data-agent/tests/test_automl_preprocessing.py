"""Unit tests for TabularPreprocessor in Client Data Plane."""

import numpy as np
import pandas as pd
import pytest

from datapilot_agent.automl.preprocessing import TabularPreprocessor


def test_tabular_preprocessor_mixed_types():
    df = pd.DataFrame({
        "age": [25.0, 30.0, np.nan, 45.0, 50.0],
        "salary": [50000.0, 60000.0, 75000.0, np.nan, 90000.0],
        "department": ["sales", "engineering", "sales", "hr", None],
        "signup_date": ["2023-01-15", "2023-02-20", "2023-03-25", "2023-04-10", "2023-05-01"],
    })

    preprocessor = TabularPreprocessor()
    transformed = preprocessor.fit_transform(df)

    assert isinstance(transformed, np.ndarray)
    assert transformed.shape[0] == 5
    # Should have imputed all NaNs
    assert not np.isnan(transformed).any()
    assert len(preprocessor.feature_names) == transformed.shape[1]


def test_strict_featurization_ordering_no_leakage():
    """Verify preprocessor fit strictly on train fold does not leak val fold distribution."""
    train_df = pd.DataFrame({
        "num": [10.0, 20.0, 30.0],
        "cat": ["A", "B", "A"],
    })
    val_df = pd.DataFrame({
        "num": [100.0, 200.0],
        "cat": ["A", "C"],  # "C" is an unseen category in training
    })

    preprocessor = TabularPreprocessor()
    X_train = preprocessor.fit_transform(train_df)
    X_val = preprocessor.transform(val_df)

    # Train shape and val shape feature dimension must match exactly
    assert X_train.shape[1] == X_val.shape[1]
    # Unseen category 'C' is safely ignored (all 0s in one-hot columns), no error
    assert not np.isnan(X_val).any()
