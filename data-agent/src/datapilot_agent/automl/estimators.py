"""Estimator factory and uniform wrapper interface.

Supports all required algorithms for Classification and Regression:
- Baseline (DummyClassifier / DummyRegressor)
- Logistic Regression / Linear Regression
- Random Forest
- XGBoost
- LightGBM
- CatBoost
"""

from typing import Any, Dict, Optional, Tuple
import numpy as np
from catboost import CatBoostClassifier, CatBoostRegressor
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression
from xgboost import XGBClassifier, XGBRegressor

from .schemas import MLProblemType, ModelName


class EstimatorWrapper:
    """Uniform wrapper for sklearn, xgboost, lightgbm, and catboost estimators."""

    def __init__(
        self,
        name: str,
        algorithm_key: ModelName,
        model: Any,
        is_baseline: bool = False,
    ):
        self.name = name
        self.algorithm_key = algorithm_key
        self.model = model
        self.is_baseline = is_baseline

    def fit(self, X: np.ndarray, y: np.ndarray):
        self.model.fit(X, y)
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X)

    def predict_proba(self, X: np.ndarray) -> Optional[np.ndarray]:
        if hasattr(self.model, "predict_proba"):
            try:
                return self.model.predict_proba(X)
            except Exception:
                return None
        return None

    def get_params(self) -> Dict[str, Any]:
        if hasattr(self.model, "get_params"):
            try:
                raw_params = self.model.get_params()
                # Keep JSON-serializable types only
                clean_params = {}
                for k, v in raw_params.items():
                    if isinstance(v, (str, int, float, bool, list, dict, type(None))):
                        clean_params[k] = v
                    else:
                        clean_params[k] = str(v)
                return clean_params
            except Exception:
                pass
        return {}


def create_estimator(
    algorithm_key: ModelName,
    problem_type: MLProblemType,
    params: Optional[Dict[str, Any]] = None,
    random_seed: int = 42,
) -> EstimatorWrapper:
    """Instantiate estimator wrapper with optional hyperparameter overrides."""
    p = params.copy() if params else {}

    if problem_type == MLProblemType.CLASSIFICATION:
        if algorithm_key == ModelName.BASELINE:
            model = DummyClassifier(strategy="most_frequent")
            return EstimatorWrapper("Baseline (Dummy)", algorithm_key, model, is_baseline=True)

        elif algorithm_key == ModelName.LOGISTIC_REGRESSION:
            default_p = {"max_iter": 1000, "random_state": random_seed}
            default_p.update(p)
            model = LogisticRegression(**default_p)
            return EstimatorWrapper("Logistic Regression", algorithm_key, model)

        elif algorithm_key == ModelName.RANDOM_FOREST_CLASSIFIER:
            default_p = {"n_estimators": 50, "random_state": random_seed, "n_jobs": -1}
            default_p.update(p)
            model = RandomForestClassifier(**default_p)
            return EstimatorWrapper("Random Forest", algorithm_key, model)

        elif algorithm_key == ModelName.XGBOOST_CLASSIFIER:
            default_p = {
                "n_estimators": 50,
                "random_state": random_seed,
                "eval_metric": "logloss",
                "use_label_encoder": False,
                "verbosity": 0,
            }
            default_p.update(p)
            model = XGBClassifier(**default_p)
            return EstimatorWrapper("XGBoost", algorithm_key, model)

        elif algorithm_key == ModelName.LIGHTGBM_CLASSIFIER:
            default_p = {
                "n_estimators": 50,
                "random_state": random_seed,
                "verbose": -1,
            }
            default_p.update(p)
            model = LGBMClassifier(**default_p)
            return EstimatorWrapper("LightGBM", algorithm_key, model)

        elif algorithm_key == ModelName.CATBOOST_CLASSIFIER:
            default_p = {
                "iterations": 50,
                "random_seed": random_seed,
                "verbose": 0,
            }
            default_p.update(p)
            model = CatBoostClassifier(**default_p)
            return EstimatorWrapper("CatBoost", algorithm_key, model)

        else:
            raise ValueError(f"Unsupported classification algorithm: {algorithm_key}")

    else:  # REGRESSION
        if algorithm_key == ModelName.BASELINE:
            model = DummyRegressor(strategy="mean")
            return EstimatorWrapper("Baseline (Mean)", algorithm_key, model, is_baseline=True)

        elif algorithm_key == ModelName.LINEAR_REGRESSION:
            model = LinearRegression(**p)
            return EstimatorWrapper("Linear Regression", algorithm_key, model)

        elif algorithm_key == ModelName.RANDOM_FOREST_REGRESSOR:
            default_p = {"n_estimators": 50, "random_state": random_seed, "n_jobs": -1}
            default_p.update(p)
            model = RandomForestRegressor(**default_p)
            return EstimatorWrapper("Random Forest", algorithm_key, model)

        elif algorithm_key == ModelName.XGBOOST_REGRESSOR:
            default_p = {
                "n_estimators": 50,
                "random_state": random_seed,
                "verbosity": 0,
            }
            default_p.update(p)
            model = XGBRegressor(**default_p)
            return EstimatorWrapper("XGBoost", algorithm_key, model)

        elif algorithm_key == ModelName.LIGHTGBM_REGRESSOR:
            default_p = {
                "n_estimators": 50,
                "random_state": random_seed,
                "verbose": -1,
            }
            default_p.update(p)
            model = LGBMRegressor(**default_p)
            return EstimatorWrapper("LightGBM", algorithm_key, model)

        elif algorithm_key == ModelName.CATBOOST_REGRESSOR:
            default_p = {
                "iterations": 50,
                "random_seed": random_seed,
                "verbose": 0,
            }
            default_p.update(p)
            model = CatBoostRegressor(**default_p)
            return EstimatorWrapper("CatBoost", algorithm_key, model)

        else:
            raise ValueError(f"Unsupported regression algorithm: {algorithm_key}")


def get_default_algorithms(problem_type: MLProblemType) -> list[ModelName]:
    """Get ordered list of candidate algorithms for problem type."""
    if problem_type == MLProblemType.CLASSIFICATION:
        return [
            ModelName.LOGISTIC_REGRESSION,
            ModelName.RANDOM_FOREST_CLASSIFIER,
            ModelName.XGBOOST_CLASSIFIER,
            ModelName.LIGHTGBM_CLASSIFIER,
            ModelName.CATBOOST_CLASSIFIER,
        ]
    else:
        return [
            ModelName.LINEAR_REGRESSION,
            ModelName.RANDOM_FOREST_REGRESSOR,
            ModelName.XGBOOST_REGRESSOR,
            ModelName.LIGHTGBM_REGRESSOR,
            ModelName.CATBOOST_REGRESSOR,
        ]
