"""Agent protocol and datasets: agents, enrollment tokens, credentials, datasets, agent_jobs, profile_summaries."""

import sqlalchemy as sa
from alembic import op

revision = "0003_agent_protocol_datasets"
down_revision = "0002_phase1_auth_projects"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. agents table
    op.create_table(
        "agents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("approved_name", sa.String(160), nullable=False),
        sa.Column("status", sa.String(32), server_default="active", nullable=False),
        sa.Column("runtime_version", sa.String(64), nullable=False),
        sa.Column("protocol_version", sa.String(32), server_default="1.0", nullable=False),
        sa.Column("capabilities", sa.Text(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agents_organization_id", "agents", ["organization_id"])

    # 2. agent_enrollment_tokens table
    op.create_table(
        "agent_enrollment_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_enrollment_tokens_organization_id",
        "agent_enrollment_tokens",
        ["organization_id"],
    )
    op.create_index(
        "ix_agent_enrollment_tokens_token_hash",
        "agent_enrollment_tokens",
        ["token_hash"],
        unique=True,
    )

    # 3. agent_credentials table
    op.create_table(
        "agent_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agent_credentials_agent_id", "agent_credentials", ["agent_id"], unique=True
    )
    op.create_index(
        "ix_agent_credentials_token_hash",
        "agent_credentials",
        ["token_hash"],
        unique=True,
    )

    # 4. datasets table
    op.create_table(
        "datasets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("opaque_local_ref", sa.String(128), nullable=False),
        sa.Column("approved_alias", sa.String(160), nullable=False),
        sa.Column("format", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), server_default="registered", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "project_id", "opaque_local_ref", name="uq_datasets_org_proj_ref"
        ),
    )
    op.create_index("ix_datasets_agent_id", "datasets", ["agent_id"])
    op.create_index("ix_datasets_opaque_local_ref", "datasets", ["opaque_local_ref"])
    op.create_index("ix_datasets_organization_id", "datasets", ["organization_id"])
    op.create_index("ix_datasets_project_id", "datasets", ["project_id"])

    # 5. agent_jobs table
    op.create_table(
        "agent_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("agent_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("operation", sa.String(64), nullable=False),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), server_default="queued", nullable=False),
        sa.Column("lease_token", sa.String(64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_jobs_agent_id", "agent_jobs", ["agent_id"])
    op.create_index("ix_agent_jobs_organization_id", "agent_jobs", ["organization_id"])
    op.create_index("ix_agent_jobs_project_id", "agent_jobs", ["project_id"])

    # 6. profile_summaries table
    op.create_table(
        "profile_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("dataset_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=True),
        sa.Column("total_rows", sa.Integer(), nullable=False),
        sa.Column("total_columns", sa.Integer(), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("permitted_payload", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["agent_jobs.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_profile_summaries_dataset_id", "profile_summaries", ["dataset_id"])
    op.create_index("ix_profile_summaries_job_id", "profile_summaries", ["job_id"])
    op.create_index(
        "ix_profile_summaries_organization_id", "profile_summaries", ["organization_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_profile_summaries_organization_id", table_name="profile_summaries")
    op.drop_index("ix_profile_summaries_job_id", table_name="profile_summaries")
    op.drop_index("ix_profile_summaries_dataset_id", table_name="profile_summaries")
    op.drop_table("profile_summaries")

    op.drop_index("ix_agent_jobs_project_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_organization_id", table_name="agent_jobs")
    op.drop_index("ix_agent_jobs_agent_id", table_name="agent_jobs")
    op.drop_table("agent_jobs")

    op.drop_index("ix_datasets_project_id", table_name="datasets")
    op.drop_index("ix_datasets_organization_id", table_name="datasets")
    op.drop_index("ix_datasets_opaque_local_ref", table_name="datasets")
    op.drop_index("ix_datasets_agent_id", table_name="datasets")
    op.drop_table("datasets")

    op.drop_index("ix_agent_credentials_token_hash", table_name="agent_credentials")
    op.drop_index("ix_agent_credentials_agent_id", table_name="agent_credentials")
    op.drop_table("agent_credentials")

    op.drop_index("ix_agent_enrollment_tokens_token_hash", table_name="agent_enrollment_tokens")
    op.drop_index(
        "ix_agent_enrollment_tokens_organization_id", table_name="agent_enrollment_tokens"
    )
    op.drop_table("agent_enrollment_tokens")

    op.drop_index("ix_agents_organization_id", table_name="agents")
    op.drop_table("agents")
