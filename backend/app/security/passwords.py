import re

import bcrypt


def hash_password(password: str) -> str:
    """Hash a password securely using bcrypt with adaptive salt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash in constant time."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def validate_password_strength(password: str) -> str | None:
    """
    Validate password complexity:
    - At least 8 characters, maximum 128 characters
    - Must contain at least one digit or special symbol
    """
    if len(password) < 8:
        return "Password must be at least 8 characters long."
    if len(password) > 128:
        return "Password cannot exceed 128 characters."
    if not re.search(r"[\d\W_]", password):
        return "Password must contain at least one number or special character."
    return None
