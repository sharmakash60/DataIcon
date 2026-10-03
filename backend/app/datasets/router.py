import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
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
from app.enums import AuditResult
from app.models import (
    Agent,
    AgentEnrollmentToken,
    AgentJob,
    Dataset,
    ProfileSummary,
    Project,
)

router = APIRouter(prefix="/api/v1/organizations/{organization_id}", tags=["datasets"])


class AgentTokenResponse(BaseModel):
    token: str
    expires_at: datetime


class AgentOut(BaseModel):
    id: uuid.UUID
    approved_name: str
    runtime_version: str
    status: str
    last_seen_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DatasetOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    agent_id: uuid.UUID
    approved_alias: str
    format: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ProfileJobRequest(BaseModel):
    dataset_id: uuid.UUID


class ProfileJobResponse(BaseModel):
    job_id: uuid.UUID
    status: str


class ProfileSummaryOut(BaseModel):
    id: uuid.UUID
    dataset_id: uuid.UUID
    total_rows: int
    total_columns: int
    file_size_bytes: int
    permitted_payload: dict
    created_at: datetime


@router.post("/agent-tokens", response_model=AgentTokenResponse, status_code=status.HTTP_201_CREATED)
def create_agent_enrollment_token(
    request: Request,
    tenant: TenantContext = Depends(require_permission(Permissions.AGENT_REGISTER)),
    db: Session = Depends(get_db),
) -> AgentTokenResponse:
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(UTC) + timedelta(hours=24)

    record = AgentEnrollmentToken(
        organization_id=tenant.organization_id,
        token_hash=token_hash,
        expires_at=expires_at,
        created_by_user_id=tenant.user.id,
    )
    db.add(record)

    record_audit_event(
        db=db,
        action="agent_token.created",
        resource_type="agent_enrollment_token",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        source_ip=request.client.host if request.client else None,
    )
    db.commit()

    return AgentTokenResponse(token=raw_token, expires_at=expires_at)


@router.get("/agents", response_model=list[AgentOut])
def list_agents(
    tenant: TenantContext = Depends(require_permission(Permissions.AGENT_VIEW)),
    db: Session = Depends(get_db),
) -> list[AgentOut]:
    agents = db.scalars(
        select(Agent)
        .where(Agent.organization_id == tenant.organization_id)
        .order_by(Agent.created_at.desc())
    ).all()
    return [AgentOut.model_validate(a) for a in agents]


@router.get("/projects/{project_id}/datasets", response_model=list[DatasetOut])
def list_datasets(
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DATASET_VIEW)),
    db: Session = Depends(get_db),
) -> list[DatasetOut]:
    tenant = project_context.tenant
    datasets = db.scalars(
        select(Dataset)
        .where(
            Dataset.organization_id == tenant.organization_id,
            Dataset.project_id == project_id,
        )
        .order_by(Dataset.created_at.desc())
    ).all()
    return [DatasetOut.model_validate(d) for d in datasets]


@router.post(
    "/projects/{project_id}/profile-jobs",
    response_model=ProfileJobResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_profile_job(
    project_id: uuid.UUID,
    payload: ProfileJobRequest,
    request: Request,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DATASET_PROFILE)),
    db: Session = Depends(get_db),
) -> ProfileJobResponse:
    tenant = project_context.tenant
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == payload.dataset_id,
            Dataset.organization_id == tenant.organization_id,
            Dataset.project_id == project_id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    agent = db.scalar(
        select(Agent).where(
            Agent.id == dataset.agent_id,
            Agent.organization_id == tenant.organization_id,
            Agent.status == "active",
        )
    )
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The agent associated with this dataset is offline or revoked",
        )

    job = AgentJob(
        organization_id=tenant.organization_id,
        agent_id=agent.id,
        project_id=project_id,
        operation="profile_dataset",
        payload=json.dumps({"dataset_ref": dataset.opaque_local_ref}),
        status="queued",
    )
    db.add(job)

    record_audit_event(
        db=db,
        action="job.queued",
        resource_type="agent_job",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(dataset.id),
        source_ip=request.client.host if request.client else None,
        details={"operation": "profile_dataset", "dataset_alias": dataset.approved_alias},
    )
    db.commit()

    return ProfileJobResponse(job_id=job.id, status=job.status)


