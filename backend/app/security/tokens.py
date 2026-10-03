import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from app.config import Settings


def create_access_token(user_id: uuid.UUID, settings: Settings) -> str:
    """Create a short-lived signed JWT access token."""
    now = datetime.now(UTC)
    expire = now + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str, settings: Settings) -> dict:
    """Decode and validate a signed JWT access token."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["sub", "exp", "iat"]},
        )
        if payload.get("type") != "access":
            raise ValueError("Invalid token type")
        return payload
    except jwt.PyJWTError as exc:
        raise ValueError(f"Invalid access token: {exc}") from exc


def generate_refresh_token(settings: Settings) -> tuple[str, str, datetime]:
    """
    Generate a cryptographically secure random refresh token.
    Returns: (raw_token, token_hash, expires_at)
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_refresh_token(raw_token)
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    return raw_token, token_hash, expires_at


def hash_refresh_token(raw_token: str) -> str:
    """Compute SHA-256 hash of a raw refresh token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
