"""Schemas for Senior Data Scientist Mode Workflow Engine.

Strictly preserves provenance:
- Empirical measurements from client data plane: [EMPIRICALLY MEASURED]
- AI rationale and guidance: [AI RATIONALE]
- User overrides and decisions: [USER DECISION]
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, Field


WorkflowExecutionMode = Literal["automatic", "assisted", "manual"]
WorkflowStageStatus = Literal["completed", "running", "needs_review", "blocked", "not_started"]


class EvidenceItem(BaseModel):
    label: str
    value: Any
    source: str
    provenance: Literal["empirically_measured"] = "empirically_measured"
    badge: str = "[EMPIRICALLY MEASURED]"
    details: str | None = None


class FindingItem(BaseModel):
    title: str
    description: str
    measured_fact: str | None = None
    provenance: Literal["empirically_measured"] = "empirically_measured"
    badge: str = "[EMPIRICALLY MEASURED]"


class RecommendationItem(BaseModel):
    title: str
    rationale: str
    suggested_action: str
    provenance: Literal["ai_generated"] = "ai_generated"
    badge: str = "[AI RATIONALE]"


class UserDecision(BaseModel):
    decision: Literal["accepted", "overridden", "rejected", "pending"] = "pending"
    overridden_recommendation: str | None = None
    custom_parameters: dict[str, Any] = Field(default_factory=dict)
    user_decision_notes: str | None = None
    updated_at: str | None = None
    decided_by_email: str | None = None
    provenance: Literal["user_override"] = "user_override"
    badge: str = "[USER DECISION]"


class WorkflowStage(BaseModel):
    stage_key: str
    stage_index: int  # 1 to 15
    title: str
    category: str
    status: WorkflowStageStatus
    what_was_analyzed: list[str]
    evidence: list[EvidenceItem] = Field(default_factory=list)
    findings: list[FindingItem] = Field(default_factory=list)
    recommendations: list[RecommendationItem] = Field(default_factory=list)
    user_decisions: UserDecision = Field(default_factory=UserDecision)
    is_overridden: bool = False
    can_advance: bool = True
    blockers: list[str] = Field(default_factory=list)
    artifact_link: str | None = None


class ProjectWorkflowOut(BaseModel):
    project_id: uuid.UUID
    organization_id: uuid.UUID
    project_name: str
    execution_mode: WorkflowExecutionMode
    current_stage_key: str
    current_stage_index: int
    stages: list[WorkflowStage]
    summary: dict[str, int]
    updated_at: datetime


class StageOverrideRequest(BaseModel):
    decision: Literal["accepted", "overridden", "rejected"]
    overridden_recommendation: str | None = None
    custom_parameters: dict[str, Any] = Field(default_factory=dict)
    user_decision_notes: str | None = None
    status: WorkflowStageStatus | None = None


class ModeUpdateRequest(BaseModel):
    execution_mode: WorkflowExecutionMode


class StageAdvanceRequest(BaseModel):
    target_stage_key: str | None = None
