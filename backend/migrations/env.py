from alembic import context

import app.models  # noqa: F401 - register model metadata
from app.config import Settings
from app.db import Base, build_engine

config = context.config
target_metadata = Base.metadata


def run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=str(Settings().database_url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
elif config.attributes.get("connection") is not None:
    run_migrations(config.attributes["connection"])
else:
    engine = build_engine(Settings())
    try:
        with engine.connect() as connection:
            run_migrations(connection)
    finally:
        engine.dispose()
