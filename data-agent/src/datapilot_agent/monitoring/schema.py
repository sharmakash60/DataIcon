"""Schemas for Model Monitoring, Drift Detection, and Performance Tracking.

PRIVACY CONTRACT:
- Internal records (containing input features and raw predictions) are kept strictly within local memory / local client storage.
- AggregateMonitoringSnapshot contains ONLY aggregated statistics, latency percentiles, error rates, drift scores, and performance metrics.
- Zero raw dataset rows, zero raw inference calls, and zero raw ground truth rows leave the client environment.
"""

from __future__ import annotations

import datetime
from typing import Any, Dict, List, Literal, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class InternalPredictionRecord(BaseModel):
    """Local, in-memory record of an individual inference invocation.
    
    NEVER exported to the cloud. Kept strictly on the client.
    """
    model_config = ConfigDict(extra="allow")

    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = Field(default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).timestamp())
    features: Dict[str, Any]
    prediction: Any
    probabilities: Optional[Dict[str, float]] = None
    latency_ms: float
    is_error: bool = False
    error_type: Optional[str] = None
    ground_truth: Optional[Any] = None


class FeatureFieldSchema(BaseModel):
    name: str
    dtype: str = "numeric"  # numeric | categorical | datetime
    nullable: bool = True
    example: Optional[Any] = None


class LatencySummary(BaseModel):
    mean_ms: float
    min_ms: float
    max_ms: float
    p50_ms: float
    p90_ms: float
    p95_ms: float
    p99_ms: float


class PredictionDistribution(BaseModel):
    total_predictions: int
    class_counts: Optional[Dict[str, int]] = None
    class_proportions: Optional[Dict[str, float]] = None
    quantiles: Optional[Dict[str, float]] = None  # e.g., p10, p25, p50, p75, p90 for regression
    mean: Optional[float] = None
    std: Optional[float] = None


class FeatureDriftResult(BaseModel):
    feature_name: str
    dtype: Literal["numeric", "categorical"]
    method: Literal["ks_test", "psi", "chi_square"]
    statistic: float
    p_value: Optional[float] = None
    drift_detected: bool
    severity: Literal["none", "warning", "critical"]
    baseline_stats: Dict[str, Any] = Field(default_factory=dict)
    current_stats: Dict[str, Any] = Field(default_factory=dict)


class DataDriftSummary(BaseModel):
    drifted_features_count: int
    total_features_count: int
    drift_share: float
    dataset_drift_detected: bool
    method: str = "aggregate_share"


class PerformanceMetrics(BaseModel):
    sample_count: int
    metrics: Dict[str, float]
    evaluated_at: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )


class MonitoringAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    alert_type: Literal["feature_drift", "data_drift", "performance_drop", "latency_spike", "error_spike"]
    severity: Literal["info", "warning", "critical"]
    message: str
    feature_name: Optional[str] = None
    metric_name: str
    threshold: float
    current_value: float
    timestamp: str = Field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )


class AggregateMonitoringSnapshot(BaseModel):
    """Authoritative aggregate metrics payload permitted for cloud export.
    
    Contains strictly summary indicators:
    - Prediction distribution
    - Feature & data drift scores
    - Latency percentiles
    - Throughput
    - Error rate
    - Ground truth performance metrics (when available)
    - Active alerts
    """
    model_config = ConfigDict(extra="forbid")

    deployment_id: Optional[str] = None
    model_name: str
    model_version: str
    period_start: str
    period_end: str
    window_seconds: float
    total_requests: int
    throughput_rps: float
    error_count: int
    error_rate: float
    latency: LatencySummary
    prediction_distribution: PredictionDistribution
    feature_drifts: List[FeatureDriftResult]
    data_drift: DataDriftSummary
    performance: Optional[PerformanceMetrics] = None
    alerts: List[MonitoringAlert] = Field(default_factory=list)


class GroundTruthSubmission(BaseModel):
    """Payload for submitting ground truth labels locally."""
    request_id: str
    actual: Any
