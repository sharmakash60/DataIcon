import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=160)
    organization_name: str = Field(min_length=1, max_length=160)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=1)


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    display_name: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OrganizationMembershipOut(BaseModel):
    organization_id: uuid.UUID
    organization_name: str
    role: str
    status: str
    permissions: list[str] = []


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserOut
    organizations: list[OrganizationMembershipOut]


class TokenRefreshResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int


class MeResponse(BaseModel):
    user: UserOut
    organizations: list[OrganizationMembershipOut]
