"""Local Data-Quality Analysis Engine.

Performs data quality assessments on client datasets in-memory:
- Duplicate row detection
- Missingness and sparsity analysis
- Zero variance / constant columns
- High cardinality / identifier flags
- Numeric outlier detection (IQR rule)
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from datapilot_agent.contracts import QualityFindingSummary


def analyze_dataset_quality(df: pd.DataFrame) -> tuple[list[QualityFindingSummary], dict[str, list[str]]]:
    """Execute quality checks across the entire dataset and individual columns.
    
    Returns:
        (dataset_findings, column_issues_map)
    """
    findings: list[QualityFindingSummary] = []
    column_issues: dict[str, list[str]] = {col: [] for col in df.columns}
    total_rows = len(df)

    if total_rows == 0:
        findings.append(
            QualityFindingSummary(
                code="EMPTY_DATASET",
                severity="critical",
                message="Dataset has 0 rows.",
                affected_ratio=1.0,
            )
        )
        return findings, column_issues

    # 1. Duplicate rows
    duplicate_count = int(df.duplicated().sum())
    if duplicate_count > 0:
        dup_ratio = float(round(duplicate_count / total_rows, 4))
        findings.append(
            QualityFindingSummary(
                code="DUPLICATE_ROWS",
                severity="medium" if dup_ratio < 0.10 else "high",
                message=f"Found {duplicate_count} duplicate rows ({dup_ratio:.1%} of dataset).",
                affected_ratio=dup_ratio,
            )
        )

    # 2. Per-column quality checks
    for col in df.columns:
        series = df[col]
        null_count = int(series.isna().sum())
        null_ratio = float(round(null_count / total_rows, 4))

        # 2a. Missingness
        if null_ratio >= 0.50:
            column_issues[col].append("CRITICAL_MISSINGNESS")
            findings.append(
                QualityFindingSummary(
                    code="CRITICAL_MISSINGNESS",
                    severity="high",
                    message=f"Column '{col}' has {null_ratio:.1%} missing values.",
                    column=str(col),
                    affected_ratio=null_ratio,
                )
            )
        elif null_ratio >= 0.20:
            column_issues[col].append("HIGH_MISSINGNESS")
            findings.append(
                QualityFindingSummary(
                    code="HIGH_MISSINGNESS",
                    severity="medium",
                    message=f"Column '{col}' has {null_ratio:.1%} missing values.",
                    column=str(col),
                    affected_ratio=null_ratio,
                )
            )

        # 2b. Zero variance / constant values
        non_null_series = series.dropna()
        distinct_count = int(non_null_series.nunique())

        if distinct_count == 1:
            column_issues[col].append("ZERO_VARIANCE")
            findings.append(
                QualityFindingSummary(
                    code="ZERO_VARIANCE",
                    severity="low",
                    message=f"Column '{col}' is constant with only 1 distinct value.",
                    column=str(col),
                    affected_ratio=1.0,
                )
            )
        elif distinct_count == 0 and total_rows > 0:
            column_issues[col].append("ALL_NULLS")
            findings.append(
                QualityFindingSummary(
                    code="ALL_NULLS",
                    severity="high",
                    message=f"Column '{col}' contains only null values.",
                    column=str(col),
                    affected_ratio=1.0,
                )
            )

        # 2c. High cardinality on string/object columns (potential leaky ID)
        if pd.api.types.is_string_dtype(series) or pd.api.types.is_object_dtype(series):
            if total_rows > 50 and distinct_count == total_rows:
                column_issues[col].append("UNIQUE_IDENTIFIER_SUSPECT")
                findings.append(
                    QualityFindingSummary(
                        code="UNIQUE_IDENTIFIER_SUSPECT",
                        severity="low",
                        message=f"Column '{col}' contains 100% unique string values; may be a primary key or UUID.",
                        column=str(col),
                        affected_ratio=1.0,
                    )
                )

        # 2d. Outliers on numeric columns (IQR rule)
        if pd.api.types.is_numeric_dtype(series) and distinct_count > 1 and len(non_null_series) > 10:
            q25 = float(non_null_series.quantile(0.25))
            q75 = float(non_null_series.quantile(0.75))
            iqr = q75 - q25
            if iqr > 0:
                lower_bound = q25 - 1.5 * iqr
                upper_bound = q75 + 1.5 * iqr
                outliers_count = int(((non_null_series < lower_bound) | (non_null_series > upper_bound)).sum())
                if outliers_count > 0:
                    outlier_ratio = float(round(outliers_count / total_rows, 4))
                    if outlier_ratio > 0.05:
                        column_issues[col].append("OUTLIERS_DETECTED")
                        findings.append(
                            QualityFindingSummary(
                                code="OUTLIERS_DETECTED",
                                severity="low",
                                message=f"Column '{col}' has {outliers_count} statistical outliers ({outlier_ratio:.1%}).",
                                column=str(col),
                                affected_ratio=outlier_ratio,
                            )
                        )

    return findings, column_issues
