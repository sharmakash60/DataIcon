"""0008 senior data scientist reports table

Revision ID: 0008_senior_ds_reports
Revises: 0007_explainability_reports
Create Date: 2026-09-26
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0008_senior_ds_reports"
down_revision = "0007_explainability_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "senior_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), sa.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("executive_summary", sa.Text(), nullable=False),
        sa.Column("sections_json", sa.Text(), nullable=False),
        sa.Column("markdown_content", sa.Text(), nullable=False),
        sa.Column("verified_artifacts_json", sa.Text(), nullable=False),
        sa.Column("has_ai_synthesis", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("provenance_verified", sa.Boolean(), nullable=False, server_default=sa.text("TRUE")),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("provenance_verified = TRUE", name="ck_senior_report_provenance_verified"),
    )
    op.create_index("ix_senior_reports_org", "senior_reports", ["organization_id"])
    op.create_index("ix_senior_reports_proj", "senior_reports", ["project_id"])
    op.create_index("ix_senior_reports_exp", "senior_reports", ["experiment_id"])
    op.create_index("ix_senior_reports_user", "senior_reports", ["created_by_user_id"])


def downgrade() -> None:
    op.drop_index("ix_senior_reports_user", "senior_reports")
    op.drop_index("ix_senior_reports_exp", "senior_reports")
    op.drop_index("ix_senior_reports_proj", "senior_reports")
    op.drop_index("ix_senior_reports_org", "senior_reports")
    op.drop_table("senior_reports")
