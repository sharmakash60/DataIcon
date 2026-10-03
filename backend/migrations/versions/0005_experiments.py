"""AutoML experiments, model runs, and hyperparameter trials tables."""

import sqlalchemy as sa
from alembic import op

revision = "0005_experiments"
down_revision = "0004_business_requirements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Experiments
    op.create_table(
        "experiments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("problem_type", sa.String(64), nullable=False),
        sa.Column("target_name", sa.String(160), nullable=False),
        sa.Column("primary_metric", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), server_default="completed", nullable=False),
        sa.Column("best_model_name", sa.String(160), nullable=True),
        sa.Column("best_score", sa.Float(), nullable=True),
        sa.Column("baseline_score", sa.Float(), nullable=True),
        sa.Column("n_samples", sa.Integer(), nullable=True),
        sa.Column("n_features", sa.Integer(), nullable=True),
        sa.Column("total_execution_time_seconds", sa.Float(), nullable=True),
        sa.Column("metadata_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
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
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_experiments_name"),
    )
    op.create_index("ix_experiments_organization_id", "experiments", ["organization_id"])
    op.create_index("ix_experiments_project_id", "experiments", ["project_id"])
    op.create_index("ix_experiments_created_by_user_id", "experiments", ["created_by_user_id"])

    # 2. Experiment Runs
    op.create_table(
        "experiment_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("model_name", sa.String(160), nullable=False),
        sa.Column("algorithm_key", sa.String(64), nullable=False),
        sa.Column("is_baseline", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("mean_cv_score", sa.Float(), nullable=False),
        sa.Column("std_cv_score", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("training_time_seconds", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("inference_latency_ms", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("hyperparameters_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("metrics_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("cv_scores_json", sa.Text(), server_default="[]", nullable=False),
        sa.Column("status", sa.String(32), server_default="completed", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_experiment_runs_organization_id", "experiment_runs", ["organization_id"])
    op.create_index("ix_experiment_runs_experiment_id", "experiment_runs", ["experiment_id"])

    # 3. Experiment Trials (Optuna)
    op.create_table(
        "experiment_trials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("experiment_id", sa.Uuid(), nullable=False),
        sa.Column("trial_number", sa.Integer(), nullable=False),
        sa.Column("model_name", sa.String(160), nullable=False),
        sa.Column("parameters_json", sa.Text(), server_default="{}", nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("state", sa.String(32), server_default="COMPLETE", nullable=False),
        sa.Column("duration_seconds", sa.Float(), server_default="0.0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_experiment_trials_organization_id", "experiment_trials", ["organization_id"])
    op.create_index("ix_experiment_trials_experiment_id", "experiment_trials", ["experiment_id"])


def downgrade() -> None:
    op.drop_table("experiment_trials")
    op.drop_table("experiment_runs")
    op.drop_table("experiments")
