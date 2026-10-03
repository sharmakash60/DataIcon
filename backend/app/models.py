import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Float,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.enums import (
    MembershipStatus,
    OrgStatus,
    ProjectClassification,
    ProjectStatus,
    UserStatus,
)


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = (CheckConstraint("length(trim(name)) > 0", name="ck_organizations_name"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default=OrgStatus.ACTIVE.value, server_default="active", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    projects: Mapped[list["Project"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    agents: Mapped[list["Agent"]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("length(trim(email)) > 0", name="ck_users_email"),
        CheckConstraint("length(trim(display_name)) > 0", name="ck_users_display_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default=UserStatus.ACTIVE.value, server_default="active", nullable=False
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_memberships_org_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default=MembershipStatus.ACTIVE.value, server_default="active", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship(back_populates="memberships")
    user: Mapped["User"] = relationship(back_populates="memberships")


class Project(Base):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="ck_projects_name"),
        UniqueConstraint("organization_id", "name", name="uq_projects_org_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    purpose: Mapped[str | None] = mapped_column(String(500), nullable=True)
    classification: Mapped[str] = mapped_column(
        String(64),
        default=ProjectClassification.INTERNAL.value,
        server_default="internal",
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(32), default=ProjectStatus.ACTIVE.value, server_default="active", nullable=False
    )
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship(back_populates="projects")
    owner: Mapped["User | None"] = relationship()
    datasets: Mapped[list["Dataset"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    business_requirements: Mapped[list["BusinessRequirement"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    problem_formulations: Mapped[list["ProblemFormulation"]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="desc(ProblemFormulation.version)"
    )
    experiments: Mapped[list["Experiment"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    members: Mapped[list["ProjectMembership"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    workflow: Mapped["ProjectWorkflow | None"] = relationship(
        back_populates="project", uselist=False, cascade="all, delete-orphan"
    )


class ProjectMembership(Base):
    __tablename__ = "project_memberships"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_memberships_project_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship()


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    result: Mapped[str] = mapped_column(String(32), nullable=False)
    source_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    approved_name: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active", nullable=False)
    runtime_version: Mapped[str] = mapped_column(String(64), nullable=False)
    protocol_version: Mapped[str] = mapped_column(String(32), default="1.0", server_default="1.0", nullable=False)
    capabilities: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship(back_populates="agents")
    credentials: Mapped[list["AgentCredential"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
    jobs: Mapped[list["AgentJob"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )
    datasets: Mapped[list["Dataset"]] = relationship(
        back_populates="agent", cascade="all, delete-orphan"
    )


class AgentEnrollmentToken(Base):
    __tablename__ = "agent_enrollment_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AgentCredential(Base):
    __tablename__ = "agent_credentials"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), unique=True, index=True, nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    agent: Mapped["Agent"] = relationship(back_populates="credentials")


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        UniqueConstraint("organization_id", "project_id", "opaque_local_ref", name="uq_datasets_org_proj_ref"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    opaque_local_ref: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    approved_alias: Mapped[str] = mapped_column(String(160), nullable=False)
    format: Mapped[str] = mapped_column(String(32), nullable=False)  # csv, parquet, excel
    status: Mapped[str] = mapped_column(String(32), default="registered", server_default="registered", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="datasets")
    agent: Mapped["Agent"] = relationship(back_populates="datasets")
    profiles: Mapped[list["ProfileSummary"]] = relationship(
        back_populates="dataset", cascade="all, delete-orphan"
    )


class AgentJob(Base):
    __tablename__ = "agent_jobs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    agent_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    operation: Mapped[str] = mapped_column(String(64), nullable=False)  # profile_dataset
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", server_default="queued", nullable=False)
    lease_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    agent: Mapped["Agent"] = relationship(back_populates="jobs")


class ProfileSummary(Base):
    __tablename__ = "profile_summaries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("agent_jobs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False)
    total_columns: Mapped[int] = mapped_column(Integer, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    permitted_payload: Mapped[str] = mapped_column(Text, nullable=False)  # JSON string of permitted metadata
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    dataset: Mapped["Dataset"] = relationship(back_populates="profiles")


class BusinessRequirement(Base):
    __tablename__ = "business_requirements"
    __table_args__ = (
        CheckConstraint("length(trim(business_objective)) > 0", name="ck_business_requirements_objective"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    natural_language_input: Mapped[str] = mapped_column(Text, nullable=False)
    business_objective: Mapped[str] = mapped_column(Text, nullable=False)
    prediction_objective: Mapped[str] = mapped_column(Text, nullable=False)
    target_name: Mapped[str] = mapped_column(String(160), nullable=False)
    prediction_horizon: Mapped[str | None] = mapped_column(String(160), nullable=True)
    ml_problem_type: Mapped[str] = mapped_column(String(64), nullable=False)
    primary_metric: Mapped[str] = mapped_column(String(64), nullable=False)
    secondary_metrics: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    business_constraints: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    cost_of_false_positives: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_of_false_negatives: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_prediction_frequency: Mapped[str | None] = mapped_column(String(64), nullable=True)
    business_priority: Mapped[str | None] = mapped_column(String(255), nullable=True)
    suggested_positive_class: Mapped[str | None] = mapped_column(String(160), nullable=True)
    confidence_score: Mapped[float] = mapped_column(Float, default=1.0, server_default="1.0", nullable=False)
    assumptions: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    missing_requirements: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    status: Mapped[str] = mapped_column(String(32), default="draft", server_default="draft", nullable=False)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="business_requirements")
    formulations: Mapped[list["ProblemFormulation"]] = relationship(back_populates="requirement")


class ProblemFormulation(Base):
    __tablename__ = "problem_formulations"
    __table_args__ = (
        UniqueConstraint("project_id", "version", name="uq_problem_formulations_project_version"),
        CheckConstraint("length(trim(business_objective)) > 0", name="ck_problem_formulations_objective"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("business_requirements.id", ondelete="SET NULL"), nullable=True, index=True
    )
    business_objective: Mapped[str] = mapped_column(Text, nullable=False)
    ml_objective: Mapped[str] = mapped_column(Text, nullable=False)
    target: Mapped[str] = mapped_column(String(160), nullable=False)
    prediction_horizon: Mapped[str | None] = mapped_column(String(160), nullable=True)
    candidate_problem_type: Mapped[str] = mapped_column(String(64), nullable=False)
    primary_metric: Mapped[str] = mapped_column(String(64), nullable=False)
    secondary_metrics: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    business_constraints: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    cost_of_false_positives: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_of_false_negatives: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_prediction_frequency: Mapped[str | None] = mapped_column(String(64), nullable=True)
    business_priority: Mapped[str | None] = mapped_column(String(255), nullable=True)
    assumptions: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    status: Mapped[str] = mapped_column(String(32), default="active", server_default="active", nullable=False)
    confirmed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="problem_formulations")
    requirement: Mapped["BusinessRequirement | None"] = relationship(back_populates="formulations")


class Experiment(Base):
    __tablename__ = "experiments"
    __table_args__ = (
        CheckConstraint("length(trim(name)) > 0", name="ck_experiments_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    problem_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_name: Mapped[str] = mapped_column(String(160), nullable=False)
    primary_metric: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="completed", server_default="completed", nullable=False)

    # Experiment Management System Specific Fields
    dataset_version: Mapped[str] = mapped_column(String(64), default="v1.0", server_default="v1.0", nullable=False)
    dataset_fingerprint: Mapped[str] = mapped_column(String(128), default="unknown", server_default="unknown", nullable=False)
    problem_formulation_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    preprocessing_config_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    feature_config_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    model_name: Mapped[str] = mapped_column(String(160), default="Model", server_default="Model", nullable=False)
    hyperparameters_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    validation_strategy: Mapped[str] = mapped_column(String(160), default="5-fold StratifiedKFold", server_default="5-fold StratifiedKFold", nullable=False)
    metrics_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    training_duration_seconds: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", nullable=False)
    environment_info_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    random_seed: Mapped[int] = mapped_column(Integer, default=42, server_default="42", nullable=False)
    artifact_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Benchmark summary fields
    best_model_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    best_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    n_samples: Mapped[int | None] = mapped_column(Integer, nullable=True)
    n_features: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_execution_time_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="experiments")
    runs: Mapped[list["ExperimentRun"]] = relationship(
        back_populates="experiment", cascade="all, delete-orphan", order_by="ExperimentRun.rank"
    )
    trials: Mapped[list["ExperimentTrial"]] = relationship(
        back_populates="experiment", cascade="all, delete-orphan", order_by="ExperimentTrial.trial_number"
    )


class ExperimentRun(Base):
    __tablename__ = "experiment_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    algorithm_key: Mapped[str] = mapped_column(String(64), nullable=False)
    is_baseline: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rank: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mean_cv_score: Mapped[float] = mapped_column(Float, nullable=False)
    std_cv_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    training_time_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    inference_latency_ms: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    hyperparameters_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    metrics_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    cv_scores_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="completed", server_default="completed", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    experiment: Mapped["Experiment"] = relationship(back_populates="runs")


class ExperimentTrial(Base):
    __tablename__ = "experiment_trials"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trial_number: Mapped[int] = mapped_column(Integer, nullable=False)
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    parameters_json: Mapped[str] = mapped_column(Text, default="{}", server_default="{}", nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    state: Mapped[str] = mapped_column(String(32), default="COMPLETE", nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    experiment: Mapped["Experiment"] = relationship(back_populates="trials")


class ExplainabilityReport(Base):
    """Stores explainability results received from the Client Data Plane.

    PROVENANCE CONTRACT (enforced by schema):
      - global_shap_json, permutation_importance_json, error_analysis_json,
        local_explanations_json  →  source = 'model_derived'
      - ai_narrative_json        →  source = 'ai_generated'  (LLM text only)
      - user_assumptions_json    →  source = 'user_assumption'

    Raw data rows are NEVER stored here.
    """
    __tablename__ = "explainability_reports"
    __table_args__ = (
        CheckConstraint(
            "provenance_verified = TRUE",
            name="ck_explainability_provenance_verified",
        ),
        Index("ix_expl_org", "organization_id"),
        Index("ix_expl_proj", "project_id"),
        Index("ix_expl_exp", "experiment_id"),
        Index("ix_expl_run", "experiment_run_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )
    experiment_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("experiment_runs.id", ondelete="SET NULL"), nullable=True
    )

    # Report metadata
    schema_version: Mapped[str] = mapped_column(String(32), nullable=False)
    model_name: Mapped[str] = mapped_column(String(160), nullable=False)
    problem_type: Mapped[str] = mapped_column(String(64), nullable=False)
    target_name: Mapped[str] = mapped_column(String(160), nullable=False)
    primary_metric: Mapped[str] = mapped_column(String(64), nullable=False)
    primary_metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    n_eval_samples: Mapped[int] = mapped_column(Integer, nullable=False)
    explained_at: Mapped[str] = mapped_column(String(64), nullable=False)

    # Model-derived facts (source='model_derived')
    global_shap_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    permutation_importance_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    local_explanations_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_analysis_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI-generated narrative (source='ai_generated' — never overrides numeric facts)
    ai_narrative_json: Mapped[str | None] = mapped_column(Text, nullable=True)

    # User-provided business assumptions (source='user_assumption')
    user_assumptions_json: Mapped[str] = mapped_column(Text, default="[]", server_default="[]", nullable=False)

    # Provenance sentinel — always TRUE, enforced at DB level
    provenance_verified: Mapped[bool] = mapped_column(Boolean, default=True, server_default="TRUE", nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    experiment: Mapped["Experiment"] = relationship()


class SeniorReport(Base):
    """Stores generated Senior Data Scientist Reports.

    STRICT INTEGRITY CONTRACT:
    - verified_artifacts_json contains only authoritative model, dataset, and experiment facts.
    - sections_json stores all 18 standard report sections.
    - AI-generated synthesis is restricted to qualitative interpretation of verified facts.
    - Fabricated numbers, metrics, or statistics are strictly forbidden and validated.
    """
    __tablename__ = "senior_reports"
    __table_args__ = (
        CheckConstraint(
            "provenance_verified = TRUE",
            name="ck_senior_report_provenance_verified",
        ),
        Index("ix_senior_reports_org", "organization_id"),
        Index("ix_senior_reports_proj", "project_id"),
        Index("ix_senior_reports_exp", "experiment_id"),
        Index("ix_senior_reports_user", "created_by_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False)
    sections_json: Mapped[str] = mapped_column(Text, nullable=False)
    markdown_content: Mapped[str] = mapped_column(Text, nullable=False)
    verified_artifacts_json: Mapped[str] = mapped_column(Text, nullable=False)
    has_ai_synthesis: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    provenance_verified: Mapped[bool] = mapped_column(Boolean, default=True, server_default="TRUE", nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship()
    experiment: Mapped["Experiment"] = relationship()


class ModelDeployment(Base):
    """Tracks deployed model metadata, configuration, and approval lifecycle.

    STRICT PRIVACY CONTRACT:
    - Model weights, artifacts, and training binaries remain strictly in the client environment.
    - Prediction data is processed locally by the client agent; the control plane never receives or proxies prediction payloads.
    - This entity records deployment specifications, approval status, endpoint configuration, and feature schema.
    """
    __tablename__ = "model_deployments"
    __table_args__ = (
        Index("ix_model_deployments_org", "organization_id"),
        Index("ix_model_deployments_proj", "project_id"),
        Index("ix_model_deployments_exp", "experiment_id"),
        Index("ix_model_deployments_status", "status"),
        Index("ix_model_deployments_user", "created_by_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    experiment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_version: Mapped[str] = mapped_column(String(50), default="v1.0.0", nullable=False)
    deployment_type: Mapped[str] = mapped_column(String(50), nullable=False)  # "local" | "docker"
    endpoint_url: Mapped[str] = mapped_column(String(512), default="http://localhost:8080", nullable=False)
    prediction_path: Mapped[str] = mapped_column(String(128), default="/predict", nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending_approval", nullable=False)  # "pending_approval" | "active" | "stopped" | "rolled_back"
    problem_type: Mapped[str] = mapped_column(String(50), default="classification", nullable=False)
    target_name: Mapped[str] = mapped_column(String(255), default="target", nullable=False)
    primary_metric: Mapped[str] = mapped_column(String(100), default="accuracy", nullable=False)
    input_schema_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    auth_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship()
    project: Mapped["Project"] = relationship()
    experiment: Mapped["Experiment"] = relationship()


class MonitoringSnapshot(Base):
    """Stores aggregate model monitoring metrics over a reporting window.

    STRICT PRIVACY CONTRACT:
    - Zero raw prediction inputs or outputs are stored.
    - Only aggregate statistics, drift metrics, latency percentiles, error rates, and summary distributions.
    """
    __tablename__ = "monitoring_snapshots"
    __table_args__ = (
        Index("ix_monitoring_snapshots_org", "organization_id"),
        Index("ix_monitoring_snapshots_proj", "project_id"),
        Index("ix_monitoring_snapshots_dep", "deployment_id"),
        Index("ix_monitoring_snapshots_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    deployment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("model_deployments.id", ondelete="CASCADE"), nullable=False
    )
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    total_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    throughput_rps: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_p50_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_p95_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    latency_p99_ms: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    data_drift_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    data_drift_detected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    metrics_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    prediction_distribution_json: Mapped[str] = mapped_column(Text, default="{}", nullable=False)
    feature_drift_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship()
    project: Mapped["Project"] = relationship()
    deployment: Mapped["ModelDeployment"] = relationship()


class MonitoringAlertRecord(Base):
    """Stores alerts triggered by feature drift, data drift, latency spikes, or accuracy drops."""
    __tablename__ = "monitoring_alerts"
    __table_args__ = (
        Index("ix_monitoring_alerts_org", "organization_id"),
        Index("ix_monitoring_alerts_proj", "project_id"),
        Index("ix_monitoring_alerts_dep", "deployment_id"),
        Index("ix_monitoring_alerts_type", "alert_type"),
        Index("ix_monitoring_alerts_resolved", "is_resolved"),
        Index("ix_monitoring_alerts_severity", "severity"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    deployment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("model_deployments.id", ondelete="CASCADE"), nullable=False
    )
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("monitoring_snapshots.id", ondelete="SET NULL"), nullable=True
    )
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    feature_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    current_value: Mapped[float] = mapped_column(Float, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    organization: Mapped["Organization"] = relationship()
    project: Mapped["Project"] = relationship()
    deployment: Mapped["ModelDeployment"] = relationship()


class ProjectWorkflow(Base):
    """Stores the Senior Data Scientist Mode workflow state, execution mode, and user overrides."""

    __tablename__ = "project_workflows"
    __table_args__ = (
        UniqueConstraint("organization_id", "project_id", name="uq_project_workflows_org_project"),
        Index("ix_project_workflows_org", "organization_id"),
        Index("ix_project_workflows_proj", "project_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    execution_mode: Mapped[str] = mapped_column(
        String(32), default="assisted", server_default="assisted", nullable=False
    )
    current_stage_key: Mapped[str] = mapped_column(
        String(64), default="business_understanding", server_default="business_understanding", nullable=False
    )
    current_stage_index: Mapped[int] = mapped_column(
        Integer, default=1, server_default="1", nullable=False
    )
    stages_state_json: Mapped[str] = mapped_column(
        Text, default="{}", server_default="{}", nullable=False
    )
    user_overrides_json: Mapped[str] = mapped_column(
        Text, default="{}", server_default="{}", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    project: Mapped["Project"] = relationship(back_populates="workflow")


