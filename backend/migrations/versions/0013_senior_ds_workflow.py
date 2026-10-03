"""0013 senior data scientist workflow

Revision ID: 0013_senior_ds_workflow
Revises: 0012_problem_formulations
Create Date: 2026-09-29
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0013_senior_ds_workflow"
down_revision = "0012_problem_formulations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_workflows",
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
        sa.Column("execution_mode", sa.String(length=32), server_default="assisted", nullable=False),
        sa.Column("current_stage_key", sa.String(length=64), server_default="business_understanding", nullable=False),
        sa.Column("current_stage_index", sa.Integer(), server_default="1", nullable=False),
        sa.Column("stages_state_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("user_overrides_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "project_id", name="uq_project_workflows_org_project"),
    )
    op.create_index("ix_project_workflows_org", "project_workflows", ["organization_id"])
    op.create_index("ix_project_workflows_proj", "project_workflows", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_project_workflows_proj", table_name="project_workflows")
    op.drop_index("ix_project_workflows_org", table_name="project_workflows")
    op.drop_table("project_workflows")
