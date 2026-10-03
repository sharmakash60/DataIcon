"""0012 problem formulations and business requirement extensions

Revision ID: 0012_problem_formulations
Revises: 0011_project_memberships
Create Date: 2026-09-29
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0012_problem_formulations"
down_revision = "0011_project_memberships"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new columns to business_requirements
    op.add_column("business_requirements", sa.Column("cost_of_false_positives", sa.Text(), nullable=True))
    op.add_column("business_requirements", sa.Column("cost_of_false_negatives", sa.Text(), nullable=True))
    op.add_column("business_requirements", sa.Column("expected_prediction_frequency", sa.String(length=64), nullable=True))
    op.add_column("business_requirements", sa.Column("business_priority", sa.String(length=255), nullable=True))
    op.add_column("business_requirements", sa.Column("missing_requirements", sa.Text(), server_default="[]", nullable=False))

    # 2. Create problem_formulations table
    op.create_table(
        "problem_formulations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("version", sa.Integer(), nullable=False),
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
            "requirement_id",
            sa.Uuid(),
            sa.ForeignKey("business_requirements.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("business_objective", sa.Text(), nullable=False),
        sa.Column("ml_objective", sa.Text(), nullable=False),
        sa.Column("target", sa.String(length=160), nullable=False),
        sa.Column("prediction_horizon", sa.String(length=160), nullable=True),
        sa.Column("candidate_problem_type", sa.String(length=64), nullable=False),
        sa.Column("primary_metric", sa.String(length=64), nullable=False),
        sa.Column("secondary_metrics", sa.Text(), server_default="[]", nullable=False),
        sa.Column("business_constraints", sa.Text(), server_default="[]", nullable=False),
        sa.Column("cost_of_false_positives", sa.Text(), nullable=True),
        sa.Column("cost_of_false_negatives", sa.Text(), nullable=True),
        sa.Column("expected_prediction_frequency", sa.String(length=64), nullable=True),
        sa.Column("business_priority", sa.String(length=255), nullable=True),
        sa.Column("assumptions", sa.Text(), server_default="[]", nullable=False),
        sa.Column("status", sa.String(length=32), server_default="active", nullable=False),
        sa.Column(
            "confirmed_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("project_id", "version", name="uq_problem_formulations_project_version"),
        sa.CheckConstraint("length(trim(business_objective)) > 0", name="ck_problem_formulations_objective"),
    )
    op.create_index("ix_problem_formulations_organization_id", "problem_formulations", ["organization_id"])
    op.create_index("ix_problem_formulations_project_id", "problem_formulations", ["project_id"])
    op.create_index("ix_problem_formulations_requirement_id", "problem_formulations", ["requirement_id"])


def downgrade() -> None:
    op.drop_index("ix_problem_formulations_requirement_id", table_name="problem_formulations")
    op.drop_index("ix_problem_formulations_project_id", table_name="problem_formulations")
    op.drop_index("ix_problem_formulations_organization_id", table_name="problem_formulations")
    op.drop_table("problem_formulations")

    op.drop_column("business_requirements", "missing_requirements")
    op.drop_column("business_requirements", "business_priority")
    op.drop_column("business_requirements", "expected_prediction_frequency")
    op.drop_column("business_requirements", "cost_of_false_negatives")
    op.drop_column("business_requirements", "cost_of_false_positives")
