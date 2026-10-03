"""Validation and cross-validation splitting strategies.

Ensures deterministic, leakage-free data splits for classification and regression.
"""

from typing import Generator, List, Tuple
import numpy as np
import pandas as pd
from sklearn.model_selection import KFold, StratifiedKFold, train_test_split

from .schemas import MLProblemType, ValidationStrategy


class DataSplitter:
    """Manages train/validation/test splits and cross-validation folding."""

    def __init__(
        self,
        problem_type: MLProblemType,
        strategy: ValidationStrategy = ValidationStrategy.STRATIFIED_K_FOLD,
        n_splits: int = 5,
        random_seed: int = 42,
    ):
        self.problem_type = problem_type
        self.strategy = strategy
        self.n_splits = n_splits
        self.random_seed = random_seed

    def get_cv_splits(
        self,
        X: pd.DataFrame,
        y: pd.Series,
    ) -> List[Tuple[np.ndarray, np.ndarray]]:
        """Generate (train_idx, val_idx) fold splits."""
        if self.problem_type == MLProblemType.CLASSIFICATION:
            # Check if smallest class has at least n_splits samples
            min_class_count = y.value_counts().min()
            if min_class_count < self.n_splits:
                # Fallback to KFold if classes are too small for stratified folds
                splitter = KFold(
                    n_splits=self.n_splits,
                    shuffle=True,
                    random_state=self.random_seed,
                )
                return list(splitter.split(X, y))

            splitter = StratifiedKFold(
                n_splits=self.n_splits,
                shuffle=True,
                random_state=self.random_seed,
            )
            return list(splitter.split(X, y))
        else:
            splitter = KFold(
                n_splits=self.n_splits,
                shuffle=True,
                random_state=self.random_seed,
            )
            return list(splitter.split(X, y))

    def train_test_split(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        test_size: float = 0.2,
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
        """Holdout split for final evaluation."""
        stratify = y if self.problem_type == MLProblemType.CLASSIFICATION else None
        # Handle tiny classes in stratify
        if stratify is not None and stratify.value_counts().min() < 2:
            stratify = None

        return train_test_split(
            X,
            y,
            test_size=test_size,
            random_state=self.random_seed,
            stratify=stratify,
        )
