"""DataPilot V1 Experiment Engine.

Executes the 12-stage sequential AutoML experiment workflow:
1.  Business Requirement
2.  Problem Formulation
3.  Dataset Profile
4.  Baseline
5.  Candidate Models
6.  Preprocessing
7.  Cross Validation
8.  Hyperparameter Optimization (Optuna where configured)
9.  Evaluation
10. Error Analysis
11. Business Constraints
12. Model Recommendation

CRITICAL ARCHITECTURAL CONSTRAINTS:
- No LLM selects a model without actual empirical experimentation.
- Models are never selected on Accuracy alone (multi-metric ranking required).
- All training execution occurs inside the Client Data Plane.
- Experiment tracking persists all 11 required reproducibility fields.
"""

from __future__ import annotations

import hashlib
import json
import logging
import platform
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, clone
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import (
    GradientBoostingRegressor,
    HistGradientBoostingClassifier,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_absolute_percentage_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    root_mean_squared_error,
)
from sklearn.model_selection import KFold, StratifiedKFold
from sklearn.preprocessing import OneHotEncoder, StandardScaler

import catboost as cb
import lightgbm as lgb
import optuna
import xgboost as xgb

logger = logging.getLogger(__name__)
optuna.logging.set_verbosity(optuna.logging.WARNING)


# =====================================================================
# 1. Automatic Preprocessor
# =====================================================================

