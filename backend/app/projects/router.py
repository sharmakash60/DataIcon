import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
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
from app.enums import AuditResult, ProjectStatus, Role
from app.models import Membership, Project, ProjectMembership, User
from app.schemas.common import PaginatedResponse
from app.schemas.organizations import ProjectMemberAdd, ProjectMemberOut
from app.schemas.projects import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter(prefix="/api/v1/organizations/{organization_id}/projects", tags=["projects"])


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    request: Request,
    payload: ProjectCreate,
    tenant: TenantContext = Depends(require_permission(Permissions.PROJECT_CREATE)),
    db: Session = Depends(get_db),
) -> ProjectOut:
    name_clean = payload.name.strip()
    if not name_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project name cannot be blank",
        )

    # Check unique name within organization
    existing = db.scalar(
        select(Project).where(
            Project.organization_id == tenant.organization_id,
            Project.name == name_clean,
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A project named '{name_clean}' already exists in this organization",
        )

    project = Project(
        organization_id=tenant.organization_id,
        name=name_clean,
        purpose=payload.purpose.strip() if payload.purpose else None,
        classification=payload.classification.value,
        status=ProjectStatus.ACTIVE.value,
        owner_user_id=tenant.user.id,
    )
    db.add(project)
    db.flush()

    # Automatically grant project membership to creator
    creator_pm = ProjectMembership(
        organization_id=tenant.organization_id,
        project_id=project.id,
        user_id=tenant.user.id,
        role=tenant.role,
    )
    db.add(creator_pm)

    record_audit_event(
        db=db,
        action="project.create",
        resource_type="project",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(project.id),
        source_ip=request.client.host if request.client else None,
        details={"name": name_clean, "classification": project.classification},
    )
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(project)


@router.get("", response_model=PaginatedResponse[ProjectOut])
def list_projects(
    tenant: TenantContext = Depends(require_permission(Permissions.PROJECT_VIEW)),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    project_status: ProjectStatus | None = None,
) -> PaginatedResponse[ProjectOut]:
    query = select(Project).where(Project.organization_id == tenant.organization_id)

    # Project-level access isolation:
    # Owners and Admins can see all projects in the organization.
    # Other roles (data_scientist, analyst, viewer, security_auditor) only see assigned projects.
    if tenant.role not in {Role.OWNER.value, Role.ADMIN.value}:
        assigned_project_ids = select(ProjectMembership.project_id).where(
            ProjectMembership.organization_id == tenant.organization_id,
            ProjectMembership.user_id == tenant.user.id,
        )
        query = query.where(
            or_(
                Project.owner_user_id == tenant.user.id,
                Project.id.in_(assigned_project_ids),
            )
        )

    if project_status:
        query = query.where(Project.status == project_status.value)

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0
    projects = db.scalars(
        query.order_by(Project.created_at.desc()).limit(limit).offset(offset)
    ).all()

    return PaginatedResponse(
        items=[ProjectOut.model_validate(p) for p in projects],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.PROJECT_VIEW)),
    db: Session = Depends(get_db),
) -> ProjectOut:
    return ProjectOut.model_validate(project_context.project)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    request: Request,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.PROJECT_UPDATE)),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = project_context.project
    tenant = project_context.tenant

    updates = {}
    if payload.name is not None:
        name_clean = payload.name.strip()
        if not name_clean:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project name cannot be blank",
            )
        existing = db.scalar(
            select(Project).where(
                Project.organization_id == tenant.organization_id,
                Project.name == name_clean,
                Project.id != project_id,
            )
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A project named '{name_clean}' already exists in this organization",
            )
        project.name = name_clean
        updates["name"] = name_clean

    if payload.purpose is not None:
        project.purpose = payload.purpose.strip() if payload.purpose else None
        updates["purpose"] = project.purpose

    if payload.classification is not None:
        project.classification = payload.classification.value
        updates["classification"] = project.classification

    if payload.status is not None:
        project.status = payload.status.value
        updates["status"] = project.status

    if updates:
        db.flush()
        record_audit_event(
            db=db,
            action="project.update",
            resource_type="project",
            result=AuditResult.SUCCESS,
            organization_id=tenant.organization_id,
            actor_id=tenant.user.id,
            actor_email=tenant.user.email,
            resource_id=str(project.id),
            source_ip=request.client.host if request.client else None,
            details=updates,
        )
        db.commit()
        db.refresh(project)

    return ProjectOut.model_validate(project)


