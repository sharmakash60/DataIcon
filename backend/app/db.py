from collections.abc import Generator

from fastapi import Request
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session

from app.config import Settings


class Base(DeclarativeBase):
    pass


def build_engine(settings: Settings):
    return create_engine(
        str(settings.database_url),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_timeout=settings.dependency_timeout_seconds,
        connect_args={
            "connect_timeout": settings.dependency_timeout_seconds,
            "options": f"-c statement_timeout={settings.dependency_timeout_seconds * 1000}",
        },
    )


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
