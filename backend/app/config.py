from pathlib import Path

from pydantic import Field, PostgresDsn, RedisDsn, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    app_name: str = "DataPilot"
    database_url: PostgresDsn = (
        "postgresql+psycopg://datapilot:datapilot_dev_only@127.0.0.1:15432/datapilot"
    )
    redis_url: RedisDsn = "redis://127.0.0.1:16379/0"
    dependency_timeout_seconds: int = Field(default=2, ge=1, le=10)

    environment: str = "development"

    # Authentication & Security
    jwt_secret: str = "datapilot-phase1-dev-secret-key-32-chars-minimum-entropy"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = Field(default=15, ge=1, le=1440)
    refresh_token_expire_days: int = Field(default=7, ge=1, le=90)
    max_login_attempts: int = Field(default=5, ge=1, le=50)
    lockout_duration_seconds: int = Field(default=300, ge=10, le=86400)

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        env = self.environment.lower().strip()
        if env not in ("development", "test", "testing", "dev"):
            default_jwt = "datapilot-phase1-dev-secret-key-32-chars-minimum-entropy"
            if self.jwt_secret == default_jwt or len(self.jwt_secret) < 32:
                raise ValueError(
                    "FATAL [SEC-01]: JWT_SECRET must be explicitly configured and cannot use the default development key in production."
                )
            if "datapilot_dev_only" in str(self.database_url):
                raise ValueError(
                    "FATAL [AUTH-01]: DATABASE_URL cannot contain the development fallback password in production."
                )
        return self

    # External LLM Settings (optional - supports No-LLM mode)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None

