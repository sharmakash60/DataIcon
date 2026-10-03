"""DataPilot V1 Client Data Plane AutoML Engine.

Executes all preprocessing, splitting, training, benchmarking, and Optuna tuning
strictly inside the client environment. Raw training data never leaves this boundary.
"""

from .engine import AutoMLEngine
from .schemas import (
    AutoMLConfig,
    ExperimentResultPayload,
    LeaderboardEntry,
    MLProblemType,
    ModelBenchmarkResult,
    ModelName,
    PrimaryMetric,
    TuningTrialResult,
)

__all__ = [
    "AutoMLEngine",
    "AutoMLConfig",
    "ExperimentResultPayload",
    "LeaderboardEntry",
    "MLProblemType",
    "ModelBenchmarkResult",
    "ModelName",
    "PrimaryMetric",
    "TuningTrialResult",
]
