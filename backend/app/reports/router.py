"""Senior Data Scientist Report REST Router."""
from __future__ import annotations

import json
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.auth.dependencies import (
    ProjectContext,
    TenantContext,
    require_permission,
    require_project_permission,
)
from app.auth.permissions import Permissions
from app.config import Settings
from app.db import get_db
from app.models import Experiment, SeniorReport
from app.reports.generator import generate_senior_report
from app.reports.schemas import (
    GenerateReportRequest,
    ReportSectionOut,
    SeniorReportDetailOut,
    SeniorReportSummaryOut,
)

router = APIRouter(
    prefix="/api/v1/organizations/{organization_id}/projects/{project_id}/experiments",
    tags=["reports"],
)


def _serialize_report_detail(rpt: SeniorReport) -> SeniorReportDetailOut:
    sections_raw = json.loads(rpt.sections_json) if rpt.sections_json else []
    artifacts_raw = json.loads(rpt.verified_artifacts_json) if rpt.verified_artifacts_json else {}
    version = artifacts_raw.get("report_version", 1)

    return SeniorReportDetailOut(
        id=rpt.id,
        organization_id=rpt.organization_id,
        project_id=rpt.project_id,
        experiment_id=rpt.experiment_id,
        version=version,
        title=rpt.title,
        executive_summary=rpt.executive_summary,
        sections=[ReportSectionOut(**s) for s in sections_raw],
        markdown_content=rpt.markdown_content,
        verified_artifacts=artifacts_raw,
        has_ai_synthesis=rpt.has_ai_synthesis,
        provenance_verified=rpt.provenance_verified,
        created_at=rpt.created_at,
        updated_at=rpt.updated_at,
    )


def _serialize_report_summary(rpt: SeniorReport) -> SeniorReportSummaryOut:
    artifacts_raw = json.loads(rpt.verified_artifacts_json) if rpt.verified_artifacts_json else {}
    version = artifacts_raw.get("report_version", 1)

    return SeniorReportSummaryOut(
        id=rpt.id,
        organization_id=rpt.organization_id,
        project_id=rpt.project_id,
        experiment_id=rpt.experiment_id,
        version=version,
        title=rpt.title,
        executive_summary=rpt.executive_summary,
        has_ai_synthesis=rpt.has_ai_synthesis,
        provenance_verified=rpt.provenance_verified,
        created_at=rpt.created_at,
        updated_at=rpt.updated_at,
    )


def _get_experiment(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    tenant: TenantContext,
    db: Session,
) -> Experiment:
    exp = db.scalar(
        select(Experiment).where(
            Experiment.id == experiment_id,
            Experiment.organization_id == tenant.organization_id,
            Experiment.project_id == project_id,
        )
    )
    if not exp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Experiment not found.")
    return exp


@router.post(
    "/{experiment_id}/reports",
    response_model=SeniorReportDetailOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_senior_report(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    payload: GenerateReportRequest,
    request: Request,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.REPORT_CREATE)),
    db: Session = Depends(get_db),
) -> SeniorReportDetailOut:
    """Generate an authoritative 18-section Senior Data Scientist Report."""
    tenant = project_context.tenant
    exp = _get_experiment(experiment_id, project_id, tenant, db)
    settings: Settings = request.app.state.settings if hasattr(request.app.state, "settings") else Settings()

    report = await generate_senior_report(
        experiment=exp,
        db=db,
        settings=settings,
        title=payload.title,
        include_ai_synthesis=payload.include_ai_synthesis,
        user_context=payload.user_context,
        user_id=tenant.user.id,
    )

    return _serialize_report_detail(report)


@router.get(
    "/{experiment_id}/reports",
    response_model=List[SeniorReportSummaryOut],
)
def list_senior_reports(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db),
) -> List[SeniorReportSummaryOut]:
    """List all generated Senior Data Scientist Reports for an experiment."""
    tenant = project_context.tenant
    _get_experiment(experiment_id, project_id, tenant, db)

    reports = db.scalars(
        select(SeniorReport)
        .where(
            SeniorReport.organization_id == tenant.organization_id,
            SeniorReport.project_id == project_id,
            SeniorReport.experiment_id == experiment_id,
        )
        .order_by(desc(SeniorReport.created_at))
    ).all()

    return [_serialize_report_summary(r) for r in reports]


