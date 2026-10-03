"""0010 model monitoring and alerts tables

Revision ID: 0010_model_monitoring
Revises: 0009_model_deployments
Create Date: 2026-09-26
"""
from __future__ import annotations
from alembic import op
import sqlalchemy as sa

revision = "0010_model_monitoring"
down_revision = "0009_model_deployments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. monitoring_snapshots table
    op.create_table(
        "monitoring_snapshots",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("deployment_id", sa.Uuid(), sa.ForeignKey("model_deployments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("period_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("total_requests", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("throughput_rps", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_rate", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("latency_p50_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("latency_p95_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("latency_p99_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("data_drift_score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("data_drift_detected", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("metrics_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("prediction_distribution_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("feature_drift_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_monitoring_snapshots_org", "monitoring_snapshots", ["organization_id"])
    op.create_index("ix_monitoring_snapshots_proj", "monitoring_snapshots", ["project_id"])
    op.create_index("ix_monitoring_snapshots_dep", "monitoring_snapshots", ["deployment_id"])
    op.create_index("ix_monitoring_snapshots_created", "monitoring_snapshots", ["created_at"])

    # 2. monitoring_alerts table
    op.create_table(
        "monitoring_alerts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organization_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("deployment_id", sa.Uuid(), sa.ForeignKey("model_deployments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("snapshot_id", sa.Uuid(), sa.ForeignKey("monitoring_snapshots.id", ondelete="SET NULL"), nullable=True),
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(50), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("feature_name", sa.String(255), nullable=True),
        sa.Column("metric_name", sa.String(100), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("current_value", sa.Float(), nullable=False),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_monitoring_alerts_org", "monitoring_alerts", ["organization_id"])
    op.create_index("ix_monitoring_alerts_proj", "monitoring_alerts", ["project_id"])
    op.create_index("ix_monitoring_alerts_dep", "monitoring_alerts", ["deployment_id"])
    op.create_index("ix_monitoring_alerts_type", "monitoring_alerts", ["alert_type"])
    op.create_index("ix_monitoring_alerts_resolved", "monitoring_alerts", ["is_resolved"])
    op.create_index("ix_monitoring_alerts_severity", "monitoring_alerts", ["severity"])


def downgrade() -> None:
    op.drop_index("ix_monitoring_alerts_severity", "monitoring_alerts")
    op.drop_index("ix_monitoring_alerts_resolved", "monitoring_alerts")
    op.drop_index("ix_monitoring_alerts_type", "monitoring_alerts")
    op.drop_index("ix_monitoring_alerts_dep", "monitoring_alerts")
    op.drop_index("ix_monitoring_alerts_proj", "monitoring_alerts")
    op.drop_index("ix_monitoring_alerts_org", "monitoring_alerts")
    op.drop_table("monitoring_alerts")

    op.drop_index("ix_monitoring_snapshots_created", "monitoring_snapshots")
    op.drop_index("ix_monitoring_snapshots_dep", "monitoring_snapshots")
    op.drop_index("ix_monitoring_snapshots_proj", "monitoring_snapshots")
    op.drop_index("ix_monitoring_snapshots_org", "monitoring_snapshots")
    op.drop_table("monitoring_snapshots")
