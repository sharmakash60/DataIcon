"""Local Dataset Discovery with Path Traversal Protection and Opaque References.

Guarantees:
1. Real local absolute filesystem paths are NEVER sent to the cloud.
2. Only opaque reference tokens and sanitized aliases are used for identification.
3. Path traversal attacks (symlink escapes, '..') are strictly rejected.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Literal

from datapilot_agent.contracts import DiscoveredDataset


SUPPORTED_EXTENSIONS: dict[str, Literal["csv", "parquet", "excel"]] = {
    ".csv": "csv",
    ".parquet": "parquet",
    ".xlsx": "excel",
    ".xls": "excel",
}


def sanitize_alias(filename: str) -> str:
    """Sanitize a filename to a safe alias without filesystem special characters."""
    base = Path(filename).stem
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", base)
    cleaned = re.sub(r"_+", "_", cleaned).strip("_")
    return cleaned[:80] or "unnamed_dataset"


def compute_opaque_ref(relative_path: str) -> str:
    """Compute a deterministic, non-reversible opaque token for a local file reference."""
    normalized = relative_path.replace("\\", "/").strip("/")
    hashed = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"ds_ref_{hashed[:24]}"


def discover_local_datasets(base_dir: Path | str) -> list[DiscoveredDataset]:
    """Scan base directory for supported dataset files.
    
    Verifies canonical paths to prevent path traversal outside base_dir.
    Returns discovered datasets with opaque references.
    """
    root = Path(base_dir).resolve()
    if not root.exists():
        raise FileNotFoundError(f"Configured dataset directory does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"Configured dataset path is not a directory: {root}")

    discovered: list[DiscoveredDataset] = []

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        # Prevent symlink directory traversal escaping root
        try:
            resolved = path.resolve()
            resolved.relative_to(root)
        except (ValueError, RuntimeError):
            # Outside root directory - skip for security
            continue

        ext = path.suffix.lower()
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        # Calculate relative path for stable opaque reference
        rel_obj = resolved.relative_to(root)
        rel_path = str(rel_obj)
        opaque_ref = compute_opaque_ref(rel_path)
        alias = sanitize_alias(path.name)
        fmt = SUPPORTED_EXTENSIONS[ext]
        file_size = resolved.stat().st_size
        project_folder = rel_obj.parts[0] if len(rel_obj.parts) > 1 else None

        discovered.append(
            DiscoveredDataset(
                local_path=resolved,
                opaque_local_ref=opaque_ref,
                approved_alias=alias,
                format=fmt,
                file_size_bytes=file_size,
                project_folder=project_folder,
            )
        )

    # Sort deterministically by approved alias and opaque reference
    discovered.sort(key=lambda d: (d.approved_alias, d.opaque_local_ref))
    return discovered
