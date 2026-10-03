"""Model Deployments REST Router for Control Plane.

Tracks deployment declarations, approval workflows, and client endpoint configuration.

STRICT PRIVACY POLICY:
The cloud control plane NEVER proxies or receives raw prediction inputs/outputs.
Live inference is executed strictly inside the customer boundary by the Client Data Plane.
"""

from __future__ import annotations

import datetime
import json
from typing import Any, Dict, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
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
from app.deployments.schemas import (
    ApproveDeploymentRequest,
    CreateDeploymentRequest,
    DeploymentDetailOut,
    DeploymentListResponse,
    DeploymentSummaryOut,
    RollbackDeploymentRequest,
    StopDeploymentRequest,
)
from app.enums import AuditResult
from app.models import Experiment, ModelDeployment, Project

router = APIRouter(
    prefix="/api/v1/organizations/{organization_id}/projects/{project_id}",
    tags=["deployments"],
)


def _serialize_summary(dep: ModelDeployment) -> DeploymentSummaryOut:
    return DeploymentSummaryOut(
        id=dep.id,
        organization_id=dep.organization_id,
        project_id=dep.project_id,
        experiment_id=dep.experiment_id,
        name=dep.name,
        model_name=dep.model_name,
        model_version=dep.model_version,
        deployment_type=dep.deployment_type,
        endpoint_url=dep.endpoint_url,
        prediction_path=dep.prediction_path,
        status=dep.status,
        problem_type=dep.problem_type,
        target_name=dep.target_name,
        primary_metric=dep.primary_metric,
        created_at=dep.created_at,
        approved_at=dep.approved_at,
    )


def _serialize_detail(dep: ModelDeployment) -> DeploymentDetailOut:
    try:
        input_schema = json.loads(dep.input_schema_json) if dep.input_schema_json else []
    except Exception:
        input_schema = []

    return DeploymentDetailOut(
        id=dep.id,
        organization_id=dep.organization_id,
        project_id=dep.project_id,
        experiment_id=dep.experiment_id,
        name=dep.name,
        model_name=dep.model_name,
        model_version=dep.model_version,
        deployment_type=dep.deployment_type,
        endpoint_url=dep.endpoint_url,
        prediction_path=dep.prediction_path,
        status=dep.status,
        problem_type=dep.problem_type,
        target_name=dep.target_name,
        primary_metric=dep.primary_metric,
        input_schema=input_schema,
        notes=dep.notes,
        auth_configured=bool(dep.auth_token_hash),
        approved_by_user_id=dep.approved_by_user_id,
        created_by_user_id=dep.created_by_user_id,
        created_at=dep.created_at,
        updated_at=dep.updated_at,
        approved_at=dep.approved_at,
    )


@router.post(
    "/experiments/{experiment_id}/deployments",
    response_model=DeploymentDetailOut,
    status_code=status.HTTP_201_CREATED,
)
def create_deployment(
    project_id: uuid.UUID,
    experiment_id: uuid.UUID,
    payload: CreateDeploymentRequest,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DEPLOYMENT_CREATE)),
    db: Session = Depends(get_db),
) -> DeploymentDetailOut:
    """Create a new model deployment record for an experiment."""
    tenant = project_context.tenant
    # Verify experiment belongs to the authenticated organization and project
    exp = db.scalar(
        select(Experiment).where(
            Experiment.id == experiment_id,
            Experiment.project_id == project_id,
            Experiment.organization_id == tenant.organization_id,
        )
    )
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found.")

    if payload.auto_approve and Permissions.MODEL_APPROVE not in tenant.permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: MODEL_APPROVE required to auto-approve deployments",
        )

    # Derive input feature schema from experiment metadata
    feature_names = []
    if exp.feature_config_json:
        try:
            cfg = json.loads(exp.feature_config_json)
            feature_names = cfg.get("features", [])
        except Exception:
            feature_names = []

    schema_list = [{"name": f, "dtype": "numeric"} for f in feature_names]

    status_val = "active" if payload.auto_approve else "pending_approval"
    approved_by = tenant.user.id if payload.auto_approve else None
    approved_at = datetime.datetime.now(datetime.timezone.utc) if payload.auto_approve else None

    deployment = ModelDeployment(
        organization_id=tenant.organization_id,
        project_id=exp.project_id,
        experiment_id=exp.id,
        name=payload.name,
        model_name=exp.best_model_name or exp.model_name or "Trained Model",
        model_version="v1.0.0",
        deployment_type=payload.deployment_type,
        endpoint_url=payload.endpoint_url,
        prediction_path=payload.prediction_path,
        status=status_val,
        problem_type=exp.problem_type,
        target_name=exp.target_name,
        primary_metric=exp.primary_metric,
        input_schema_json=json.dumps(schema_list),
        notes=payload.notes,
        approved_by_user_id=approved_by,
        approved_at=approved_at,
        created_by_user_id=tenant.user.id,
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)

    record_audit_event(
        db,
        action="deployment:created",
        resource_type="model_deployment",
        resource_id=str(deployment.id),
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        details={
            "deployment_id": str(deployment.id),
            "experiment_id": str(exp.id),
            "deployment_type": deployment.deployment_type,
            "status": deployment.status,
            "endpoint_url": deployment.endpoint_url,
        },
    )
    db.commit()

    return _serialize_detail(deployment)


