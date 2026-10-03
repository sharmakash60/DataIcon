"""0007 explainability reports table

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0007_explainability_reports"
down_revision = "0006_experiment_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "explainability_reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), sa.ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("experiment_run_id", sa.Uuid(), sa.ForeignKey("experiment_runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("schema_version", sa.String(32), nullable=False),
        sa.Column("model_name", sa.String(160), nullable=False),
        sa.Column("problem_type", sa.String(64), nullable=False),
        sa.Column("target_name", sa.String(160), nullable=False),
        sa.Column("primary_metric", sa.String(64), nullable=False),
        sa.Column("primary_metric_value", sa.Float(), nullable=False),
        sa.Column("n_eval_samples", sa.Integer(), nullable=False),
        sa.Column("explained_at", sa.String(64), nullable=False),
        sa.Column("global_shap_json", sa.Text(), nullable=True),
        sa.Column("permutation_importance_json", sa.Text(), nullable=True),
        sa.Column("local_explanations_json", sa.Text(), nullable=True),
        sa.Column("error_analysis_json", sa.Text(), nullable=True),
        sa.Column("ai_narrative_json", sa.Text(), nullable=True),
        sa.Column("user_assumptions_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("provenance_verified", sa.Boolean(), nullable=False, server_default="TRUE"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("provenance_verified = TRUE", name="ck_explainability_provenance_verified"),
    )
    op.create_index("ix_expl_org", "explainability_reports", ["organization_id"])
    op.create_index("ix_expl_proj", "explainability_reports", ["project_id"])
    op.create_index("ix_expl_exp", "explainability_reports", ["experiment_id"])
    op.create_index("ix_expl_run", "explainability_reports", ["experiment_run_id"])


def downgrade() -> None:
    op.drop_index("ix_expl_run", "explainability_reports")
    op.drop_index("ix_expl_exp", "explainability_reports")
    op.drop_index("ix_expl_proj", "explainability_reports")
    op.drop_index("ix_expl_org", "explainability_reports")
    op.drop_table("explainability_reports")
