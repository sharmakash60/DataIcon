import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.auth.dependencies import (
    TenantContext,
    get_current_user,
    get_tenant_context,
    require_permission,
)
from app.auth.permissions import Permissions
from app.db import get_db
from app.enums import AuditResult, MembershipStatus, OrgStatus, Role
from app.models import Membership, Organization, Project, ProjectMembership, User
from app.schemas.organizations import (
    MemberAdd,
    MemberOut,
    MemberRoleUpdate,
    OrgCreate,
    OrgOut,
)

router = APIRouter(prefix="/api/v1/organizations", tags=["organizations"])


@router.post("", response_model=OrgOut, status_code=status.HTTP_201_CREATED)
def create_organization(
    request: Request,
    payload: OrgCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> OrgOut:
    name_clean = payload.name.strip()
    if not name_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Organization name cannot be empty",
        )

    org = Organization(name=name_clean)
    db.add(org)
    db.flush()

    membership = Membership(
        organization_id=org.id,
        user_id=current_user.id,
        role=Role.OWNER.value,
        status=MembershipStatus.ACTIVE.value,
    )
    db.add(membership)

    record_audit_event(
        db=db,
        action="org.create",
        resource_type="organization",
        result=AuditResult.SUCCESS,
        organization_id=org.id,
        actor_id=current_user.id,
        actor_email=current_user.email,
        resource_id=str(org.id),
        source_ip=request.client.host if request.client else None,
        details={"name": name_clean},
    )
    db.commit()
    db.refresh(org)
    return OrgOut.model_validate(org)


@router.get("", response_model=list[OrgOut])
def list_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[OrgOut]:
    memberships = db.scalars(
        select(Membership).where(
            Membership.user_id == current_user.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).all()
    org_ids = [m.organization_id for m in memberships]
    if not org_ids:
        return []
    orgs = db.scalars(
        select(Organization).where(
            Organization.id.in_(org_ids),
            Organization.status == OrgStatus.ACTIVE.value,
        )
    ).all()
    return [OrgOut.model_validate(o) for o in orgs]


@router.get("/{organization_id}", response_model=OrgOut)
def get_organization(
    tenant: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> OrgOut:
    org = db.scalar(select(Organization).where(Organization.id == tenant.organization_id))
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found",
        )
    return OrgOut.model_validate(org)


@router.get("/{organization_id}/members", response_model=list[MemberOut])
def list_members(
    tenant: TenantContext = Depends(require_permission(Permissions.MEMBERS_VIEW)),
    db: Session = Depends(get_db),
) -> list[MemberOut]:
    memberships = db.scalars(
        select(Membership).where(
            Membership.organization_id == tenant.organization_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    ).all()

    # Pre-fetch user project memberships for this organization
    p_memberships = db.scalars(
        select(ProjectMembership).where(
            ProjectMembership.organization_id == tenant.organization_id
        )
    ).all()
    projects = {
        p.id: p.name
        for p in db.scalars(
            select(Project).where(Project.organization_id == tenant.organization_id)
        ).all()
    }

    user_projects_map: dict[uuid.UUID, list[tuple[uuid.UUID, str]]] = {}
    for pm in p_memberships:
        p_name = projects.get(pm.project_id, "Unknown Project")
        user_projects_map.setdefault(pm.user_id, []).append((pm.project_id, p_name))

    results = []
    for m in memberships:
        user = db.scalar(select(User).where(User.id == m.user_id))
        if user:
            proj_info = user_projects_map.get(user.id, [])
            results.append(
                MemberOut(
                    id=m.id,
                    user_id=user.id,
                    email=user.email,
                    display_name=user.display_name,
                    role=m.role,
                    status=m.status,
                    created_at=m.created_at,
                    project_ids=[p[0] for p in proj_info],
                    project_names=[p[1] for p in proj_info],
                    last_activity_at=user.last_login_at or user.updated_at,
                )
            )
    return results


@router.post(
    "/{organization_id}/members",
    response_model=MemberOut,
    status_code=status.HTTP_201_CREATED,
)
def add_member(
    request: Request,
    payload: MemberAdd,
    tenant: TenantContext = Depends(require_permission(Permissions.MEMBERS_INVITE)),
    db: Session = Depends(get_db),
) -> MemberOut:
    target_email = payload.email.strip().lower()

    # Self-privilege escalation check
    if payload.role == Role.OWNER and tenant.role != Role.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an organization owner can grant the owner role",
        )

    target_user = db.scalar(select(User).where(User.email == target_email))
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User with this email not found. User must register before being added.",
        )

    if target_user.id == tenant.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot modify your own membership via invite",
        )

    existing = db.scalar(
        select(Membership).where(
            Membership.organization_id == tenant.organization_id,
            Membership.user_id == target_user.id,
        )
    )
    if existing and existing.status == MembershipStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already an active member of this organization",
        )

    if existing:
        existing.status = MembershipStatus.ACTIVE.value
        existing.role = payload.role.value
        membership = existing
    else:
        membership = Membership(
            organization_id=tenant.organization_id,
            user_id=target_user.id,
            role=payload.role.value,
            status=MembershipStatus.ACTIVE.value,
        )
        db.add(membership)
    db.flush()

    record_audit_event(
        db=db,
        action="member.add",
        resource_type="membership",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(membership.id),
        source_ip=request.client.host if request.client else None,
        details={"user_id": str(target_user.id), "role": payload.role.value},
    )
    db.commit()

    return MemberOut(
        id=membership.id,
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=membership.role,
        status=membership.status,
        created_at=membership.created_at,
        project_ids=[],
        project_names=[],
        last_activity_at=target_user.last_login_at or target_user.updated_at,
    )


