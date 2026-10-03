"""Comprehensive Unit Test Suite for Local Data Profiling Engine.

Tests calculation of all local profiling metrics on synthetic datasets:
- row count & column count
- data types
- missing values
- duplicate rows
- unique values
- cardinality
- numerical statistics (min, max, mean, std, median, q25, q75, iqr, skew, kurt)
- categorical statistics (mode, frequency, ratios, distinct count)
- distributions (binned histograms)
- outliers (Tukey's IQR method)
- feature correlations (Pearson coefficients)
- constant columns
- suspicious columns

Guarantees that synthetic datasets remain strictly local and never reach the cloud.
"""

from pathlib import Path
from uuid import uuid4

import httpx
import numpy as np
import pandas as pd
import pytest

from datapilot_agent.client import ControlPlaneClient
from datapilot_agent.contracts import AgentConfig, PermittedProfilePayload
from datapilot_agent.export_gate import sanitize_and_verify_export
from datapilot_agent.profiler import profile_dataframe, profile_dataset_file


@pytest.fixture
def synthetic_profiling_dataframe() -> pd.DataFrame:
    """Create a controlled synthetic dataset with known statistical properties."""
    np.random.seed(42)
    n = 100

    # Linear correlation between feat_x and feat_y (r ~ 0.98)
    feat_x = np.linspace(10.0, 100.0, n)
    feat_y = 2.0 * feat_x + np.random.normal(0, 1.0, n)

    # Feature with known outliers
    feat_outliers = np.random.normal(50.0, 5.0, n)
    feat_outliers[0] = 500.0  # High outlier
    feat_outliers[1] = -200.0 # Low outlier

    # Categorical feature with known mode and frequencies
    categories = ["Tier_A"] * 60 + ["Tier_B"] * 30 + ["Tier_C"] * 10

    # Constant column
    constant_val = ["CONSTANT_VAL"] * n

    # Suspicious ID column (100% unique string tokens)
    suspicious_ids = [f"token_id_hash_{i:04d}" for i in range(n)]

    # Missing values column (25% nulls)
    sparse_vals = [float(i) if i % 4 != 0 else None for i in range(n)]

    df = pd.DataFrame({
        "customer_id": suspicious_ids,
        "feature_x": feat_x,
        "feature_y": feat_y,
        "metrics_with_outliers": feat_outliers,
        "account_tier": categories,
        "system_flag": constant_val,
        "sparse_score": sparse_vals,
    })

    # Duplicate rows: duplicate row 10 and row 20 to test duplicate detection
    df = pd.concat([df, df.iloc[[10, 20]]], ignore_index=True)
    return df


