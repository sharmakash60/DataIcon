"""DataPilot Client Data Plane V1 AutoML Engine.

Executes end-to-end tabular machine learning locally inside the customer boundary:
- Strict train/val preprocessing
- Cross-validation splitting
- Baseline model evaluation
- Model benchmarking (Logistic/Linear Regression, Random Forest, XGBoost, LightGBM, CatBoost)
- Optuna hyperparameter optimization
- Leaderboard ranking
- Export gate validation ensuring zero raw training data leaks
"""

import time
from typing import List, Optional
import numpy as np
import pandas as pd

from .benchmarking import ModelBenchmarker
from .estimators import get_default_algorithms
from .schemas import (
    AutoMLConfig,
    ExperimentResultPayload,
    MLProblemType,
    ModelBenchmarkResult,
    ModelName,
    PrimaryMetric,
    TuningTrialResult,
)
from .splitting import DataSplitter
from .tuning import HyperparameterTuner
from ..export_gate import ExportGate, PermittedExportType


class AutoMLEngine:
    """Orchestrates local tabular AutoML within the Client Data Plane."""

    def __init__(self, config: AutoMLConfig):
        self.config = config
        self._set_default_metric()

    def _set_default_metric(self) -> None:
        if self.config.primary_metric is None:
            if self.config.problem_type == MLProblemType.CLASSIFICATION:
                self.config.primary_metric = PrimaryMetric.ROC_AUC
            else:
                self.config.primary_metric = PrimaryMetric.RMSE

    def run(
        self,
        df: pd.DataFrame,
        experiment_name: str = "AutoML Experiment",
    ) -> ExperimentResultPayload:
        """Run the end-to-end AutoML pipeline locally.

        Guarantees that raw data rows are never included in the returned payload.
        """
        start_time = time.perf_counter()

        if self.config.target_column not in df.columns:
            raise ValueError(f"Target column '{self.config.target_column}' not found in dataframe.")

        # Drop rows with null target
        clean_df = df.dropna(subset=[self.config.target_column]).copy()
        if len(clean_df) < 10:
            raise ValueError(f"Dataset too small for AutoML (minimum 10 rows, got {len(clean_df)}).")

        y = clean_df[self.config.target_column]

        # Determine feature columns
        if self.config.feature_columns:
            features = [c for c in self.config.feature_columns if c in clean_df.columns and c != self.config.target_column]
        else:
            features = [c for c in clean_df.columns if c != self.config.target_column]

        if not features:
            raise ValueError("No feature columns available for modeling.")

        X = clean_df[features]

        # 1. Generate CV splits
        splitter = DataSplitter(
            problem_type=self.config.problem_type,
            strategy=self.config.validation_strategy,
            n_splits=self.config.n_splits,
            random_seed=self.config.random_seed,
        )
        cv_splits = splitter.get_cv_splits(X, y)

        # 2. Select algorithms
        algorithms_to_run: List[ModelName] = []
        if self.config.include_baseline:
            algorithms_to_run.append(ModelName.BASELINE)

        if self.config.algorithms:
            for algo in self.config.algorithms:
                if algo not in algorithms_to_run:
                    algorithms_to_run.append(algo)
        else:
            candidates = get_default_algorithms(self.config.problem_type)
            algorithms_to_run.extend(candidates)

        # 3. Model Benchmarking
        benchmarker = ModelBenchmarker(
            problem_type=self.config.problem_type,
            primary_metric=self.config.primary_metric.value,
            random_seed=self.config.random_seed,
        )

        benchmarks: List[ModelBenchmarkResult] = []
        for algo_key in algorithms_to_run:
            res = benchmarker.evaluate_cv(algo_key, X, y, cv_splits)
            benchmarks.append(res)

        # 4. Optuna Hyperparameter Tuning on Top Candidate
        tuning_trials: List[TuningTrialResult] = []
        non_baseline_benchmarks = [b for b in benchmarks if not b.is_baseline]

        if self.config.tune_hyperparameters and non_baseline_benchmarks:
            # Pick best performing algorithm from baseline evaluation
            initial_leaderboard = benchmarker.create_leaderboard(non_baseline_benchmarks)
            top_algo_key = initial_leaderboard[0].algorithm_key

            # Split train and validation for tuning study
            X_tr, X_val, y_tr, y_val = splitter.train_test_split(X, y, test_size=0.25)

            from .preprocessing import TabularPreprocessor
            pre = TabularPreprocessor()
            X_tr_proc = pre.fit_transform(X_tr)
            X_val_proc = pre.transform(X_val)

            tuner = HyperparameterTuner(
                problem_type=self.config.problem_type,
                primary_metric=self.config.primary_metric.value,
                n_trials=self.config.optuna_trials,
                timeout_seconds=self.config.optuna_timeout_seconds,
                random_seed=self.config.random_seed,
            )
            best_params, best_study_score, trials = tuner.tune(
                algorithm_key=top_algo_key,
                X_train=X_tr_proc,
                y_train=y_tr.to_numpy(),
                X_val=X_val_proc,
                y_val=y_val.to_numpy(),
            )
            tuning_trials.extend(trials)

            # Re-evaluate top algorithm across all CV folds with tuned hyperparameters
            if best_params:
                tuned_benchmark = benchmarker.evaluate_cv(
                    top_algo_key,
                    X,
                    y,
                    cv_splits,
                    params=best_params,
                )
                tuned_benchmark.model_name = f"{tuned_benchmark.model_name} (Tuned)"
                # Replace or append tuned benchmark
                benchmarks.append(tuned_benchmark)

        # 5. Build Final Leaderboard
        final_leaderboard = benchmarker.create_leaderboard(benchmarks)
        best_entry = final_leaderboard[0]

        baseline_score = 0.0
        for b in benchmarks:
            if b.is_baseline:
                baseline_score = b.mean_cv_score
                break

        total_time = round(time.perf_counter() - start_time, 2)

        # 6. Assemble Permitted Result Payload
        payload = ExperimentResultPayload(
            experiment_name=experiment_name,
            problem_type=self.config.problem_type,
            target_name=self.config.target_column,
            primary_metric=self.config.primary_metric.value,
            n_samples=len(clean_df),
            n_features=len(features),
            feature_names=features,
            n_splits=self.config.n_splits,
            validation_strategy=self.config.validation_strategy.value,
            baseline_score=baseline_score,
            best_model_name=best_entry.model_name,
            best_score=best_entry.primary_metric_score,
            leaderboard=final_leaderboard,
            benchmarks=benchmarks,
            tuning_trials=tuning_trials,
            total_execution_time_seconds=total_time,
        )

        # 7. Strictly Validate through Export Gate
        gate = ExportGate()
        payload_dict = payload.model_dump()
        gate.validate_and_sanitize(
            PermittedExportType.EXPERIMENT_RESULT,
            payload_dict,
        )

        return payload
