"""Add experiment management system fields to experiments table."""

import sqlalchemy as sa
from alembic import op

revision = "0006_experiment_management"
down_revision = "0005_experiments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("experiments", sa.Column("dataset_version", sa.String(64), server_default="v1.0", nullable=False))
    op.add_column("experiments", sa.Column("dataset_fingerprint", sa.String(128), server_default="unknown", nullable=False))
    op.add_column("experiments", sa.Column("problem_formulation_json", sa.Text(), server_default="{}", nullable=False))
    op.add_column("experiments", sa.Column("preprocessing_config_json", sa.Text(), server_default="{}", nullable=False))
    op.add_column("experiments", sa.Column("feature_config_json", sa.Text(), server_default="{}", nullable=False))
    op.add_column("experiments", sa.Column("model_name", sa.String(160), server_default="Model", nullable=False))
    op.add_column("experiments", sa.Column("hyperparameters_json", sa.Text(), server_default="{}", nullable=False))
    op.add_column("experiments", sa.Column("validation_strategy", sa.String(160), server_default="5-fold StratifiedKFold", nullable=False))
    op.add_column("experiments", sa.Column("metrics_json", sa.Text(), server_default="{}", nullable=False))
    op.add_column("experiments", sa.Column("training_duration_seconds", sa.Float(), server_default="0.0", nullable=False))
    op.add_column("experiments", sa.Column("environment_info_json", sa.Text(), server_default="{}", nullable=False))
    op.add_column("experiments", sa.Column("random_seed", sa.Integer(), server_default="42", nullable=False))
    op.add_column("experiments", sa.Column("artifact_reference", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("experiments", "artifact_reference")
    op.drop_column("experiments", "random_seed")
    op.drop_column("experiments", "environment_info_json")
    op.drop_column("experiments", "training_duration_seconds")
    op.drop_column("experiments", "metrics_json")
    op.drop_column("experiments", "validation_strategy")
    op.drop_column("experiments", "hyperparameters_json")
    op.drop_column("experiments", "model_name")
    op.drop_column("experiments", "feature_config_json")
    op.drop_column("experiments", "preprocessing_config_json")
    op.drop_column("experiments", "problem_formulation_json")
    op.drop_column("experiments", "dataset_fingerprint")
    op.drop_column("experiments", "dataset_version")