@router.delete("/{project_id}", response_model=dict[str, str])
def delete_project(
    project_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(require_permission(Permissions.PROJECT_DELETE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    project = db.scalar(
        select(Project).where(
            Project.organization_id == tenant.organization_id,
            Project.id == project_id,
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    db.delete(project)
    record_audit_event(
        db=db,
        action="project.delete",
        resource_type="project",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(project_id),
        source_ip=request.client.host if request.client else None,
        details={"name": project.name},
    )
    db.commit()
    return {"status": "deleted"}


# ---------------------------------------------------------------------------
# Project-Level Membership Endpoints
# ---------------------------------------------------------------------------


@router.get("/{project_id}/members", response_model=list[ProjectMemberOut])
def list_project_members(
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.PROJECT_VIEW)),
    db: Session = Depends(get_db),
) -> list[ProjectMemberOut]:
    members = db.scalars(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.organization_id == project_context.tenant.organization_id,
        )
    ).all()
    out = []
    for m in members:
        user = db.scalar(select(User).where(User.id == m.user_id))
        if user:
            out.append(
                ProjectMemberOut(
                    id=m.id,
                    project_id=m.project_id,
                    user_id=user.id,
                    email=user.email,
                    display_name=user.display_name,
                    role=m.role,
                    created_at=m.created_at,
                )
            )
    return out


@router.post("/{project_id}/members", response_model=ProjectMemberOut, status_code=status.HTTP_201_CREATED)
def assign_project_member(
    project_id: uuid.UUID,
    payload: ProjectMemberAdd,
    request: Request,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.PROJECT_UPDATE)),
    db: Session = Depends(get_db),
) -> ProjectMemberOut:
    tenant = project_context.tenant
    # Verify target user exists and belongs to the same organization
    target_user = db.scalar(select(User).where(User.id == payload.user_id))
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    org_membership = db.scalar(
        select(Membership).where(
            Membership.organization_id == tenant.organization_id,
            Membership.user_id == target_user.id,
            Membership.status == "active",
        )
    )
    if not org_membership:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an active member of this organization",
        )

    # Check if already assigned
    existing = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == target_user.id,
        )
    )
    assigned_role = payload.role.value if payload.role else org_membership.role
    if existing:
        existing.role = assigned_role
        pm = existing
    else:
        pm = ProjectMembership(
            organization_id=tenant.organization_id,
            project_id=project_id,
            user_id=target_user.id,
            role=assigned_role,
        )
        db.add(pm)
    db.flush()

    record_audit_event(
        db=db,
        action="project.member_assign",
        resource_type="project_membership",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(pm.id),
        source_ip=request.client.host if request.client else None,
        details={"project_id": str(project_id), "target_user_id": str(target_user.id), "role": assigned_role},
    )
    db.commit()

    return ProjectMemberOut(
        id=pm.id,
        project_id=pm.project_id,
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=pm.role,
        created_at=pm.created_at,
    )


@router.delete("/{project_id}/members/{user_id}", response_model=dict[str, str])
def remove_project_member(
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    request: Request,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.PROJECT_UPDATE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    tenant = project_context.tenant
    pm = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.organization_id == tenant.organization_id,
            ProjectMembership.user_id == user_id,
        )
    )
    if not pm:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project member assignment not found")

    db.delete(pm)
    record_audit_event(
        db=db,
        action="project.member_remove",
        resource_type="project_membership",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(pm.id),
        source_ip=request.client.host if request.client else None,
        details={"project_id": str(project_id), "removed_user_id": str(user_id)},
    )
    db.commit()
    return {"status": "removed"}
