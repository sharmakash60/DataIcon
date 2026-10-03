"""0009 model deployments table

Revision ID: 0009_model_deployments
Revises: 0008_senior_ds_reports
Create Date: 2026-09-26
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0009_model_deployments"
down_revision = "0008_senior_ds_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_deployments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), sa.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("model_name", sa.String(255), nullable=False),
        sa.Column("model_version", sa.String(50), nullable=False, server_default="v1.0.0"),
        sa.Column("deployment_type", sa.String(50), nullable=False),
        sa.Column("endpoint_url", sa.String(512), nullable=False, server_default="http://localhost:8080"),
        sa.Column("prediction_path", sa.String(128), nullable=False, server_default="/predict"),
        sa.Column("status", sa.String(50), nullable=False, server_default="pending_approval"),
        sa.Column("problem_type", sa.String(50), nullable=False, server_default="classification"),
        sa.Column("target_name", sa.String(255), nullable=False, server_default="target"),
        sa.Column("primary_metric", sa.String(100), nullable=False, server_default="accuracy"),
        sa.Column("input_schema_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("auth_token_hash", sa.String(255), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("approved_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_model_deployments_org", "model_deployments", ["organization_id"])
    op.create_index("ix_model_deployments_proj", "model_deployments", ["project_id"])
    op.create_index("ix_model_deployments_exp", "model_deployments", ["experiment_id"])
    op.create_index("ix_model_deployments_status", "model_deployments", ["status"])
    op.create_index("ix_model_deployments_user", "model_deployments", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_model_deployments_user", "model_deployments")
    op.drop_index("ix_model_deployments_status", "model_deployments")
    op.drop_index("ix_model_deployments_exp", "model_deployments")
    op.drop_index("ix_model_deployments_proj", "model_deployments")
    op.drop_index("ix_model_deployments_org", "model_deployments")
    op.drop_table("model_deployments")
