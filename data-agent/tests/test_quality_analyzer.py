"""Tests for local data-quality analysis."""

import pandas as pd

from datapilot_agent.quality_analyzer import analyze_dataset_quality


def test_duplicate_rows():
    df = pd.DataFrame({
        "id": [1, 2, 2, 3],
        "val": ["A", "B", "B", "C"],
    })
    findings, _ = analyze_dataset_quality(df)
    codes = {f.code for f in findings}
    assert "DUPLICATE_ROWS" in codes
    dup_finding = next(f for f in findings if f.code == "DUPLICATE_ROWS")
    assert dup_finding.affected_ratio == 0.25


def test_high_missingness():
    df = pd.DataFrame({
        "col1": [1, 2, 3, 4],
        "sparse_col": [1, None, None, None],  # 75% null
    })
    findings, col_issues = analyze_dataset_quality(df)
    assert "CRITICAL_MISSINGNESS" in col_issues["sparse_col"]
    assert any(f.code == "CRITICAL_MISSINGNESS" and f.column == "sparse_col" for f in findings)


def test_zero_variance():
    df = pd.DataFrame({
        "status": ["active", "active", "active", "active"],
        "num": [10, 20, 30, 40],
    })
    findings, col_issues = analyze_dataset_quality(df)
    assert "ZERO_VARIANCE" in col_issues["status"]
    assert any(f.code == "ZERO_VARIANCE" and f.column == "status" for f in findings)
