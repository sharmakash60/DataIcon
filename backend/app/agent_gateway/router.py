import hashlib
import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent_gateway.dependencies import get_current_agent
from app.agent_gateway.schemas import (
    AgentEnrollRequest,
    AgentEnrollResponse,
    AgentProjectOut,
    ClaimJobResponse,
    DatasetRegistrationRequest,
    DatasetRegistrationResponse,
    HeartbeatResponse,
    SubmitJobResultRequest,
    SubmitJobResultResponse,
)
from app.audit.service import record_audit_event
from app.db import get_db
from app.enums import AuditResult
from app.models import (
    Agent,
    AgentCredential,
    AgentEnrollmentToken,
    AgentJob,
    Dataset,
    ProfileSummary,
    Project,
)

router = APIRouter(prefix="/agent/v1", tags=["agent-gateway"])


@router.post("/enroll", response_model=AgentEnrollResponse, status_code=status.HTTP_201_CREATED)
def enroll_agent(
    request: Request,
    payload: AgentEnrollRequest,
    db: Session = Depends(get_db),
) -> AgentEnrollResponse:
    now = datetime.now(UTC)
    token_hash = hashlib.sha256(payload.enrollment_token.strip().encode("utf-8")).hexdigest()

    enrollment = db.scalar(
        select(AgentEnrollmentToken).where(
            AgentEnrollmentToken.token_hash == token_hash,
            AgentEnrollmentToken.used_at.is_(None),
            AgentEnrollmentToken.expires_at > now,
        )
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or already used enrollment token",
        )

    # 1. Mark token used
    enrollment.used_at = now

    # 2. Create Agent
    agent = Agent(
        organization_id=enrollment.organization_id,
        approved_name=payload.approved_name.strip(),
        runtime_version=payload.runtime_version.strip(),
        protocol_version="1.0",
        capabilities=json.dumps(payload.capabilities),
        last_seen_at=now,
        status="active",
    )
    db.add(agent)
    db.flush()

    # 3. Issue Agent Secret Credential
    raw_token = secrets.token_urlsafe(32)
    cred_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = now + timedelta(days=90)

    cred = AgentCredential(
        agent_id=agent.id,
        token_hash=cred_hash,
        expires_at=expires_at,
    )
    db.add(cred)

    record_audit_event(
        db=db,
        action="agent.enrolled",
        resource_type="agent",
        result=AuditResult.SUCCESS,
        organization_id=enrollment.organization_id,
        resource_id=str(agent.id),
        source_ip=request.client.host if request.client else None,
        details={"name": agent.approved_name, "version": agent.runtime_version},
    )
    db.commit()

    return AgentEnrollResponse(
        agent_id=agent.id,
        agent_token=raw_token,
        organization_id=enrollment.organization_id,
    )


@router.post("/heartbeat", response_model=HeartbeatResponse)
def agent_heartbeat(
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
) -> HeartbeatResponse:
    now = datetime.now(UTC)
    agent.last_seen_at = now
    db.commit()
    return HeartbeatResponse(status="ok", server_time=now)


@router.post(
    "/dataset-registrations",
    response_model=DatasetRegistrationResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_dataset(
    request: Request,
    payload: DatasetRegistrationRequest,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
) -> DatasetRegistrationResponse:
    # Verify project belongs to agent's organization
    project = db.scalar(
        select(Project).where(
            Project.id == payload.project_id,
            Project.organization_id == agent.organization_id,
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found in this organization",
        )

    # Upsert dataset registration
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == agent.organization_id,
            Dataset.project_id == payload.project_id,
            Dataset.opaque_local_ref == payload.opaque_local_ref,
        )
    )
    if dataset:
        dataset.approved_alias = payload.approved_alias.strip()
        dataset.format = payload.format
        dataset.agent_id = agent.id
    else:
        dataset = Dataset(
            organization_id=agent.organization_id,
            project_id=payload.project_id,
            agent_id=agent.id,
            opaque_local_ref=payload.opaque_local_ref,
            approved_alias=payload.approved_alias.strip(),
            format=payload.format,
            status="registered",
        )
        db.add(dataset)

    db.flush()
    record_audit_event(
        db=db,
        action="dataset.registered",
        resource_type="dataset",
        result=AuditResult.SUCCESS,
        organization_id=agent.organization_id,
        resource_id=str(dataset.id),
        source_ip=request.client.host if request.client else None,
        details={
            "approved_alias": dataset.approved_alias,
            "format": dataset.format,
            "opaque_ref": dataset.opaque_local_ref,
        },
    )
    db.commit()

    return DatasetRegistrationResponse(dataset_id=dataset.id, status=dataset.status)


