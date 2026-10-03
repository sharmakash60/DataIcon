import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.enums import ProjectClassification, ProjectStatus


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    purpose: str | None = Field(default=None, max_length=500)
    classification: ProjectClassification = ProjectClassification.INTERNAL


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    purpose: str | None = Field(default=None, max_length=500)
    classification: ProjectClassification | None = None
    status: ProjectStatus | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    purpose: str | None
    classification: str
    status: str
    owner_user_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
