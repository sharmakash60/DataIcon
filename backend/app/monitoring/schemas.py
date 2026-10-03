"""Pydantic schemas for Model Monitoring telemetry and alerts in Control Plane."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class LatencySummaryIn(BaseModel):
    mean_ms: float
    min_ms: float
    max_ms: float
    p50_ms: float
    p90_ms: float
    p95_ms: float
    p99_ms: float


class PredictionDistributionIn(BaseModel):
    total_predictions: int
    class_counts: Optional[Dict[str, int]] = None
    class_proportions: Optional[Dict[str, float]] = None
    quantiles: Optional[Dict[str, float]] = None
    mean: Optional[float] = None
    std: Optional[float] = None


class FeatureDriftIn(BaseModel):
    feature_name: str
    dtype: str
    method: str
    statistic: float
    p_value: Optional[float] = None
    drift_detected: bool
    severity: str
    baseline_stats: Dict[str, Any] = Field(default_factory=dict)
    current_stats: Dict[str, Any] = Field(default_factory=dict)


class DataDriftIn(BaseModel):
    drifted_features_count: int
    total_features_count: int
    drift_share: float
    dataset_drift_detected: bool
    method: str = "aggregate_share"


class PerformanceIn(BaseModel):
    sample_count: int
    metrics: Dict[str, float]
    evaluated_at: str


class MonitoringAlertIn(BaseModel):
    alert_type: Literal["feature_drift", "data_drift", "performance_drop", "latency_spike", "error_spike"]
    severity: Literal["info", "warning", "critical"]
    message: str
    feature_name: Optional[str] = None
    metric_name: str
    threshold: float
    current_value: float
    timestamp: str


class IngestMonitoringSnapshotRequest(BaseModel):
    """Aggregate snapshot ingested from Client Data Plane.
    
    Guaranteed to contain zero raw records.
    """
    model_config = ConfigDict(extra="forbid")

    period_start: datetime
    period_end: datetime
    window_seconds: float
    total_requests: int
    throughput_rps: float
    error_count: int
    error_rate: float
    latency: LatencySummaryIn
    prediction_distribution: PredictionDistributionIn
    feature_drifts: List[FeatureDriftIn]
    data_drift: DataDriftIn
    performance: Optional[PerformanceIn] = None
    alerts: List[MonitoringAlertIn] = Field(default_factory=list)
    deployment_id: Optional[uuid.UUID] = None
    model_name: Optional[str] = None
    model_version: Optional[str] = None
    snapshot_id: Optional[str] = None


class MonitoringSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    deployment_id: uuid.UUID
    period_start: datetime
    period_end: datetime
    total_requests: int
    throughput_rps: float
    error_count: int
    error_rate: float
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float
    data_drift_score: float
    data_drift_detected: bool
    metrics: Dict[str, float]
    prediction_distribution: Dict[str, Any]
    feature_drifts: List[Dict[str, Any]]
    created_at: datetime


class MonitoringAlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    deployment_id: uuid.UUID
    snapshot_id: Optional[uuid.UUID] = None
    alert_type: str
    severity: str
    message: str
    feature_name: Optional[str] = None
    metric_name: str
    threshold: float
    current_value: float
    is_resolved: bool
    resolved_at: Optional[datetime] = None
    resolved_by_user_id: Optional[uuid.UUID] = None
    created_at: datetime


class ResolveAlertRequest(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=1000)


class MonitoringSnapshotListResponse(BaseModel):
    items: List[MonitoringSnapshotOut]
    total: int


class MonitoringAlertListResponse(BaseModel):
    items: List[MonitoringAlertOut]
    total: int

