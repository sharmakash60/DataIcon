import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.dependencies import TenantContext, require_permission
from app.db import get_db
from app.models import AuditEvent
from app.schemas.common import PaginatedResponse

router = APIRouter(prefix="/api/v1/organizations/{organization_id}/audit-events", tags=["audit"])


class AuditEventOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID | None
    actor_id: uuid.UUID | None
    actor_email: str | None
    action: str
    resource_type: str
    resource_id: str | None
    result: str
    source_ip: str | None
    details: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=PaginatedResponse[AuditEventOut])
def list_audit_events(
    tenant: TenantContext = Depends(require_permission("audit:read")),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> PaginatedResponse[AuditEventOut]:
    query = (
        select(AuditEvent)
        .where(AuditEvent.organization_id == tenant.organization_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    count_query = (
        select(func.count())
        .select_from(AuditEvent)
        .where(AuditEvent.organization_id == tenant.organization_id)
    )

    total = db.scalar(count_query) or 0
    events = db.scalars(query).all()

    return PaginatedResponse(
        items=[AuditEventOut.model_validate(e) for e in events],
        total=total,
        limit=limit,
        offset=offset,
    )
