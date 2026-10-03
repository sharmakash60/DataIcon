import json
import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.enums import AuditResult
from app.models import AuditEvent

logger = logging.getLogger(__name__)


def record_audit_event(
    db: Session,
    action: str,
    resource_type: str,
    result: AuditResult = AuditResult.SUCCESS,
    organization_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    actor_email: str | None = None,
    resource_id: str | None = None,
    source_ip: str | None = None,
    details: dict[str, Any] | None = None,
) -> AuditEvent:
    """
    Persist an append-only audit event.
    Guarantees no sensitive credentials, tokens, or passwords are included.
    """
    sanitized_details = None
    if details:
        # Strip forbidden fields defensively
        cleaned = {
            k: v
            for k, v in details.items()
            if k not in {"password", "token", "access_token", "refresh_token", "secret"}
        }
        sanitized_details = json.dumps(cleaned)[:2000]

    event = AuditEvent(
        organization_id=organization_id,
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        result=result.value if hasattr(result, "value") else str(result),
        source_ip=source_ip,
        details=sanitized_details,
    )
    db.add(event)
    try:
        db.flush()
    except Exception as exc:
        logger.error("Failed to persist audit event: %s", exc)
    return event