@router.patch(
    "/{organization_id}/members/{membership_id}",
    response_model=MemberOut,
)
def update_member_role(
    membership_id: uuid.UUID,
    payload: MemberRoleUpdate,
    request: Request,
    tenant: TenantContext = Depends(require_permission(Permissions.MEMBERS_UPDATE)),
    db: Session = Depends(get_db),
) -> MemberOut:
    membership = db.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.organization_id == tenant.organization_id,
        )
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership record not found",
        )

    # 1. Prevent self-privilege modification
    if membership.user_id == tenant.user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Users cannot modify their own role or privileges",
        )

    # 2. Only OWNER can assign the OWNER role
    if payload.role == Role.OWNER and tenant.role != Role.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only an organization owner can assign the owner role",
        )

    # 3. Only OWNER can modify another OWNER's role
    if membership.role == Role.OWNER.value and tenant.role != Role.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An administrator cannot demote or modify an organization owner",
        )

    old_role = membership.role
    membership.role = payload.role.value
    db.flush()

    record_audit_event(
        db=db,
        action="member.role_update",
        resource_type="membership",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(membership.id),
        source_ip=request.client.host if request.client else None,
        details={"user_id": str(membership.user_id), "old_role": old_role, "new_role": payload.role.value},
    )
    db.commit()

    user = db.scalar(select(User).where(User.id == membership.user_id))
    return MemberOut(
        id=membership.id,
        user_id=user.id if user else membership.user_id,
        email=user.email if user else "",
        display_name=user.display_name if user else "",
        role=membership.role,
        status=membership.status,
        created_at=membership.created_at,
        project_ids=[],
        project_names=[],
        last_activity_at=user.last_login_at if user else None,
    )


@router.delete(
    "/{organization_id}/members/{membership_id}",
    response_model=dict[str, str],
)
def remove_member(
    membership_id: uuid.UUID,
    request: Request,
    tenant: TenantContext = Depends(require_permission(Permissions.MEMBERS_REMOVE)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    membership = db.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.organization_id == tenant.organization_id,
        )
    )
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Membership record not found",
        )

    # Prevent removing oneself
    if membership.user_id == tenant.user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself from the organization",
        )

    # Prevent removing owner
    if membership.role == Role.OWNER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The organization owner cannot be removed by an administrator",
        )

    # Clean up project memberships
    project_members = db.scalars(
        select(ProjectMembership).where(
            ProjectMembership.organization_id == tenant.organization_id,
            ProjectMembership.user_id == membership.user_id,
        )
    ).all()
    for pm in project_members:
        db.delete(pm)

    db.delete(membership)

    record_audit_event(
        db=db,
        action="member.remove",
        resource_type="membership",
        result=AuditResult.SUCCESS,
        organization_id=tenant.organization_id,
        actor_id=tenant.user.id,
        actor_email=tenant.user.email,
        resource_id=str(membership.id),
        source_ip=request.client.host if request.client else None,
        details={"user_id": str(membership.user_id), "removed_role": membership.role},
    )
    db.commit()
    return {"status": "removed"}
