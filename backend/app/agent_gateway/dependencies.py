import hashlib
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Agent, AgentCredential

agent_security_scheme = HTTPBearer(auto_error=False)


def get_current_agent(
    credentials: HTTPAuthorizationCredentials | None = Depends(agent_security_scheme),
    db: Session = Depends(get_db),
) -> Agent:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid agent credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    raw_token = credentials.credentials
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    now = datetime.now(UTC)

    cred = db.scalar(
        select(AgentCredential).where(
            AgentCredential.token_hash == token_hash,
            AgentCredential.revoked_at.is_(None),
            AgentCredential.expires_at > now,
        )
    )
    if not cred:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or revoked agent credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    agent = db.scalar(select(Agent).where(Agent.id == cred.agent_id, Agent.status == "active"))
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Agent is deactivated or not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return agent
