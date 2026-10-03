"""Contracts and Schemas for DataPilot Client Data Agent.

STRICT PRIVACY GUARANTEE:
All export schemas enforce `extra = "forbid"` and explicit field allowlists.
No raw rows, records, cell values, or sample data can ever be represented
or exported by these contracts.

Schema Version: 1.0.0
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class NumericStats(BaseModel):
    """Bounded aggregate statistics for a numeric column."""
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    std: float | None = None
    median: float | None = None
    q25: float | None = None
    q75: float | None = None
    iqr: float | None = None
    skewness: float | None = None
    kurtosis: float | None = None

    model_config = {"extra": "forbid"}


class CategoryFrequency(BaseModel):
    """Aggregate frequency for a categorical value.
    
    If the column is flagged as PII or confidential, category labels are sanitized/redacted.
    """
    category: str = Field(max_length=160)
    count: int = Field(ge=0)
    ratio: float = Field(ge=0.0, le=1.0)

    model_config = {"extra": "forbid"}


class CategoricalStats(BaseModel):
    """Summary statistics for categorical or text features."""
    top_categories_count: int = Field(ge=0)
    mode: str | None = None
    mode_frequency: int | None = None
    mode_ratio: float | None = None
    distinct_categories_count: int = Field(ge=0)
    top_frequencies: list[CategoryFrequency] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class DistributionStats(BaseModel):
    """Binned distribution summary (histogram).
    
    Contains strictly bin partition edges and bucket counts. Never individual rows.
    """
    type: str = Field(max_length=32, description="e.g. histogram, categorical_frequency")
    bin_edges: list[float] | None = None
    bin_counts: list[int] | None = None

    model_config = {"extra": "forbid"}


class OutlierStats(BaseModel):
    """Statistical outlier summary based on Tukey's IQR rule."""
    method: str = Field(default="iqr", max_length=32)
    outlier_count: int = Field(ge=0)
    outlier_ratio: float = Field(ge=0.0, le=1.0)
    lower_bound: float | None = None
    upper_bound: float | None = None

    model_config = {"extra": "forbid"}


class ColumnProfile(BaseModel):
    """Permitted summary metrics for an individual column.
    
    Contains strictly structural metadata, aggregate statistics, and classifications.
    Never contains raw cell contents, sample rows, or row-level records.
    """
    name: str = Field(max_length=160, description="Column name/header")
    data_type: str = Field(max_length=32, description="Inferred technical data type")
    null_count: int = Field(ge=0, description="Count of missing/null values")
    null_ratio: float = Field(ge=0.0, le=1.0, description="Ratio of null values (0.0 to 1.0)")
    unique_count: int = Field(ge=0, description="Count of distinct values")
    cardinality_ratio: float = Field(default=0.0, ge=0.0, le=1.0, description="unique_count / total_rows")
    is_constant: bool = Field(default=False, description="True if column has only 1 distinct value")
    is_suspicious: bool = Field(default=False, description="True if flagged by anomaly heuristics")
    suspicious_reasons: list[str] = Field(default_factory=list, description="Explanations if flagged suspicious")
    is_pii: bool = Field(description="Flag indicating if column contains PII patterns")
    pii_types: list[str] = Field(default_factory=list, description="Categories of PII detected (e.g. EMAIL, PHONE)")
    numeric_stats: NumericStats | None = Field(default=None, description="Descriptive numeric statistics")
    categorical_stats: CategoricalStats | None = Field(default=None, description="Categorical distributions")
    distribution: DistributionStats | None = Field(default=None, description="Binned histogram")
    outliers: OutlierStats | None = Field(default=None, description="Outlier metrics")
    quality_issues: list[str] = Field(default_factory=list, description="Rule violation tags")

    model_config = {"extra": "forbid"}


# Backward compatibility alias
ColumnSummary = ColumnProfile


class CorrelationEntry(BaseModel):
    """Pairwise numerical correlation coefficient."""
    column_a: str = Field(max_length=160)
    column_b: str = Field(max_length=160)
    pearson_coefficient: float = Field(ge=-1.0, le=1.0)

    model_config = {"extra": "forbid"}


class QualityFindingSummary(BaseModel):
    """Permitted dataset-level quality finding summary."""
    code: str = Field(description="Finding rule code, e.g. DUPLICATE_ROWS, HIGH_MISSINGNESS")
    severity: Literal["low", "medium", "high", "critical"] = Field(description="Severity classification")
    message: str = Field(description="Human-readable explanation of the finding")
    column: str | None = Field(default=None, description="Associated column name if column-specific")
    affected_ratio: float | None = Field(default=None, ge=0.0, le=1.0, description="Ratio of dataset affected")

    model_config = {"extra": "forbid"}


class PermittedProfilePayload(BaseModel):
    """Permitted versioned dataset profile export payload.
    
    This is the ONLY data artifact permitted to leave the client environment
    and be sent to the DataPilot cloud control plane.
    """
    schema_version: str = Field(default="1.0.0", max_length=32, description="Version tag for export schema")
    dataset_ref: str = Field(description="Opaque local reference key for the dataset")
    format: Literal["csv", "parquet", "excel"] = Field(description="Dataset file format")
    total_rows: int = Field(ge=0, description="Total count of rows")
    total_columns: int = Field(ge=0, description="Total count of columns")
    duplicate_rows_count: int = Field(ge=0, description="Count of exact duplicate rows")
    duplicate_rows_ratio: float = Field(default=0.0, ge=0.0, le=1.0, description="Ratio of duplicate rows")
    file_size_bytes: int = Field(ge=0, description="Local file size in bytes")
    constant_columns: list[str] = Field(default_factory=list, description="List of columns with zero variance")
    suspicious_columns: list[str] = Field(default_factory=list, description="List of columns flagged as suspicious")
    correlations: list[CorrelationEntry] = Field(default_factory=list, description="Pairwise feature correlations")
    columns: list[ColumnProfile] = Field(description="Per-column permitted statistical summaries")
    quality_findings: list[QualityFindingSummary] = Field(default_factory=list, description="Dataset-level quality findings")
    profiled_at: str = Field(description="ISO-8601 profiling completion timestamp")

    model_config = {"extra": "forbid"}


class SubmitJobResultRequest(BaseModel):
    """Control plane job submission payload envelope."""
    lease_token: str
    profile: PermittedProfilePayload

    model_config = {"extra": "forbid"}


class DiscoveredDataset(BaseModel):
    """Local representation of a discovered dataset file on disk."""
    local_path: Path
    opaque_local_ref: str
    approved_alias: str
    format: Literal["csv", "parquet", "excel"]
    file_size_bytes: int
    project_folder: str | None = None

    model_config = {"arbitrary_types_allowed": True}


class AgentConfig(BaseModel):
    """Client Data Agent local runtime configuration."""
    cloud_api_url: str = "http://127.0.0.1:8000"
    agent_name: str = "local-data-agent"
    runtime_version: str = "0.2.0"
    data_dir: Path
    enrollment_token: str | None = None
    agent_id: UUID | None = None
    agent_token: str | None = None
    organization_id: UUID | None = None
    project_id: UUID | None = None
    heartbeat_interval_seconds: int = 30
    poll_interval_seconds: int = 5
    max_file_size_bytes: int = 500 * 1024 * 1024
    allow_category_values: bool = False

    model_config = {"arbitrary_types_allowed": True}


class JobClaim(BaseModel):
    """Claimed job from the cloud control plane."""
    job_id: UUID
    operation: str
    payload: dict[str, Any]
    lease_token: str
