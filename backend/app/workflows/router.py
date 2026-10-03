"""FastAPI Router for Senior Data Scientist Mode Workflow Engine.

Exposes REST endpoints to:
- Retrieve 15-stage workflow timeline state with full telemetry and AI reasoning
- Switch between Automatic, Assisted, and Manual/Advanced execution modes
- Apply user manual overrides and decisions at every stage
- Advance workflow stages
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.auth.dependencies import (
    ProjectContext,
    require_project_permission,
)
from app.auth.permissions import Permissions
from app.db import get_db
from app.enums import AuditResult
from app.workflows.schemas import (
    ModeUpdateRequest,
    ProjectWorkflowOut,
    StageAdvanceRequest,
    StageOverrideRequest,
)
from app.workflows.service import (
    STAGE_DEFINITIONS,
    build_project_workflow_out,
    get_or_create_project_workflow,
    save_stage_override,
    update_workflow_execution_mode,
)

router = APIRouter(
    prefix="/api/v1/organizations/{organization_id}/projects/{project_id}/workflow",
    tags=["senior-data-scientist-workflow"],
)

VALID_STAGE_KEYS = {s["key"] for s in STAGE_DEFINITIONS}

require_project_view = require_project_permission(Permissions.PROJECT_VIEW)
require_project_update = require_project_permission(Permissions.PROJECT_UPDATE)


@router.get("", response_model=ProjectWorkflowOut)
def get_project_workflow(
    ctx: Annotated[ProjectContext, Depends(require_project_view)],
    db: Session = Depends(get_db),
) -> ProjectWorkflowOut:
    """Retrieve the current 15-stage workflow timeline, execution mode, and stage telemetry."""
    workflow = get_or_create_project_workflow(db, ctx.tenant.organization_id, ctx.project.id)
    return build_project_workflow_out(db, ctx.project, workflow)


@router.patch("/mode", response_model=ProjectWorkflowOut)
def update_workflow_mode(
    request: Request,
    payload: ModeUpdateRequest,
    ctx: Annotated[ProjectContext, Depends(require_project_update)],
    db: Session = Depends(get_db),
) -> ProjectWorkflowOut:
    """Switch workflow execution mode: Automatic, Assisted, or Manual/Advanced."""
    if payload.execution_mode not in ("automatic", "assisted", "manual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid execution mode: {payload.execution_mode}",
        )

    workflow = get_or_create_project_workflow(db, ctx.tenant.organization_id, ctx.project.id)
    old_mode = workflow.execution_mode
    update_workflow_execution_mode(db, workflow, payload.execution_mode)

    record_audit_event(
        db=db,
        action="workflow.mode_update",
        resource_type="project_workflow",
        result=AuditResult.SUCCESS,
        organization_id=ctx.tenant.organization_id,
        actor_id=ctx.tenant.user.id,
        actor_email=ctx.tenant.user.email,
        resource_id=str(workflow.id),
        source_ip=request.client.host if request.client else None,
        details={
            "project_id": str(ctx.project.id),
            "old_mode": old_mode,
            "new_mode": payload.execution_mode,
        },
    )
    db.commit()
    db.refresh(workflow)

    return build_project_workflow_out(db, ctx.project, workflow)


@router.post("/stages/{stage_key}/override", response_model=ProjectWorkflowOut)
def override_workflow_stage(
    stage_key: str,
    payload: StageOverrideRequest,
    request: Request,
    ctx: Annotated[ProjectContext, Depends(require_project_update)],
    db: Session = Depends(get_db),
) -> ProjectWorkflowOut:
    """Record a user manual override, decision, or custom parameters for a specific stage."""
    if stage_key not in VALID_STAGE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid workflow stage key '{stage_key}'. Must be one of: {sorted(list(VALID_STAGE_KEYS))}",
        )

    workflow = get_or_create_project_workflow(db, ctx.tenant.organization_id, ctx.project.id)
    save_stage_override(
        db=db,
        workflow=workflow,
        stage_key=stage_key,
        override_req=payload,
        actor_email=ctx.tenant.user.email,
    )

    record_audit_event(
        db=db,
        action="workflow.stage_override",
        resource_type="project_workflow",
        result=AuditResult.SUCCESS,
        organization_id=ctx.tenant.organization_id,
        actor_id=ctx.tenant.user.id,
        actor_email=ctx.tenant.user.email,
        resource_id=str(workflow.id),
        source_ip=request.client.host if request.client else None,
        details={
            "project_id": str(ctx.project.id),
            "stage_key": stage_key,
            "decision": payload.decision,
            "has_overridden_recommendation": bool(payload.overridden_recommendation),
            "has_custom_parameters": bool(payload.custom_parameters),
        },
    )
    db.commit()
    db.refresh(workflow)

    return build_project_workflow_out(db, ctx.project, workflow)


@router.post("/stages/{stage_key}/advance", response_model=ProjectWorkflowOut)
def advance_workflow_stage(
    stage_key: str,
    request: Request,
    ctx: Annotated[ProjectContext, Depends(require_project_update)],
    db: Session = Depends(get_db),
    payload: StageAdvanceRequest | None = None,
) -> ProjectWorkflowOut:
    """Advance the workflow stage or acknowledge stage progression."""
    if stage_key not in VALID_STAGE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid workflow stage key '{stage_key}'",
        )

    workflow = get_or_create_project_workflow(db, ctx.tenant.organization_id, ctx.project.id)

    # Mark stage_key as completed in workflow overrides
    overrides: dict = {}
    if workflow.user_overrides_json:
        try:
            import json
            overrides = json.loads(workflow.user_overrides_json)
        except Exception:
            overrides = {}

    from datetime import UTC, datetime
    stage_override = overrides.get(stage_key, {})
    stage_override["status"] = "completed"
    if "decision" not in stage_override:
        stage_override["decision"] = "accepted"
    stage_override["updated_at"] = datetime.now(UTC).isoformat()
    stage_override["decided_by_email"] = ctx.tenant.user.email
    overrides[stage_key] = stage_override
    workflow.user_overrides_json = json.dumps(overrides)

    # Find next stage
    current_def = next(s for s in STAGE_DEFINITIONS if s["key"] == stage_key)
    curr_index = current_def["index"]
    next_def = next((s for s in STAGE_DEFINITIONS if s["index"] == curr_index + 1), None)

    if next_def:
        workflow.current_stage_key = next_def["key"]
        workflow.current_stage_index = next_def["index"]

    record_audit_event(
        db=db,
        action="workflow.stage_advance",
        resource_type="project_workflow",
        result=AuditResult.SUCCESS,
        organization_id=ctx.tenant.organization_id,
        actor_id=ctx.tenant.user.id,
        actor_email=ctx.tenant.user.email,
        resource_id=str(workflow.id),
        source_ip=request.client.host if request.client else None,
        details={
            "project_id": str(ctx.project.id),
            "advanced_from_stage": stage_key,
            "advanced_to_stage": next_def["key"] if next_def else stage_key,
        },
    )
    db.commit()
    db.refresh(workflow)

    return build_project_workflow_out(db, ctx.project, workflow)

