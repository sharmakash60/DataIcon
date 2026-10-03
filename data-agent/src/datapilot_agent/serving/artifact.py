"""Local Model Artifact Manager.

Enforces:
1. Artifacts are saved and loaded strictly within the client local environment.
2. Zero serialization to or retrieval from the cloud control plane.
3. Integrity checks upon loading (ensuring required preprocessor and metadata exist).
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass, field
import json
import hashlib
import hmac
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import joblib

from datapilot_agent.automl.preprocessing import TabularPreprocessor
from datapilot_agent.serving.schema import FeatureFieldSchema, ModelMetadataResponse

DEFAULT_SIGNING_KEY = "datapilot-local-artifact-signing-key-32b"


def _compute_hmac(file_path: Path, key: bytes) -> str:
    """Compute HMAC-SHA256 digest of a binary file."""
    h = hmac.new(key, digestmod=hashlib.sha256)
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class ModelArtifactBundle:
    """In-memory bundle containing the trained model, preprocessor, and metadata."""
    model: Any
    preprocessor: TabularPreprocessor
    model_name: str
    problem_type: str  # "classification" | "regression"
    target_name: str
    primary_metric: str
    feature_names: List[str]
    feature_schema: List[FeatureFieldSchema]
    classes: Optional[List[Any]] = None
    model_version: str = "v1.0.0"
    metrics: Dict[str, float] = field(default_factory=dict)
    hyperparameters: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(
        default_factory=lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )

    def to_metadata_response(self, deployment_type: str = "local") -> ModelMetadataResponse:
        return ModelMetadataResponse(
            model_name=self.model_name,
            model_version=self.model_version,
            problem_type=self.problem_type,  # type: ignore
            target_name=self.target_name,
            primary_metric=self.primary_metric,
            feature_names=self.feature_names,
            feature_schema=self.feature_schema,
            classes=self.classes,
            created_at=self.created_at,
            deployment_type=deployment_type,
        )


def save_model_artifact(
    bundle: ModelArtifactBundle,
    target_dir: Path | str,
    artifact_name: str = "model_bundle.joblib",
    signing_key: Optional[str] = None,
) -> Path:
    """Save the complete model bundle locally inside the client environment.
    
    Creates:
    - {target_dir}/{artifact_name}: Complete binary bundle (model + preprocessor + metadata)
    - {target_dir}/{artifact_name}.sig: HMAC-SHA256 signature guaranteeing artifact integrity
    - {target_dir}/metadata.json: JSON metadata for external inspection without loading model
    """
    dest_dir = Path(target_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    bundle_path = dest_dir / artifact_name

    payload = {
        "model": bundle.model,
        "preprocessor": bundle.preprocessor,
        "metadata": {
            "model_name": bundle.model_name,
            "model_version": bundle.model_version,
            "problem_type": bundle.problem_type,
            "target_name": bundle.target_name,
            "primary_metric": bundle.primary_metric,
            "feature_names": bundle.feature_names,
            "feature_schema": [f.model_dump() for f in bundle.feature_schema],
            "classes": bundle.classes,
            "metrics": bundle.metrics,
            "hyperparameters": bundle.hyperparameters,
            "created_at": bundle.created_at,
        },
    }

    joblib.dump(payload, bundle_path, compress=3)

    # SEC-02: Cryptographic signature to protect against insecure deserialization / tampering
    key = (signing_key or os.getenv("DATAPILOT_ARTIFACT_KEY") or DEFAULT_SIGNING_KEY).encode("utf-8")
    sig = _compute_hmac(bundle_path, key)
    sig_path = dest_dir / f"{artifact_name}.sig"
    with open(sig_path, "w", encoding="utf-8") as f:
        f.write(sig)

    # Write separate metadata.json for lightweight client inspection
    metadata_json_path = dest_dir / "metadata.json"
    with open(metadata_json_path, "w", encoding="utf-8") as f:
        json.dump(payload["metadata"], f, indent=2)

    return bundle_path


def load_model_artifact(
    source_path: Path | str,
    signing_key: Optional[str] = None,
    verify_signature: bool = True,
) -> ModelArtifactBundle:
    """Load and validate a local model artifact bundle with HMAC verification."""
    src = Path(source_path)
    if src.is_dir():
        candidate = src / "model_bundle.joblib"
        if candidate.exists():
            src = candidate
        else:
            raise FileNotFoundError(f"No model_bundle.joblib found in directory: {source_path}")

    if not src.exists():
        raise FileNotFoundError(f"Model artifact file does not exist: {source_path}")

    # SEC-02: Cryptographic signature verification before deserialization
    if verify_signature:
        sig_candidates = [
            src.with_name(f"{src.name}.sig"),
            src.with_suffix(".sig"),
            src.parent / f"{src.name}.sig",
        ]
        sig_path = next((p for p in sig_candidates if p.exists()), None)
        if not sig_path:
            raise ValueError(
                f"Security error [SEC-02]: Missing cryptographic signature (.sig) for model artifact at {src}. "
                "Deserialization aborted to prevent insecure code execution."
            )
        key = (signing_key or os.getenv("DATAPILOT_ARTIFACT_KEY") or DEFAULT_SIGNING_KEY).encode("utf-8")
        expected_sig = sig_path.read_text(encoding="utf-8").strip()
        actual_sig = _compute_hmac(src, key)
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError(
                f"Security error [SEC-02]: Cryptographic HMAC verification failed for artifact at {src}. "
                "Artifact may have been tampered with or corrupted."
            )

    try:
        data = joblib.load(src)
    except Exception as exc:
        raise ValueError(f"Failed to deserialize model artifact at {src}: {exc}") from exc

    if not isinstance(data, dict) or "model" not in data or "preprocessor" not in data:
        raise ValueError(f"Corrupt or invalid model artifact structure at {src}")

    meta = data.get("metadata", {})
    raw_schema = meta.get("feature_schema", [])
    feature_schema = [
        FeatureFieldSchema(**f) if isinstance(f, dict) else f for f in raw_schema
    ]

    return ModelArtifactBundle(
        model=data["model"],
        preprocessor=data["preprocessor"],
        model_name=meta.get("model_name", "Unknown Model"),
        model_version=meta.get("model_version", "v1.0.0"),
        problem_type=meta.get("problem_type", "classification"),
        target_name=meta.get("target_name", "target"),
        primary_metric=meta.get("primary_metric", "accuracy"),
        feature_names=meta.get("feature_names", []),
        feature_schema=feature_schema,
        classes=meta.get("classes"),
        metrics=meta.get("metrics", {}),
        hyperparameters=meta.get("hyperparameters", {}),
        created_at=meta.get("created_at", datetime.datetime.now(datetime.timezone.utc).isoformat()),
    )
