from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy.exc import OperationalError

from app.config import Settings
from app.main import create_app


def test_liveness_does_not_require_dependencies():
    with TestClient(create_app()) as client:
        assert client.get("/api/v1/health/live").json()["status"] == "alive"


def test_failed_dependencies_return_503_without_leaking_secrets():
    app = create_app()
    with TestClient(app) as client:
        engine, cache = app.state.engine, app.state.cache
        app.state.engine = MagicMock()
        app.state.engine.connect.side_effect = OperationalError(
            "secret-dsn", {}, Exception("secret")
        )
        app.state.cache = MagicMock()
        app.state.cache.ping.side_effect = RedisConnectionError("secret-password")
        try:
            response = client.get("/api/v1/health/ready")
            assert response.status_code == 503
            assert response.json() == {
                "status": "not_ready",
                "checks": {"postgresql": "error", "migrations": "error", "redis": "error"},
            }
            assert "secret" not in response.text
            assert response.headers["cache-control"] == "no-store"
        finally:
            app.state.engine, app.state.cache = engine, cache


@pytest.mark.parametrize("url", ["sqlite:///local.db", "https://example.com"])
def test_configuration_rejects_non_postgres_database(url):
    with pytest.raises(ValidationError):
        Settings(database_url=url, _env_file=None)
