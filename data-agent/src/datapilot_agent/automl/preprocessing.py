"""Tabular Data Preprocessing Pipeline.

Enforces strict featurization ordering:
Preprocessing components are fit strictly on the training fold and applied to validation/test folds.
Zero data leakage is permitted.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


class TabularPreprocessor(BaseEstimator, TransformerMixin):
    """Transforms raw heterogeneous tabular inputs into clean numerical arrays.

    - Splits columns into numeric, categorical, and datetime
    - Imputes missing values:
      - Numeric: median
      - Categorical: most frequent / constant 'missing'
    - Scales numeric features (StandardScaler)
    - One-hot encodes categorical features with handle_unknown='ignore'
    - Converts datetime columns to timestamps / components
    """

    def __init__(self):
        self.numeric_cols_: List[str] = []
        self.categorical_cols_: List[str] = []
        self.datetime_cols_: List[str] = []
        self.column_transformer_: Optional[ColumnTransformer] = None
        self.feature_names_: List[str] = []

    def _detect_types(self, df: pd.DataFrame) -> None:
        numeric = []
        categorical = []
        datetime = []

        for col in df.columns:
            dtype = df[col].dtype
            if pd.api.types.is_numeric_dtype(dtype) and not pd.api.types.is_bool_dtype(dtype):
                numeric.append(col)
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                datetime.append(col)
            else:
                # String, object, category, boolean
                # Check if it might be parseable datetime
                sample = df[col].dropna()
                if len(sample) > 0 and isinstance(sample.iloc[0], str) and len(sample.iloc[0]) >= 8:
                    try:
                        pd.to_datetime(sample.iloc[:10], format="mixed")
                        datetime.append(col)
                        continue
                    except Exception:
                        pass
                categorical.append(col)

        self.numeric_cols_ = numeric
        self.categorical_cols_ = categorical
        self.datetime_cols_ = datetime

    def _prepare_datetime_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        for col in self.datetime_cols_:
            parsed = pd.to_datetime(df[col], format="mixed", errors="coerce")
            df[f"{col}_year"] = parsed.dt.year.fillna(2000).astype(float)
            df[f"{col}_month"] = parsed.dt.month.fillna(1).astype(float)
            df[f"{col}_day"] = parsed.dt.day.fillna(1).astype(float)
            df[f"{col}_dayofweek"] = parsed.dt.dayofweek.fillna(0).astype(float)
            df = df.drop(columns=[col])
        return df

    def fit(self, X: pd.DataFrame, y=None):
        X_df = X.copy()
        self._detect_types(X_df)

        # Expand datetimes
        if self.datetime_cols_:
            X_df = self._prepare_datetime_features(X_df)
            # Re-detect numeric for expanded datetime fields
            self.numeric_cols_ = [c for c in X_df.columns if c not in self.categorical_cols_]

        transformers = []

        if self.numeric_cols_:
            num_pipeline = Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="median")),
                    ("scaler", StandardScaler()),
                ]
            )
            transformers.append(("num", num_pipeline, self.numeric_cols_))

        if self.categorical_cols_:
            cat_pipeline = Pipeline(
                [
                    ("imputer", SimpleImputer(strategy="constant", fill_value="missing")),
                    ("encoder", OneHotEncoder(
                        handle_unknown="ignore",
                        sparse_output=False,
                        # ML-01: cap cardinality to prevent memory exhaustion.
                        # Categories appearing in fewer than 1% of rows are collapsed
                        # into the "infrequent_sklearn" bucket; at most 50 dummies
                        # are emitted per column regardless of true cardinality.
                        max_categories=50,
                        min_frequency=0.01,
                    )),
                ]
            )
            transformers.append(("cat", cat_pipeline, self.categorical_cols_))

        if transformers:
            self.column_transformer_ = ColumnTransformer(
                transformers=transformers,
                remainder="drop",
            )
            self.column_transformer_.fit(X_df)

            # Store generated feature names
            names = []
            if self.numeric_cols_:
                names.extend(self.numeric_cols_)
            if self.categorical_cols_:
                cat_encoder = self.column_transformer_.named_transformers_["cat"].named_steps["encoder"]
                cat_names = cat_encoder.get_feature_names_out(self.categorical_cols_).tolist()
                names.extend(cat_names)
            self.feature_names_ = names
        else:
            self.feature_names_ = []

        return self

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        if self.column_transformer_ is None:
            return np.empty((len(X), 0), dtype=float)

        X_df = X.copy()
        if self.datetime_cols_:
            X_df = self._prepare_datetime_features(X_df)

        return self.column_transformer_.transform(X_df)

    def fit_transform(self, X: pd.DataFrame, y=None) -> np.ndarray:
        return self.fit(X, y).transform(X)

    @property
    def feature_names(self) -> List[str]:
        return self.feature_names_
