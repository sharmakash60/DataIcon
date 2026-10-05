import hashlib
import logging

from redis import Redis
from redis.exceptions import RedisError

from app.config import Settings

logger = logging.getLogger(__name__)


def get_login_attempt_key(email: str) -> str:
    normalized = email.strip().lower()
    email_hash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"datapilot:login_attempts:{email_hash}"


def is_login_locked(cache: Redis | None, email: str, settings: Settings) -> bool:
    """Check if the email has exceeded maximum allowed failed attempts."""
    if cache is None:
        return False
    try:
        key = get_login_attempt_key(email)
        attempts = cache.get(key)
        if attempts is not None and int(attempts) >= settings.max_login_attempts:
            return True
        return False
    except (RedisError, OSError) as exc:
        logger.debug("Throttling cache check failed: %s", exc)
        return False


def record_failed_login(cache: Redis | None, email: str, settings: Settings) -> int:
    """Record a failed login attempt and set/refresh TTL."""
    if cache is None:
        return 1
    try:
        key = get_login_attempt_key(email)
        pipe = cache.pipeline()
        pipe.incr(key)
        pipe.expire(key, settings.lockout_duration_seconds)
        results = pipe.execute()
        return int(results[0])
    except (RedisError, OSError) as exc:
        logger.debug("Throttling record failure failed: %s", exc)
        return 1


def clear_failed_logins(cache: Redis | None, email: str) -> None:
    """Clear failed login attempts upon successful authentication."""
    if cache is None:
        return
    try:
        key = get_login_attempt_key(email)
        cache.delete(key)
    except (RedisError, OSError) as exc:
        logger.debug("Throttling clear failed: %s", exc)
