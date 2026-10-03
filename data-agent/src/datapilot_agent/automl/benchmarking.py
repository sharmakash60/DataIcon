"""Model Benchmarking and Comparison Suite.

Evaluates multiple estimators across identical cross-validation folds.
Ranks candidates into a standardized performance leaderboard.
"""

import time
from typing import Dict, List, Tuple
import numpy as np
import pandas as pd

from .estimators import EstimatorWrapper, create_estimator
from .metrics import evaluate_model, is_higher_better
from .preprocessing import TabularPreprocessor
from .schemas import (
    LeaderboardEntry,
    MLProblemType,
    ModelBenchmarkResult,
    ModelName,
)


class ModelBenchmarker:
    """Benchmarks and ranks models across identical cross-validation folds."""

    def __init__(
        self,
        problem_type: MLProblemType,
        primary_metric: str,
        random_seed: int = 42,
    ):
        self.problem_type = problem_type
        self.primary_metric = primary_metric
        self.random_seed = random_seed

    def evaluate_cv(
        self,
        algorithm_key: ModelName,
        X: pd.DataFrame,
        y: pd.Series,
        cv_splits: List[Tuple[np.ndarray, np.ndarray]],
        params: Dict = None,
    ) -> ModelBenchmarkResult:
        """Run k-fold cross validation for a single model with fold-isolated preprocessing."""
        fold_scores: List[float] = []
        all_metrics: Dict[str, List[float]] = {}
        total_train_time = 0.0
        total_eval_time = 0.0
        total_eval_samples = 0

        y_arr = y.to_numpy()
        last_params = {}

        for train_idx, val_idx in cv_splits:
            X_train_raw = X.iloc[train_idx]
            y_train = y_arr[train_idx]
            X_val_raw = X.iloc[val_idx]
            y_val = y_arr[val_idx]

            # Fit preprocessor strictly on training fold
            preprocessor = TabularPreprocessor()
            X_train = preprocessor.fit_transform(X_train_raw)
            X_val = preprocessor.transform(X_val_raw)

            wrapper = create_estimator(
                algorithm_key,
                self.problem_type,
                params=params,
                random_seed=self.random_seed,
            )

            # Fit model
            t_fit_start = time.perf_counter()
            wrapper.fit(X_train, y_train)
            total_train_time += time.perf_counter() - t_fit_start

            # Inference & Latency
            t_eval_start = time.perf_counter()
            y_pred = wrapper.predict(X_val)
            y_prob = wrapper.predict_proba(X_val) if self.problem_type == MLProblemType.CLASSIFICATION else None
            total_eval_time += time.perf_counter() - t_eval_start
            total_eval_samples += len(X_val)

            metrics = evaluate_model(self.problem_type, y_val, y_pred, y_prob)
            score = metrics.get(self.primary_metric, 0.0)
            fold_scores.append(round(score, 5))

            for k, v in metrics.items():
                if k not in all_metrics:
                    all_metrics[k] = []
                all_metrics[k].append(v)

            last_params = wrapper.get_params()

        # Compute summary metrics
        mean_metrics = {k: round(float(np.mean(vals)), 5) for k, vals in all_metrics.items()}
        mean_score = round(float(np.mean(fold_scores)), 5)
        std_score = round(float(np.std(fold_scores)), 5)
        avg_train_time = round(total_train_time / len(cv_splits), 4)

        # Latency in milliseconds per 1000 samples
        latency_ms = (
            round((total_eval_time / total_eval_samples) * 1000.0, 3)
            if total_eval_samples > 0
            else 0.0
        )

        name_display = algorithm_key.value.replace("_", " ").title()

        return ModelBenchmarkResult(
            model_name=name_display,
            algorithm_key=algorithm_key,
            is_baseline=(algorithm_key == ModelName.BASELINE),
            hyperparameters=last_params,
            cv_scores=fold_scores,
            mean_cv_score=mean_score,
            std_cv_score=std_score,
            metrics=mean_metrics,
            training_time_seconds=avg_train_time,
            inference_latency_ms=latency_ms,
        )

    def create_leaderboard(
        self,
        benchmarks: List[ModelBenchmarkResult],
    ) -> List[LeaderboardEntry]:
        """Rank model benchmark results into an ordered leaderboard."""
        higher_better = is_higher_better(self.primary_metric)

        sorted_benchmarks = sorted(
            benchmarks,
            key=lambda b: b.mean_cv_score,
            reverse=higher_better,
        )

        leaderboard = []
        for idx, bm in enumerate(sorted_benchmarks, start=1):
            is_best = (idx == 1)
            leaderboard.append(
                LeaderboardEntry(
                    rank=idx,
                    model_name=bm.model_name,
                    algorithm_key=bm.algorithm_key,
                    is_baseline=bm.is_baseline,
                    primary_metric_name=self.primary_metric,
                    primary_metric_score=bm.mean_cv_score,
                    std_score=bm.std_cv_score,
                    training_time_seconds=bm.training_time_seconds,
                    inference_latency_ms=bm.inference_latency_ms,
                    is_best_model=is_best,
                )
            )
        return leaderboard