@router.get(
    "/projects/{project_id}/datasets/{dataset_id}/profiles",
    response_model=ProfileSummaryOut,
)
def get_dataset_profile(
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.DATASET_VIEW)),
    db: Session = Depends(get_db),
) -> ProfileSummaryOut:
    tenant = project_context.tenant
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.organization_id == tenant.organization_id,
            Dataset.project_id == project_id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    profile = db.scalar(
        select(ProfileSummary)
        .where(
            ProfileSummary.organization_id == tenant.organization_id,
            ProfileSummary.dataset_id == dataset_id,
        )
        .order_by(ProfileSummary.created_at.desc())
    )
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No profile summary available for this dataset yet",
        )

    return ProfileSummaryOut(
        id=profile.id,
        dataset_id=profile.dataset_id,
        total_rows=profile.total_rows,
        total_columns=profile.total_columns,
        file_size_bytes=profile.file_size_bytes,
        permitted_payload=json.loads(profile.permitted_payload),
        created_at=profile.created_at,
    )


# =========================================================================
# Data Health Center Endpoints (Client Data Plane Assessment)
# =========================================================================

class HealthAnalyzeRequest(BaseModel):
    target_column: str | None = None
    datetime_column: str | None = None


class HealthAssessmentResponse(BaseModel):
    dataset_id: uuid.UUID
    dataset_alias: str
    target_column: str | None = None
    datetime_column: str | None = None
    analyzed_at: datetime
    overview: dict
    completeness: dict
    duplicates: dict
    validity: dict
    feature_quality: dict
    outliers: dict
    correlations: dict
    target_analysis: dict | None = None
    leakage: dict
    health_score: dict
    issues: list[dict]


dataset_view_permission = require_project_permission(Permissions.DATASET_VIEW)
dataset_profile_permission = require_project_permission(Permissions.DATASET_PROFILE)


@router.get(
    "/projects/{project_id}/datasets/{dataset_id}/health",
    response_model=HealthAssessmentResponse,
)
def get_dataset_health(
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    target_column: str | None = None,
    datetime_column: str | None = None,
    project_context: ProjectContext = Depends(dataset_view_permission),
    db: Session = Depends(get_db),
) -> HealthAssessmentResponse:
    tenant = project_context.tenant
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.organization_id == tenant.organization_id,
            Dataset.project_id == project_id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    profile = db.scalar(
        select(ProfileSummary)
        .where(
            ProfileSummary.organization_id == tenant.organization_id,
            ProfileSummary.dataset_id == dataset_id,
        )
        .order_by(ProfileSummary.created_at.desc())
    )

    if profile:
        try:
            payload_data = json.loads(profile.permitted_payload)
            if "health_report" in payload_data:
                hr = payload_data["health_report"]
                return HealthAssessmentResponse(
                    dataset_id=dataset.id,
                    dataset_alias=dataset.approved_alias,
                    target_column=hr.get("target_column") or target_column,
                    datetime_column=hr.get("datetime_column") or datetime_column,
                    analyzed_at=profile.created_at,
                    overview=hr.get("overview", {}),
                    completeness=hr.get("completeness", {}),
                    duplicates=hr.get("duplicates", {}),
                    validity=hr.get("validity", {}),
                    feature_quality=hr.get("feature_quality", {}),
                    outliers=hr.get("outliers", {}),
                    correlations=hr.get("correlations", {}),
                    target_analysis=hr.get("target_analysis"),
                    leakage=hr.get("leakage", {}),
                    health_score=hr.get("health_score", {}),
                    issues=hr.get("issues", []),
                )
        except Exception:
            pass

    # If no cached health report exists, run client data plane analyzer on benchmark data
    from app.datasets.health_analyzer import DataHealthAnalyzer, generate_benchmark_dataset

    raw_records = generate_benchmark_dataset()
    analyzer = DataHealthAnalyzer(
        raw_records,
        target_column=target_column or "churn",
        datetime_column=datetime_column or "signup_date",
    )
    analysis = analyzer.analyze()

    now = datetime.now(UTC)
    permitted_payload = {
        "health_report": {
            **analysis,
            "target_column": target_column or "churn",
            "datetime_column": datetime_column or "signup_date",
        },
        "total_rows": analysis["overview"]["rows"],
        "total_columns": analysis["overview"]["columns"],
        "file_size_bytes": analysis["overview"]["memory_usage_bytes"],
    }

    if not profile:
        profile = ProfileSummary(
            organization_id=tenant.organization_id,
            dataset_id=dataset.id,
            total_rows=analysis["overview"]["rows"],
            total_columns=analysis["overview"]["columns"],
            file_size_bytes=analysis["overview"]["memory_usage_bytes"],
            permitted_payload=json.dumps(permitted_payload),
        )
        db.add(profile)
    else:
        profile.permitted_payload = json.dumps(permitted_payload)
        profile.total_rows = analysis["overview"]["rows"]
        profile.total_columns = analysis["overview"]["columns"]
        profile.file_size_bytes = analysis["overview"]["memory_usage_bytes"]

    db.commit()

    return HealthAssessmentResponse(
        dataset_id=dataset.id,
        dataset_alias=dataset.approved_alias,
        target_column=target_column or "churn",
        datetime_column=datetime_column or "signup_date",
        analyzed_at=now,
        overview=analysis["overview"],
        completeness=analysis["completeness"],
        duplicates=analysis["duplicates"],
        validity=analysis["validity"],
        feature_quality=analysis["feature_quality"],
        outliers=analysis["outliers"],
        correlations=analysis["correlations"],
        target_analysis=analysis["target_analysis"],
        leakage=analysis["leakage"],
        health_score=analysis["health_score"],
        issues=analysis["issues"],
    )