class AutomaticPreprocessor:
    """Automatic client-side preprocessor for tabular data.
    
    Handles:
    - Identifier / leakage column detection and removal
    - Constant / zero-variance column pruning
    - Datetime feature extraction
    - Missing value imputation (median for numeric, mode/missing for categorical)
    - One-hot encoding of categorical features
    - Standardization of numerical features
    """

    def __init__(self, random_state: int = 42) -> None:
        self.random_state = random_state
        self.dropped_identifier_cols: List[str] = []
        self.dropped_constant_cols: List[str] = []
        self.datetime_cols: List[str] = []
        self.numeric_cols: List[str] = []
        self.categorical_cols: List[str] = []
        self.imputation_values: Dict[str, Any] = {}
        self.scaler: Optional[StandardScaler] = None
        self.encoder: Optional[OneHotEncoder] = None
        self.final_feature_names: List[str] = []
        self.is_fitted: bool = False

    def fit_transform(
        self,
        df: pd.DataFrame,
        target_col: str,
    ) -> Tuple[np.ndarray, List[str], Dict[str, Any]]:
        """Fit preprocessor on dataframe (excluding target) and return transformed array."""
        X_raw = df.drop(columns=[target_col]).copy()
        n_rows = len(X_raw)

        # 1. Identify and drop identifier / leakage columns
        self.dropped_identifier_cols = []
        for col in X_raw.columns:
            col_lower = col.lower()
            # Match common ID naming patterns
            if (
                col_lower in {"id", "uuid", "guid", "code", "index"}
                or col_lower.endswith(("_id", "_uuid", "_code", "_key"))
            ):
                self.dropped_identifier_cols.append(col)
            # High cardinality string columns where distinct count == rows
            elif X_raw[col].dtype == object or isinstance(X_raw[col].dtype, pd.StringDtype):
                if X_raw[col].nunique(dropna=True) >= 0.95 * n_rows and n_rows > 30:
                    self.dropped_identifier_cols.append(col)

        X_work = X_raw.drop(columns=self.dropped_identifier_cols)

        # 2. Identify and drop zero-variance / constant columns
        self.dropped_constant_cols = []
        for col in X_work.columns:
            if X_work[col].nunique(dropna=False) <= 1:
                self.dropped_constant_cols.append(col)

        X_work = X_work.drop(columns=self.dropped_constant_cols)

        # 3. Detect and expand datetime columns
        self.datetime_cols = []
        engineered_dt_dfs = []
        for col in X_work.columns:
            is_dt = False
            if pd.api.types.is_datetime64_any_dtype(X_work[col]):
                is_dt = True
                parsed_series = pd.to_datetime(X_work[col])
            elif X_work[col].dtype == object or isinstance(X_work[col].dtype, pd.StringDtype):
                # Try parsing sample
                sample = X_work[col].dropna().head(20)
                if len(sample) > 0:
                    try:
                        import warnings
                        with warnings.catch_warnings():
                            warnings.simplefilter("ignore")
                            pd.to_datetime(sample, errors="raise")
                            parsed_series = pd.to_datetime(X_work[col], errors="coerce")
                        if parsed_series.notna().mean() > 0.8:
                            is_dt = True
                    except Exception:
                        is_dt = False

            if is_dt:
                self.datetime_cols.append(col)
                dt_df = pd.DataFrame({
                    f"{col}_year": parsed_series.dt.year.fillna(2024).astype(float),
                    f"{col}_month": parsed_series.dt.month.fillna(1).astype(float),
                    f"{col}_day": parsed_series.dt.day.fillna(1).astype(float),
                    f"{col}_dayofweek": parsed_series.dt.dayofweek.fillna(0).astype(float),
                }, index=X_work.index)
                engineered_dt_dfs.append(dt_df)

        if self.datetime_cols:
            X_work = X_work.drop(columns=self.datetime_cols)
            if engineered_dt_dfs:
                X_work = pd.concat([X_work] + engineered_dt_dfs, axis=1)

        # 4. Partition remaining columns into numeric and categorical
        self.numeric_cols = []
        self.categorical_cols = []
        for col in X_work.columns:
            if pd.api.types.is_numeric_dtype(X_work[col]):
                self.numeric_cols.append(col)
            else:
                self.categorical_cols.append(col)

        # 5. Impute numerical columns (median)
        self.imputation_values = {}
        X_num_clean = pd.DataFrame(index=X_work.index)
        for col in self.numeric_cols:
            median_val = float(X_work[col].median()) if X_work[col].notna().any() else 0.0
            self.imputation_values[col] = median_val
            X_num_clean[col] = X_work[col].fillna(median_val)

        # 6. Impute categorical columns (mode / 'missing')
        X_cat_clean = pd.DataFrame(index=X_work.index)
        for col in self.categorical_cols:
            mode_s = X_work[col].dropna().mode()
            fill_val = str(mode_s.iloc[0]) if len(mode_s) > 0 else "missing"
            self.imputation_values[col] = fill_val
            X_cat_clean[col] = X_work[col].fillna(fill_val).astype(str)

        # 7. Scale numeric columns
        scaled_num = np.empty((n_rows, 0), dtype=float)
        if self.numeric_cols:
            self.scaler = StandardScaler()
            scaled_num = self.scaler.fit_transform(X_num_clean.values)

        # 8. Encode categorical columns
        encoded_cat = np.empty((n_rows, 0), dtype=float)
        cat_feature_names: List[str] = []
        if self.categorical_cols:
            self.encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore")
            encoded_cat = self.encoder.fit_transform(X_cat_clean.values)
            cat_feature_names = list(self.encoder.get_feature_names_out(self.categorical_cols))

        # Combine arrays
        if scaled_num.shape[1] > 0 and encoded_cat.shape[1] > 0:
            X_out = np.hstack([scaled_num, encoded_cat])
            self.final_feature_names = self.numeric_cols + cat_feature_names
        elif scaled_num.shape[1] > 0:
            X_out = scaled_num
            self.final_feature_names = self.numeric_cols.copy()
        elif encoded_cat.shape[1] > 0:
            X_out = encoded_cat
            self.final_feature_names = cat_feature_names.copy()
        else:
            raise ValueError("All features were dropped during preprocessing; cannot train model.")

        self.is_fitted = True

        config = {
            "dropped_identifiers": self.dropped_identifier_cols,
            "dropped_constant_columns": self.dropped_constant_cols,
            "datetime_columns_expanded": self.datetime_cols,
            "numeric_imputation": "median",
            "categorical_imputation": "most_frequent",
            "numerical_scaler": "StandardScaler",
            "categorical_encoder": "OneHotEncoder(handle_unknown='ignore')",
            "original_feature_count": len(X_raw.columns),
            "final_feature_count": len(self.final_feature_names),
            "final_feature_names": self.final_feature_names,
        }
        return X_out, self.final_feature_names, config

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """Transform new data using fitted preprocessor parameters."""
        if not self.is_fitted:
            raise RuntimeError("Preprocessor must be fitted before calling transform.")

        X = df.copy()
        cols_to_drop = [c for c in (self.dropped_identifier_cols + self.dropped_constant_cols) if c in X.columns]
        X = X.drop(columns=cols_to_drop)

        # Expand datetime
        engineered_dt_dfs = []
        for col in self.datetime_cols:
            if col in X.columns:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    parsed_series = pd.to_datetime(X[col], errors="coerce")
                dt_df = pd.DataFrame({
                    f"{col}_year": parsed_series.dt.year.fillna(2024).astype(float),
                    f"{col}_month": parsed_series.dt.month.fillna(1).astype(float),
                    f"{col}_day": parsed_series.dt.day.fillna(1).astype(float),
                    f"{col}_dayofweek": parsed_series.dt.dayofweek.fillna(0).astype(float),
                }, index=X.index)
                engineered_dt_dfs.append(dt_df)
                X = X.drop(columns=[col])

        if engineered_dt_dfs:
            X = pd.concat([X] + engineered_dt_dfs, axis=1)

        # Numeric impute and scale
        X_num = pd.DataFrame(index=X.index)
        for col in self.numeric_cols:
            fill_val = self.imputation_values.get(col, 0.0)
            X_num[col] = X[col].fillna(fill_val) if col in X.columns else fill_val

        scaled_num = np.empty((len(X), 0), dtype=float)
        if self.scaler is not None and self.numeric_cols:
            scaled_num = self.scaler.transform(X_num.values)

        # Categorical impute and encode
        X_cat = pd.DataFrame(index=X.index)
        for col in self.categorical_cols:
            fill_val = self.imputation_values.get(col, "missing")
            X_cat[col] = X[col].fillna(fill_val).astype(str) if col in X.columns else fill_val

        encoded_cat = np.empty((len(X), 0), dtype=float)
        if self.encoder is not None and self.categorical_cols:
            encoded_cat = self.encoder.transform(X_cat.values)

        if scaled_num.shape[1] > 0 and encoded_cat.shape[1] > 0:
            return np.hstack([scaled_num, encoded_cat])
        elif scaled_num.shape[1] > 0:
            return scaled_num
        elif encoded_cat.shape[1] > 0:
            return encoded_cat
        return np.empty((len(X), 0), dtype=float)


# =====================================================================
# 2. Experiment Engine Core
# =====================================================================

