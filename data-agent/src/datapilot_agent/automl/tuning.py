"""Optuna Hyperparameter Tuning Module.

Executes local bayesian optimization for candidate algorithms with bounded budgets.
Extracts structured trial history for experiment tracking.
"""

import time
from typing import Any, Callable, Dict, List, Optional, Tuple
import numpy as np
import optuna

from .estimators import create_estimator
from .metrics import evaluate_model, is_higher_better
from .schemas import MLProblemType, ModelName, TuningTrialResult


class HyperparameterTuner:
    """Tunes estimator hyperparameters using Optuna."""

    def __init__(
        self,
        problem_type: MLProblemType,
        primary_metric: str,
        n_trials: int = 15,
        timeout_seconds: Optional[int] = 60,
        random_seed: int = 42,
    ):
        self.problem_type = problem_type
        self.primary_metric = primary_metric
        self.n_trials = n_trials
        self.timeout_seconds = timeout_seconds
        self.random_seed = random_seed
        optuna.logging.set_verbosity(optuna.logging.WARNING)

    def _suggest_params(self, trial: optuna.Trial, algorithm_key: ModelName) -> Dict[str, Any]:
        """Sample hyperparameters based on model family."""
        if algorithm_key == ModelName.LOGISTIC_REGRESSION:
            return {
                "C": trial.suggest_float("C", 1e-3, 10.0, log=True),
            }
        elif algorithm_key == ModelName.LINEAR_REGRESSION:
            return {
                "fit_intercept": trial.suggest_categorical("fit_intercept", [True, False]),
            }
        elif algorithm_key in [ModelName.RANDOM_FOREST_CLASSIFIER, ModelName.RANDOM_FOREST_REGRESSOR]:
            return {
                "n_estimators": trial.suggest_int("n_estimators", 20, 80, step=10),
                "max_depth": trial.suggest_int("max_depth", 3, 12),
                "min_samples_split": trial.suggest_int("min_samples_split", 2, 8),
            }
        elif algorithm_key in [ModelName.XGBOOST_CLASSIFIER, ModelName.XGBOOST_REGRESSOR]:
            return {
                "n_estimators": trial.suggest_int("n_estimators", 20, 80, step=10),
                "max_depth": trial.suggest_int("max_depth", 3, 7),
                "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.25, log=True),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
            }
        elif algorithm_key in [ModelName.LIGHTGBM_CLASSIFIER, ModelName.LIGHTGBM_REGRESSOR]:
            return {
                "n_estimators": trial.suggest_int("n_estimators", 20, 80, step=10),
                "max_depth": trial.suggest_int("max_depth", 3, 7),
                "num_leaves": trial.suggest_int("num_leaves", 8, 40),
                "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.25, log=True),
            }
        elif algorithm_key in [ModelName.CATBOOST_CLASSIFIER, ModelName.CATBOOST_REGRESSOR]:
            return {
                "iterations": trial.suggest_int("iterations", 20, 80, step=10),
                "depth": trial.suggest_int("depth", 3, 7),
                "learning_rate": trial.suggest_float("learning_rate", 0.02, 0.25, log=True),
                "l2_leaf_reg": trial.suggest_float("l2_leaf_reg", 1.0, 8.0),
            }
        return {}

    def tune(
        self,
        algorithm_key: ModelName,
        X_train: np.ndarray,
        y_train: np.ndarray,
        X_val: np.ndarray,
        y_val: np.ndarray,
    ) -> Tuple[Dict[str, Any], float, List[TuningTrialResult]]:
        """Run Optuna study and return (best_params, best_score, trials_history)."""
        higher_better = is_higher_better(self.primary_metric)
        direction = "maximize" if higher_better else "minimize"

        sampler = optuna.samplers.TPESampler(seed=self.random_seed)
        study = optuna.create_study(direction=direction, sampler=sampler)

        trials_history: List[TuningTrialResult] = []

        def objective(trial: optuna.Trial) -> float:
            t0 = time.perf_counter()
            params = self._suggest_params(trial, algorithm_key)

            try:
                wrapper = create_estimator(
                    algorithm_key,
                    self.problem_type,
                    params=params,
                    random_seed=self.random_seed,
                )
                wrapper.fit(X_train, y_train)

                y_pred = wrapper.predict(X_val)
                y_prob = wrapper.predict_proba(X_val) if self.problem_type == MLProblemType.CLASSIFICATION else None

                metrics = evaluate_model(self.problem_type, y_val, y_pred, y_prob)
                score = metrics.get(self.primary_metric, 0.0)

                duration = time.perf_counter() - t0
                trials_history.append(
                    TuningTrialResult(
                        trial_number=trial.number,
                        model_name=algorithm_key.value,
                        parameters=params,
                        score=round(score, 5),
                        state="COMPLETE",
                        duration_seconds=round(duration, 3),
                    )
                )
                return score
            except Exception as e:
                duration = time.perf_counter() - t0
                trials_history.append(
                    TuningTrialResult(
                        trial_number=trial.number,
                        model_name=algorithm_key.value,
                        parameters=params,
                        score=0.0 if higher_better else 999999.0,
                        state="FAIL",
                        duration_seconds=round(duration, 3),
                    )
                )
                return 0.0 if higher_better else 999999.0

        study.optimize(
            objective,
            n_trials=self.n_trials,
            timeout=self.timeout_seconds,
        )

        best_params = study.best_params if len(study.trials) > 0 else {}
        best_score = study.best_value if len(study.trials) > 0 else 0.0

        return best_params, float(best_score), trials_history
