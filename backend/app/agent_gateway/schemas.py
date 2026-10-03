import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class AgentEnrollRequest(BaseModel):
    enrollment_token: str = Field(min_length=1)
    approved_name: str = Field(min_length=1, max_length=160)
    runtime_version: str = Field(min_length=1, max_length=64)
    capabilities: list[str] = Field(default_factory=list)


class AgentEnrollResponse(BaseModel):
    agent_id: uuid.UUID
    agent_token: str
    organization_id: uuid.UUID


class HeartbeatResponse(BaseModel):
    status: str
    server_time: datetime


class DatasetRegistrationRequest(BaseModel):
    project_id: uuid.UUID
    opaque_local_ref: str = Field(min_length=1, max_length=128)
    approved_alias: str = Field(min_length=1, max_length=160)
    format: str = Field(pattern="^(csv|parquet|excel)$")


class DatasetRegistrationResponse(BaseModel):
    dataset_id: uuid.UUID
    status: str


class AgentProjectOut(BaseModel):
    id: uuid.UUID
    name: str


class ClaimJobResponse(BaseModel):
    job_id: uuid.UUID
    operation: str
    payload: dict
    lease_token: str


# =========================================================================
# Versioned Permitted Export Schemas for Dataset Profiling
# Version: 1.0.0
# Enforces strict "extra: forbid" - zero raw records or cell data permitted.
# =========================================================================

class NumericStats(BaseModel):
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
    category: str = Field(max_length=160)
    count: int = Field(ge=0)
    ratio: float = Field(ge=0.0, le=1.0)

    model_config = {"extra": "forbid"}


class CategoricalStats(BaseModel):
    top_categories_count: int = Field(ge=0)
    mode: str | None = None
    mode_frequency: int | None = None
    mode_ratio: float | None = None
    distinct_categories_count: int = Field(ge=0)
    top_frequencies: list[CategoryFrequency] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


class DistributionStats(BaseModel):
    type: str = Field(max_length=32)
    bin_edges: list[float] | None = None
    bin_counts: list[int] | None = None

    model_config = {"extra": "forbid"}


class OutlierStats(BaseModel):
    method: str = Field(default="iqr", max_length=32)
    outlier_count: int = Field(ge=0)
    outlier_ratio: float = Field(ge=0.0, le=1.0)
    lower_bound: float | None = None
    upper_bound: float | None = None

    model_config = {"extra": "forbid"}


class ColumnProfile(BaseModel):
    name: str = Field(max_length=160)
    data_type: str = Field(max_length=32)
    null_count: int = Field(ge=0)
    null_ratio: float = Field(ge=0.0, le=1.0)
    unique_count: int = Field(ge=0)
    cardinality_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    is_constant: bool = False
    is_suspicious: bool = False
    suspicious_reasons: list[str] = Field(default_factory=list)
    is_pii: bool = False
    pii_types: list[str] = Field(default_factory=list)
    numeric_stats: NumericStats | None = None
    categorical_stats: CategoricalStats | None = None
    distribution: DistributionStats | None = None
    outliers: OutlierStats | None = None
    quality_issues: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}


# Backward compatibility alias
ColumnSummary = ColumnProfile


class CorrelationEntry(BaseModel):
    column_a: str = Field(max_length=160)
    column_b: str = Field(max_length=160)
    pearson_coefficient: float = Field(ge=-1.0, le=1.0)

    model_config = {"extra": "forbid"}


class QualityFindingSummary(BaseModel):
    code: str
    severity: str
    message: str
    column: str | None = None
    affected_ratio: float | None = None

    model_config = {"extra": "forbid"}


class PermittedProfilePayload(BaseModel):
    schema_version: str = Field(default="1.0.0", max_length=32)
    dataset_ref: str
    format: str
    total_rows: int = Field(ge=0)
    total_columns: int = Field(ge=0)
    duplicate_rows_count: int = Field(ge=0)
    duplicate_rows_ratio: float = Field(default=0.0, ge=0.0, le=1.0)
    file_size_bytes: int = Field(ge=0)
    constant_columns: list[str] = Field(default_factory=list)
    suspicious_columns: list[str] = Field(default_factory=list)
    correlations: list[CorrelationEntry] = Field(default_factory=list)
    columns: list[ColumnProfile]
    quality_findings: list[QualityFindingSummary] = Field(default_factory=list)
    profiled_at: str

    model_config = {"extra": "forbid"}


class SubmitJobResultRequest(BaseModel):
    lease_token: str
    profile: PermittedProfilePayload

    model_config = {"extra": "forbid"}


class SubmitJobResultResponse(BaseModel):
    status: str
    summary_id: uuid.UUID
