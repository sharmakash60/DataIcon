import logging
from collections.abc import Generator
from pathlib import Path

from fastapi import Request
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session

from app.config import Settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


def build_engine(settings: Settings):
    db_url = str(settings.database_url)
    if db_url.startswith("sqlite"):
        eng = create_engine(db_url, connect_args={"check_same_thread": False})
        Base.metadata.create_all(eng)
        return eng

    try:
        eng = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=5,
            pool_timeout=settings.dependency_timeout_seconds,
            connect_args={
                "connect_timeout": settings.dependency_timeout_seconds,
                "options": f"-c statement_timeout={settings.dependency_timeout_seconds * 1000}",
            },
        )
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return eng
    except Exception as exc:
        logger.warning(
            "PostgreSQL connection failed (%s). Falling back to local SQLite database for development.",
            exc,
        )
        sqlite_path = Path(__file__).resolve().parents[2] / "datapilot_local.db"
        fallback_eng = create_engine(
            f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(fallback_eng)
        return fallback_eng


def get_db(request: Request) -> Generator[Session, None, None]:
    engine = getattr(request.app.state, "engine", None)
    own_engine = False
    if engine is None:
        engine = build_engine(Settings())
        own_engine = True

    with Session(engine) as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            if own_engine:
                engine.dispose()
