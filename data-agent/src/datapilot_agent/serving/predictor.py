"""Local Model Predictor.

Executes low-latency local inference inside the client environment.
Guarantees:
- Input feature validation against model schema
- Automatic preprocessing (scaling, imputation, one-hot encoding)
- Both single-record and batch inference
- Probability estimation for classification
- Strict zero-egress policy for all feature inputs and prediction outputs
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional, Union
import numpy as np
import pandas as pd

from datapilot_agent.serving.artifact import ModelArtifactBundle, load_model_artifact
from datapilot_agent.serving.schema import (
    ModelMetadataResponse,
    PredictionResult,
)

logger = logging.getLogger("datapilot_agent.serving.predictor")


class LocalPredictor:
    """In-memory inference engine executing model predictions locally."""

    def __init__(self, bundle_or_path: Union[ModelArtifactBundle, str]):
        if isinstance(bundle_or_path, ModelArtifactBundle):
            self.bundle = bundle_or_path
        else:
            self.bundle = load_model_artifact(bundle_or_path)

        self.model = self.bundle.model
        self.preprocessor = self.bundle.preprocessor
        self.feature_names = self.bundle.feature_names
        self.problem_type = self.bundle.problem_type
        self.classes = self.bundle.classes

    def get_metadata(self, deployment_type: str = "local") -> ModelMetadataResponse:
        return self.bundle.to_metadata_response(deployment_type=deployment_type)

    def predict(
        self,
        features: Union[Dict[str, Any], List[Dict[str, Any]]],
        request_id: Optional[str] = None,
    ) -> PredictionResult:
        """Execute local model prediction on tabular features."""
        start_time = time.perf_counter()
        req_id = request_id or str(uuid.uuid4())
        warnings: List[str] = []

        # Standardize input to list of dicts
        if isinstance(features, dict):
            records = [features]
        elif isinstance(features, list):
            if not features:
                raise ValueError("Prediction request contains an empty list of features.")
            records = features
        else:
            raise TypeError(f"Invalid features type: {type(features)}. Expected dict or list of dicts.")

        # Construct DataFrame
        input_df = pd.DataFrame(records)

        # Validate feature completeness and alignment
        missing_cols = [c for c in self.feature_names if c not in input_df.columns]
        if missing_cols:
            warnings.append(
                f"Features missing from input: {missing_cols}. Missing values will be imputed."
            )
            for c in missing_cols:
                input_df[c] = np.nan

        # Align column order strictly to model feature names
        aligned_df = input_df[self.feature_names].copy()

        # Transform features through preprocessor
        try:
            X_proc = self.preprocessor.transform(aligned_df)
        except Exception as exc:
            logger.error("Preprocessing failed for prediction: %s", exc)
            raise ValueError(f"Feature preprocessing error: {exc}") from exc

        # Execute model prediction
        try:
            raw_preds = self.model.predict(X_proc)
        except Exception as exc:
            logger.error("Model prediction failed: %s", exc)
            raise RuntimeError(f"Model inference failed: {exc}") from exc

        # Convert numpy types to native Python types
        if isinstance(raw_preds, np.ndarray):
            predictions: List[Any] = raw_preds.tolist()
        else:
            predictions = list(raw_preds)

        # Compute probabilities if classification
        probabilities: Optional[List[Dict[str, float]]] = None
        if self.problem_type == "classification":
            prob_matrix = None
            if hasattr(self.model, "predict_proba"):
                try:
                    prob_matrix = self.model.predict_proba(X_proc)
                except Exception as exc:
                    logger.debug("predict_proba failed: %s", exc)

            if prob_matrix is not None and isinstance(prob_matrix, np.ndarray):
                # Determine class labels
                if self.classes and len(self.classes) == prob_matrix.shape[1]:
                    class_labels = [str(c) for c in self.classes]
                elif hasattr(self.model, "classes_") and len(self.model.classes_) == prob_matrix.shape[1]:
                    class_labels = [str(c) for c in self.model.classes_]
                elif hasattr(self.model, "model") and hasattr(self.model.model, "classes_"):
                    class_labels = [str(c) for c in self.model.model.classes_]
                else:
                    class_labels = [str(i) for i in range(prob_matrix.shape[1])]

                probabilities = []
                for row in prob_matrix:
                    prob_dict = {
                        class_labels[i]: round(float(p), 4) for i, p in enumerate(row)
                    }
                    probabilities.append(prob_dict)

        latency_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        return PredictionResult(
            prediction_id=req_id,
            model_name=self.bundle.model_name,
            model_version=self.bundle.model_version,
            predictions=predictions,
            probabilities=probabilities,
            latency_ms=latency_ms,
            warnings=warnings,
        )