@router.get(
    "/{experiment_id}/reports/{report_id}",
    response_model=SeniorReportDetailOut,
)
def get_senior_report(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db),
) -> SeniorReportDetailOut:
    """Get full details of a specific Senior Data Scientist Report."""
    tenant = project_context.tenant
    _get_experiment(experiment_id, project_id, tenant, db)

    report = db.scalar(
        select(SeniorReport).where(
            SeniorReport.id == report_id,
            SeniorReport.organization_id == tenant.organization_id,
            SeniorReport.project_id == project_id,
            SeniorReport.experiment_id == experiment_id,
        )
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    return _serialize_report_detail(report)


@router.get(
    "/{experiment_id}/reports/{report_id}/markdown",
)
def download_senior_report_markdown(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db),
) -> Response:
    """Download the complete Senior Data Scientist Report as a Markdown document."""
    tenant = project_context.tenant
    _get_experiment(experiment_id, project_id, tenant, db)

    report = db.scalar(
        select(SeniorReport).where(
            SeniorReport.id == report_id,
            SeniorReport.organization_id == tenant.organization_id,
            SeniorReport.project_id == project_id,
            SeniorReport.experiment_id == experiment_id,
        )
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    filename = f"senior_ds_report_{report.experiment_id}_{str(report.id)[:8]}.md"
    return Response(
        content=report.markdown_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/{experiment_id}/reports/{report_id}/html",
)
def download_senior_report_html(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db),
) -> Response:
    """Download the complete Senior Data Scientist Report as a standalone styled HTML document."""
    tenant = project_context.tenant
    _get_experiment(experiment_id, project_id, tenant, db)

    report = db.scalar(
        select(SeniorReport).where(
            SeniorReport.id == report_id,
            SeniorReport.organization_id == tenant.organization_id,
            SeniorReport.project_id == project_id,
            SeniorReport.experiment_id == experiment_id,
        )
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    from app.reports.formatters import build_report_html

    sections_raw = json.loads(report.sections_json) if report.sections_json else []
    artifacts_raw = json.loads(report.verified_artifacts_json) if report.verified_artifacts_json else {}
    version = artifacts_raw.get("report_version", 1)

    html_content = build_report_html(
        report_title=report.title,
        executive_summary=report.executive_summary,
        sections=sections_raw,
        metadata={
            "version": version,
            "project_name": artifacts_raw.get("project", {}).get("name", "DataPilot Project"),
            "experiment_id": str(report.experiment_id),
            "created_at": report.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") if report.created_at else "",
        },
    )

    filename = f"senior_ds_report_v{version}_{str(report.id)[:8]}.html"
    return Response(
        content=html_content,
        media_type="text/html",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get(
    "/{experiment_id}/reports/{report_id}/pdf",
)
def download_senior_report_pdf(
    experiment_id: uuid.UUID,
    project_id: uuid.UUID,
    report_id: uuid.UUID,
    project_context: ProjectContext = Depends(require_project_permission(Permissions.REPORT_VIEW)),
    db: Session = Depends(get_db),
) -> Response:
    """Download the complete Senior Data Scientist Report as a multi-page PDF document."""
    tenant = project_context.tenant
    _get_experiment(experiment_id, project_id, tenant, db)

    report = db.scalar(
        select(SeniorReport).where(
            SeniorReport.id == report_id,
            SeniorReport.organization_id == tenant.organization_id,
            SeniorReport.project_id == project_id,
            SeniorReport.experiment_id == experiment_id,
        )
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found.")

    from app.reports.formatters import build_report_pdf

    sections_raw = json.loads(report.sections_json) if report.sections_json else []
    artifacts_raw = json.loads(report.verified_artifacts_json) if report.verified_artifacts_json else {}
    version = artifacts_raw.get("report_version", 1)

    pdf_bytes = build_report_pdf(
        report_title=report.title,
        executive_summary=report.executive_summary,
        sections=sections_raw,
        metadata={
            "version": version,
            "project_name": artifacts_raw.get("project", {}).get("name", "DataPilot Project"),
            "experiment_id": str(report.experiment_id),
            "created_at": report.created_at.strftime("%Y-%m-%d %H:%M:%S UTC") if report.created_at else "",
        },
    )

    filename = f"senior_ds_report_v{version}_{str(report.id)[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
