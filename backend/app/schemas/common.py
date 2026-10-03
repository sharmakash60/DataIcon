from typing import Any, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Any | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class PaginationParams(BaseModel):
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int
