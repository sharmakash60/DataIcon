"""DataPilot Client Data Agent Execution Runner.

Coordinates local dataset discovery, heartbeat, job retrieval, profiling,
privacy verification, and result reporting.

NO REMOTE CODE EXECUTION:
Only predetermined safe operations ('profile_dataset') are recognized.
Arbitrary python code or remote scripts are strictly rejected.
"""

from __future__ import annotations

import logging
import time
from typing import Callable
from uuid import UUID

from datapilot_agent.client import ControlPlaneClient
from datapilot_agent.contracts import AgentConfig, DiscoveredDataset, JobClaim
from datapilot_agent.discovery import discover_local_datasets
from datapilot_agent.profiler import profile_dataset_file

logger = logging.getLogger("datapilot_agent.runner")


class AgentRunner:
    """Local worker orchestrating client-side data operations."""

    def __init__(self, config: AgentConfig, client: ControlPlaneClient | None = None) -> None:
        self.config = config
        self.client = client or ControlPlaneClient(config)
        self.local_datasets: dict[str, DiscoveredDataset] = {}
        self._running = False

    @staticmethod
    def _normalize_name(name: str) -> str:
        import re
        return re.sub(r"[^a-z0-9]", "", name.lower())

    def _resolve_project_id(
        self,
        project_folder: str | None,
        projects_cache: dict[str, UUID],
        default_project_id: UUID | None,
    ) -> UUID | None:
        """Resolve target project ID based on subfolder name to prevent cross-project data leakage."""
        if not project_folder:
            return default_project_id

        norm = self._normalize_name(project_folder)
        if norm in projects_cache:
            return projects_cache[norm]

        # Check if project_folder is an exact UUID string
        for pid in projects_cache.values():
            if str(pid).lower() == project_folder.lower():
                return pid

        return None

    def sync_local_datasets(self, project_id: UUID | None = None) -> list[DiscoveredDataset]:
        """Discover datasets in configured data directory and register them strictly to their project."""
        discovered = discover_local_datasets(self.config.data_dir)
        self.local_datasets = {d.opaque_local_ref: d for d in discovered}

        if not self.config.agent_token:
            return discovered

        # Refresh project lookup cache from control plane
        projects_cache: dict[str, UUID] = {}
        try:
            cloud_projects = self.client.list_projects()
            for p in cloud_projects:
                norm = self._normalize_name(p["name"])
                projects_cache[norm] = UUID(p["id"])
        except Exception as err:
            logger.debug("Could not refresh projects list from cloud: %s", err)

        default_project_id = project_id or self.config.project_id

        for ds in discovered:
            target_pid = self._resolve_project_id(ds.project_folder, projects_cache, default_project_id)
            if not target_pid:
                if ds.project_folder:
                    logger.warning(
                        "PROJECT ISOLATION GUARD: Subfolder '%s' for '%s' does not match any active project in the organization. "
                        "Skipping registration to prevent cross-project data leakage.",
                        ds.project_folder,
                        ds.approved_alias,
                    )
                else:
                    logger.info(
                        "Dataset '%s' is in root directory without a designated project folder or default project_id. "
                        "Create a folder named after your project (e.g. ./datasets/<ProjectName>/) to auto-register.",
                        ds.approved_alias,
                    )
                continue

            try:
                self.client.register_dataset(target_pid, ds)
                logger.info(
                    "Registered dataset %s (%s) strictly to project %s",
                    ds.approved_alias,
                    ds.opaque_local_ref,
                    target_pid,
                )
            except Exception as err:
                logger.warning("Failed to register dataset %s: %s", ds.approved_alias, err)

        return discovered

    def handle_profile_job(self, job: JobClaim) -> bool:
        """Process a 'profile_dataset' operation locally."""
        dataset_ref = job.payload.get("dataset_ref")
        if not dataset_ref:
            logger.error("Job %s missing required 'dataset_ref' payload", job.job_id)
            return False

        ds = self.local_datasets.get(dataset_ref)
        if not ds:
            # Re-sync local datasets in case file was recently added
            self.sync_local_datasets()
            ds = self.local_datasets.get(dataset_ref)

        if not ds:
            logger.error("Referenced dataset %s is not present locally on this agent", dataset_ref)
            return False

        logger.info("Profiling local dataset %s (%s)...", ds.approved_alias, ds.format)
        profile = profile_dataset_file(
            file_path=ds.local_path,
            dataset_ref=ds.opaque_local_ref,
            dataset_format=ds.format,
            max_size_bytes=self.config.max_file_size_bytes,
        )

        logger.info(
            "Profile complete for %s. Rows: %d, Columns: %d. Sending permitted metadata...",
            ds.approved_alias,
            profile.total_rows,
            profile.total_columns,
        )
        self.client.submit_job_results(
            job_id=job.job_id,
            lease_token=job.lease_token,
            profile=profile,
        )
        logger.info("Submitted profile results for job %s", job.job_id)
        return True

    def process_next_job(self) -> bool:
        """Claim and execute the next queued job from the control plane."""
        job = self.client.claim_job()
        if not job:
            return False

        logger.info("Claimed job %s (operation: %s)", job.job_id, job.operation)

        # STRICT SECURITY BARRIER: No remote Python code execution
        if job.operation == "profile_dataset":
            return self.handle_profile_job(job)
        else:
            logger.error(
                "SECURITY REJECTION: Unsupported or unauthorized operation '%s' requested",
                job.operation,
            )
            return False

    def run_once(self) -> dict[str, int]:
        """Perform a single iteration of discovery, heartbeat, and job execution."""
        stats = {"discovered": 0, "heartbeats": 0, "jobs_processed": 0}
        
        # 1. Discover local files
        discovered = self.sync_local_datasets()
        stats["discovered"] = len(discovered)

        # 2. Send heartbeat
        if self.config.agent_token:
            self.client.send_heartbeat()
            stats["heartbeats"] += 1

            # 3. Check for work
            if self.process_next_job():
                stats["jobs_processed"] += 1

        return stats
