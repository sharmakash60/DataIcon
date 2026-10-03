"""Critical Privacy Assurance Test Suite.

DEMONSTRATES AND PROVES:
1. RAW DATASET ROWS ARE NEVER SENT TO THE CLOUD API.
2. High-entropy confidential strings, patient records, PII values, and secret tokens
   in dataset cells are completely absent from all network export payloads.
3. Arbitrary remote Python execution is strictly rejected.
"""

from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pandas as pd
import pytest

from datapilot_agent.client import ControlPlaneClient
from datapilot_agent.contracts import AgentConfig, DiscoveredDataset, JobClaim
from datapilot_agent.discovery import discover_local_datasets
from datapilot_agent.export_gate import (
    SecurityLeakException,
    sanitize_and_verify_export,
)
from datapilot_agent.profiler import profile_dataframe, profile_dataset_file
from datapilot_agent.runner import AgentRunner

# Confidential sentinel strings embedded directly inside dataset cells
SENTINELS = [
    "TOP_SECRET_PATIENT_DIAGNOSIS_7721",
    "CONFIDENTIAL_SSN_999-00-1111",
    "SECRET_API_KEY_sk_live_998877665544",
    "PRIVATE_INTERNAL_NOTE_DO_NOT_DISCLOSE",
    "CARD_4012888888881881",
    "CONFIDENTIAL_SALARY_250000_USD",
]


@pytest.fixture
def sensitive_dataset_file(tmp_path: Path) -> Path:
    """Create a temporary CSV file with confidential rows."""
    file_path = tmp_path / "patients_confidential.csv"
    data = {
        "patient_id": [1001, 1002, 1003, 1004, 1005, 1006],
        "ssn": [
            SENTINELS[1],
            "111-22-3333",
            "222-33-4444",
            "333-44-5555",
            "444-55-6666",
            "555-66-7777",
        ],
        "diagnosis": [
            SENTINELS[0],
            "Hypertension",
            "Allergy",
            SENTINELS[3],
            "Healthy",
            "Checkup",
        ],
        "financial_key": [
            SENTINELS[2],
            SENTINELS[4],
            SENTINELS[5],
            "ref_abc_1",
            "ref_abc_2",
            "ref_abc_3",
        ],
        "visit_cost": [150.0, 300.0, 75.5, 200.0, 50.0, 120.0],
    }
    df = pd.DataFrame(data)
    df.to_csv(file_path, index=False)
    return file_path


def test_zero_raw_data_in_profile_export(sensitive_dataset_file: Path):
    """Prove that no sentinel cell value appears anywhere in the generated export."""
    # 1. Profile dataset
    profile = profile_dataset_file(
        file_path=sensitive_dataset_file,
        dataset_ref="ds_ref_confidential_01",
        dataset_format="csv",
    )

    # 2. Pass through export gatekeeper
    export_dict = sanitize_and_verify_export(profile, known_forbidden_values=set(SENTINELS))

    # 3. Deep serialization check
    serialized_payload = str(export_dict)

    # Verify that NONE of the secret sentinel data exists anywhere in the export dictionary
    for sentinel in SENTINELS:
        assert sentinel not in serialized_payload, (
            f"CRITICAL PRIVACY VIOLATION: Sentinel '{sentinel}' leaked into export payload!"
        )

    # Verify that rows are absent as structures
    assert "patient_id" in [c["name"] for c in export_dict["columns"]]
    assert "diagnosis" in [c["name"] for c in export_dict["columns"]]
    # But cell contents like 'Hypertension' or 'Checkup' are absent
    assert "Hypertension" not in serialized_payload
    assert "Allergy" not in serialized_payload


def test_export_gate_detects_and_aborts_on_leaked_sentinel():
    """Prove that if a raw value were somehow inserted, the gate aborts transmission."""
    df = pd.DataFrame({"col_a": [1, 2, 3]})
    profile = profile_dataframe(df, "ref_1", "csv", 100)

    # Simulate an attack where someone tries to embed a sentinel in an approved metadata field
    profile.columns[0].name = f"col_with_{SENTINELS[0]}"

    with pytest.raises(SecurityLeakException, match="CRITICAL PRIVACY VIOLATION"):
        sanitize_and_verify_export(profile, known_forbidden_values=set(SENTINELS))


def test_wire_transmission_contains_zero_raw_rows(sensitive_dataset_file: Path):
    """Intercept HTTP wire traffic and verify zero confidential bytes are transmitted."""
    captured_requests: list[httpx.Request] = []
    discovered = discover_local_datasets(sensitive_dataset_file.parent)
    assert len(discovered) >= 1
    target_ref = discovered[0].opaque_local_ref

    def mock_transport_handler(request: httpx.Request) -> httpx.Response:
        captured_requests.append(request)
        if request.url.path.endswith("/results"):
            return httpx.Response(200, json={"status": "accepted", "summary_id": str(uuid4())})
        elif request.url.path.endswith("/jobs/claim"):
            return httpx.Response(
                200,
                json={
                    "job_id": str(uuid4()),
                    "operation": "profile_dataset",
                    "payload": {"dataset_ref": target_ref},
                    "lease_token": "lease_test_token_123",
                },
            )
        elif request.url.path.endswith("/heartbeat"):
            return httpx.Response(200, json={"status": "ok", "server_time": "2026-09-26T12:00:00Z"})
        elif request.url.path.endswith("/dataset-registrations"):
            return httpx.Response(201, json={"dataset_id": str(uuid4()), "status": "registered"})
        return httpx.Response(404)

    config = AgentConfig(
        cloud_api_url="http://mock-cloud.datapilot.local",
        data_dir=sensitive_dataset_file.parent,
        agent_id=uuid4(),
        agent_token="mock_agent_token_secret",
        organization_id=uuid4(),
        project_id=uuid4(),
    )

    client = ControlPlaneClient(config)
    # Inject mock transport to intercept the wire traffic
    client._http = httpx.Client(
        base_url=config.cloud_api_url,
        transport=httpx.MockTransport(mock_transport_handler),
    )

    runner = AgentRunner(config, client)
    stats = runner.run_once()

    assert stats["discovered"] >= 1
    assert stats["jobs_processed"] == 1
    assert len(captured_requests) >= 1

    # Inspect all wire requests sent across the network
    for req in captured_requests:
        body_bytes = req.content
        body_text = body_bytes.decode("utf-8", errors="replace")

        # Prove that NO sentinel strings or sensitive cell values were transmitted
        for sentinel in SENTINELS:
            assert sentinel not in body_text, (
                f"NETWORK LEAK DETECTED: Wire request to {req.url} contained sentinel '{sentinel}'!"
            )

        assert "Hypertension" not in body_text
        assert "Checkup" not in body_text


def test_reject_arbitrary_remote_python_execution(tmp_path: Path):
    """Prove that arbitrary remote code execution requests are strictly rejected."""
    config = AgentConfig(
        cloud_api_url="http://mock-cloud.datapilot.local",
        data_dir=tmp_path,
        agent_id=uuid4(),
        agent_token="mock_agent_token",
    )
    runner = AgentRunner(config)

    # Malicious or unauthorized job attempting code execution
    malicious_job = JobClaim(
        job_id=uuid4(),
        operation="execute_python_script",
        payload={"script": "import os; os.system('echo compromised')"},
        lease_token="lease_123",
    )

    # Must be rejected immediately without execution
    result = runner.process_next_job
    # Directly verify unsupported operation handling
    runner.client.claim_job = lambda: malicious_job
    handled = runner.process_next_job()
    assert handled is False