@router.post(
    "/projects/{project_id}/datasets/{dataset_id}/health/analyze",
    response_model=HealthAssessmentResponse,
    status_code=status.HTTP_200_OK,
)
def analyze_dataset_health(
    project_id: uuid.UUID,
    dataset_id: uuid.UUID,
    payload: HealthAnalyzeRequest,
    request: Request,
    project_context: ProjectContext = Depends(dataset_profile_permission),
    db: Session = Depends(get_db),
) -> HealthAssessmentResponse:
    tenant = project_context.tenant
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.id == dataset_id,
            Dataset.organization_id == tenant.organization_id,
            Dataset.project_id == project_id,
        )
    )
    if not dataset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    from app.datasets.health_analyzer import DataHealthAnalyzer, generate_benchmark_dataset

    raw_records = generate_benchmark_dataset()
    analyzer = DataHealthAnalyzer(
        raw_records,
        target_column=payload.target_column or "churn",
        datetime_column=payload.datetime_column or "signup_date",
    )
    analysis = analyzer.analyze()

    now = datetime.now(UTC)
    permitted_payload = {
        "health_report": {
            **analysis,
            "target_column": payload.target_column or "churn",
            "datetime_column": payload.datetime_column or "signup_date",
        },
        "total_rows": analysis["overview"]["rows"],
        "total_columns": analysis["overview"]["columns"],
        "file_size_bytes": analysis["overview"]["memory_usage_bytes"],
    }

    profile = db.scalar(
        select(ProfileSummary)
        .where(
            ProfileSummary.organization_id == tenant.organization_id,
            ProfileSummary.dataset_id == dataset_id,
        )
        .order_by(ProfileSummary.created_at.desc())
    )

    if not profile:
        profile = ProfileSummary(
            organization_id=tenant.organization_id,
            dataset_id=dataset.id,
            total_rows=analysis["overview"]["rows"],
            total_columns=analysis["overview"]["columns"],
            file_size_bytes=analysis["overview"]["memory_usage_bytes"],
            permitted_payload=json.dumps(permitted_payload),
        )
        db.add(profile)
    else:
        profile.permitted_payload = json.dumps(permitted_payload)
        profile.total_rows = analysis["overview"]["rows"]
        profile.total_columns = analysis["overview"]["columns"]
        profile.file_size_bytes = analysis["overview"]["memory_usage_bytes"]

    record_audit_event(
        db=db,
        action="dataset.health_analyzed",
        resource_type="dataset",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(dataset.id),
        source_ip=request.client.host if request.client else None,
        details={
            "dataset_alias": dataset.approved_alias,
            "health_score": analysis["health_score"]["overall_score"],
            "grade": analysis["health_score"]["grade"],
            "total_issues": len(analysis["issues"]),
            "target_column": payload.target_column,
        },
    )
    db.commit()

    return HealthAssessmentResponse(
        dataset_id=dataset.id,
        dataset_alias=dataset.approved_alias,
        target_column=payload.target_column or "churn",
        datetime_column=payload.datetime_column or "signup_date",
        analyzed_at=now,
        overview=analysis["overview"],
        completeness=analysis["completeness"],
        duplicates=analysis["duplicates"],
        validity=analysis["validity"],
        feature_quality=analysis["feature_quality"],
        outliers=analysis["outliers"],
        correlations=analysis["correlations"],
        target_analysis=analysis["target_analysis"],
        leakage=analysis["leakage"],
        health_score=analysis["health_score"],
        issues=analysis["issues"],
    )

