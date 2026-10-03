"""Tests for local dataset discovery and path traversal safety."""

from pathlib import Path

import pytest

from datapilot_agent.contracts import DiscoveredDataset
from datapilot_agent.discovery import (
    compute_opaque_ref,
    discover_local_datasets,
    sanitize_alias,
)


def test_sanitize_alias():
    assert sanitize_alias("customer_churn.csv") == "customer_churn"
    assert sanitize_alias("sales-report (2026).xlsx") == "sales-report_2026"
    assert sanitize_alias("..special##@!.parquet") == "special"
    assert sanitize_alias("___") == "unnamed_dataset"


def test_compute_opaque_ref_deterministic():
    ref1 = compute_opaque_ref("subfolder/data.csv")
    ref2 = compute_opaque_ref("subfolder/data.csv")
    assert ref1 == ref2
    assert ref1.startswith("ds_ref_")
    assert len(ref1) > 10


def test_discover_local_datasets(tmp_path: Path):
    # Create valid files
    (tmp_path / "sales.csv").write_text("a,b\n1,2\n", encoding="utf-8")
    (tmp_path / "users.parquet").write_text("dummy parquet content", encoding="utf-8")
    (tmp_path / "budget.xlsx").write_text("dummy excel content", encoding="utf-8")
    
    # Unsupported files
    (tmp_path / "script.py").write_text("print('hello')", encoding="utf-8")
    (tmp_path / "notes.txt").write_text("some notes", encoding="utf-8")

    discovered = discover_local_datasets(tmp_path)
    aliases = {d.approved_alias for d in discovered}
    formats = {d.format for d in discovered}

    assert len(discovered) == 3
    assert "sales" in aliases
    assert "users" in aliases
    assert "budget" in aliases
    assert formats == {"csv", "parquet", "excel"}
    
    # Verify opaque ref format
    for d in discovered:
        assert d.opaque_local_ref.startswith("ds_ref_")
        assert d.local_path.exists()


def test_discover_non_existent_dir():
    with pytest.raises(FileNotFoundError):
        discover_local_datasets("/non/existent/path/12345")
