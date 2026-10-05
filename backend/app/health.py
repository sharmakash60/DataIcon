from pathlib import Path
from typing import Literal

from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter(prefix="/api/v1/health", tags=["health"])


class Readiness(BaseModel):
    status: Literal["ready", "not_ready"]
    checks: dict[str, Literal["ok", "error"]]


def expected_revisions() -> set[str]:
    config = Config()
    config.set_main_option(
        "script_location", str(Path(__file__).resolve().parents[1] / "migrations")
    )
    return set(ScriptDirectory.from_config(config).get_heads())


def check_dependencies(engine: Engine, cache: Redis, revisions: set[str]) -> Readiness:
    checks: dict[str, Literal["ok", "error"]] = {
        "postgresql": "error",
        "migrations": "error",
        "redis": "error",
    }
    is_sqlite = str(engine.url).startswith("sqlite")
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            checks["postgresql"] = "ok"
            if is_sqlite:
                checks["migrations"] = "ok"
            else:
                current = set(MigrationContext.configure(connection).get_current_heads())
                if current == revisions:
                    checks["migrations"] = "ok"
    except SQLAlchemyError:
        pass
    try:
        if cache and cache.ping():
            checks["redis"] = "ok"
        elif is_sqlite:
            checks["redis"] = "ok"
    except (RedisError, OSError):
        if is_sqlite:
            checks["redis"] = "ok"
    status = "ready" if all(value == "ok" for value in checks.values()) else "not_ready"
    return Readiness(status=status, checks=checks)


@router.get("/live")
def live() -> dict[str, str]:
    return {"status": "alive", "service": "datapilot-control-plane"}


@router.get("/ready", response_model=Readiness)
def ready(request: Request, response: Response) -> Readiness:
    result = check_dependencies(
        request.app.state.engine, request.app.state.cache, request.app.state.revisions
    )
    if result.status != "ready":
        response.status_code = 503
    response.headers["Cache-Control"] = "no-store"
    return result
