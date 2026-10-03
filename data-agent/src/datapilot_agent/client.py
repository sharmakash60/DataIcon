"""Client API adapter for communicating with the DataPilot Cloud Control Plane.

Implements:
- Registration / Enrollment (POST /agent/v1/enroll)
- Bearer Authentication
- Heartbeat telemetry (POST /agent/v1/heartbeat)
- Dataset registration with opaque references (POST /agent/v1/dataset-registrations)
- Secure job claiming (POST /agent/v1/jobs/claim)
- Secure metadata transmission (POST /agent/v1/jobs/{job_id}/results)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from uuid import UUID

import httpx

from datapilot_agent.contracts import (
    AgentConfig,
    DiscoveredDataset,
    JobClaim,
    PermittedProfilePayload,
)
from datapilot_agent.export_gate import sanitize_and_verify_export

logger = logging.getLogger("datapilot_agent.client")


class CloudAPIError(Exception):
    """Exception raised when cloud control plane returns an error."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(f"Cloud API Error {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


class ControlPlaneClient:
    """HTTP Client connecting the local agent to the DataPilot Control Plane."""

    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.base_url = config.cloud_api_url.rstrip("/")
        self._http = httpx.Client(
            base_url=self.base_url,
            timeout=15.0,
            headers={"User-Agent": f"DataPilot-Agent/{config.runtime_version}"},
        )
        if not self.config.agent_token and getattr(self.config, "data_dir", None):
            creds_path = Path(self.config.data_dir) / ".agent_credentials.json"
            if creds_path.is_file():
                try:
                    data = json.loads(creds_path.read_text(encoding="utf-8"))
                    self.config.agent_id = UUID(data["agent_id"])
                    self.config.agent_token = data["agent_token"]
                    self.config.organization_id = UUID(data["organization_id"])
                except Exception:
                    pass

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> ControlPlaneClient:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    @property
    def auth_headers(self) -> dict[str, str]:
        if not self.config.agent_token:
            raise ValueError("Agent is not authenticated; agent_token is missing.")
        return {"Authorization": f"Bearer {self.config.agent_token}"}

    def enroll(self, enrollment_token: str) -> dict[str, Any]:
        """Enroll the local agent using an organization-issued one-time enrollment token."""
        url = "/agent/v1/enroll"
        payload = {
            "enrollment_token": enrollment_token,
            "approved_name": self.config.agent_name,
            "runtime_version": self.config.runtime_version,
            "capabilities": ["csv", "parquet", "excel", "profiling", "pii_detection"],
        }
        res = self._http.post(url, json=payload)
        if res.status_code != 201:
            raise CloudAPIError(res.status_code, res.text)

        data = res.json()
        self.config.agent_id = UUID(data["agent_id"])
        self.config.agent_token = data["agent_token"]
        self.config.organization_id = UUID(data["organization_id"])

        if getattr(self.config, "data_dir", None):
            creds_path = Path(self.config.data_dir) / ".agent_credentials.json"
            try:
                creds_path.write_text(
                    json.dumps({
                        "agent_id": str(self.config.agent_id),
                        "agent_token": self.config.agent_token,
                        "organization_id": str(self.config.organization_id),
                    }, indent=2),
                    encoding="utf-8",
                )
            except Exception:
                pass

        return data

    def send_heartbeat(self) -> dict[str, Any]:
        """Send liveness heartbeat to the control plane."""
        url = "/agent/v1/heartbeat"
        res = self._http.post(url, headers=self.auth_headers)
        if res.status_code != 200:
            raise CloudAPIError(res.status_code, res.text)
        return res.json()

    def list_projects(self) -> list[dict[str, Any]]:
        """List active projects in the agent's organization for folder routing."""
        url = "/agent/v1/projects"
        res = self._http.get(url, headers=self.auth_headers)
        if res.status_code != 200:
            raise CloudAPIError(res.status_code, res.text)
        return res.json()

    def register_dataset(self, project_id: UUID, dataset: DiscoveredDataset) -> UUID:
        """Register a discovered local dataset using ONLY its opaque reference and alias.
        
        NEVER sends local filesystem paths or raw data.
        """
        url = "/agent/v1/dataset-registrations"
        payload = {
            "project_id": str(project_id),
            "opaque_local_ref": dataset.opaque_local_ref,
            "approved_alias": dataset.approved_alias,
            "format": dataset.format,
        }
        res = self._http.post(url, json=payload, headers=self.auth_headers)
        if res.status_code != 201:
            raise CloudAPIError(res.status_code, res.text)

        data = res.json()
        return UUID(data["dataset_id"])

    def claim_job(self) -> JobClaim | None:
        """Poll the cloud control plane for any assigned work.
        
        Returns None if no jobs are currently available.
        """
        url = "/agent/v1/jobs/claim"
        res = self._http.post(url, headers=self.auth_headers)
        if res.status_code != 200:
            raise CloudAPIError(res.status_code, res.text)

        data = res.json()
        if not data:
            return None

        return JobClaim(
            job_id=UUID(data["job_id"]),
            operation=data["operation"],
            payload=data.get("payload", {}),
            lease_token=data["lease_token"],
        )

    def submit_job_results(
        self,
        job_id: UUID,
        lease_token: str,
        profile: PermittedProfilePayload,
        sentinels_to_verify: set[str] | None = None,
    ) -> dict[str, Any]:
        """Submit permitted profile metadata to the cloud control plane.
        
        MANDATORY: Runs the payload through export_gate before sending.
        """
        # 1. Gatekeeper inspection
        verified_dict = sanitize_and_verify_export(profile, sentinels_to_verify)

        # 2. Package request
        url = f"/agent/v1/jobs/{job_id}/results"
        payload = {
            "lease_token": lease_token,
            "profile": verified_dict,
        }

        # 3. Transmit
        res = self._http.post(url, json=payload, headers=self.auth_headers)
        if res.status_code != 200:
            raise CloudAPIError(res.status_code, res.text)

        return res.json()

    def submit_experiment_results(
        self,
        org_id: UUID,
        project_id: UUID,
        experiment_payload: dict[str, Any],
        user_token: str | None = None,
        sentinels_to_verify: set[str] | None = None,
    ) -> dict[str, Any]:
        """Submit permitted experiment metadata & metrics to the control plane.

        MANDATORY: Runs payload through ExportGate before sending.
        """
        from datapilot_agent.export_gate import ExportGate, PermittedExportType
        gate = ExportGate()
        verified_dict = gate.validate_and_sanitize(
            PermittedExportType.EXPERIMENT_RESULT,
            experiment_payload,
            sentinels_to_verify,
        )

        headers = self.auth_headers.copy()
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"

        url = f"/api/v1/organizations/{org_id}/projects/{project_id}/experiments/ingest"
        res = self._http.post(url, json=verified_dict, headers=headers)
        if res.status_code != 201:
            raise CloudAPIError(res.status_code, res.text)
        return res.json()

