"""CLI interface for DataPilot Client Data Agent.

Supports:
1. Agent runner mode (discovery, profiling, heartbeat, job polling)
2. Local model serving mode (POST /predict, GET /health, GET /metadata)
3. Docker packaging mode (self-contained container bundle generation)
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
import sys
from typing import Sequence
from uuid import UUID

from datapilot_agent.client import ControlPlaneClient
from datapilot_agent.contracts import AgentConfig
from datapilot_agent.runner import AgentRunner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("datapilot_agent.cli")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="DataPilot Client Data Agent - Local Privacy Engine",
    )
    subparsers = parser.add_subparsers(dest="subcommand", help="Agent operation mode")

    # 1. Runner mode (explicit subcommand or default)
    run_parser = subparsers.add_parser("run", help="Run local discovery, profiling, and job polling")
    _add_runner_arguments(run_parser)

    # 2. Local serving mode
    serve_parser = subparsers.add_parser("serve", help="Serve a local model artifact via REST prediction API")
    serve_parser.add_argument(
        "--artifact",
        "-a",
        type=Path,
        required=True,
        help="Path to model artifact bundle (.joblib) or directory containing model_bundle.joblib",
    )
    serve_parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host address to bind the serving server to (default: 0.0.0.0)",
    )
    serve_parser.add_argument(
        "--port",
        "-p",
        type=int,
        default=8080,
        help="Port to bind the serving server to (default: 8080)",
    )
    serve_parser.add_argument(
        "--api-key",
        default=None,
        help="Optional API key required in X-API-Key or Authorization header",
    )

    # 3. Docker packaging mode
    pkg_parser = subparsers.add_parser("package-docker", help="Package model artifact into a standalone Docker deployment bundle")
    pkg_parser.add_argument(
        "--artifact",
        "-a",
        type=Path,
        required=True,
        help="Path to model artifact bundle (.joblib) or directory containing model_bundle.joblib",
    )
    pkg_parser.add_argument(
        "--output-dir",
        "-o",
        type=Path,
        required=True,
        help="Output directory to write Dockerfile, requirements.txt, and compose bundle to",
    )

    # Allow top-level runner arguments for backwards compatibility when no subcommand is specified
    _add_runner_arguments(parser, required=False)

    return parser


def _add_runner_arguments(parser: argparse.ArgumentParser, required: bool = True) -> None:
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=required,
        help="Local directory containing client datasets to discover and profile",
    )
    parser.add_argument(
        "--cloud-url",
        default="http://127.0.0.1:8000",
        help="DataPilot Cloud Control Plane URL",
    )
    parser.add_argument(
        "--enrollment-token",
        help="One-time enrollment token issued by organization admin",
    )
    parser.add_argument(
        "--agent-name",
        default="local-agent",
        help="Human-readable alias for this local agent instance",
    )
    parser.add_argument(
        "--project-id",
        type=UUID,
        help="Project ID to automatically associate registered datasets with",
    )
    parser.add_argument(
        "--single-run",
        action="store_true",
        help="Run discovery, heartbeat, and job polling once and exit",
    )


def handle_serve(args: argparse.Namespace) -> int:
    """Run local FastAPI model serving server."""
    import uvicorn
    from datapilot_agent.serving.predictor import LocalPredictor
    from datapilot_agent.serving.server import create_serving_app

    logger.info("Loading model artifact from %s...", args.artifact)
    predictor = LocalPredictor(str(args.artifact))
    logger.info(
        "Loaded model '%s' (%s, version: %s). Starting REST prediction API on %s:%s...",
        predictor.bundle.model_name,
        predictor.bundle.problem_type,
        predictor.bundle.model_version,
        args.host,
        args.port,
    )
    app = create_serving_app(predictor=predictor, api_key=args.api_key)
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


def handle_package_docker(args: argparse.Namespace) -> int:
    """Package model artifact for Docker container deployment."""
    from datapilot_agent.serving.docker_packager import DockerPackager

    logger.info("Packaging model artifact %s into Docker bundle at %s...", args.artifact, args.output_dir)
    packager = DockerPackager(str(args.artifact))
    packager.package(args.output_dir)
    logger.info("Docker deployment bundle created successfully at %s", args.output_dir)
    return 0


def handle_runner(args: argparse.Namespace) -> int:
    """Execute data agent runner mode."""
    if not args.data_dir:
        logger.error("--data-dir is required for agent runner mode.")
        return 1

    config = AgentConfig(
        cloud_api_url=args.cloud_url,
        agent_name=args.agent_name,
        data_dir=args.data_dir,
        enrollment_token=args.enrollment_token,
        project_id=args.project_id,
    )

    client = ControlPlaneClient(config)
    if args.enrollment_token:
        logger.info("Enrolling agent with token...")
        client.enroll(args.enrollment_token)
        logger.info("Enrollment successful. Agent ID: %s", config.agent_id)

    runner = AgentRunner(config, client)

    if getattr(args, "single_run", False):
        stats = runner.run_once()
        logger.info("Single-run finished: %s", stats)
        return 0

    import time
    logger.info(
        "Data Agent background watcher active on '%s' (poll interval: %ds). Watching for dataset files...",
        config.data_dir,
        config.poll_interval_seconds,
    )
    try:
        while True:
            stats = runner.run_once()
            if stats["discovered"] > 0 or stats["jobs_processed"] > 0:
                logger.info("Watcher cycle: %s", stats)
            time.sleep(config.poll_interval_seconds)
    except KeyboardInterrupt:
        logger.info("Data Agent watcher stopped.")
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.subcommand == "serve":
        return handle_serve(args)
    elif args.subcommand == "package-docker":
        return handle_package_docker(args)
    else:
        return handle_runner(args)


if __name__ == "__main__":
    sys.exit(main())
