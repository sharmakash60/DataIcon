"""Local Data Profiling Engine.

Calculates comprehensive structural, statistical, distribution, and quality
metrics strictly inside the customer's private client perimeter in memory:
- row count & column count
- technical & logical data types
- missing values & null ratios
- duplicate rows & duplicate ratios
- unique values & cardinality ratios
- numerical statistics (min, max, mean, std, median, q25, q75, iqr, skew, kurt)
- categorical statistics (mode, frequencies, distinct counts)
- distributions (10-bin numeric histograms, frequency distributions)
- statistical outliers (Tukey's IQR method)
- feature correlations (pairwise Pearson coefficients)
- constant columns identification
- suspicious column detection (data leakage, extreme imbalance, high missingness)

ZERO RAW DATA RETENTION:
Only permitted statistical metadata conforming to PermittedProfilePayload
is generated.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

from datapilot_agent.contracts import (
    CategoricalStats,
    CategoryFrequency,
    ColumnProfile,
    CorrelationEntry,
    DistributionStats,
    NumericStats,
    OutlierStats,
    PermittedProfilePayload,
)
from datapilot_agent.loaders import load_dataset
from datapilot_agent.pii_detector import detect_column_pii
from datapilot_agent.quality_analyzer import analyze_dataset_quality


def clean_float(val: float | None) -> float | None:
    """Ensure floating point numbers are finite and JSON-serializable."""
    if val is None or math.isnan(val) or math.isinf(val):
        return None
    return float(round(val, 4))


def infer_column_type(series: pd.Series) -> str:
    """Infer clean technical data type label for a pandas series."""
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    elif pd.api.types.is_integer_dtype(series):
        return "integer"
    elif pd.api.types.is_float_dtype(series):
        return "float"
    elif pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    elif isinstance(series.dtype, pd.CategoricalDtype):
        return "category"
    else:
        return "string"


def compute_numerical_statistics(series: pd.Series) -> tuple[NumericStats | None, OutlierStats | None, DistributionStats | None]:
    """Calculate descriptive stats, outliers, and histogram for numeric series."""
    if not pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        return None, None, None

    clean = series.dropna()
    total = len(clean)
    if total == 0:
        return None, None, None

    val_min = clean_float(float(clean.min()))
    val_max = clean_float(float(clean.max()))
    val_mean = clean_float(float(clean.mean()))
    val_std = clean_float(float(clean.std())) if total > 1 else 0.0
    val_median = clean_float(float(clean.median()))
    q25 = clean_float(float(clean.quantile(0.25)))
    q75 = clean_float(float(clean.quantile(0.75)))

    iqr = None
    if q25 is not None and q75 is not None:
        iqr = clean_float(q75 - q25)

    skew = clean_float(float(clean.skew())) if total > 2 else None
    kurt = clean_float(float(clean.kurtosis())) if total > 3 else None

    num_stats = NumericStats(
        min=val_min,
        max=val_max,
        mean=val_mean,
        std=val_std,
        median=val_median,
        q25=q25,
        q75=q75,
        iqr=iqr,
        skewness=skew,
        kurtosis=kurt,
    )

    # Outlier calculation via IQR
    outlier_stats: OutlierStats | None = None
    if iqr is not None and iqr > 0 and q25 is not None and q75 is not None:
        lower_bound = clean_float(q25 - 1.5 * iqr)
        upper_bound = clean_float(q75 + 1.5 * iqr)
        outlier_mask = (clean < (q25 - 1.5 * iqr)) | (clean > (q75 + 1.5 * iqr))
        outlier_count = int(outlier_mask.sum())
        outlier_ratio = clean_float(outlier_count / total) or 0.0
        outlier_stats = OutlierStats(
            method="iqr",
            outlier_count=outlier_count,
            outlier_ratio=outlier_ratio,
            lower_bound=lower_bound,
            upper_bound=upper_bound,
        )
    else:
        outlier_stats = OutlierStats(
            method="iqr",
            outlier_count=0,
            outlier_ratio=0.0,
            lower_bound=val_min,
            upper_bound=val_max,
        )

    # 10-bin histogram distribution
    dist_stats: DistributionStats | None = None
    try:
        bin_counts_raw, bin_edges_raw = np.histogram(clean, bins=min(10, max(2, total)))
        bin_edges = [clean_float(float(x)) for x in bin_edges_raw]
        bin_counts = [int(x) for x in bin_counts_raw]
        dist_stats = DistributionStats(
            type="histogram",
            bin_edges=[x for x in bin_edges if x is not None],
            bin_counts=bin_counts,
        )
    except Exception:
        dist_stats = None

    return num_stats, outlier_stats, dist_stats


def is_safe_categorical_feature(
    col_name: str,
    distinct_count: int,
    total_clean: int,
    is_pii: bool,
) -> bool:
    """Determine whether column values are safe categorical classes vs raw text/identifiers."""
    if is_pii:
        return False
    col_lower = str(col_name).lower()
    # Identifier, secret, or key columns must never emit raw cell strings
    if any(k in col_lower for k in ("id", "token", "key", "secret", "password", "hash", "ssn", "card", "note")):
        return False
    if total_clean == 0:
        return False
    cardinality_ratio = distinct_count / total_clean
    # Safe discrete category: low distinct count AND distinct_count significantly less than total rows
    if distinct_count <= 25 and (
        cardinality_ratio <= 0.30 or (distinct_count <= 5 and total_clean <= 20 and distinct_count < total_clean)
    ):
        return True
    return False


def compute_categorical_statistics(
    series: pd.Series,
    is_pii: bool,
    total_rows: int,
    allow_category_values: bool = False,
) -> CategoricalStats | None:
    """Calculate categorical distributions, mode, and frequencies with privacy redaction."""
    clean = series.dropna()
    total_clean = len(clean)
    if total_clean == 0:
        return None

    value_counts = clean.value_counts()
    distinct_count = len(value_counts)
    col_name = str(series.name) if series.name is not None else ""
    is_safe = is_safe_categorical_feature(col_name, distinct_count, total_clean, is_pii)

    mode_val: str | None = None
    mode_freq: int | None = None
    mode_ratio: float | None = None

    if distinct_count > 0:
        top_raw_val = value_counts.index[0]
        mode_freq = int(value_counts.iloc[0])
        mode_ratio = clean_float(mode_freq / total_rows) if total_rows > 0 else 0.0
        if is_pii:
            mode_val = "<PII_REDACTED>"
        elif not allow_category_values:
            # EGR-01: Anonymize category values by default to prevent raw string egress
            mode_val = "<CATEGORY_MODE>"
        elif not is_safe:
            mode_val = "<REDACTED_HIGH_CARDINALITY>"
        else:
            mode_val = str(top_raw_val)[:100]

    # Compute top frequencies (max 10 categories)
    top_frequencies: list[CategoryFrequency] = []
    for i, (cat_raw, count) in enumerate(value_counts.head(10).items()):
        cnt = int(count)
        ratio = clean_float(cnt / total_rows) if total_rows > 0 else 0.0
        if is_pii:
            cat_label = "<PII_REDACTED>"
        elif not allow_category_values:
            # EGR-01: Emit safe opaque category rank labels with real frequency counts
            cat_label = f"<CATEGORY_{i + 1}>"
        elif not is_safe:
            cat_label = f"<REDACTED_CAT_{i + 1}>"
        else:
            cat_label = str(cat_raw)[:100]
        top_frequencies.append(
            CategoryFrequency(
                category=cat_label,
                count=cnt,
                ratio=ratio or 0.0,
            )
        )

    return CategoricalStats(
        top_categories_count=min(10, distinct_count),
        mode=mode_val,
        mode_frequency=mode_freq,
        mode_ratio=mode_ratio,
        distinct_categories_count=distinct_count,
        top_frequencies=top_frequencies,
    )


def compute_pairwise_correlations(df: pd.DataFrame, max_cols: int = 50) -> list[CorrelationEntry]:
    """Compute pairwise Pearson correlation coefficients between numeric features."""
    numeric_cols = [
        col for col in df.columns
        if pd.api.types.is_numeric_dtype(df[col]) and not pd.api.types.is_bool_dtype(df[col])
    ][:max_cols]

    if len(numeric_cols) < 2:
        return []

    try:
        corr_matrix = df[numeric_cols].corr(method="pearson")
        entries: list[CorrelationEntry] = []
        for i, col_a in enumerate(numeric_cols):
            for col_b in numeric_cols[i + 1:]:
                raw_coef = corr_matrix.loc[col_a, col_b]
                coef = clean_float(float(raw_coef))
                if coef is not None:
                    # Bound strictly within [-1.0, 1.0]
                    bounded_coef = max(-1.0, min(1.0, coef))
                    entries.append(
                        CorrelationEntry(
                            column_a=str(col_a)[:160],
                            column_b=str(col_b)[:160],
                            pearson_coefficient=bounded_coef,
                        )
                    )
        # Sort descending by absolute correlation
        entries.sort(key=lambda c: abs(c.pearson_coefficient), reverse=True)
        return entries[:100]
    except Exception:
        return []


def detect_suspicious_features(
    col_name: str,
    data_type: str,
    total_rows: int,
    null_ratio: float,
    unique_count: int,
    cardinality_ratio: float,
    is_pii: bool,
    num_stats: NumericStats | None,
    cat_stats: CategoricalStats | None,
) -> tuple[bool, list[str]]:
    """Apply heuristics to detect suspicious features (leakage, imbalance, sparsity)."""
    reasons: list[str] = []

    # 1. Potential identifier / data leakage (high cardinality in string/integer)
    if data_type in ("string", "integer") and total_rows > 30 and cardinality_ratio >= 0.90:
        if any(k in col_name.lower() for k in ("id", "key", "token", "hash", "code", "guid", "uuid")):
            reasons.append("HIGH_CARDINALITY_IDENTIFIER: Potential primary key or leakage")

    # 2. Critical missingness
    if null_ratio >= 0.50:
        reasons.append(f"CRITICAL_MISSINGNESS: {null_ratio:.1%} missing values")

    # 3. Constant feature (zero variance)
    if unique_count <= 1 and total_rows > 0:
        reasons.append("ZERO_VARIANCE: Constant feature with <= 1 unique value")

    # 4. Severe class imbalance on categoricals
    if cat_stats and cat_stats.mode_ratio is not None and cat_stats.mode_ratio >= 0.98 and total_rows > 50:
        reasons.append(f"EXTREME_IMBALANCE: Dominant class represents {cat_stats.mode_ratio:.1%} of rows")

    # 5. Extreme skewness on numeric columns
    if num_stats and num_stats.skewness is not None and abs(num_stats.skewness) >= 10.0:
        reasons.append(f"EXTREME_SKEWNESS: Distribution skewness coefficient is {num_stats.skewness}")

    # 6. Sensitive PII pattern
    if is_pii:
        reasons.append("CONFIDENTIAL_PII: Contains detected personal identifiable information")

    is_suspicious = len(reasons) > 0
    return is_suspicious, reasons


def profile_dataframe(
    df: pd.DataFrame,
    dataset_ref: str,
    dataset_format: Literal["csv", "parquet", "excel"],
    file_size_bytes: int,
    allow_category_values: bool = False,
) -> PermittedProfilePayload:
    """Execute comprehensive local data profiling on an in-memory DataFrame."""
    total_rows = len(df)
    total_cols = len(df.columns)
    duplicate_rows = int(df.duplicated().sum()) if total_rows > 0 else 0
    dup_ratio = clean_float(duplicate_rows / total_rows) if total_rows > 0 else 0.0

    # 1. Quality findings
    findings, column_issues_map = analyze_dataset_quality(df)

    # 2. Correlations
    correlations = compute_pairwise_correlations(df)

    constant_cols: list[str] = []
    suspicious_cols: list[str] = []
    columns: list[ColumnProfile] = []

    # 3. Column-by-column profiling
    for col in df.columns:
        series = df[col]
        col_name = str(col)[:160]
        data_type = infer_column_type(series)
        null_count = int(series.isna().sum())
        null_ratio = clean_float(null_count / total_rows) if total_rows > 0 else 0.0
        unique_count = int(series.nunique())
        cardinality_ratio = clean_float(unique_count / total_rows) if total_rows > 0 else 0.0
        is_constant = bool(unique_count <= 1 and total_rows > 0)

        if is_constant:
            constant_cols.append(col_name)

        # PII detection
        is_pii, pii_types = detect_column_pii(col_name, series)

        # Numerical & Distribution & Outlier statistics
        num_stats, outlier_stats, dist_stats = compute_numerical_statistics(series)

        # Categorical statistics
        cat_stats = None
        if not pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series) or unique_count <= 20:
            cat_stats = compute_categorical_statistics(series, is_pii, total_rows, allow_category_values=allow_category_values)

        # Suspicious feature detection
        is_suspicious, suspicious_reasons = detect_suspicious_features(
            col_name=col_name,
            data_type=data_type,
            total_rows=total_rows,
            null_ratio=null_ratio or 0.0,
            unique_count=unique_count,
            cardinality_ratio=cardinality_ratio or 0.0,
            is_pii=is_pii,
            num_stats=num_stats,
            cat_stats=cat_stats,
        )

        if is_suspicious:
            suspicious_cols.append(col_name)

        col_issues = column_issues_map.get(col, [])

        columns.append(
            ColumnProfile(
                name=col_name,
                data_type=data_type,
                null_count=null_count,
                null_ratio=null_ratio or 0.0,
                unique_count=unique_count,
                cardinality_ratio=cardinality_ratio or 0.0,
                is_constant=is_constant,
                is_suspicious=is_suspicious,
                suspicious_reasons=suspicious_reasons,
                is_pii=is_pii,
                pii_types=pii_types,
                numeric_stats=num_stats,
                categorical_stats=cat_stats,
                distribution=dist_stats,
                outliers=outlier_stats,
                quality_issues=col_issues,
            )
        )

    return PermittedProfilePayload(
        schema_version="1.0.0",
        dataset_ref=dataset_ref,
        format=dataset_format,
        total_rows=total_rows,
        total_columns=total_cols,
        duplicate_rows_count=duplicate_rows,
        duplicate_rows_ratio=dup_ratio or 0.0,
        file_size_bytes=file_size_bytes,
        constant_columns=constant_cols,
        suspicious_columns=suspicious_cols,
        correlations=correlations,
        columns=columns,
        quality_findings=findings,
        profiled_at=datetime.now(UTC).isoformat(),
    )


def profile_dataset_file(
    file_path: Path,
    dataset_ref: str,
    dataset_format: Literal["csv", "parquet", "excel"],
    max_size_bytes: int = 500 * 1024 * 1024,
    allow_category_values: bool = False,
) -> PermittedProfilePayload:
    """Load local file, profile in memory, and generate permitted summary."""
    df = load_dataset(file_path, dataset_format, max_size_bytes)
    file_size = file_path.stat().st_size
    return profile_dataframe(df, dataset_ref, dataset_format, file_size, allow_category_values=allow_category_values)
