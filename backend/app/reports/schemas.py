"""Pydantic schemas for Senior Data Scientist Report Generator.

PROVENANCE GUARANTEE:
- All metrics, counts, and statistical tables are sourced from verified database artifacts.
- AI synthesis is restricted to qualitative commentary and validated against fabrication.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class ReportSectionOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section_number: int
    key: str
    title: str
    verified_facts: Dict[str, Any] = Field(default_factory=dict)
    content_markdown: str
    source: str = "measured_result"  # 'measured_result' | 'ai_interpretation' | 'user_assumption' | 'composite'


class GenerateReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = None
    include_ai_synthesis: bool = True
    user_context: Optional[str] = None


class SeniorReportSummaryOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    experiment_id: uuid.UUID
    version: int = 1
    title: str
    executive_summary: str
    has_ai_synthesis: bool
    provenance_verified: bool
    created_at: datetime
    updated_at: datetime


class SeniorReportDetailOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID
    organization_id: uuid.UUID
    project_id: uuid.UUID
    experiment_id: uuid.UUID
    version: int = 1
    title: str
    executive_summary: str
    sections: List[ReportSectionOut]
    markdown_content: str
    verified_artifacts: Dict[str, Any]
    has_ai_synthesis: bool
    provenance_verified: bool
    created_at: datetime
    updated_at: datetime
