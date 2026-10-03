"""Tests for profiler and privacy export gatekeeper."""

from datetime import UTC, datetime

import pandas as pd
import pytest

from datapilot_agent.contracts import ColumnSummary, PermittedProfilePayload
from datapilot_agent.export_gate import (
    SecurityLeakException,
    sanitize_and_verify_export,
)
from datapilot_agent.profiler import profile_dataframe


def test_profiler_schema_conformance():
    df = pd.DataFrame({
        "customer_id": [101, 102, 103, 104],
        "email": ["alice@corp.com", "bob@corp.com", "charlie@corp.com", "dave@corp.com"],
        "spend": [50.0, 100.5, 25.2, 75.0],
    })

    payload = profile_dataframe(df, dataset_ref="ds_ref_abc123", dataset_format="csv", file_size_bytes=1024)

    assert payload.total_rows == 4
    assert payload.total_columns == 3
    assert payload.dataset_ref == "ds_ref_abc123"

    # Email column should be flagged as PII
    email_col = next(c for c in payload.columns if c.name == "email")
    assert email_col.is_pii is True
    assert "EMAIL" in email_col.pii_types

    # Spend column should have numeric stats
    spend_col = next(c for c in payload.columns if c.name == "spend")
    assert spend_col.numeric_stats is not None
    assert spend_col.numeric_stats.min == 25.2
    assert spend_col.numeric_stats.max == 100.5


def test_export_gate_passes_clean_payload():
    col = ColumnSummary(
        name="test_col",
        data_type="integer",
        null_count=0,
        null_ratio=0.0,
        unique_count=5,
        is_pii=False,
    )
    payload = PermittedProfilePayload(
        dataset_ref="ref_1",
        format="csv",
        total_rows=5,
        total_columns=1,
        duplicate_rows_count=0,
        file_size_bytes=100,
        columns=[col],
        quality_findings=[],
        profiled_at=datetime.now(UTC).isoformat(),
    )

    clean_dict = sanitize_and_verify_export(payload)
    assert clean_dict["total_rows"] == 5
    assert clean_dict["dataset_ref"] == "ref_1"


def test_export_gate_blocks_extra_forbidden_fields():
    # If someone tries to attach unauthorized keys
    raw_dict = {
        "dataset_ref": "ref_1",
        "format": "csv",
        "total_rows": 5,
        "total_columns": 1,
        "duplicate_rows_count": 0,
        "file_size_bytes": 100,
        "columns": [],
        "quality_findings": [],
        "profiled_at": datetime.now(UTC).isoformat(),
        "unauthorized_field": "sneak_in",
    }

    # Pydantic validation error or security leak exception
    with pytest.raises((ValueError, SecurityLeakException)):
        PermittedProfilePayload.model_validate(raw_dict)