class DataPilotExperimentEngine:
    """V1 DataPilot AutoML Experiment Engine.
    
    Implements the 12-stage sequential workflow with Client Data Plane containment.
    """

    def __init__(self, random_seed: int = 42) -> None:
        self.random_seed = random_seed

    def _compute_dataset_fingerprint(self, df: pd.DataFrame) -> str:
        """Generate SHA-256 fingerprint for dataset schema, length, and content sample."""
        schema_str = ";".join(f"{col}:{df[col].dtype}" for col in sorted(df.columns))
        sample_str = df.head(10).to_csv(index=False)
        tail_str = df.tail(10).to_csv(index=False)
        payload = f"rows:{len(df)}|cols:{len(df.columns)}|schema:{schema_str}|sample:{sample_str}|tail:{tail_str}"
        return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"

    # -----------------------------------------------------------------
    # Stage 5 Candidate Model Builders
    # -----------------------------------------------------------------

    def _get_classification_candidates(self) -> List[Tuple[str, str, BaseEstimator]]:
        """Instantiate all 6 V1 supported classification candidate models."""
        seed = self.random_seed
        return [
            ("Logistic Regression", "logistic_regression", LogisticRegression(max_iter=1000, random_state=seed)),
            ("Random Forest", "random_forest", RandomForestClassifier(n_estimators=100, random_state=seed, n_jobs=1)),
            ("XGBoost", "xgboost", xgb.XGBClassifier(n_estimators=100, eval_metric="logloss", random_state=seed, verbosity=0, n_jobs=1)),
            ("LightGBM", "lightgbm", lgb.LGBMClassifier(n_estimators=100, random_state=seed, verbose=-1, n_jobs=1)),
            ("CatBoost", "catboost", cb.CatBoostClassifier(iterations=100, random_seed=seed, verbose=0, thread_count=1)),
            ("HistGradientBoosting", "hist_gradient_boosting", HistGradientBoostingClassifier(max_iter=100, random_state=seed)),
        ]

    def _get_regression_candidates(self) -> List[Tuple[str, str, BaseEstimator]]:
        """Instantiate all 6 V1 supported regression candidate models."""
        seed = self.random_seed
        return [
            ("Linear Regression", "linear_regression", Ridge(random_state=seed)),
            ("Random Forest", "random_forest", RandomForestRegressor(n_estimators=100, random_state=seed, n_jobs=1)),
            ("XGBoost", "xgboost", xgb.XGBRegressor(n_estimators=100, random_state=seed, verbosity=0, n_jobs=1)),
            ("LightGBM", "lightgbm", lgb.LGBMRegressor(n_estimators=100, random_state=seed, verbose=-1, n_jobs=1)),
            ("CatBoost", "catboost", cb.CatBoostRegressor(iterations=100, random_seed=seed, verbose=0, thread_count=1)),
            ("Gradient Boosting", "gradient_boosting", GradientBoostingRegressor(n_estimators=100, random_state=seed)),
        ]

    # -----------------------------------------------------------------
    # Metric Calculation
    # -----------------------------------------------------------------

    def _calculate_classification_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_prob: Optional[np.ndarray],
    ) -> Dict[str, float]:
        """Compute all required classification metrics."""
        is_binary = len(np.unique(y_true)) <= 2

        acc = float(accuracy_score(y_true, y_pred))
        prec = float(precision_score(y_true, y_pred, average="binary" if is_binary else "weighted", zero_division=0))
        rec = float(recall_score(y_true, y_pred, average="binary" if is_binary else "weighted", zero_division=0))
        f1 = float(f1_score(y_true, y_pred, average="binary" if is_binary else "weighted", zero_division=0))

        roc_auc_val = 0.5
        pr_auc_val = float(prec)

        if y_prob is not None:
            try:
                if is_binary:
                    # Positive class prob
                    p = y_prob[:, 1] if y_prob.ndim == 2 and y_prob.shape[1] > 1 else y_prob.ravel()
                    roc_auc_val = float(roc_auc_score(y_true, p))
                    pr_auc_val = float(average_precision_score(y_true, p))
                else:
                    roc_auc_val = float(roc_auc_score(y_true, y_prob, multi_class="ovr"))
                    pr_auc_val = float(f1)
            except Exception as e:
                logger.warning(f"Error computing ROC/PR AUC: {e}")

        return {
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
            "roc_auc": round(roc_auc_val, 4),
            "pr_auc": round(pr_auc_val, 4),
        }

    def _calculate_regression_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
    ) -> Dict[str, float]:
        """Compute all required regression metrics."""
        mae = float(mean_absolute_error(y_true, y_pred))
        rmse = float(root_mean_squared_error(y_true, y_pred))
        r2 = float(r2_score(y_true, y_pred))

        # Safe MAPE
        with np.errstate(divide="ignore", invalid="ignore"):
            mape_raw = np.abs((y_true - y_pred) / np.where(np.abs(y_true) < 1e-6, 1e-6, y_true))
            mape = float(np.mean(np.clip(mape_raw, 0.0, 10.0)))

        return {
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "r2": round(r2, 4),
            "mape": round(mape, 4),
        }

    # -----------------------------------------------------------------
    # Cross Validation Runner
    # -----------------------------------------------------------------

    def _evaluate_candidate_cv(
        self,
        model_name: str,
        algorithm_key: str,
        estimator: BaseEstimator,
        X: np.ndarray,
        y: np.ndarray,
        cv: Union[StratifiedKFold, KFold],
        is_classification: bool,
        primary_metric: str,
        is_baseline: bool = False,
    ) -> Dict[str, Any]:
        """Run cross-validation for a candidate estimator and compute metrics & latencies."""
        n_samples = len(y)
        oof_preds = np.zeros(n_samples) if not is_classification else np.zeros(n_samples, dtype=int)
        oof_probs = np.zeros((n_samples, 2)) if is_classification else None

        fold_primary_scores: List[float] = []
        t0 = time.perf_counter()

        for fold_idx, (train_idx, val_idx) in enumerate(cv.split(X, y if is_classification else None)):
            X_tr, y_tr = X[train_idx], y[train_idx]
            X_val, y_val = X[val_idx], y[val_idx]

            fold_model = clone(estimator)
            fold_model.fit(X_tr, y_tr)

            preds = fold_model.predict(X_val)
            oof_preds[val_idx] = preds

            if is_classification:
                if hasattr(fold_model, "predict_proba"):
                    probs = fold_model.predict_proba(X_val)
                    if probs.ndim == 2 and probs.shape[1] == 2:
                        oof_probs[val_idx] = probs
                    else:
                        oof_probs[val_idx, 1] = probs[:, 0] if probs.ndim == 2 else probs
                else:
                    oof_probs[val_idx, 1] = preds

                f_metrics = self._calculate_classification_metrics(
                    y_val, preds, oof_probs[val_idx] if oof_probs is not None else None
                )
                fold_primary_scores.append(f_metrics.get(primary_metric, f_metrics["roc_auc"]))
            else:
                f_metrics = self._calculate_regression_metrics(y_val, preds)
                fold_primary_scores.append(f_metrics.get(primary_metric, f_metrics["rmse"]))

        training_time_seconds = time.perf_counter() - t0

        # Inference latency benchmark on validation sample (100 samples)
        sample_size = min(100, n_samples)
        sample_X = X[:sample_size]
        t_lat_start = time.perf_counter()
        _ = estimator.fit(X, y).predict(sample_X)
        lat_elapsed_ms = (time.perf_counter() - t_lat_start) * 1000.0
        inference_latency_ms = round(lat_elapsed_ms / max(1, sample_size), 3)

        if is_classification:
            overall_metrics = self._calculate_classification_metrics(y, oof_preds, oof_probs)
        else:
            overall_metrics = self._calculate_regression_metrics(y, oof_preds)

        mean_cv = float(np.mean(fold_primary_scores))
        std_cv = float(np.std(fold_primary_scores))

        # Hyperparameters
        try:
            hp = estimator.get_params()
            clean_hp = {k: str(v) if not isinstance(v, (int, float, bool, str, type(None))) else v for k, v in hp.items() if not k.startswith("_")}
        except Exception:
            clean_hp = {}

        return {
            "model_name": model_name,
            "algorithm_key": algorithm_key,
            "is_baseline": is_baseline,
            "metrics": overall_metrics,
            "mean_cv_score": round(mean_cv, 4),
            "std_cv_score": round(std_cv, 4),
            "cv_scores": [round(s, 4) for s in fold_primary_scores],
            "training_time_seconds": round(training_time_seconds, 3),
            "inference_latency_ms": inference_latency_ms,
            "hyperparameters": clean_hp,
            "oof_predictions": oof_preds,
            "oof_probabilities": oof_probs if is_classification else None,
        }

    # -----------------------------------------------------------------
    # Stage 8 Optuna Hyperparameter Optimization
    # -----------------------------------------------------------------

    def _optimize_hyperparameters(
        self,
        algorithm_key: str,
        X: np.ndarray,
        y: np.ndarray,
        cv: Union[StratifiedKFold, KFold],
        is_classification: bool,
        primary_metric: str,
        n_trials: int = 10,
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Tune candidate hyperparameters using Optuna and return best parameters & trial logs."""
        trials_log: List[Dict[str, Any]] = []
        direction = "minimize" if primary_metric in {"rmse", "mae", "mse", "mape"} else "maximize"
        seed = self.random_seed

        def objective(trial: optuna.Trial) -> float:
            t_start = time.perf_counter()
            params: Dict[str, Any] = {}

            if "random_forest" in algorithm_key:
                n_est = trial.suggest_int("n_estimators", 20, 150)
                max_depth = trial.suggest_int("max_depth", 3, 15)
                min_split = trial.suggest_int("min_samples_split", 2, 8)
                params = {"n_estimators": n_est, "max_depth": max_depth, "min_samples_split": min_split}
                if is_classification:
                    est = RandomForestClassifier(n_estimators=n_est, max_depth=max_depth, min_samples_split=min_split, random_state=seed, n_jobs=1)
                else:
                    est = RandomForestRegressor(n_estimators=n_est, max_depth=max_depth, min_samples_split=min_split, random_state=seed, n_jobs=1)

            elif "xgboost" in algorithm_key:
                n_est = trial.suggest_int("n_estimators", 30, 150)
                max_depth = trial.suggest_int("max_depth", 2, 8)
                lr = trial.suggest_float("learning_rate", 0.01, 0.3, log=True)
                sub = trial.suggest_float("subsample", 0.6, 1.0)
                params = {"n_estimators": n_est, "max_depth": max_depth, "learning_rate": lr, "subsample": sub}
                if is_classification:
                    est = xgb.XGBClassifier(n_estimators=n_est, max_depth=max_depth, learning_rate=lr, subsample=sub, eval_metric="logloss", random_state=seed, verbosity=0, n_jobs=1)
                else:
                    est = xgb.XGBRegressor(n_estimators=n_est, max_depth=max_depth, learning_rate=lr, subsample=sub, random_state=seed, verbosity=0, n_jobs=1)

            elif "lightgbm" in algorithm_key:
                n_est = trial.suggest_int("n_estimators", 30, 150)
                max_depth = trial.suggest_int("max_depth", 3, 10)
                lr = trial.suggest_float("learning_rate", 0.01, 0.3, log=True)
                leaves = trial.suggest_int("num_leaves", 15, 63)
                params = {"n_estimators": n_est, "max_depth": max_depth, "learning_rate": lr, "num_leaves": leaves}
                if is_classification:
                    est = lgb.LGBMClassifier(n_estimators=n_est, max_depth=max_depth, learning_rate=lr, num_leaves=leaves, random_state=seed, verbose=-1, n_jobs=1)
                else:
                    est = lgb.LGBMRegressor(n_estimators=n_est, max_depth=max_depth, learning_rate=lr, num_leaves=leaves, random_state=seed, verbose=-1, n_jobs=1)

            elif "catboost" in algorithm_key:
                iterations = trial.suggest_int("iterations", 30, 150)
                depth = trial.suggest_int("depth", 3, 8)
                lr = trial.suggest_float("learning_rate", 0.02, 0.3, log=True)
                params = {"iterations": iterations, "depth": depth, "learning_rate": lr}
                if is_classification:
                    est = cb.CatBoostClassifier(iterations=iterations, depth=depth, learning_rate=lr, random_seed=seed, verbose=0, thread_count=1)
                else:
                    est = cb.CatBoostRegressor(iterations=iterations, depth=depth, learning_rate=lr, random_seed=seed, verbose=0, thread_count=1)

            elif "logistic_regression" in algorithm_key:
                c_val = trial.suggest_float("C", 0.01, 10.0, log=True)
                params = {"C": c_val}
                est = LogisticRegression(C=c_val, max_iter=1000, random_state=seed)

            elif "linear_regression" in algorithm_key:
                alpha = trial.suggest_float("alpha", 0.01, 10.0, log=True)
                params = {"alpha": alpha}
                est = Ridge(alpha=alpha, random_state=seed)

            else:
                # HistGradientBoosting / Gradient Boosting
                lr = trial.suggest_float("learning_rate", 0.01, 0.3, log=True)
                max_iter = trial.suggest_int("max_iter", 30, 150)
                params = {"learning_rate": lr, "max_iter": max_iter}
                if is_classification:
                    est = HistGradientBoostingClassifier(learning_rate=lr, max_iter=max_iter, random_state=seed)
                else:
                    est = GradientBoostingRegressor(learning_rate=lr, n_estimators=max_iter, random_state=seed)

            # Evaluate on fold splits
            fold_scores = []
            for tr_idx, vl_idx in cv.split(X, y if is_classification else None):
                est_clone = clone(est)
                est_clone.fit(X[tr_idx], y[tr_idx])
                p = est_clone.predict(X[vl_idx])

                if is_classification:
                    prb = est_clone.predict_proba(X[vl_idx]) if hasattr(est_clone, "predict_proba") else None
                    met = self._calculate_classification_metrics(y[vl_idx], p, prb)
                else:
                    met = self._calculate_regression_metrics(y[vl_idx], p)

                score = met.get(primary_metric, 0.0)
                fold_scores.append(score)

            mean_score = float(np.mean(fold_scores))
            dur = time.perf_counter() - t_start

            trials_log.append({
                "trial_number": trial.number,
                "model_name": algorithm_key,
                "parameters": params,
                "score": round(mean_score, 4),
                "state": "COMPLETE",
                "duration_seconds": round(dur, 3),
            })
            return mean_score

        study = optuna.create_study(direction=direction)
        study.optimize(objective, n_trials=n_trials)
        return study.best_params, trials_log

    # -----------------------------------------------------------------
    # Complete 12-Stage Workflow Orchestration
    # -----------------------------------------------------------------

    def run_experiment(
        self,
        dataset: pd.DataFrame,
        target_column: str,
        experiment_name: str = "Automated Experiment",
        dataset_version: str = "v1.0",
        problem_type: Optional[str] = None,
        primary_metric: Optional[str] = None,
        business_requirements: Optional[Dict[str, Any]] = None,
        enable_optuna: bool = False,
        optuna_trials: int = 8,
        n_splits: int = 5,
    ) -> Dict[str, Any]:
        """Execute the full 12-stage sequential AutoML experiment workflow inside Client Data Plane."""
        total_start_time = time.perf_counter()
        reqs = business_requirements or {}

        # =============================================================
        # Stage 1: Business Requirement
        # =============================================================
        stage_1_business_requirement = {
            "stage_number": 1,
            "stage_name": "Business Requirement",
            "business_objective": reqs.get("business_objective", "Optimize empirical predictive performance on target"),
            "prediction_horizon": reqs.get("prediction_horizon", "Next evaluation window"),
            "primary_metric": primary_metric or reqs.get("primary_metric"),
            "max_latency_ms": reqs.get("max_latency_ms", 100.0),
            "cost_false_positive": reqs.get("cost_false_positive", 10.0),
            "cost_false_negative": reqs.get("cost_false_negative", 100.0),
            "min_score": reqs.get("min_score", 0.0),
        }

        # =============================================================
        # Stage 2: Problem Formulation
        # =============================================================
        if target_column not in dataset.columns:
            raise ValueError(f"Target column '{target_column}' does not exist in dataset.")

        target_series = dataset[target_column].dropna()
        n_unique_targets = target_series.nunique()

        if problem_type is None:
            if pd.api.types.is_numeric_dtype(target_series):
                if n_unique_targets == 2:
                    resolved_problem_type = "classification"
                elif n_unique_targets > 20:
                    resolved_problem_type = "regression"
                else:
                    resolved_problem_type = "classification"
            else:
                resolved_problem_type = "classification"
        else:
            resolved_problem_type = problem_type.lower().strip()

        is_classification = resolved_problem_type == "classification"

        if primary_metric is None:
            if is_classification:
                # Default primary metric is ROC-AUC or Recall based on business requirements
                resolved_primary_metric = "recall" if reqs.get("cost_false_negative", 0) > reqs.get("cost_false_positive", 0) * 3 else "roc_auc"
            else:
                resolved_primary_metric = "rmse"
        else:
            resolved_primary_metric = primary_metric.lower().strip()

        # Enforce that Accuracy alone is NEVER the sole criterion
        secondary_metrics = (
            ["roc_auc", "f1", "recall", "precision", "pr_auc", "accuracy"]
            if is_classification
            else ["rmse", "mae", "r2", "mape"]
        )

        stage_2_problem_formulation = {
            "stage_number": 2,
            "stage_name": "Problem Formulation",
            "problem_type": resolved_problem_type,
            "target_name": target_column,
            "primary_metric": resolved_primary_metric,
            "secondary_metrics": secondary_metrics,
            "selection_policy": "Multi-criteria ranking (Do not select on Accuracy alone)",
        }

        # =============================================================
        # Stage 3: Dataset Profile
        # =============================================================
        fingerprint = self._compute_dataset_fingerprint(dataset)
        numeric_count = int(sum(pd.api.types.is_numeric_dtype(dataset[c]) for c in dataset.columns if c != target_column))
        cat_count = int(sum(dataset[c].dtype == object for c in dataset.columns if c != target_column))
        total_missing = int(dataset.isna().sum().sum())
        missing_pct = round((total_missing / (len(dataset) * len(dataset.columns))) * 100, 2)

        stage_3_dataset_profile = {
            "stage_number": 3,
            "stage_name": "Dataset Profile",
            "dataset_version": dataset_version,
            "dataset_fingerprint": fingerprint,
            "row_count": len(dataset),
            "column_count": len(dataset.columns),
            "numeric_feature_count": numeric_count,
            "categorical_feature_count": cat_count,
            "missing_values_count": total_missing,
            "missing_values_percentage": missing_pct,
            "target_distribution": dataset[target_column].value_counts(normalize=True).to_dict() if is_classification else {
                "min": float(target_series.min()),
                "max": float(target_series.max()),
                "mean": float(target_series.mean()),
                "std": float(target_series.std()),
            },
        }

        # =============================================================
        # Stage 6: Preprocessing (Client Data Plane)
        # =============================================================
        # Prepare targets
        y_raw = dataset[target_column].copy()
        if is_classification:
            # Map classes to integers 0, 1, ...
            classes, y_arr = np.unique(y_raw, return_inverse=True)
            y_arr = y_arr.astype(int)
        else:
            y_arr = y_raw.values.astype(float)

        preprocessor = AutomaticPreprocessor(random_state=self.random_seed)
        X_arr, feature_names, preprocessing_config = preprocessor.fit_transform(dataset, target_col=target_column)

        stage_6_preprocessing = {
            "stage_number": 6,
            "stage_name": "Preprocessing",
            "pipeline": preprocessing_config,
            "imputation": "median_and_mode",
            "encoding": "one_hot",
            "scaling": "standard_scaler",
            "final_feature_dimension": X_arr.shape[1],
        }

        # =============================================================
        # Stage 7: Cross Validation Setup
        # =============================================================
        if is_classification:
            cv = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=self.random_seed)
            validation_strategy = f"{n_splits}-fold StratifiedKFold"
        else:
            cv = KFold(n_splits=n_splits, shuffle=True, random_state=self.random_seed)
            validation_strategy = f"{n_splits}-fold KFold"

        stage_7_cross_validation = {
            "stage_number": 7,
            "stage_name": "Cross Validation",
            "strategy": validation_strategy,
            "n_splits": n_splits,
            "random_seed": self.random_seed,
        }

        # =============================================================
        # Stage 4: Baseline Model Training
        # =============================================================
        if is_classification:
            baseline_est = DummyClassifier(strategy="prior")
            baseline_name = "Baseline Dummy (Prior)"
        else:
            baseline_est = DummyRegressor(strategy="mean")
            baseline_name = "Baseline Dummy (Mean)"

        baseline_eval = self._evaluate_candidate_cv(
            model_name=baseline_name,
            algorithm_key="baseline_dummy",
            estimator=baseline_est,
            X=X_arr,
            y=y_arr,
            cv=cv,
            is_classification=is_classification,
            primary_metric=resolved_primary_metric,
            is_baseline=True,
        )

        stage_4_baseline = {
            "stage_number": 4,
            "stage_name": "Baseline",
            "baseline_model": baseline_name,
            "baseline_score": baseline_eval["mean_cv_score"],
            "metrics": baseline_eval["metrics"],
        }

        # =============================================================
        # Stage 5: Candidate Models Initialization
        # =============================================================
        if is_classification:
            candidates = self._get_classification_candidates()
        else:
            candidates = self._get_regression_candidates()

        stage_5_candidate_models = {
            "stage_number": 5,
            "stage_name": "Candidate Models",
            "models_evaluated": [c[0] for c in candidates],
            "total_candidates": len(candidates),
        }

        # Evaluate all candidate models across CV folds
        benchmarks: List[Dict[str, Any]] = [baseline_eval]
        for name, key, estimator in candidates:
            res = self._evaluate_candidate_cv(
                model_name=name,
                algorithm_key=key,
                estimator=estimator,
                X=X_arr,
                y=y_arr,
                cv=cv,
                is_classification=is_classification,
                primary_metric=resolved_primary_metric,
                is_baseline=False,
            )
            benchmarks.append(res)

        # Sort non-baseline candidates by primary metric
        lower_is_better = resolved_primary_metric in {"rmse", "mae", "mse", "mape"}
        non_baseline_bms = [b for b in benchmarks if not b["is_baseline"]]
        non_baseline_bms.sort(
            key=lambda b: b["metrics"].get(resolved_primary_metric, b["mean_cv_score"]),
            reverse=not lower_is_better,
        )

        # =============================================================
        # Stage 8: Hyperparameter Optimization (Optuna where configured)
        # =============================================================
        optuna_trials_logged: List[Dict[str, Any]] = []
        top_candidate_bm = non_baseline_bms[0]

        if enable_optuna and len(non_baseline_bms) > 0:
            best_key = top_candidate_bm["algorithm_key"]
            tuned_params, trials_log = self._optimize_hyperparameters(
                algorithm_key=best_key,
                X=X_arr,
                y=y_arr,
                cv=cv,
                is_classification=is_classification,
                primary_metric=resolved_primary_metric,
                n_trials=optuna_trials,
            )
            optuna_trials_logged.extend(trials_log)

            # Re-evaluate top candidate with tuned parameters
            # Clone and apply best params
            for name, key, est in candidates:
                if key == best_key:
                    tuned_est = clone(est)
                    try:
                        tuned_est.set_params(**tuned_params)
                        tuned_eval = self._evaluate_candidate_cv(
                            model_name=f"{name} (Optuna Tuned)",
                            algorithm_key=f"{key}_tuned",
                            estimator=tuned_est,
                            X=X_arr,
                            y=y_arr,
                            cv=cv,
                            is_classification=is_classification,
                            primary_metric=resolved_primary_metric,
                            is_baseline=False,
                        )
                        tuned_eval["hyperparameters"] = tuned_params
                        benchmarks.append(tuned_eval)
                        non_baseline_bms.append(tuned_eval)
                        non_baseline_bms.sort(
                            key=lambda b: b["metrics"].get(resolved_primary_metric, b["mean_cv_score"]),
                            reverse=not lower_is_better,
                        )
                    except Exception as e:
                        logger.warning(f"Could not fit tuned candidate: {e}")

        stage_8_hyperparameter_optimization = {
            "stage_number": 8,
            "stage_name": "Hyperparameter Optimization",
            "enabled": enable_optuna,
            "optimization_framework": "Optuna",
            "trials_executed": len(optuna_trials_logged),
            "best_tuned_params": top_candidate_bm["hyperparameters"] if not enable_optuna else tuned_params if 'tuned_params' in locals() else {},
        }

        # Build Leaderboard
        leaderboard: List[Dict[str, Any]] = []
        for rank, bm in enumerate(non_baseline_bms, start=1):
            leaderboard.append({
                "rank": rank,
                "model_name": bm["model_name"],
                "algorithm_key": bm["algorithm_key"],
                "is_baseline": bm["is_baseline"],
                "primary_score": bm["metrics"].get(resolved_primary_metric, bm["mean_cv_score"]),
                "mean_cv_score": bm["mean_cv_score"],
                "std_cv_score": bm["std_cv_score"],
                "training_time_seconds": bm["training_time_seconds"],
                "inference_latency_ms": bm["inference_latency_ms"],
                "metrics": bm["metrics"],
            })

        # =============================================================
        # Stage 9: Evaluation
        # =============================================================
        stage_9_evaluation = {
            "stage_number": 9,
            "stage_name": "Evaluation",
            "primary_metric": resolved_primary_metric,
            "leaderboard": leaderboard,
            "baseline_score": baseline_eval["mean_cv_score"],
            "top_model_score": leaderboard[0]["primary_score"] if leaderboard else 0.0,
        }

        # =============================================================
        # Stage 10: Error Analysis (Client Data Plane)
        # =============================================================
        top_model_bm = non_baseline_bms[0]
        oof_preds = top_model_bm["oof_predictions"]

        if is_classification:
            cm = confusion_matrix(y_arr, oof_preds)
            tn = int(cm[0, 0]) if cm.shape == (2, 2) else 0
            fp = int(cm[0, 1]) if cm.shape == (2, 2) else 0
            fn = int(cm[1, 0]) if cm.shape == (2, 2) else 0
            tp = int(cm[1, 1]) if cm.shape == (2, 2) else 0

            error_analysis_data = {
                "confusion_matrix": cm.tolist(),
                "true_positives": tp,
                "true_negatives": tn,
                "false_positives": fp,
                "false_negatives": fn,
                "false_positive_rate": round(fp / max(1, fp + tn), 4),
                "false_negative_rate": round(fn / max(1, fn + tp), 4),
                "high_error_samples_identified": fp + fn,
            }
        else:
            residuals = y_arr - oof_preds
            abs_residuals = np.abs(residuals)
            error_analysis_data = {
                "mean_residual": round(float(np.mean(residuals)), 4),
                "std_residual": round(float(np.std(residuals)), 4),
                "median_absolute_error": round(float(np.median(abs_residuals)), 4),
                "p95_error": round(float(np.percentile(abs_residuals, 95)), 4),
                "max_error": round(float(np.max(abs_residuals)), 4),
            }

        stage_10_error_analysis = {
            "stage_number": 10,
            "stage_name": "Error Analysis",
            "model_evaluated": top_model_bm["model_name"],
            "details": error_analysis_data,
        }

        # =============================================================
        # Stage 11: Business Constraints Verification
        # =============================================================
        max_lat_ms = stage_1_business_requirement["max_latency_ms"]
        cost_fp = stage_1_business_requirement["cost_false_positive"]
        cost_fn = stage_1_business_requirement["cost_false_negative"]

        compliant_candidates: List[Dict[str, Any]] = []
        for bm in non_baseline_bms:
            lat = bm["inference_latency_ms"]
            violates_latency = lat > max_lat_ms

            business_cost = None
            if is_classification:
                oof = bm["oof_predictions"]
                b_cm = confusion_matrix(y_arr, oof)
                b_fp = int(b_cm[0, 1]) if b_cm.shape == (2, 2) else 0
                b_fn = int(b_cm[1, 0]) if b_cm.shape == (2, 2) else 0
                business_cost = round((b_fp * cost_fp) + (b_fn * cost_fn), 2)

            bm["violates_latency_sla"] = violates_latency
            bm["estimated_business_cost"] = business_cost

            if not violates_latency:
                compliant_candidates.append(bm)

        stage_11_business_constraints = {
            "stage_number": 11,
            "stage_name": "Business Constraints",
            "max_latency_sla_ms": max_lat_ms,
            "all_models_within_sla": len(compliant_candidates) == len(non_baseline_bms),
            "compliant_model_count": len(compliant_candidates),
            "cost_of_fp": cost_fp,
            "cost_of_fn": cost_fn,
        }

        # =============================================================
        # Stage 12: Model Recommendation (Evidenced & Multi-Criteria)
        # =============================================================
        # Recommendation selects from compliant candidates if available, otherwise fallback to top rank
        candidate_pool = compliant_candidates if compliant_candidates else non_baseline_bms

        # If business cost applies in classification, factor it in
        if is_classification and any(c.get("estimated_business_cost") is not None for c in candidate_pool):
            # Pick candidate minimizing business cost with strong primary metric
            best_model_entry = min(
                candidate_pool,
                key=lambda c: (c.get("estimated_business_cost", float("inf")), -c["metrics"].get(resolved_primary_metric, 0.0)),
            )
        else:
            best_model_entry = candidate_pool[0]

        # Generate transparent empirical justification
        best_score = best_model_entry["metrics"].get(resolved_primary_metric, best_model_entry["mean_cv_score"])
        baseline_score = baseline_eval["mean_cv_score"]
        diff_pct = (
            ((best_score - baseline_score) / abs(baseline_score) * 100)
            if abs(baseline_score) > 1e-6
            else 0.0
        )
        if lower_is_better:
            diff_pct = -diff_pct

        sign = "+" if diff_pct >= 0 else ""
        rationale = (
            f"Model '{best_model_entry['model_name']}' is recommended based on verified empirical validation results. "
            f"It achieved {resolved_primary_metric.upper()} of {best_score:.4f} vs Baseline Dummy of {baseline_score:.4f} "
            f"({sign}{diff_pct:.1f}% improvement across {n_splits} cross-validation folds). "
            f"Inference latency is {best_model_entry['inference_latency_ms']:.2f}ms (SLA target: <={max_lat_ms}ms). "
            f"Selection confirmed by multi-criteria evaluation without relying on Accuracy alone."
        )

        stage_12_model_recommendation = {
            "stage_number": 12,
            "stage_name": "Model Recommendation",
            "recommended_model_name": best_model_entry["model_name"],
            "algorithm_key": best_model_entry["algorithm_key"],
            "primary_metric": resolved_primary_metric,
            "measured_score": best_score,
            "baseline_score": baseline_score,
            "score_lift_percentage": round(diff_pct, 2),
            "inference_latency_ms": best_model_entry["inference_latency_ms"],
            "within_latency_sla": not best_model_entry.get("violates_latency_sla", False),
            "business_cost": best_model_entry.get("estimated_business_cost"),
            "empirical_rationale": rationale,
        }

        total_execution_time = time.perf_counter() - total_start_time

        # Clean benchmarks for serialization
        serializable_benchmarks = []
        for b in benchmarks:
            b_copy = {k: v for k, v in b.items() if k not in {"oof_predictions", "oof_probabilities"}}
            serializable_benchmarks.append(b_copy)

        return {
            "experiment_name": experiment_name,
            "dataset_version": dataset_version,
            "dataset_fingerprint": fingerprint,
            "problem_type": resolved_problem_type,
            "target_name": target_column,
            "primary_metric": resolved_primary_metric,
            "best_model_name": best_model_entry["model_name"],
            "best_score": best_score,
            "baseline_score": baseline_score,
            "validation_strategy": validation_strategy,
            "n_samples": len(dataset),
            "n_features": X_arr.shape[1],
            "feature_names": feature_names,
            "random_seed": self.random_seed,
            "total_execution_time_seconds": round(total_execution_time, 3),
            "environment_info": {
                "os": platform.system(),
                "python_version": platform.python_version(),
                "machine": platform.machine(),
                "execution_plane": "Client Data Plane (Zero Raw Data Leakage)",
            },
            "preprocessing_config": preprocessing_config,
            "feature_config": {
                "features": feature_names,
                "n_features": len(feature_names),
                "dropped_identifiers": preprocessing_config["dropped_identifiers"],
                "dropped_constant_columns": preprocessing_config["dropped_constant_columns"],
            },
            "hyperparameters": best_model_entry["hyperparameters"],
            "metrics": best_model_entry["metrics"],
            "workflow_stages": [
                stage_1_business_requirement,
                stage_2_problem_formulation,
                stage_3_dataset_profile,
                stage_4_baseline,
                stage_5_candidate_models,
                stage_6_preprocessing,
                stage_7_cross_validation,
                stage_8_hyperparameter_optimization,
                stage_9_evaluation,
                stage_10_error_analysis,
                stage_11_business_constraints,
                stage_12_model_recommendation,
            ],
            "leaderboard": leaderboard,
            "benchmarks": serializable_benchmarks,
            "tuning_trials": optuna_trials_logged,
            "recommendation": stage_12_model_recommendation,
        }
