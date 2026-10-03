import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from redis import Redis
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import Settings
from app.main import create_app
from app.models import Organization

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(os.getenv("RUN_INTEGRATION") != "1", reason="Set RUN_INTEGRATION=1"),
]


@pytest.fixture
def isolated_database():
    """Migration rollback tests touch only a freshly created, unique test database."""
    settings = Settings()
    base_url = make_url(str(settings.database_url))
    name = f"datapilot_test_{uuid.uuid4().hex}"
    admin = create_engine(base_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.exec_driver_sql(f'CREATE DATABASE "{name}"')
    url = base_url.set(database=name)
    engine = create_engine(url)
    try:
        yield engine, url.render_as_string(hide_password=False)
    finally:
        engine.dispose()
        with admin.connect() as connection:
            connection.exec_driver_sql(f'DROP DATABASE "{name}" WITH (FORCE)')
        admin.dispose()


def migrate(engine, action: str, target: str = "head"):
    config = Config(str(Path(__file__).resolve().parents[2] / "backend" / "alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        if action == "check":
            command.check(config)
        else:
            getattr(command, action)(config, target)


def test_migration_roundtrip_and_real_sqlalchemy_persistence(isolated_database):
    engine, _ = isolated_database
    migrate(engine, "upgrade")
    migrate(engine, "upgrade")  # repeated startup is safe
    migrate(engine, "check")  # metadata matches the actual migration
    with Session(engine) as session:
        organization = Organization(name="DataPilot integration test")
        session.add(organization)
        session.commit()
        session.refresh(organization)
        assert isinstance(organization.id, uuid.UUID)
        assert organization.created_at.tzinfo is not None
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM organizations")).scalar_one() == 1
    migrate(engine, "downgrade", "base")
    assert "organizations" not in inspect(engine).get_table_names()
    migrate(engine, "upgrade")
    assert "organizations" in inspect(engine).get_table_names()


def test_readiness_requires_migrations_and_real_redis(isolated_database):
    engine, url = isolated_database
    settings = Settings(database_url=url)
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["checks"] == {
            "postgresql": "ok",
            "redis": "ok",
            "migrations": "error",
        }
        migrate(engine, "upgrade")
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 200
        assert response.json()["checks"] == {"postgresql": "ok", "redis": "ok", "migrations": "ok"}


def test_real_redis_write_read_and_cleanup():
    cache = Redis.from_url(str(Settings().redis_url), decode_responses=True)
    key = f"datapilot:test:{uuid.uuid4().hex}"
    try:
        assert cache.ping()
        assert cache.set(key, "connected", ex=30)
        assert cache.get(key) == "connected"
    finally:
        cache.delete(key)
        cache.close()
