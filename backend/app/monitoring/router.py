"""Model Monitoring REST Router for Control Plane.

Receives aggregate telemetry snapshots and alerts from Client Data Plane.

STRICT PRIVACY POLICY:
Zero raw prediction input records, zero model prediction arrays, and zero raw ground truth
values are ever received or stored by the Control Plane. Only aggregate statistical distributions,
drift scores, latency metrics, error rates, and alert declarations are ingested.
"""

from __future__ import annotations

import datetime
import json
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select, func
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.auth.dependencies import (
    ProjectContext,
    TenantContext,
    require_permission,
    require_project_permission,
)
from app.auth.permissions import Permissions
from app.db import get_db
from app.models import ModelDeployment, MonitoringAlertRecord, MonitoringSnapshot
from app.monitoring.schemas import (
    IngestMonitoringSnapshotRequest,
    MonitoringAlertListResponse,
    MonitoringAlertOut,
    MonitoringSnapshotListResponse,
    MonitoringSnapshotOut,
    ResolveAlertRequest,
)

router = APIRouter(
    prefix="/api/v1/organizations/{organization_id}/projects/{project_id}/deployments/{deployment_id}/monitoring",
    tags=["model-monitoring"],
)


def _serialize_snapshot(snap: MonitoringSnapshot) -> MonitoringSnapshotOut:
    try:
        metrics = json.loads(snap.metrics_json) if snap.metrics_json else {}
    except Exception:
        metrics = {}

    try:
        pred_dist = (
            json.loads(snap.prediction_distribution_json)
            if snap.prediction_distribution_json
            else {}
        )
    except Exception:
        pred_dist = {}

    try:
        drifts = json.loads(snap.feature_drift_json) if snap.feature_drift_json else []
    except Exception:
        drifts = []

    return MonitoringSnapshotOut(
        id=snap.id,
        organization_id=snap.organization_id,
        project_id=snap.project_id,
        deployment_id=snap.deployment_id,
        period_start=snap.period_start,
        period_end=snap.period_end,
        total_requests=snap.total_requests,
        throughput_rps=snap.throughput_rps,
        error_count=snap.error_count,
        error_rate=snap.error_rate,
        latency_p50_ms=snap.latency_p50_ms,
        latency_p95_ms=snap.latency_p95_ms,
        latency_p99_ms=snap.latency_p99_ms,
        data_drift_score=snap.data_drift_score,
        data_drift_detected=snap.data_drift_detected,
        metrics=metrics,
        prediction_distribution=pred_dist,
        feature_drifts=drifts,
        created_at=snap.created_at,
    )


def _serialize_alert(alert: MonitoringAlertRecord) -> MonitoringAlertOut:
    return MonitoringAlertOut(
        id=alert.id,
        organization_id=alert.organization_id,
        project_id=alert.project_id,
        deployment_id=alert.deployment_id,
        snapshot_id=alert.snapshot_id,
        alert_type=alert.alert_type,
        severity=alert.severity,
        message=alert.message,
        feature_name=alert.feature_name,
        metric_name=alert.metric_name,
        threshold=alert.threshold,
        current_value=alert.current_value,
        is_resolved=alert.is_resolved,
        resolved_at=alert.resolved_at,
        resolved_by_user_id=alert.resolved_by_user_id,
        created_at=alert.created_at,
    )


def _get_verified_deployment(
    deployment_id: uuid.UUID,
    project_id: uuid.UUID,
    tenant: TenantContext,
    db: Session,
) -> ModelDeployment:
    dep = db.scalar(
        select(ModelDeployment).where(
            ModelDeployment.id == deployment_id,
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
    )
    if not dep:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found.",
        )
    return dep


@router.post(
    "/metrics",
    response_model=MonitoringSnapshotOut,
    status_code=status.HTTP_201_CREATED,
)
def ingest_monitoring_snapshot(
    deployment_id: uuid.UUID,
    project_id: uuid.UUID,
    payload: IngestMonitoringSnapshotRequest,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.MONITORING_CONFIGURE)),
    db: Session = Depends(get_db),
) -> MonitoringSnapshotOut:
    """Ingest aggregate telemetry metrics from Client Data Plane.

    Strictly verified: Extra unknown keys are forbidden.
    No raw prediction rows or input payloads are accepted.
    """
    tenant = project_context.tenant
    dep = _get_verified_deployment(deployment_id, project_id, tenant, db)

    # Serialize nested aggregate objects to JSON
    metrics_data = payload.performance.metrics if payload.performance else {}
    metrics_json = json.dumps(metrics_data)
    pred_dist_json = json.dumps(payload.prediction_distribution.model_dump())
    feature_drifts_json = json.dumps([fd.model_dump() for fd in payload.feature_drifts])

    snapshot = MonitoringSnapshot(
        organization_id=tenant.organization_id,
        project_id=dep.project_id,
        deployment_id=dep.id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        total_requests=payload.total_requests,
        throughput_rps=payload.throughput_rps,
        error_count=payload.error_count,
        error_rate=payload.error_rate,
        latency_p50_ms=payload.latency.p50_ms,
        latency_p95_ms=payload.latency.p95_ms,
        latency_p99_ms=payload.latency.p99_ms,
        data_drift_score=payload.data_drift.drift_share,
        data_drift_detected=payload.data_drift.dataset_drift_detected,
        metrics_json=metrics_json,
        prediction_distribution_json=pred_dist_json,
        feature_drift_json=feature_drifts_json,
    )
    db.add(snapshot)
    db.flush()

    # Create alerts if present in snapshot
    created_alert_ids = []
    for alert_in in payload.alerts:
        alert_record = MonitoringAlertRecord(
            organization_id=tenant.organization_id,
            project_id=dep.project_id,
            deployment_id=dep.id,
            snapshot_id=snapshot.id,
            alert_type=alert_in.alert_type,
            severity=alert_in.severity,
            message=alert_in.message,
            feature_name=alert_in.feature_name,
            metric_name=alert_in.metric_name,
            threshold=alert_in.threshold,
            current_value=alert_in.current_value,
            is_resolved=False,
        )
        db.add(alert_record)
        created_alert_ids.append(alert_record)

    db.commit()
    db.refresh(snapshot)

    record_audit_event(
        db,
        action="monitoring:snapshot_ingested",
        resource_type="monitoring_snapshot",
        resource_id=str(snapshot.id),
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        details={
            "deployment_id": str(dep.id),
            "total_requests": snapshot.total_requests,
            "data_drift_detected": snapshot.data_drift_detected,
            "alerts_count": len(payload.alerts),
            "period_end": payload.period_end.isoformat(),
        },
    )
    db.commit()

    return _serialize_snapshot(snapshot)


