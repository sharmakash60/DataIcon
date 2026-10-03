"""DataPilot Client Data Agent - Local Privacy-Preserving Runtime."""

from datapilot_agent.contracts import (
    AgentConfig,
    ColumnSummary,
    DiscoveredDataset,
    PermittedProfilePayload,
    QualityFindingSummary,
)
from datapilot_agent.discovery import discover_local_datasets
from datapilot_agent.export_gate import SecurityLeakException, sanitize_and_verify_export
from datapilot_agent.loaders import load_dataset
from datapilot_agent.profiler import profile_dataframe, profile_dataset_file
from datapilot_agent.runner import AgentRunner

__version__ = "0.2.0"

__all__ = [
    "AgentConfig",
    "AgentRunner",
    "ColumnSummary",
    "DiscoveredDataset",
    "PermittedProfilePayload",
    "QualityFindingSummary",
    "SecurityLeakException",
    "discover_local_datasets",
    "load_dataset",
    "profile_dataframe",
    "profile_dataset_file",
    "sanitize_and_verify_export",
]
