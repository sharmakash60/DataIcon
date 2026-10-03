import uuid
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.service import record_audit_event
from app.auth.permissions import Permissions, get_permissions_for_role, ROLE_PERMISSIONS
from app.config import Settings
from app.db import get_db
from app.enums import AuditResult, MembershipStatus, Role, UserStatus
from app.models import Membership, Project, ProjectMembership, User
from app.security.tokens import decode_access_token

security_scheme = HTTPBearer(auto_error=False)

# Backward compatibility map for legacy permission strings
LEGACY_PERMISSION_MAP = {
    "org:manage": Permissions.ORGANIZATION_UPDATE,
    "member:read": Permissions.MEMBERS_VIEW,
    "member:manage": Permissions.MEMBERS_INVITE,
    "project:create": Permissions.PROJECT_CREATE,
    "project:read": Permissions.PROJECT_VIEW,
    "project:update": Permissions.PROJECT_UPDATE,
    "project:write": Permissions.PROJECT_UPDATE,
    "project:delete": Permissions.PROJECT_DELETE,
    "audit:read": Permissions.AUDIT_LOG_VIEW,
}


@dataclass
class TenantContext:
    organization_id: uuid.UUID
    user: User
    membership: Membership
    role: str
    permissions: set[str]


@dataclass
class ProjectContext:
    project_id: uuid.UUID
    project: Project
    tenant: TenantContext


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    settings = Settings()
    try:
        payload = decode_access_token(credentials.credentials, settings)
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, KeyError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.scalar(select(User).where(User.id == user_id, User.status == UserStatus.ACTIVE.value))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_tenant_context(
    organization_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> TenantContext:
    membership = db.scalar(
        select(Membership).where(
            Membership.organization_id == organization_id,
            Membership.user_id == current_user.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    )
    if not membership:
        record_audit_event(
            db=db,
            action="auth.tenant_access_denied",
            resource_type="organization",
            result=AuditResult.DENIED,
            organization_id=organization_id,
            actor_id=current_user.id,
            actor_email=current_user.email,
            resource_id=str(organization_id),
            details={"reason": "no_active_membership"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access to this organization is denied",
        )

    canonical_permissions = get_permissions_for_role(membership.role)
    # Include both canonical permissions and legacy tokens for backward compatibility
    all_effective_permissions = set(canonical_permissions)
    for legacy_token, mapped_perm in LEGACY_PERMISSION_MAP.items():
        if mapped_perm in canonical_permissions:
            all_effective_permissions.add(legacy_token)

    return TenantContext(
        organization_id=organization_id,
        user=current_user,
        membership=membership,
        role=membership.role,
        permissions=all_effective_permissions,
    )


def require_permission(permission: str) -> Callable:
    def dependency(
        tenant: TenantContext = Depends(get_tenant_context),
        db: Session = Depends(get_db),
    ) -> TenantContext:
        canonical = LEGACY_PERMISSION_MAP.get(permission, permission)
        if permission not in tenant.permissions and canonical not in tenant.permissions:
            record_audit_event(
                db=db,
                action="auth.permission_denied",
                resource_type="permission",
                result=AuditResult.DENIED,
                organization_id=tenant.organization_id,
                actor_id=tenant.user.id,
                actor_email=tenant.user.email,
                resource_id=permission,
                details={"role": tenant.role, "required_permission": permission},
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission} required",
            )
        return tenant

    return dependency


def get_project_context(
    organization_id: uuid.UUID,
    project_id: uuid.UUID,
    tenant: TenantContext = Depends(get_tenant_context),
    db: Session = Depends(get_db),
) -> ProjectContext:
    """
    Project-level access verification:
    1. Enforces tenant boundary (project must belong to tenant.organization_id, else 404).
    2. Enforces project access:
       - 'owner' and 'admin' roles have access to all projects in the organization.
       - 'data_scientist', 'analyst', 'viewer', 'security_auditor' must be explicitly assigned
         in project_memberships or be the project's creator/owner.
    """
    project = db.scalar(
        select(Project).where(
            Project.id == project_id,
            Project.organization_id == tenant.organization_id,
        )
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    # Org-level admins and owners have universal project access within their tenant
    if tenant.role in {Role.OWNER.value, Role.ADMIN.value}:
        return ProjectContext(project_id=project_id, project=project, tenant=tenant)

    # Check project creator / designated owner
    if project.owner_user_id == tenant.user.id:
        return ProjectContext(project_id=project_id, project=project, tenant=tenant)

    # Check project membership table
    is_project_member = db.scalar(
        select(ProjectMembership).where(
            ProjectMembership.project_id == project_id,
            ProjectMembership.user_id == tenant.user.id,
        )
    )
    if not is_project_member:
        record_audit_event(
            db=db,
            action="auth.project_access_denied",
            resource_type="project",
            result=AuditResult.DENIED,
            organization_id=tenant.organization_id,
            actor_id=tenant.user.id,
            actor_email=tenant.user.email,
            resource_id=str(project_id),
            details={"role": tenant.role, "reason": "not_assigned_to_project"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You are not assigned to this project",
        )

    return ProjectContext(project_id=project_id, project=project, tenant=tenant)


def require_project_permission(permission: str) -> Callable:
    """Verify both project-level access and required action permission."""
    def dependency(
        project_context: ProjectContext = Depends(get_project_context),
        db: Session = Depends(get_db),
    ) -> ProjectContext:
        canonical = LEGACY_PERMISSION_MAP.get(permission, permission)
        tenant = project_context.tenant
        if permission not in tenant.permissions and canonical not in tenant.permissions:
            record_audit_event(
                db=db,
                action="auth.permission_denied",
                resource_type="permission",
                result=AuditResult.DENIED,
                organization_id=tenant.organization_id,
                actor_id=tenant.user.id,
                actor_email=tenant.user.email,
                resource_id=permission,
                details={
                    "project_id": str(project_context.project_id),
                    "role": tenant.role,
                    "required_permission": permission,
                },
            )
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission} required",
            )
        return project_context

    return dependency
