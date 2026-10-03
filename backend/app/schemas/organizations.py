import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.enums import Role


class OrgCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)


class OrgUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    email: EmailStr
    role: Role = Role.DATA_SCIENTIST


class MemberRoleUpdate(BaseModel):
    role: Role


class MemberOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    display_name: str
    role: str
    status: str
    created_at: datetime
    project_ids: list[uuid.UUID] = Field(default_factory=list)
    project_names: list[str] = Field(default_factory=list)
    last_activity_at: datetime | None = None

    model_config = {"from_attributes": True}


class ProjectMemberAdd(BaseModel):
    user_id: uuid.UUID
    role: Role | None = None


class ProjectMemberOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    email: str
    display_name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}
