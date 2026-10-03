"""FastAPI Serving Application for Local Prediction API with Automated Monitoring.

Exposes:
- POST /predict: Run low-latency local inference (records telemetry to local monitoring engine).
- GET /health: Liveness probe.
- GET /ready: Readiness probe.
- GET /metadata: Inspect feature schema and model details.
- GET /monitoring/metrics: Extract aggregated monitoring snapshot.
- POST /monitoring/ground-truth: Ingest actual ground truth labels locally.
- GET /monitoring/alerts: Inspect active drift, latency, error, and performance alerts.

SECURITY GUARANTEE:
Prediction payloads and ground truth values are handled 100% within the local client runtime.
Only strictly aggregated metrics leave the client boundary if configured.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional, Union

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from datapilot_agent.monitoring.engine import ModelMonitoringEngine
from datapilot_agent.monitoring.schema import (
    AggregateMonitoringSnapshot,
    GroundTruthSubmission,
    MonitoringAlert,
)
from datapilot_agent.serving.predictor import LocalPredictor
from datapilot_agent.serving.schema import (
    HealthResponse,
    ModelMetadataResponse,
    PredictionResult,
    PredictRequest,
)

logger = logging.getLogger("datapilot_agent.serving.server")


def create_serving_app(
    predictor: LocalPredictor,
    api_key: Optional[str] = None,
    deployment_type: str = "local",
    monitoring_engine: Optional[ModelMonitoringEngine] = None,
    allowed_origins: Optional[List[str]] = None,
    require_api_key: bool = False,
) -> FastAPI:
    """Create a configured FastAPI serving microservice with local monitoring."""
    app = FastAPI(
        title="DataPilot Client Model Serving API",
        description="Local inference & monitoring engine running inside client boundary. Zero cloud data egress.",
        version=predictor.bundle.model_version,
    )

    # Initialize local monitoring engine if not supplied
    monitor = monitoring_engine or ModelMonitoringEngine(
        model_name=predictor.bundle.model_name,
        model_version=predictor.bundle.model_version,
        problem_type=predictor.bundle.problem_type,
        feature_schema=predictor.bundle.feature_schema,
        baseline_metrics=predictor.bundle.metrics,
        primary_metric=predictor.bundle.primary_metric,
    )

    # SEC-03: Restrict CORS to configured origins instead of wildcard
    cors_origins = allowed_origins or [
        orig.strip()
        for orig in os.getenv(
            "SERVING_CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000",
        ).split(",")
        if orig.strip()
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    expected_api_key = api_key or os.getenv("SERVING_API_KEY")
    if require_api_key and not expected_api_key:
        expected_api_key = "datapilot-serving-required-key"

    def verify_api_key(
        x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
        authorization: Optional[str] = Header(None),
    ) -> None:
        """Authenticate caller via X-API-Key or Bearer token if configured."""
        if not expected_api_key:
            return  # No API key required if not configured

        token = x_api_key
        if not token and authorization:
            if authorization.startswith("Bearer "):
                token = authorization[7:]

        if not token or token != expected_api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or missing API key (X-API-Key or Bearer token).",
            )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc), "error": "BAD_REQUEST"},
        )

    @app.exception_handler(Exception)
    async def general_error_handler(request: Request, exc: Exception):
        logger.error("Unhandled error during serving: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal inference error occurred.", "error": "INTERNAL_ERROR"},
        )

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="healthy",
            model_loaded=True,
            model_name=predictor.bundle.model_name,
            model_version=predictor.bundle.model_version,
        )

    @app.get("/ready", response_model=HealthResponse, tags=["health"])
    def ready() -> HealthResponse:
        return HealthResponse(
            status="ready",
            model_loaded=True,
            model_name=predictor.bundle.model_name,
            model_version=predictor.bundle.model_version,
        )

    @app.get("/metadata", response_model=ModelMetadataResponse, tags=["metadata"])
    def metadata() -> ModelMetadataResponse:
        return predictor.get_metadata(deployment_type=deployment_type)

    @app.post(
        "/predict",
        response_model=PredictionResult,
        status_code=status.HTTP_200_OK,
        tags=["inference"],
        dependencies=[Depends(verify_api_key)],
    )
    def predict(payload: PredictRequest) -> PredictionResult:
        """Execute local model inference on supplied tabular feature data."""
        req_id = payload.request_id
        try:
            result = predictor.predict(
                features=payload.features,
                request_id=req_id,
            )

            # Record telemetry into local monitoring buffer
            raw_features = payload.features
            if isinstance(raw_features, dict):
                feature_items = [raw_features]
            else:
                feature_items = raw_features

            for idx, item in enumerate(feature_items):
                pred_val = result.predictions[idx] if idx < len(result.predictions) else None
                prob_val = (
                    result.probabilities[idx]
                    if result.probabilities and idx < len(result.probabilities)
                    else None
                )
                monitor.record_inference(
                    request_id=f"{result.prediction_id}_{idx}" if len(feature_items) > 1 else result.prediction_id,
                    features=item,
                    prediction=pred_val,
                    latency_ms=result.latency_ms / max(1, len(feature_items)),
                    probabilities=prob_val,
                    is_error=False,
                )

            return result

        except ValueError as err:
            # Record failed inference in local monitoring
            monitor.record_inference(
                request_id=str(req_id),
                features=payload.features if isinstance(payload.features, dict) else {},
                prediction=None,
                latency_ms=0.0,
                is_error=True,
                error_type="ValueError",
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(err),
            )
        except Exception as err:
            logger.error("Prediction inference failed: %s", err)
            monitor.record_inference(
                request_id=str(req_id),
                features=payload.features if isinstance(payload.features, dict) else {},
                prediction=None,
                latency_ms=0.0,
                is_error=True,
                error_type=type(err).__name__,
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Inference execution failed due to an internal error. Please check feature inputs.",
            )

    # ──── Monitoring Endpoints (Local Client Operations) ──────────────────────

    @app.get(
        "/monitoring/metrics",
        response_model=AggregateMonitoringSnapshot,
        tags=["monitoring"],
        dependencies=[Depends(verify_api_key)],
    )
    def get_monitoring_metrics(
        window_seconds: Optional[float] = Query(None, description="Lookback window in seconds"),
    ) -> AggregateMonitoringSnapshot:
        """Compute authoritative aggregate monitoring snapshot over recent inference window."""
        return monitor.compute_snapshot(window_seconds=window_seconds)

    @app.post(
        "/monitoring/ground-truth",
        tags=["monitoring"],
        dependencies=[Depends(verify_api_key)],
    )
    def submit_ground_truth(
        payload: Union[GroundTruthSubmission, List[GroundTruthSubmission]],
    ) -> dict[str, Any]:
        """Ingest ground truth label(s) locally to enable accuracy and degradation monitoring."""
        if isinstance(payload, list):
            count = monitor.record_ground_truth_batch(payload)
            return {"status": "ok", "matched_count": count}
        else:
            success = monitor.record_ground_truth(payload.request_id, payload.actual)
            return {"status": "ok", "matched": success}

    @app.get(
        "/monitoring/alerts",
        response_model=List[MonitoringAlert],
        tags=["monitoring"],
        dependencies=[Depends(verify_api_key)],
    )
    def get_monitoring_alerts(
        window_seconds: Optional[float] = Query(None, description="Lookback window in seconds"),
    ) -> List[MonitoringAlert]:
        """Inspect active drift, latency, error rate, and performance alerts."""
        snapshot = monitor.compute_snapshot(window_seconds=window_seconds)
        return snapshot.alerts

    # Attach monitor reference to app state for testing/lifecycle
    app.state.monitor = monitor

    return app
