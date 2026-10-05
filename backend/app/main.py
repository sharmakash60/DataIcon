from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from redis import Redis

from app.agent_gateway.router import router as agent_gateway_router
from app.audit.router import router as audit_router
from app.auth.router import router as auth_router
from app.config import Settings
from app.datasets.router import router as datasets_router
from app.db import build_engine
from app.health import expected_revisions
from app.health import router as health_router
from app.organizations.router import router as orgs_router
from app.projects.router import router as projects_router
from app.requirements.router import router as requirements_router
from app.experiments.router import router as experiments_router
from app.explainability.router import router as explainability_router
from app.reports.router import router as reports_router
from app.deployments.router import router as deployments_router
from app.monitoring.router import router as monitoring_router
from app.workflows.router import router as workflows_router


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        application.state.engine = build_engine(config)
        try:
            cache_client = Redis.from_url(
                str(config.redis_url),
                socket_connect_timeout=1,
                socket_timeout=1,
                retry_on_timeout=False,
                decode_responses=True,
            )
            cache_client.ping()
            application.state.cache = cache_client
        except Exception:
            application.state.cache = None

        application.state.revisions = expected_revisions()
        try:
            yield
        finally:
            if getattr(application.state, "cache", None) is not None:
                try:
                    application.state.cache.close()
                except Exception:
                    pass
            application.state.engine.dispose()

    application = FastAPI(
        title=config.app_name,
        version="0.2.0",
        description="DataPilot Control Plane - Phase 1 Foundation",
        lifespan=lifespan,
    )

    @application.exception_handler(HTTPException)
    async def custom_http_exception_handler(request: Request, exc: HTTPException):
        code_map = {
            400: "BAD_REQUEST",
            401: "UNAUTHORIZED",
            403: "FORBIDDEN",
            404: "NOT_FOUND",
            409: "CONFLICT",
            422: "UNPROCESSABLE_ENTITY",
            429: "TOO_MANY_REQUESTS",
            500: "INTERNAL_ERROR",
            503: "SERVICE_UNAVAILABLE",
        }
        error_code = code_map.get(exc.status_code, "ERROR")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "error": {
                    "code": error_code,
                    "message": exc.detail if isinstance(exc.detail, str) else "Request error",
                    "details": exc.detail if not isinstance(exc.detail, str) else None,
                },
            },
            headers=exc.headers,
        )

    application.include_router(health_router)
    application.include_router(auth_router)
    application.include_router(orgs_router)
    application.include_router(projects_router)
    application.include_router(datasets_router)
    application.include_router(requirements_router)
    application.include_router(experiments_router)
    application.include_router(explainability_router)
    application.include_router(reports_router)
    application.include_router(deployments_router)
    application.include_router(monitoring_router)
    application.include_router(workflows_router)
    application.include_router(agent_gateway_router)
    application.include_router(audit_router)
    return application


app = create_app()