@router.get(
    "/metrics",
    response_model=MonitoringSnapshotListResponse,
)
def list_monitoring_snapshots(
    deployment_id: uuid.UUID,
    project_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    project_context: ProjectContext = Depends(require_project_permission(Permissions.MONITORING_VIEW)),
    db: Session = Depends(get_db),
) -> MonitoringSnapshotListResponse:
    """List historical aggregate monitoring snapshots for a deployment."""
    tenant = project_context.tenant
    dep = _get_verified_deployment(deployment_id, project_id, tenant, db)

    total = db.scalar(
        select(func.count(MonitoringSnapshot.id)).where(
            MonitoringSnapshot.deployment_id == dep.id,
            MonitoringSnapshot.organization_id == tenant.organization_id,
        )
    ) or 0

    query = (
        select(MonitoringSnapshot)
        .where(
            MonitoringSnapshot.deployment_id == dep.id,
            MonitoringSnapshot.organization_id == tenant.organization_id,
        )
        .order_by(desc(MonitoringSnapshot.created_at))
        .offset(offset)
        .limit(limit)
    )
    results = db.scalars(query).all()

    return MonitoringSnapshotListResponse(
        items=[_serialize_snapshot(s) for s in results],
        total=total,
    )


@router.get(
    "/alerts",
    response_model=MonitoringAlertListResponse,
)
def list_monitoring_alerts(
    deployment_id: uuid.UUID,
    project_id: uuid.UUID,
    unresolved_only: bool = Query(False),
    severity: Optional[str] = Query(None),
    alert_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    project_context: ProjectContext = Depends(require_project_permission(Permissions.MONITORING_VIEW)),
    db: Session = Depends(get_db),
) -> MonitoringAlertListResponse:
    """List monitoring alerts for a deployment."""
    tenant = project_context.tenant
    dep = _get_verified_deployment(deployment_id, project_id, tenant, db)

    conditions = [
        MonitoringAlertRecord.deployment_id == dep.id,
        MonitoringAlertRecord.organization_id == tenant.organization_id,
    ]
    if unresolved_only:
        conditions.append(MonitoringAlertRecord.is_resolved.is_(False))
    if severity:
        conditions.append(MonitoringAlertRecord.severity == severity)
    if alert_type:
        conditions.append(MonitoringAlertRecord.alert_type == alert_type)

    total = db.scalar(
        select(func.count(MonitoringAlertRecord.id)).where(*conditions)
    ) or 0

    query = (
        select(MonitoringAlertRecord)
        .where(*conditions)
        .order_by(desc(MonitoringAlertRecord.created_at))
        .offset(offset)
        .limit(limit)
    )
    results = db.scalars(query).all()

    return MonitoringAlertListResponse(
        items=[_serialize_alert(a) for a in results],
        total=total,
    )


@router.post(
    "/alerts/{alert_id}/resolve",
    response_model=MonitoringAlertOut,
)
def resolve_monitoring_alert(
    deployment_id: uuid.UUID,
    project_id: uuid.UUID,
    alert_id: uuid.UUID,
    payload: ResolveAlertRequest,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.MONITORING_CONFIGURE)),
    db: Session = Depends(get_db),
) -> MonitoringAlertOut:
    """Acknowledge and resolve an active monitoring alert."""
    tenant = project_context.tenant
    dep = _get_verified_deployment(deployment_id, project_id, tenant, db)

    alert = db.scalar(
        select(MonitoringAlertRecord).where(
            MonitoringAlertRecord.id == alert_id,
            MonitoringAlertRecord.deployment_id == dep.id,
            MonitoringAlertRecord.organization_id == tenant.organization_id,
        )
    )
    if not alert:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found.",
        )

    alert.is_resolved = True
    alert.resolved_at = datetime.datetime.now(datetime.timezone.utc)
    alert.resolved_by_user_id = tenant.user.id

    db.commit()
    db.refresh(alert)

    record_audit_event(
        db,
        action="monitoring:alert_resolved",
        resource_type="monitoring_alert",
        resource_id=str(alert.id),
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        details={
            "alert_id": str(alert.id),
            "alert_type": alert.alert_type,
            "deployment_id": str(dep.id),
            "notes": payload.notes,
        },
    )
    db.commit()

    return _serialize_alert(alert)