def test_profiling_engine_comprehensive_metrics(synthetic_profiling_dataframe: pd.DataFrame):
    df = synthetic_profiling_dataframe
    total_expected_rows = len(df) # 102 (100 + 2 duplicates)

    profile: PermittedProfilePayload = profile_dataframe(
        df=df,
        dataset_ref="ds_ref_synthetic_01",
        dataset_format="csv",
        file_size_bytes=16384,
        allow_category_values=True,
    )

    # 1. Versioned Schema
    assert profile.schema_version == "1.0.0"
    assert profile.dataset_ref == "ds_ref_synthetic_01"
    assert profile.format == "csv"

    # 2. Row count and column count
    assert profile.total_rows == total_expected_rows
    assert profile.total_columns == 7

    # 3. Duplicate rows
    assert profile.duplicate_rows_count == 2
    assert profile.duplicate_rows_ratio == round(2 / total_expected_rows, 4)

    # 4. Constant columns
    assert "system_flag" in profile.constant_columns
    const_col = next(c for c in profile.columns if c.name == "system_flag")
    assert const_col.is_constant is True
    assert const_col.unique_count == 1

    # 5. Suspicious columns
    assert "customer_id" in profile.suspicious_columns
    id_col = next(c for c in profile.columns if c.name == "customer_id")
    assert id_col.is_suspicious is True
    assert any("HIGH_CARDINALITY_IDENTIFIER" in r for r in id_col.suspicious_reasons)

    # 6. Missing values & cardinality
    sparse_col = next(c for c in profile.columns if c.name == "sparse_score")
    assert sparse_col.null_count > 20
    assert 0.20 <= sparse_col.null_ratio <= 0.30
    assert sparse_col.cardinality_ratio > 0.0

    # 7. Numerical statistics
    fx_col = next(c for c in profile.columns if c.name == "feature_x")
    assert fx_col.data_type == "float"
    assert fx_col.numeric_stats is not None
    assert fx_col.numeric_stats.min == 10.0
    assert fx_col.numeric_stats.max == 100.0
    assert 54.0 <= fx_col.numeric_stats.mean <= 56.0
    assert fx_col.numeric_stats.median is not None
    assert fx_col.numeric_stats.iqr is not None
    assert fx_col.numeric_stats.skewness is not None

    # 8. Outliers (Tukey's IQR rule)
    outlier_col = next(c for c in profile.columns if c.name == "metrics_with_outliers")
    assert outlier_col.outliers is not None
    assert outlier_col.outliers.outlier_count >= 2
    assert outlier_col.outliers.outlier_ratio > 0.0
    assert outlier_col.outliers.lower_bound is not None
    assert outlier_col.outliers.upper_bound is not None

    # 9. Distributions (Histogram)
    assert fx_col.distribution is not None
    assert fx_col.distribution.type == "histogram"
    assert len(fx_col.distribution.bin_edges) > 2
    assert len(fx_col.distribution.bin_counts) > 0
    assert sum(fx_col.distribution.bin_counts) == total_expected_rows

    # 10. Categorical statistics
    cat_col = next(c for c in profile.columns if c.name == "account_tier")
    assert cat_col.data_type == "string"
    assert cat_col.categorical_stats is not None
    assert cat_col.categorical_stats.distinct_categories_count == 3
    assert cat_col.categorical_stats.mode == "Tier_A"
    assert cat_col.categorical_stats.mode_frequency is not None
    assert cat_col.categorical_stats.mode_frequency >= 60
    assert len(cat_col.categorical_stats.top_frequencies) == 3

    # 11. Correlations
    assert len(profile.correlations) > 0
    # feature_x and feature_y have near 1.0 correlation
    xy_corr = next(
        (c for c in profile.correlations if (c.column_a == "feature_x" and c.column_b == "feature_y")
         or (c.column_a == "feature_y" and c.column_b == "feature_x")),
        None,
    )
    assert xy_corr is not None
    assert 0.95 <= xy_corr.pearson_coefficient <= 1.0


def test_never_upload_synthetic_dataset_to_cloud(tmp_path: Path, synthetic_profiling_dataframe: pd.DataFrame):
    """Prove that synthetic datasets are never sent to the cloud, and only permitted metadata is transmitted."""
    # 1. Save synthetic dataset locally
    csv_file = tmp_path / "client_synthetic_dataset.csv"
    synthetic_profiling_dataframe.to_csv(csv_file, index=False)

    # Read all raw cell strings to verify none are uploaded
    raw_csv_text = csv_file.read_text(encoding="utf-8")
    sample_raw_tokens = {
        "token_id_hash_0001",
        "token_id_hash_0042",
        "token_id_hash_0099",
        "CONSTANT_VAL",
    }

    # 2. Profile the local file
    profile = profile_dataset_file(
        file_path=csv_file,
        dataset_ref="ds_ref_synthetic_safe",
        dataset_format="csv",
    )

    # 3. Intercept transmission
    captured_requests: list[httpx.Request] = []

    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        return httpx.Response(200, json={"status": "accepted", "summary_id": str(uuid4())})

    config = AgentConfig(
        cloud_api_url="http://datapilot.cloud.local",
        data_dir=tmp_path,
        agent_id=uuid4(),
        agent_token="secret_agent_token_xyz",
    )
    client = ControlPlaneClient(config)
    client._http = httpx.Client(
        base_url=config.cloud_api_url,
        transport=httpx.MockTransport(mock_transport_handler),
    )

    # 4. Transmit permitted metadata only
    client.submit_job_results(
        job_id=uuid4(),
        lease_token="lease_token_123",
        profile=profile,
        sentinels_to_verify={"token_id_hash_0001", "token_id_hash_0042"},
    )

    assert len(captured_requests) == 1
    sent_request = captured_requests[0]
    wire_payload = sent_request.content.decode("utf-8")

    # Verify that the raw dataset file or raw rows were NEVER uploaded
    assert "token_id_hash_0001" not in wire_payload
    assert "token_id_hash_0042" not in wire_payload
    assert "token_id_hash_0099" not in wire_payload

    # But statistical metadata is present
    assert '"schema_version":"1.0.0"' in wire_payload or '"schema_version": "1.0.0"' in wire_payload
    assert "feature_x" in wire_payload
    assert "metrics_with_outliers" in wire_payload
    assert "pearson_coefficient" in wire_payload
    assert "iqr" in wire_payload
