"""Pydantic schemas for Model Deployment tracking in Control Plane."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class CreateDeploymentRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Display name for this deployment")
    deployment_type: Literal["local", "docker"] = Field(..., description="Target runtime environment")
    endpoint_url: str = Field(default="http://localhost:8080", max_length=512, description="Client-hosted serving URL")
    prediction_path: str = Field(default="/predict", max_length=128, description="Prediction endpoint path")
    notes: Optional[str] = Field(default=None, max_length=2000, description="Deployment documentation or context")
    auto_approve: bool = Field(default=False, description="Optionally mark as active immediately if permitted")


class ApproveDeploymentRequest(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=2000, description="Approval approval notes")


class RollbackDeploymentRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000, description="Reason for rollback")


class StopDeploymentRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000, description="Reason for decommissioning deployment")


class DeploymentSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    experiment_id: uuid.UUID
    name: str
    model_name: str
    model_version: str
    deployment_type: str
    endpoint_url: str
    prediction_path: str
    status: str
    problem_type: str
    target_name: str
    primary_metric: str
    created_at: datetime
    approved_at: Optional[datetime] = None


class DeploymentDetailOut(DeploymentSummaryOut):
    input_schema: List[Dict[str, Any]]
    notes: Optional[str] = None
    auth_configured: bool = False
    approved_by_user_id: Optional[uuid.UUID] = None
    created_by_user_id: Optional[uuid.UUID] = None
    updated_at: datetime


class DeploymentListResponse(BaseModel):
    items: List[DeploymentSummaryOut]
    total: int