@router.get(
    "/experiments/{experiment_id}/deployments",
    response_model=DeploymentListResponse,
)
def list_experiment_deployments(
    project_id: uuid.UUID,
    experiment_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DEPLOYMENT_VIEW)),
    db: Session = Depends(get_db),
) -> DeploymentListResponse:
    """List all deployments configured for a specific experiment."""
    tenant = project_context.tenant
    query = (
        select(ModelDeployment)
        .where(
            ModelDeployment.experiment_id == experiment_id,
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
        .order_by(desc(ModelDeployment.created_at))
    )
    results = db.scalars(query).all()
    return DeploymentListResponse(
        items=[_serialize_summary(d) for d in results],
        total=len(results),
    )


@router.get(
    "/deployments",
    response_model=DeploymentListResponse,
)
def list_project_deployments(
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DEPLOYMENT_VIEW)),
    db: Session = Depends(get_db),
) -> DeploymentListResponse:
    """List all model deployments for this project."""
    tenant = project_context.tenant
    query = (
        select(ModelDeployment)
        .where(
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
        .order_by(desc(ModelDeployment.created_at))
    )
    results = db.scalars(query).all()
    return DeploymentListResponse(
        items=[_serialize_summary(d) for d in results],
        total=len(results),
    )


@router.get(
    "/deployments/{deployment_id}",
    response_model=DeploymentDetailOut,
)
def get_deployment_detail(
    project_id: uuid.UUID,
    deployment_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DEPLOYMENT_VIEW)),
    db: Session = Depends(get_db),
) -> DeploymentDetailOut:
    """Get full deployment detail including endpoint configuration and input schema."""
    tenant = project_context.tenant
    dep = db.scalar(
        select(ModelDeployment).where(
            ModelDeployment.id == deployment_id,
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
    )
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found.")

    return _serialize_detail(dep)


@router.post(
    "/deployments/{deployment_id}/approve",
    response_model=DeploymentDetailOut,
)
def approve_deployment(
    project_id: uuid.UUID,
    deployment_id: uuid.UUID,
    payload: ApproveDeploymentRequest,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.MODEL_APPROVE)),
    db: Session = Depends(get_db),
) -> DeploymentDetailOut:
    """Approve a pending deployment to transition it to active."""
    tenant = project_context.tenant
    dep = db.scalar(
        select(ModelDeployment).where(
            ModelDeployment.id == deployment_id,
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
    )
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found.")

    dep.status = "active"
    dep.approved_by_user_id = tenant.user.id
    dep.approved_at = datetime.datetime.now(datetime.timezone.utc)
    if payload.notes:
        dep.notes = f"{dep.notes}\n[Approval Notes]: {payload.notes}" if dep.notes else payload.notes

    db.commit()
    db.refresh(dep)

    record_audit_event(
        db,
        action="deployment:approved",
        resource_type="model_deployment",
        resource_id=str(dep.id),
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        details={"deployment_id": str(dep.id), "notes": payload.notes},
    )
    db.commit()

    return _serialize_detail(dep)


@router.post(
    "/deployments/{deployment_id}/rollback",
    response_model=DeploymentDetailOut,
)
def rollback_deployment(
    project_id: uuid.UUID,
    deployment_id: uuid.UUID,
    payload: RollbackDeploymentRequest,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DEPLOYMENT_UPDATE)),
    db: Session = Depends(get_db),
) -> DeploymentDetailOut:
    """Roll back an active deployment."""
    tenant = project_context.tenant
    dep = db.scalar(
        select(ModelDeployment).where(
            ModelDeployment.id == deployment_id,
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
    )
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found.")

    dep.status = "rolled_back"
    if payload.reason:
        dep.notes = f"{dep.notes}\n[Rollback Reason]: {payload.reason}" if dep.notes else payload.reason

    db.commit()
    db.refresh(dep)

    record_audit_event(
        db,
        action="deployment:rolled_back",
        resource_type="model_deployment",
        resource_id=str(dep.id),
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        details={"deployment_id": str(dep.id), "reason": payload.reason},
    )
    db.commit()

    return _serialize_detail(dep)


@router.post(
    "/deployments/{deployment_id}/stop",
    response_model=DeploymentDetailOut,
)
def stop_deployment(
    project_id: uuid.UUID,
    deployment_id: uuid.UUID,
    payload: StopDeploymentRequest,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DEPLOYMENT_DELETE)),
    db: Session = Depends(get_db),
) -> DeploymentDetailOut:
    """Decommission and stop a deployment."""
    tenant = project_context.tenant
    dep = db.scalar(
        select(ModelDeployment).where(
            ModelDeployment.id == deployment_id,
            ModelDeployment.project_id == project_id,
            ModelDeployment.organization_id == tenant.organization_id,
        )
    )
    if not dep:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Deployment not found.")

    dep.status = "stopped"
    if payload.reason:
        dep.notes = f"{dep.notes}\n[Decommission Reason]: {payload.reason}" if dep.notes else payload.reason

    db.commit()
    db.refresh(dep)

    record_audit_event(
        db,
        action="deployment:stopped",
        resource_type="model_deployment",
        resource_id=str(dep.id),
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        details={"deployment_id": str(dep.id), "reason": payload.reason},
    )
    db.commit()

    return _serialize_detail(dep)
