"""Business requirements: business_requirements table for problem formulation."""

import sqlalchemy as sa
from alembic import op

revision = "0004_business_requirements"
down_revision = "0003_agent_protocol_datasets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "business_requirements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("natural_language_input", sa.Text(), nullable=False),
        sa.Column("business_objective", sa.Text(), nullable=False),
        sa.Column("prediction_objective", sa.Text(), nullable=False),
        sa.Column("target_name", sa.String(160), nullable=False),
        sa.Column("prediction_horizon", sa.String(160), nullable=True),
        sa.Column("ml_problem_type", sa.String(64), nullable=False),
        sa.Column("primary_metric", sa.String(64), nullable=False),
        sa.Column("secondary_metrics", sa.Text(), server_default="[]", nullable=False),
        sa.Column("business_constraints", sa.Text(), server_default="[]", nullable=False),
        sa.Column("suggested_positive_class", sa.String(160), nullable=True),
        sa.Column("confidence_score", sa.Float(), server_default="1.0", nullable=False),
        sa.Column("assumptions", sa.Text(), server_default="[]", nullable=False),
        sa.Column("status", sa.String(32), server_default="draft", nullable=False),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["organizations.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by_user_id"],
            ["users.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "length(trim(business_objective)) > 0",
            name="ck_business_requirements_objective",
        ),
    )
    op.create_index(
        "ix_business_requirements_organization_id",
        "business_requirements",
        ["organization_id"],
    )
    op.create_index(
        "ix_business_requirements_project_id",
        "business_requirements",
        ["project_id"],
    )
    op.create_index(
        "ix_business_requirements_created_by_user_id",
        "business_requirements",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_business_requirements_reviewed_by_user_id",
        "business_requirements",
        ["reviewed_by_user_id"],
    )


def downgrade() -> None:
    op.drop_table("business_requirements")