@router.get("/projects", response_model=list[AgentProjectOut])
def list_agent_projects(
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
) -> list[AgentProjectOut]:
    """List active projects in agent's organization for project folder routing."""
    projects = db.scalars(
        select(Project)
        .where(
            Project.organization_id == agent.organization_id,
            Project.status != "archived",
        )
        .order_by(Project.created_at.asc())
    ).all()
    return [AgentProjectOut(id=p.id, name=p.name) for p in projects]


@router.post("/jobs/claim", response_model=ClaimJobResponse | None)
def claim_job(
    request: Request,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
) -> ClaimJobResponse | None:
    now = datetime.now(UTC)
    # Find queued job
    job = db.scalar(
        select(AgentJob)
        .where(
            AgentJob.organization_id == agent.organization_id,
            AgentJob.agent_id == agent.id,
            AgentJob.status == "queued",
        )
        .order_by(AgentJob.created_at.asc())
    )
    if not job:
        return None

    lease_token = secrets.token_urlsafe(24)
    job.status = "leased"
    job.lease_token = lease_token
    job.lease_expires_at = now + timedelta(minutes=10)

    record_audit_event(
        db=db,
        action="agent.job_claimed",
        resource_type="agent_job",
        result=AuditResult.SUCCESS,
        organization_id=agent.organization_id,
        resource_id=str(job.id),
        source_ip=request.client.host if request.client else None,
        details={"operation": job.operation},
    )
    db.commit()

    return ClaimJobResponse(
        job_id=job.id,
        operation=job.operation,
        payload=json.loads(job.payload) if job.payload else {},
        lease_token=lease_token,
    )


@router.post("/jobs/{job_id}/results", response_model=SubmitJobResultResponse)
def submit_job_results(
    job_id: uuid.UUID,
    payload: SubmitJobResultRequest,
    request: Request,
    agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db),
) -> SubmitJobResultResponse:
    job = db.scalar(
        select(AgentJob).where(
            AgentJob.id == job_id,
            AgentJob.organization_id == agent.organization_id,
            AgentJob.agent_id == agent.id,
        )
    )
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    if job.lease_token != payload.lease_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired lease token"
        )

    # STRICT EXPORT INTEGRITY CHECK:
    # Ensure dataset exists
    dataset = db.scalar(
        select(Dataset).where(
            Dataset.organization_id == agent.organization_id,
            Dataset.project_id == job.project_id,
            Dataset.opaque_local_ref == payload.profile.dataset_ref,
        )
    )
    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Referenced dataset is not registered",
        )

    # Save summary
    summary_json = payload.profile.model_dump_json()
    summary = ProfileSummary(
        organization_id=agent.organization_id,
        dataset_id=dataset.id,
        job_id=job.id,
        total_rows=payload.profile.total_rows,
        total_columns=payload.profile.total_columns,
        file_size_bytes=payload.profile.file_size_bytes,
        permitted_payload=summary_json,
    )
    db.add(summary)

    job.status = "completed"
    job.lease_token = None

    record_audit_event(
        db=db,
        action="agent.job_completed",
        resource_type="agent_job",
        result=AuditResult.SUCCESS,
        organization_id=agent.organization_id,
        resource_id=str(job.id),
        source_ip=request.client.host if request.client else None,
        details={
            "operation": job.operation,
            "total_rows": payload.profile.total_rows,
            "total_columns": payload.profile.total_columns,
        },
    )
    db.commit()

    return SubmitJobResultResponse(status="accepted", summary_id=summary.id)
