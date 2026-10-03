"""0011 project memberships for project-level RBAC

Revision ID: 0011_project_memberships
Revises: 0010_model_monitoring
Create Date: 2026-09-29
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0011_project_memberships"
down_revision = "0010_model_monitoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organization_id",
            sa.Uuid(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "project_id",
            sa.Uuid(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_memberships_project_user"),
    )
    op.create_index(
        "ix_project_memberships_organization_id",
        "project_memberships",
        ["organization_id"],
    )
    op.create_index(
        "ix_project_memberships_project_id",
        "project_memberships",
        ["project_id"],
    )
    op.create_index(
        "ix_project_memberships_user_id",
        "project_memberships",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_project_memberships_user_id", table_name="project_memberships")
    op.drop_index("ix_project_memberships_project_id", table_name="project_memberships")
    op.drop_index("ix_project_memberships_organization_id", table_name="project_memberships")
    op.drop_table("project_memberships")
