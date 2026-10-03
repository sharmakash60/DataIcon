"""FastAPI Router for Business Requirement Engine and Problem Formulation."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.auth.dependencies import (
    ProjectContext,
    require_project_permission,
)
from app.auth.permissions import Permissions
from app.db import get_db
from app.enums import AuditResult
from app.models import BusinessRequirement, ProblemFormulation
from app.requirements.schemas import (
    BusinessRequirementOut,
    ConfirmRequirementRequest,
    ExtractRequirementRequest,
    ProblemFormulationOut,
    RejectRequirementRequest,
    RequirementStatus,
    RequirementUpdateRequest,
)
from app.requirements.service import (
    AmbiguousProblemError,
    ConflictingRequirementsError,
    MissingTargetError,
    PromptInjectionError,
    RequirementExtractionError,
    UnsupportedProblemTypeError,
    extract_requirements,
)

router = APIRouter(
    prefix="/api/v1/organizations/{organization_id}/projects/{project_id}",
    tags=["requirements"],
)

# Exported dependency singletons for clean testing overrides
require_project_view = require_project_permission(Permissions.PROJECT_VIEW)
require_project_update = require_project_permission(Permissions.PROJECT_UPDATE)


def _serialize_requirement(req: BusinessRequirement) -> BusinessRequirementOut:
    secondary_metrics = json.loads(req.secondary_metrics) if req.secondary_metrics else []
    business_constraints = json.loads(req.business_constraints) if req.business_constraints else []
    assumptions = json.loads(req.assumptions) if req.assumptions else []
    missing_requirements = json.loads(req.missing_requirements) if req.missing_requirements else []

    return BusinessRequirementOut(
        id=req.id,
        organization_id=req.organization_id,
        project_id=req.project_id,
        created_by_user_id=req.created_by_user_id,
        natural_language_input=req.natural_language_input,
        business_objective=req.business_objective,
        ml_objective=req.prediction_objective,
        prediction_objective=req.prediction_objective,
        target=req.target_name,
        target_name=req.target_name,
        prediction_horizon=req.prediction_horizon,
        candidate_problem_type=req.ml_problem_type,
        ml_problem_type=req.ml_problem_type,
        primary_metric=req.primary_metric,
        secondary_metrics=secondary_metrics,
        business_constraints=business_constraints,
        cost_of_false_positives=req.cost_of_false_positives,
        cost_of_false_negatives=req.cost_of_false_negatives,
        expected_prediction_frequency=req.expected_prediction_frequency,
        business_priority=req.business_priority,
        suggested_positive_class=req.suggested_positive_class,
        confidence_score=req.confidence_score,
        assumptions=assumptions,
        missing_requirements=missing_requirements,
        status=req.status,
        review_notes=req.review_notes,
        reviewed_by_user_id=req.reviewed_by_user_id,
        reviewed_at=req.reviewed_at,
        created_at=req.created_at,
        updated_at=req.updated_at,
    )


def _serialize_formulation(pf: ProblemFormulation) -> ProblemFormulationOut:
    return ProblemFormulationOut(
        id=pf.id,
        version=pf.version,
        organization_id=pf.organization_id,
        project_id=pf.project_id,
        requirement_id=pf.requirement_id,
        business_objective=pf.business_objective,
        ml_objective=pf.ml_objective,
        target=pf.target,
        prediction_horizon=pf.prediction_horizon,
        candidate_problem_type=pf.candidate_problem_type,
        primary_metric=pf.primary_metric,
        secondary_metrics=json.loads(pf.secondary_metrics) if pf.secondary_metrics else [],
        business_constraints=json.loads(pf.business_constraints) if pf.business_constraints else [],
        cost_of_false_positives=pf.cost_of_false_positives,
        cost_of_false_negatives=pf.cost_of_false_negatives,
        expected_prediction_frequency=pf.expected_prediction_frequency,
        business_priority=pf.business_priority,
        assumptions=json.loads(pf.assumptions) if pf.assumptions else [],
        status=pf.status,
        confirmed_by_user_id=pf.confirmed_by_user_id,
        confirmed_at=pf.confirmed_at,
        created_at=pf.created_at,
        updated_at=pf.updated_at,
    )


# ---------------------------------------------------------------------------
# Business Requirements Endpoints
# ---------------------------------------------------------------------------

@router.post("/requirements/extract", response_model=BusinessRequirementOut, status_code=status.HTTP_201_CREATED)
def extract_and_create_requirement(
    project_id: uuid.UUID,
    payload: ExtractRequirementRequest,
    request: Request,
    project_context: ProjectContext = Depends(require_project_update),
    db: Session = Depends(get_db),
) -> BusinessRequirementOut:
    """Extract structured ML requirements from natural language problem description.
    
    Creates a draft BusinessRequirement for user review. Never triggers execution.
    """
    tenant = project_context.tenant

    try:
        extracted = extract_requirements(
            problem_description=payload.problem_description,
            raw_llm_json=payload.llm_json_override,
            strict_target=payload.strict_target,
        )
    except PromptInjectionError as err:
        record_audit_event(
            db=db,
            action="security.prompt_injection_blocked",
            resource_type="business_requirement",
            result=AuditResult.DENIED,
            organization_id=tenant.organization_id,
            actor_id=tenant.user.id,
            actor_email=tenant.user.email,
            source_ip=request.client.host if request.client else None,
            details={"input_snippet": payload.problem_description[:120], "reason": str(err)},
        )
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err
    except (AmbiguousProblemError, UnsupportedProblemTypeError, ConflictingRequirementsError, MissingTargetError) as err:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)) from err
    except RequirementExtractionError as err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)) from err

    record = BusinessRequirement(
        organization_id=tenant.organization_id,
        project_id=project_id,
        created_by_user_id=tenant.user.id,
        natural_language_input=payload.problem_description.strip(),
        business_objective=extracted.business_objective,
        prediction_objective=extracted.ml_objective,
        target_name=extracted.target,
        prediction_horizon=extracted.prediction_horizon,
        ml_problem_type=extracted.candidate_problem_type.value,
        primary_metric=extracted.primary_metric,
        secondary_metrics=json.dumps(extracted.secondary_metrics),
        business_constraints=json.dumps(extracted.business_constraints),
        cost_of_false_positives=extracted.cost_of_false_positives,
        cost_of_false_negatives=extracted.cost_of_false_negatives,
        expected_prediction_frequency=extracted.expected_prediction_frequency,
        business_priority=extracted.business_priority,
        suggested_positive_class=extracted.suggested_positive_class,
        confidence_score=extracted.confidence_score,
        assumptions=json.dumps(extracted.assumptions),
        missing_requirements=json.dumps(extracted.missing_requirements),
        status=RequirementStatus.DRAFT.value,
    )
    db.add(record)
    db.flush()

    record_audit_event(
        db=db,
        action="requirement.extracted",
        resource_type="business_requirement",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(record.id),
        source_ip=request.client.host if request.client else None,
        details={
            "ml_problem_type": record.ml_problem_type,
            "target": record.target_name,
            "horizon": record.prediction_horizon,
            "primary_metric": record.primary_metric,
            "missing_requirements_count": len(extracted.missing_requirements),
        },
    )
    db.commit()

    return _serialize_requirement(record)


@router.get("/requirements", response_model=list[BusinessRequirementOut])
def list_requirements(
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_view),
    db: Session = Depends(get_db),
) -> list[BusinessRequirementOut]:
    """List all extracted and formulated requirements for a project."""
    tenant = project_context.tenant
    records = db.scalars(
        select(BusinessRequirement)
        .where(
            BusinessRequirement.organization_id == tenant.organization_id,
            BusinessRequirement.project_id == project_id,
        )
        .order_by(BusinessRequirement.created_at.desc())
    ).all()

    return [_serialize_requirement(r) for r in records]


@router.get("/requirements/{requirement_id}", response_model=BusinessRequirementOut)
def get_requirement(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_view),
    db: Session = Depends(get_db),
) -> BusinessRequirementOut:
    """Retrieve a single requirement record."""
    tenant = project_context.tenant
    record = db.scalar(
        select(BusinessRequirement).where(
            BusinessRequirement.id == requirement_id,
            BusinessRequirement.project_id == project_id,
            BusinessRequirement.organization_id == tenant.organization_id,
        )
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    return _serialize_requirement(record)


@router.put("/requirements/{requirement_id}", response_model=BusinessRequirementOut)
def update_and_review_requirement(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    payload: RequirementUpdateRequest,
    request: Request,
    project_context: ProjectContext = Depends(require_project_update),
    db: Session = Depends(get_db),
) -> BusinessRequirementOut:
    """Review and edit extracted requirements. Allows user to refine or adjust formulation."""
    tenant = project_context.tenant
    record = db.scalar(
        select(BusinessRequirement).where(
            BusinessRequirement.id == requirement_id,
            BusinessRequirement.project_id == project_id,
            BusinessRequirement.organization_id == tenant.organization_id,
        )
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    # Update editable fields
    record.business_objective = payload.business_objective.strip()
    record.prediction_objective = payload.ml_objective.strip()
    record.target_name = payload.target.strip()
    record.prediction_horizon = payload.prediction_horizon.strip() if payload.prediction_horizon else None
    record.ml_problem_type = payload.candidate_problem_type.value
    record.primary_metric = payload.primary_metric.strip()
    record.secondary_metrics = json.dumps(payload.secondary_metrics)
    record.business_constraints = json.dumps(payload.business_constraints)
    record.cost_of_false_positives = payload.cost_of_false_positives.strip() if payload.cost_of_false_positives else None
    record.cost_of_false_negatives = payload.cost_of_false_negatives.strip() if payload.cost_of_false_negatives else None
    record.expected_prediction_frequency = payload.expected_prediction_frequency.strip() if payload.expected_prediction_frequency else None
    record.business_priority = payload.business_priority.strip() if payload.business_priority else None
    record.suggested_positive_class = payload.suggested_positive_class.strip() if payload.suggested_positive_class else None
    record.assumptions = json.dumps(payload.assumptions)
    record.missing_requirements = json.dumps(payload.missing_requirements)
    record.review_notes = payload.review_notes.strip() if payload.review_notes else None

    previous_status = record.status
    record.status = payload.status.value

    if payload.status in (RequirementStatus.REVIEWED, RequirementStatus.APPROVED):
        record.reviewed_by_user_id = tenant.user.id
        record.reviewed_at = datetime.now(UTC)

    action_label = "requirement.approved" if payload.status == RequirementStatus.APPROVED else "requirement.updated"
    record_audit_event(
        db=db,
        action=action_label,
        resource_type="business_requirement",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(record.id),
        source_ip=request.client.host if request.client else None,
        details={
            "previous_status": previous_status,
            "new_status": record.status,
            "target": record.target_name,
            "primary_metric": record.primary_metric,
        },
    )
    db.commit()

    return _serialize_requirement(record)


@router.post("/requirements/{requirement_id}/confirm", response_model=dict)
def confirm_and_create_formulation(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    payload: ConfirmRequirementRequest,
    request: Request,
    project_context: ProjectContext = Depends(require_project_update),
    db: Session = Depends(get_db),
) -> dict:
    """Confirm and approve formulation, generating a versioned Problem Formulation object.
    
    Verifies that the target is defined and creates an immutable versioned snapshot.
    """
    tenant = project_context.tenant
    record = db.scalar(
        select(BusinessRequirement).where(
            BusinessRequirement.id == requirement_id,
            BusinessRequirement.project_id == project_id,
            BusinessRequirement.organization_id == tenant.organization_id,
        )
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    # Validate that target is non-empty and not unspecified
    if not record.target_name or record.target_name.strip() in {"", "unspecified_target"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot confirm problem formulation: Target variable is missing or unspecified. Please edit and specify the target variable before confirmation.",
        )

    # Calculate next version for this project
    current_max_version = db.scalar(
        select(func.coalesce(func.max(ProblemFormulation.version), 0))
        .where(
            ProblemFormulation.organization_id == tenant.organization_id,
            ProblemFormulation.project_id == project_id,
        )
    )
    next_version = (current_max_version or 0) + 1

    # Create versioned Problem Formulation
    formulation = ProblemFormulation(
        version=next_version,
        organization_id=tenant.organization_id,
        project_id=project_id,
        requirement_id=record.id,
        business_objective=record.business_objective,
        ml_objective=record.prediction_objective,
        target=record.target_name,
        prediction_horizon=record.prediction_horizon,
        candidate_problem_type=record.ml_problem_type,
        primary_metric=record.primary_metric,
        secondary_metrics=record.secondary_metrics,
        business_constraints=record.business_constraints,
        cost_of_false_positives=record.cost_of_false_positives,
        cost_of_false_negatives=record.cost_of_false_negatives,
        expected_prediction_frequency=record.expected_prediction_frequency,
        business_priority=record.business_priority,
        assumptions=record.assumptions,
        status="active",
        confirmed_by_user_id=tenant.user.id,
        confirmed_at=datetime.now(UTC),
    )
    db.add(formulation)

    # Update requirement status to approved
    record.status = RequirementStatus.APPROVED.value
    record.reviewed_by_user_id = tenant.user.id
    record.reviewed_at = datetime.now(UTC)
    if payload.review_notes:
        record.review_notes = payload.review_notes.strip()

    db.flush()

    record_audit_event(
        db=db,
        action="problem_formulation.created",
        resource_type="problem_formulation",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(formulation.id),
        source_ip=request.client.host if request.client else None,
        details={
            "version": formulation.version,
            "target": formulation.target,
            "problem_type": formulation.candidate_problem_type,
            "primary_metric": formulation.primary_metric,
            "requirement_id": str(record.id),
        },
    )
    db.commit()

    return {
        "requirement": _serialize_requirement(record).model_dump(mode="json"),
        "formulation": _serialize_formulation(formulation).model_dump(mode="json"),
    }


@router.post("/requirements/{requirement_id}/reject", response_model=BusinessRequirementOut)
def reject_requirement(
    project_id: uuid.UUID,
    requirement_id: uuid.UUID,
    payload: RejectRequirementRequest,
    request: Request,
    project_context: ProjectContext = Depends(require_project_update),
    db: Session = Depends(get_db),
) -> BusinessRequirementOut:
    """Reject a proposed requirement formulation with explicit rationale."""
    tenant = project_context.tenant
    record = db.scalar(
        select(BusinessRequirement).where(
            BusinessRequirement.id == requirement_id,
            BusinessRequirement.project_id == project_id,
            BusinessRequirement.organization_id == tenant.organization_id,
        )
    )
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requirement not found")

    record.status = RequirementStatus.REJECTED.value
    record.review_notes = f"Rejected: {payload.reason.strip()}"
    record.reviewed_by_user_id = tenant.user.id
    record.reviewed_at = datetime.now(UTC)

    record_audit_event(
        db=db,
        action="requirement.rejected",
        resource_type="business_requirement",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(record.id),
        source_ip=request.client.host if request.client else None,
        details={"reason": payload.reason.strip()},
    )
    db.commit()

    return _serialize_requirement(record)


# ---------------------------------------------------------------------------
# Versioned Problem Formulation Endpoints
# ---------------------------------------------------------------------------

@router.get("/formulations", response_model=list[ProblemFormulationOut])
def list_formulations(
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_view),
    db: Session = Depends(get_db),
) -> list[ProblemFormulationOut]:
    """List all versioned Problem Formulation objects for a project."""
    tenant = project_context.tenant
    formulations = db.scalars(
        select(ProblemFormulation)
        .where(
            ProblemFormulation.organization_id == tenant.organization_id,
            ProblemFormulation.project_id == project_id,
        )
        .order_by(ProblemFormulation.version.desc())
    ).all()

    return [_serialize_formulation(pf) for pf in formulations]


@router.get("/formulations/{formulation_id}", response_model=ProblemFormulationOut)
def get_formulation(
    project_id: uuid.UUID,
    formulation_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_view),
    db: Session = Depends(get_db),
) -> ProblemFormulationOut:
    """Retrieve a specific versioned Problem Formulation."""
    tenant = project_context.tenant
    pf = db.scalar(
        select(ProblemFormulation).where(
            ProblemFormulation.id == formulation_id,
            ProblemFormulation.project_id == project_id,
            ProblemFormulation.organization_id == tenant.organization_id,
        )
    )
    if not pf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Problem formulation not found")

    return _serialize_formulation(pf)
