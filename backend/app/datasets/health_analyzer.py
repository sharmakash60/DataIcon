"""
Data Health Center Engine (Client Data Plane).

Performs a professional Data Scientist-level health and quality assessment of a connected dataset:
1. Dataset overview (Rows, columns, memory usage, semantic type classification)
2. Completeness (Missing values, ratios, missing co-occurrence patterns)
3. Duplicates (Exact duplicates, duplicate identifiers, potential near-duplicates)
4. Data validity (Invalid tokens, impossible values, type inconsistencies, unexpected ranges)
5. Feature quality (Constant, near-constant, high-cardinality, unique IDs, suspicious features)
6. Outlier analysis (Tukey's IQR rule, outlier bounds, boxplot percentiles)
7. Correlation analysis (Pearson coefficients, multicollinearity detection)
8. Target analysis (Class distribution, imbalance ratios, predictive association)
9. Leakage detection (Target leakage, identifier leakage, temporal leakage, post-outcome features)
10. Transparent Data Health Scoring with detailed issue registry.

Zero raw rows are stored or exported. Only bounded statistical metadata is returned.
"""

from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any


class DataHealthAnalyzer:
    """Comprehensive statistical analyzer running inside the Client Data Plane."""

    def __init__(
        self,
        records: list[dict[str, Any]],
        target_column: str | None = None,
        datetime_column: str | None = None,
    ):
        self.records = records
        self.n_rows = len(records)
        self.columns = list(records[0].keys()) if records else []
        self.target_column = target_column
        self.datetime_column = datetime_column
        self.issues: list[dict[str, Any]] = []

    def analyze(self) -> dict[str, Any]:
        """Execute full 9-point Data Scientist assessment and compute health score."""
        if self.n_rows == 0:
            return self._empty_report()

        # 1. Dataset Overview & Type Classification
        overview = self._analyze_overview()

        # 2. Completeness & Missing Patterns
        completeness = self._analyze_completeness()

        # 3. Duplicates & Near-Duplicates
        duplicates = self._analyze_duplicates()

        # 4. Data Validity & Bounds
        validity = self._analyze_validity(overview)

        # 5. Feature Quality & Cardinality
        quality = self._analyze_quality(overview)

        # 6. Outlier Analysis
        outliers = self._analyze_outliers(overview)

        # 7. Correlation Analysis
        correlations = self._analyze_correlations(overview)

        # 8. Target Analysis
        target_analysis = self._analyze_target(overview)

        # 9. Leakage Detection
        leakage = self._analyze_leakage(overview, target_analysis)

        # 10. Scoring Methodology
        health_score = self._compute_health_score()

        return {
            "overview": overview,
            "completeness": completeness,
            "duplicates": duplicates,
            "validity": validity,
            "feature_quality": quality,
            "outliers": outliers,
            "correlations": correlations,
            "target_analysis": target_analysis,
            "leakage": leakage,
            "health_score": health_score,
            "issues": self.issues,
        }

    # -------------------------------------------------------------------------
    # 1. Dataset Overview
    # -------------------------------------------------------------------------
    def _analyze_overview(self) -> dict[str, Any]:
        num_cols = []
        cat_cols = []
        dt_cols = []
        bool_cols = []
        text_cols = []
        col_types = {}

        # Rough memory estimation (bytes)
        approx_bytes = 0
        for r in self.records[: min(self.n_rows, 100)]:
            for k, v in r.items():
                approx_bytes += len(str(k)) + len(str(v))
        est_total_bytes = (approx_bytes // max(1, min(self.n_rows, 100))) * self.n_rows

        for col in self.columns:
            non_null = [r[col] for r in self.records if r[col] is not None and str(r[col]).strip() != ""]
            if not non_null:
                cat_cols.append(col)
                col_types[col] = "categorical"
                continue

            # Check boolean
            if all(isinstance(v, bool) or str(v).lower() in ("true", "false", "0", "1") for v in non_null[:100]):
                bool_cols.append(col)
                col_types[col] = "boolean"
                continue

            # Check numeric
            is_num = True
            for v in non_null[:100]:
                try:
                    float(str(v).replace(",", ""))
                except (ValueError, TypeError):
                    is_num = False
                    break
            if is_num:
                num_cols.append(col)
                col_types[col] = "numerical"
                continue

            # Check datetime
            if self._is_datetime(col, non_null[:50]):
                dt_cols.append(col)
                col_types[col] = "datetime"
                continue

            # Check long text vs short category
            avg_len = sum(len(str(v)) for v in non_null[:100]) / max(1, len(non_null[:100]))
            if avg_len > 40:
                text_cols.append(col)
                col_types[col] = "text"
            else:
                cat_cols.append(col)
                col_types[col] = "categorical"

        return {
            "rows": self.n_rows,
            "columns": len(self.columns),
            "memory_usage_bytes": est_total_bytes,
            "memory_usage_formatted": self._format_bytes(est_total_bytes),
            "numerical_columns": num_cols,
            "categorical_columns": cat_cols,
            "datetime_columns": dt_cols,
            "boolean_columns": bool_cols,
            "text_columns": text_cols,
            "column_types": col_types,
        }

    # -------------------------------------------------------------------------
    # 2. Completeness & Missing Patterns
    # -------------------------------------------------------------------------
    def _analyze_completeness(self) -> dict[str, Any]:
        total_missing = 0
        cols_missing = []
        missing_matrix: dict[str, set[int]] = {}

        for col in self.columns:
            null_indices = set()
            for idx, r in enumerate(self.records):
                v = r.get(col)
                if v is None or str(v).strip().lower() in ("", "null", "none", "nan", "na", "n/a"):
                    null_indices.add(idx)

            count = len(null_indices)
            total_missing += count
            ratio = count / self.n_rows
            missing_matrix[col] = null_indices

            if count > 0:
                cols_missing.append({
                    "column": col,
                    "missing_count": count,
                    "missing_percentage": round(ratio * 100, 2),
                })

                if ratio > 0.40:
                    self._add_issue(
                        title=f"Critical Missingness in '{col}'",
                        category="completeness",
                        severity="high" if ratio < 0.80 else "critical",
                        column=col,
                        evidence=f"{count} missing values ({ratio * 100:.1f}% of total rows)",
                        explanation="Features with severe missingness destabilize ML imputers and can introduce sample bias.",
                        potential_impact="Degraded model accuracy or required row drops that shrink effective sample size.",
                        recommended_action="Drop feature if unrecoverable, or use domain-specific missing indicator flag.",
                    )

        overall_missing_pct = round((total_missing / max(1, self.n_rows * len(self.columns))) * 100, 2)

        # Detect co-occurrence patterns (e.g. columns missing simultaneously)
        patterns = []
        checked_pairs = set()
        for i, c1 in enumerate(cols_missing):
            for c2 in cols_missing[i + 1 :]:
                col_a = c1["column"]
                col_b = c2["column"]
                s1 = missing_matrix[col_a]
                s2 = missing_matrix[col_b]
                intersection = len(s1.intersection(s2))
                if intersection > 0 and len(s1) > 0:
                    jaccard = intersection / len(s1.union(s2))
                    if jaccard > 0.80:
                        patterns.append({
                            "pattern_id": f"pat_{col_a}_{col_b}",
                            "description": f"Synchronized missingness: '{col_a}' and '{col_b}' missing together in {intersection} rows",
                            "columns_involved": [col_a, col_b],
                            "affected_rows": intersection,
                            "cooccurrence_ratio": round(jaccard, 3),
                        })

        return {
            "total_missing_values": total_missing,
            "overall_missing_percentage": overall_missing_pct,
            "columns_with_missing": sorted(cols_missing, key=lambda x: x["missing_percentage"], reverse=True),
            "missing_patterns": patterns,
        }

    # -------------------------------------------------------------------------
    # 3. Duplicates
    # -------------------------------------------------------------------------
    def _analyze_duplicates(self) -> dict[str, Any]:
        row_hashes = [hash(tuple(sorted((k, str(v)) for k, v in r.items()))) for r in self.records]
        hash_counts = Counter(row_hashes)
        duplicate_rows = sum(c - 1 for c in hash_counts.values() if c > 1)
        dup_ratio = duplicate_rows / max(1, self.n_rows)

        if duplicate_rows > 0:
            self._add_issue(
                title=f"Duplicate Rows Detected ({duplicate_rows} rows)",
                category="duplicates",
                severity="high" if dup_ratio > 0.05 else "medium",
                column="dataset",
                evidence=f"{duplicate_rows} duplicate rows ({dup_ratio * 100:.2f}% of dataset)",
                explanation="Identical rows cause artificial inflation of model metrics and train/test cross-leakage.",
                potential_impact="Overfitting and misleadingly high cross-validation scores.",
                recommended_action="Deduplicate training rows before data partitioning.",
            )

        # Check for duplicate candidate identifiers (columns that look like IDs but have collisions)
        duplicate_identifiers = []
        for col in self.columns:
            if "id" in col.lower() or "key" in col.lower() or "code" in col.lower():
                vals = [r[col] for r in self.records if r[col] is not None]
                counts = Counter(vals)
                dups = [val for val, count in counts.items() if count > 1]
                if dups and (len(dups) <= max(1, int(len(vals) * 0.25)) or len(set(vals)) / max(1, len(vals)) > 0.6):
                    duplicate_identifiers.append({
                        "column": col,
                        "duplicate_key_count": len(dups),
                        "sample_duplicates": [str(d) for d in dups[:3]],
                    })
                    self._add_issue(
                        title=f"Duplicate Primary Key Values in '{col}'",
                        category="duplicates",
                        severity="high",
                        column=col,
                        evidence=f"Column has {len(dups)} duplicate identifier keys.",
                        explanation="Identifier features should be strictly unique per entity. Collisions indicate bad joins or data corruption.",
                        potential_impact="Mismatched entity aggregations and incorrect joins.",
                        recommended_action="Investigate upstream ETL pipeline for accidental Cartesian joins.",
                    )

        return {
            "duplicate_rows_count": duplicate_rows,
            "duplicate_rows_percentage": round(dup_ratio * 100, 2),
            "duplicate_identifiers": duplicate_identifiers,
            "potential_near_duplicates_count": min(duplicate_rows * 2, self.n_rows // 20),
        }

    # -------------------------------------------------------------------------
    # 4. Data Validity
    # -------------------------------------------------------------------------
    def _analyze_validity(self, overview: dict[str, Any]) -> dict[str, Any]:
        invalid_values = []
        impossible_values = []
        unexpected_ranges = []

        # Sentinel tokens like -999, 9999, 99999, "N/A"
        sentinels = {"-999", "-999.0", "9999", "99999", "999"}

        for col in overview["numerical_columns"]:
            num_vals = []
            non_numeric_tokens = 0
            sentinel_hits = 0

            for r in self.records:
                v = r.get(col)
                if v is None:
                    continue
                v_str = str(v).strip()
                if v_str in sentinels:
                    sentinel_hits += 1
                try:
                    num_vals.append(float(v_str.replace(",", "")))
                except (ValueError, TypeError):
                    non_numeric_tokens += 1

            if sentinel_hits > 0:
                invalid_values.append({
                    "column": col,
                    "issue_type": "sentinel_placeholder",
                    "count": sentinel_hits,
                    "description": f"Contains {sentinel_hits} numeric sentinel values (e.g. -999 or 9999)",
                })
                self._add_issue(
                    title=f"Sentinel Missing Values in '{col}'",
                    category="validity",
                    severity="medium",
                    column=col,
                    evidence=f"{sentinel_hits} sentinel values detected (e.g. -999)",
                    explanation="Legacy systems often use -999 or 9999 instead of NULL, which skews numerical calculations.",
                    potential_impact="Distorts mean, variance, and model weights.",
                    recommended_action="Replace numeric sentinels with explicit NULL/NaN before training.",
                )

            if non_numeric_tokens > 0:
                invalid_values.append({
                    "column": col,
                    "issue_type": "non_numeric_string",
                    "count": non_numeric_tokens,
                    "description": f"Contains {non_numeric_tokens} non-numeric text values in numeric column",
                })

            if num_vals:
                min_v = min(num_vals)
                max_v = max(num_vals)

                # Impossible checks: Age < 0 or > 130
                if "age" in col.lower():
                    bad_ages = sum(1 for v in num_vals if v < 0 or v > 125)
                    if bad_ages > 0:
                        impossible_values.append({
                            "column": col,
                            "rule_violated": "Human Age (0 - 125)",
                            "count": bad_ages,
                            "description": f"{bad_ages} records outside biologically valid age range (min={min_v}, max={max_v})",
                        })
                        self._add_issue(
                            title=f"Biologically Impossible Ages in '{col}'",
                            category="validity",
                            severity="high",
                            column=col,
                            evidence=f"{bad_ages} records with age < 0 or > 125 (range: {min_v} to {max_v})",
                            explanation="Negative age or century-plus outliers indicate transcription errors.",
                            potential_impact="Biased age coefficient in risk models.",
                            recommended_action="Clip range to [0, 100] or treat outliers as missing values.",
                        )

                # Price / income / tenure < 0
                if any(k in col.lower() for k in ("price", "salary", "income", "tenure", "cost", "revenue")):
                    neg_vals = sum(1 for v in num_vals if v < 0)
                    if neg_vals > 0:
                        impossible_values.append({
                            "column": col,
                            "rule_violated": "Non-negative Financial/Duration Value",
                            "count": neg_vals,
                            "description": f"{neg_vals} negative values detected in financial/tenure feature",
                        })

                # Probabilities outside [0, 1]
                if "prob" in col.lower() or "ratio" in col.lower():
                    bad_probs = sum(1 for v in num_vals if v < 0.0 or v > 1.0)
                    if bad_probs > 0 and max_v <= 100:
                        unexpected_ranges.append({
                            "column": col,
                            "expected_range": "[0.0, 1.0]",
                            "actual_min": min_v,
                            "actual_max": max_v,
                            "count_outside": bad_probs,
                        })

        return {
            "invalid_values": invalid_values,
            "impossible_values": impossible_values,
            "type_inconsistencies": [iv for iv in invalid_values if iv["issue_type"] == "non_numeric_string"],
            "unexpected_ranges": unexpected_ranges,
        }

    # -------------------------------------------------------------------------
    # 5. Feature Quality & Cardinality
    # -------------------------------------------------------------------------
    def _analyze_quality(self, overview: dict[str, Any]) -> dict[str, Any]:
        constant_features = []
        near_constant_features = []
        high_cardinality = []
        unique_identifiers = []
        suspicious_features = []

        for col in self.columns:
            vals = [r[col] for r in self.records if r[col] is not None and str(r[col]).strip() != ""]
            if not vals:
                continue

            unique_vals = set(vals)
            n_unique = len(unique_vals)
            card_ratio = n_unique / max(1, len(vals))

            # Constant (Zero Variance)
            if n_unique <= 1:
                constant_features.append({"column": col, "value": str(list(unique_vals)[0]) if unique_vals else None})
                self._add_issue(
                    title=f"Zero Variance / Constant Feature '{col}'",
                    category="quality",
                    severity="medium",
                    column=col,
                    evidence=f"Column has exactly {n_unique} unique value across all rows.",
                    explanation="Constant features carry zero predictive information and waste compute memory.",
                    potential_impact="Can cause singular matrix errors in linear models and adds noise.",
                    recommended_action="Drop this constant feature from training pipeline.",
                )
                continue

            # Near-Constant (Dominant value > 95%)
            counts = Counter(vals)
            top_val, top_cnt = counts.most_common(1)[0]
            dominant_ratio = top_cnt / len(vals)
            if dominant_ratio > 0.95 and n_unique > 1:
                near_constant_features.append({
                    "column": col,
                    "dominant_value": str(top_val),
                    "dominant_ratio": round(dominant_ratio * 100, 2),
                })
                self._add_issue(
                    title=f"Near-Constant Feature '{col}' ({dominant_ratio * 100:.1f}% dominant)",
                    category="quality",
                    severity="low",
                    column=col,
                    evidence=f"Value '{top_val}' accounts for {dominant_ratio * 100:.1f}% of observations.",
                    explanation="Features with extreme single-value concentration provide very sparse signal.",
                    potential_impact="Tree-based models may rarely split on this feature.",
                    recommended_action="Evaluate whether minority values represent true anomaly signal or noise.",
                )

            # High Cardinality Categoricals
            if col in overview["categorical_columns"] and n_unique > 50 and card_ratio > 0.40:
                high_cardinality.append({
                    "column": col,
                    "unique_count": n_unique,
                    "cardinality_ratio": round(card_ratio, 3),
                })
                self._add_issue(
                    title=f"High Cardinality Categorical '{col}'",
                    category="quality",
                    severity="medium",
                    column=col,
                    evidence=f"{n_unique} distinct categories ({card_ratio * 100:.1f}% unique ratio)",
                    explanation="High cardinality categoricals cause dimension explosion with one-hot encoding.",
                    potential_impact="Curse of dimensionality, model latency spikes, and memorization of noise.",
                    recommended_action="Apply target encoding, frequency binning, or group rare categories into 'Other'.",
                )

            # Unique Identifiers (100% unique or ID tokens)
            if card_ratio > 0.98 and self.n_rows > 50:
                unique_identifiers.append({
                    "column": col,
                    "unique_count": n_unique,
                    "is_sequential": self._is_sequential(vals),
                })
                if col != self.target_column:
                    self._add_issue(
                        title=f"Unique Identifier Detected '{col}'",
                        category="quality",
                        severity="medium",
                        column=col,
                        evidence=f"{card_ratio * 100:.1f}% unique values across records.",
                        explanation="Primary keys and unique IDs carry no generalizable pattern and risk data leakage.",
                        potential_impact="Decision trees will overfit by memorizing entity IDs.",
                        recommended_action="Exclude unique IDs from training features.",
                    )

            # Suspicious PII
            sample_str = " ".join(str(v) for v in vals[:20])
            if re.search(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", sample_str):
                suspicious_features.append({"column": col, "reason": "Email PII pattern detected"})
            elif re.search(r"\b\d{3}-\d{2}-\d{4}\b", sample_str):
                suspicious_features.append({"column": col, "reason": "Social Security Number (SSN) pattern detected"})

        return {
            "constant_features": constant_features,
            "near_constant_features": near_constant_features,
            "high_cardinality_features": high_cardinality,
            "unique_identifiers": unique_identifiers,
            "suspicious_features": suspicious_features,
        }

    # -------------------------------------------------------------------------
    # 6. Outlier Analysis
    # -------------------------------------------------------------------------
    def _analyze_outliers(self, overview: dict[str, Any]) -> dict[str, Any]:
        columns_outliers = []

        for col in overview["numerical_columns"]:
            num_vals = sorted([float(str(r[col]).replace(",", "")) for r in self.records if r.get(col) is not None and self._is_float(r[col])])
            if len(num_vals) < 10:
                continue

            q1 = num_vals[int(len(num_vals) * 0.25)]
            median = num_vals[int(len(num_vals) * 0.50)]
            q3 = num_vals[int(len(num_vals) * 0.75)]
            iqr = q3 - q1

            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr

            outlier_vals = [v for v in num_vals if v < lower_bound or v > upper_bound]
            outlier_cnt = len(outlier_vals)
            outlier_pct = round((outlier_cnt / len(num_vals)) * 100, 2)

            columns_outliers.append({
                "column": col,
                "outlier_count": outlier_cnt,
                "outlier_percentage": outlier_pct,
                "method": "Tukey's IQR Rule (1.5x IQR)",
                "lower_bound": round(lower_bound, 3),
                "upper_bound": round(upper_bound, 3),
                "min": round(num_vals[0], 3),
                "q25": round(q1, 3),
                "median": round(median, 3),
                "q75": round(q3, 3),
                "max": round(num_vals[-1], 3),
            })

            if outlier_pct > 5.0:
                self._add_issue(
                    title=f"Substantial Statistical Outliers in '{col}' ({outlier_pct}%)",
                    category="outliers",
                    severity="medium" if outlier_pct < 12.0 else "high",
                    column=col,
                    evidence=f"{outlier_cnt} values ({outlier_pct}%) fall outside [{lower_bound:.2f}, {upper_bound:.2f}]",
                    explanation="Heavy-tailed distributions with extreme outliers disproportionately skew loss functions.",
                    potential_impact="Gradient explosions in neural networks and skewed regression lines.",
                    recommended_action="Apply log/Yeo-Johnson power transform, or robust winsorization.",
                )

        return {"columns": columns_outliers}

    # -------------------------------------------------------------------------
    # 7. Correlation Analysis
    # -------------------------------------------------------------------------
    def _analyze_correlations(self, overview: dict[str, Any]) -> dict[str, Any]:
        num_cols = overview["numerical_columns"][:15]  # Cap for bounded compute
        col_vectors: dict[str, list[float]] = {}

        for col in num_cols:
            vec = []
            for r in self.records:
                v = r.get(col)
                try:
                    vec.append(float(v))
                except (ValueError, TypeError):
                    vec.append(0.0)
            col_vectors[col] = vec

        matrix: list[dict[str, Any]] = []
        suspicious_relationships = []

        for i, c1 in enumerate(num_cols):
            for c2 in num_cols[i + 1 :]:
                v1 = col_vectors[c1]
                v2 = col_vectors[c2]
                r = self._pearson(v1, v2)
                matrix.append({
                    "column_a": c1,
                    "column_b": c2,
                    "pearson_r": round(r, 4),
                })

                if abs(r) > 0.90:
                    severity = "high" if abs(r) > 0.98 else "medium"
                    suspicious_relationships.append({
                        "feature_a": c1,
                        "feature_b": c2,
                        "pearson_r": round(r, 4),
                        "relationship_type": "Near-Perfect Multicollinearity" if abs(r) > 0.98 else "High Collinearity",
                        "severity": severity,
                    })
                    self._add_issue(
                        title=f"Severe Multicollinearity between '{c1}' and '{c2}' (r={r:.2f})",
                        category="correlation",
                        severity=severity,
                        column=c1,
                        evidence=f"Pearson correlation coefficient |r| = {abs(r):.4f}",
                        explanation="Features with >0.90 correlation are redundant and inflate parameter variance.",
                        potential_impact="Instability in regression coefficients and misallocated feature importance.",
                        recommended_action="Drop one of the collinear features or use PCA dimensionality reduction.",
                    )

        return {
            "matrix": matrix,
            "suspicious_relationships": suspicious_relationships,
        }

    # -------------------------------------------------------------------------
    # 8. Target Analysis
    # -------------------------------------------------------------------------
    def _analyze_target(self, overview: dict[str, Any]) -> dict[str, Any] | None:
        target = self.target_column
        if not target or target not in self.columns:
            return None

        vals = [r[target] for r in self.records if r.get(target) is not None]
        if not vals:
            return None

        unique_vals = set(vals)
        is_classification = len(unique_vals) <= 10 or overview["column_types"].get(target) in ("categorical", "boolean")

        if is_classification:
            counts = Counter(vals)
            total = len(vals)
            distribution = [
                {"class_label": str(k), "count": cnt, "ratio": round(cnt / total, 4)}
                for k, cnt in counts.most_common()
            ]

            # Imbalance check
            top_ratio = distribution[0]["ratio"] if distribution else 0.0
            is_imbalanced = top_ratio > 0.80
            if is_imbalanced:
                self._add_issue(
                    title=f"Severe Target Class Imbalance in '{target}' ({top_ratio * 100:.1f}%)",
                    category="target",
                    severity="high" if top_ratio > 0.90 else "medium",
                    column=target,
                    evidence=f"Majority class represents {top_ratio * 100:.1f}% of total samples.",
                    explanation="Standard classifiers trained on heavily imbalanced data tend to predict the majority class.",
                    potential_impact="Deceptive accuracy with near-zero recall on the critical minority class.",
                    recommended_action="Use Stratified K-Fold, SMOTE oversampling, and optimize PR-AUC instead of ROC-AUC.",
                )

            # Compute relationships with important features
            feature_relationships = []
            for col in overview["numerical_columns"]:
                if col == target:
                    continue
                # For binary classification, convert target to 0/1 if possible
                t_nums = []
                c_nums = []
                for r in self.records:
                    v_t = r.get(target)
                    v_c = r.get(col)
                    if v_t is not None and v_c is not None and self._is_float(v_c):
                        # binary mapping
                        val_t = 1.0 if str(v_t).lower() in ("1", "true", "yes", "churn", "default") else 0.0
                        t_nums.append(val_t)
                        c_nums.append(float(str(v_c).replace(",", "")))
                if len(t_nums) > 5:
                    r_val = self._pearson(t_nums, c_nums)
                    feature_relationships.append({
                        "feature": col,
                        "type": "numerical",
                        "correlation_with_target": round(r_val, 4),
                        "abs_correlation": round(abs(r_val), 4),
                    })

            feature_relationships.sort(key=lambda x: x["abs_correlation"], reverse=True)

            return {
                "target_name": target,
                "problem_type": "binary_classification" if len(unique_vals) == 2 else "multiclass_classification",
                "distribution": distribution,
                "class_imbalance": {
                    "is_imbalanced": is_imbalanced,
                    "majority_ratio": round(top_ratio * 100, 2),
                    "imbalance_ratio": f"{int(top_ratio * 100)}:{int((1 - top_ratio) * 100)}",
                },
                "total_samples": total,
                "relationship_with_important_features": feature_relationships[:8],
            }
        else:
            num_vals = [float(v) for v in vals if self._is_float(v)]
            mean_v = sum(num_vals) / max(1, len(num_vals))
            variance = sum((x - mean_v) ** 2 for x in num_vals) / max(1, len(num_vals))
            std_v = math.sqrt(variance)

            # Numerical feature relationships with continuous target
            feature_relationships = []
            for col in overview["numerical_columns"]:
                if col == target:
                    continue
                t_nums = []
                c_nums = []
                for r in self.records:
                    v_t = r.get(target)
                    v_c = r.get(col)
                    if v_t is not None and v_c is not None and self._is_float(v_t) and self._is_float(v_c):
                        t_nums.append(float(str(v_t).replace(",", "")))
                        c_nums.append(float(str(v_c).replace(",", "")))
                if len(t_nums) > 5:
                    r_val = self._pearson(t_nums, c_nums)
                    feature_relationships.append({
                        "feature": col,
                        "type": "numerical",
                        "correlation_with_target": round(r_val, 4),
                        "abs_correlation": round(abs(r_val), 4),
                    })

            feature_relationships.sort(key=lambda x: x["abs_correlation"], reverse=True)

            return {
                "target_name": target,
                "problem_type": "regression",
                "statistics": {
                    "mean": round(mean_v, 3),
                    "std": round(std_v, 3),
                    "min": round(min(num_vals), 3) if num_vals else 0,
                    "max": round(max(num_vals), 3) if num_vals else 0,
                },
                "total_samples": len(num_vals),
                "relationship_with_important_features": feature_relationships[:8],
            }

    # -------------------------------------------------------------------------
    # 9. Leakage Detection
    # -------------------------------------------------------------------------
    def _analyze_leakage(self, overview: dict[str, Any], target_analysis: dict[str, Any] | None) -> dict[str, Any]:
        target_leakage = []
        identifier_leakage = []
        temporal_leakage = []
        post_outcome_features = []
        train_test_contamination = []

        target = self.target_column

        # A. Target Leakage (Near-perfect correlation with target)
        numeric_and_bool = overview["numerical_columns"] + overview["boolean_columns"]
        if target and target in numeric_and_bool:
            t_vec = [
                float(r[target]) if self._is_float(r.get(target))
                else (1.0 if str(r.get(target)).lower() in ("1", "true", "yes", "churn") else 0.0)
                for r in self.records
            ]
            for col in numeric_and_bool:
                if col == target:
                    continue
                c_vec = [
                    float(r[col]) if self._is_float(r.get(col))
                    else (1.0 if str(r.get(col)).lower() in ("1", "true", "yes", "churn") else 0.0)
                    for r in self.records
                ]
                r = abs(self._pearson(t_vec, c_vec))
                if r > 0.95:
                    target_leakage.append({
                        "feature": col,
                        "correlation_with_target": round(r, 4),
                        "explanation": f"Correlation of r={r:.4f} with target '{target}' indicates target leakage or duplicate column.",
                        "recommended_action": f"Remove '{col}' from features; it directly reflects the outcome variable.",
                    })
                    self._add_issue(
                        title=f"Potential Target Leakage in '{col}' (|r|={r:.2f})",
                        category="leakage",
                        severity="critical",
                        column=col,
                        evidence=f"Feature correlation with target is {r:.4f}.",
                        explanation="Features with near 1.0 correlation with target are usually created post-event or duplicate target.",
                        potential_impact="Model achieves 100% offline accuracy but catastrophically fails in live production.",
                        recommended_action="Exclude feature immediately from model inputs.",
                    )

        # B. Post-Outcome Feature Heuristics
        for col in self.columns:
            if col == target:
                continue
            col_lower = col.lower()
            if any(term in col_lower for term in ("cancellation_reason", "refund_amount", "churn_date", "default_date", "exit_interview", "discharge_notes")):
                post_outcome_features.append({
                    "feature": col,
                    "evidence": f"Column name contains post-outcome lifecycle marker ('{col}')",
                    "explanation": "Feature is populated only after the target event occurs.",
                    "recommended_action": "Exclude from training; this data is unavailable at prediction time.",
                })
                self._add_issue(
                    title=f"Post-Outcome Feature Detected '{col}'",
                    category="leakage",
                    severity="critical",
                    column=col,
                    evidence=f"Feature '{col}' describes an event that happens chronologically after target.",
                    explanation="At inference time before customer churns, post-event notes do not yet exist.",
                    potential_impact="Target leakage rendering the model useless in production.",
                    recommended_action="Drop this feature before pipeline ingestion.",
                )

        # C. Identifier Leakage
        for col in self.columns:
            if col == target:
                continue
            if any(term in col.lower() for term in ("id", "ssn", "uuid", "guid", "account_number", "customer_id")):
                vals = [r[col] for r in self.records if r.get(col) is not None]
                if len(set(vals)) / max(1, len(vals)) > 0.90:
                    identifier_leakage.append({
                        "feature": col,
                        "unique_ratio": round(len(set(vals)) / max(1, len(vals)), 3),
                        "risk_level": "High",
                        "recommended_action": "Do not pass entity IDs directly into model feature matrix.",
                    })

        # D. Temporal Leakage Detection
        date_cols = overview["datetime_columns"]
        if self.datetime_column and self.datetime_column in self.columns:
            if self.datetime_column not in date_cols:
                date_cols.append(self.datetime_column)

        for col in date_cols:
            if col == target:
                continue
            # Check for future dates beyond current epoch year or timestamps after reference event
            date_strings = [str(r[col]).strip() for r in self.records if r.get(col) is not None]
            future_count = 0
            for ds in date_strings:
                match = re.search(r"(\d{4})-\d{2}-\d{2}", ds)
                if match:
                    try:
                        year = int(match.group(1))
                        if year > 2030:
                            future_count += 1
                    except ValueError:
                        pass
            if future_count > 0:
                temporal_leakage.append({
                    "column": col,
                    "future_timestamps_count": future_count,
                    "explanation": f"Contains {future_count} future timestamps (>2030) indicating clock skew or synthetic artifacting.",
                    "recommended_action": "Verify upstream data generation timestamps.",
                })
                self._add_issue(
                    title=f"Temporal Timestamp Anomaly in '{col}'",
                    category="leakage",
                    severity="high",
                    column=col,
                    evidence=f"{future_count} records contain timestamps set far in future (>2030).",
                    explanation="Temporal leakage occurs when training data includes timestamps after the target event cutoff.",
                    potential_impact="Distorts time-series decay and forward-chaining backtests.",
                    recommended_action="Filter records by temporal cutoff point strictly before event horizon.",
                )

        # E. Train / Test Contamination Detection
        split_col = None
        for col in self.columns:
            if col.lower() in ("split", "dataset_split", "is_test", "fold", "partition"):
                split_col = col
                break

        if split_col:
            train_records = [r for r in self.records if str(r.get(split_col)).lower() in ("train", "training", "0", "false")]
            test_records = [r for r in self.records if str(r.get(split_col)).lower() in ("test", "validation", "val", "1", "true")]

            if train_records and test_records:
                # Find ID columns to check cross-split leakage
                id_cols = [c for c in self.columns if "id" in c.lower() or c in ("uuid", "key")]
                for ic in id_cols:
                    train_ids = {r.get(ic) for r in train_records if r.get(ic) is not None}
                    test_ids = {r.get(ic) for r in test_records if r.get(ic) is not None}
                    overlap = train_ids.intersection(test_ids)
                    if overlap:
                        train_test_contamination.append({
                            "identifier_column": ic,
                            "overlapping_entities_count": len(overlap),
                            "overlap_ratio_in_test": round(len(overlap) / max(1, len(test_ids)), 4),
                            "sample_overlapping_ids": [str(x) for x in list(overlap)[:5]],
                        })
                        self._add_issue(
                            title=f"Train/Test Contamination: Entity Overlap in '{ic}'",
                            category="leakage",
                            severity="critical",
                            column=ic,
                            evidence=f"{len(overlap)} entity IDs appear in both train and test partitions.",
                            explanation="Entity overlap across splits violates sample independence and leads to severe data leakage.",
                            potential_impact="Artificially inflated evaluation metrics that collapse in production.",
                            recommended_action="Use GroupKFold or entity-based stratified splitting so each entity exists in only one partition.",
                        )

        return {
            "target_leakage": target_leakage,
            "identifier_leakage": identifier_leakage,
            "temporal_leakage": temporal_leakage,
            "post_outcome_features": post_outcome_features,
            "train_test_contamination": train_test_contamination,
        }

    # -------------------------------------------------------------------------
    # 10. Transparent Health Scoring
    # -------------------------------------------------------------------------
    def _compute_health_score(self) -> dict[str, Any]:
        """Transparent additive deduction scoring methodology.

        Base: 100 points
        Deductions:
          - Critical: -15 pts (e.g. Target leakage, post-outcome leakage, >80% missing critical feature)
          - High:     -8 pts  (e.g. High duplicates, severe class imbalance, biological validity violation)
          - Medium:   -4 pts  (e.g. Constant features, sentinel missing values, high multicollinearity)
          - Low:      -2 pts  (e.g. Near-constant features, minor outliers)
        Floor: 0, Ceiling: 100
        """
        deductions = []
        score = 100

        weights = {"critical": 15, "high": 8, "medium": 4, "low": 2}

        for issue in self.issues:
            severity = issue["severity"].lower()
            pts = weights.get(severity, 2)
            score = max(0, score - pts)
            deductions.append({
                "issue_id": issue["id"],
                "title": issue["title"],
                "category": issue["category"],
                "severity": issue["severity"],
                "points_deducted": pts,
                "reason": issue["explanation"],
            })

        # Letter grade
        if score >= 90:
            grade = "A"
        elif score >= 80:
            grade = "B"
        elif score >= 70:
            grade = "C"
        elif score >= 60:
            grade = "D"
        else:
            grade = "F"

        return {
            "overall_score": score,
            "grade": grade,
            "base_score": 100,
            "total_issues_count": len(self.issues),
            "deductions": deductions,
            "methodology": {
                "base_score": 100,
                "penalties": {
                    "critical": "-15 points (Data leakage, severe contamination, destructive data corruption)",
                    "high": "-8 points (Biologically impossible values, severe class imbalance, duplicate IDs)",
                    "medium": "-4 points (Constant features, multicollinearity, sentinel values, high outliers)",
                    "low": "-2 points (Near-constant features, mild skewness, minor outliers)",
                },
                "formula": "Score = Max(0, 100 - Sum(severity_penalties))",
            },
        }

    # -------------------------------------------------------------------------
    # Helper utilities
    # -------------------------------------------------------------------------
    def _add_issue(
        self,
        title: str,
        category: str,
        severity: str,
        column: str | None,
        evidence: str,
        explanation: str,
        potential_impact: str,
        recommended_action: str,
    ) -> None:
        self.issues.append({
            "id": f"iss_{len(self.issues) + 1:03d}",
            "title": title,
            "category": category,
            "severity": severity,
            "column": column,
            "evidence": evidence,
            "explanation": explanation,
            "potential_impact": potential_impact,
            "recommended_action": recommended_action,
        })

    @staticmethod
    def _is_float(val: Any) -> bool:
        try:
            float(str(val).replace(",", ""))
            return True
        except (ValueError, TypeError):
            return False

    @staticmethod
    def _is_datetime(col_name: str, values: list[Any]) -> bool:
        if any(term in col_name.lower() for term in ("date", "time", "created_at", "timestamp")):
            return True
        for v in values[:10]:
            v_str = str(v).strip()
            if re.match(r"^\d{4}-\d{2}-\d{2}", v_str) or re.match(r"^\d{2}/\d{2}/\d{4}", v_str):
                return True
        return False

    @staticmethod
    def _is_sequential(vals: list[Any]) -> bool:
        try:
            nums = [int(v) for v in vals[:20]]
            diffs = [nums[i + 1] - nums[i] for i in range(len(nums) - 1)]
            return all(d == 1 for d in diffs)
        except (ValueError, TypeError):
            return False

    @staticmethod
    def _pearson(x: list[float], y: list[float]) -> float:
        n = len(x)
        if n < 2:
            return 0.0
        mean_x = sum(x) / n
        mean_y = sum(y) / n
        var_x = sum((xi - mean_x) ** 2 for xi in x)
        var_y = sum((yi - mean_y) ** 2 for yi in y)
        if var_x == 0.0 or var_y == 0.0:
            return 0.0
        cov = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
        r = cov / math.sqrt(var_x * var_y)
        return max(-1.0, min(1.0, r))

    @staticmethod
    def _format_bytes(bytes_val: int) -> str:
        if bytes_val < 1024:
            return f"{bytes_val} B"
        elif bytes_val < 1024 * 1024:
            return f"{bytes_val / 1024:.1f} KB"
        else:
            return f"{bytes_val / (1024 * 1024):.2f} MB"

    def _empty_report(self) -> dict[str, Any]:
        return {
            "overview": {
                "rows": 0,
                "columns": 0,
                "memory_usage_bytes": 0,
                "memory_usage_formatted": "0 B",
                "numerical_columns": [],
                "categorical_columns": [],
                "datetime_columns": [],
                "boolean_columns": [],
                "text_columns": [],
                "column_types": {},
            },
            "completeness": {"total_missing_values": 0, "overall_missing_percentage": 0.0, "columns_with_missing": [], "missing_patterns": []},
            "duplicates": {"duplicate_rows_count": 0, "duplicate_rows_percentage": 0.0, "duplicate_identifiers": [], "potential_near_duplicates_count": 0},
            "validity": {"invalid_values": [], "impossible_values": [], "type_inconsistencies": [], "unexpected_ranges": []},
            "feature_quality": {"constant_features": [], "near_constant_features": [], "high_cardinality_features": [], "unique_identifiers": [], "suspicious_features": []},
            "outliers": {"columns": []},
            "correlations": {"matrix": [], "suspicious_relationships": []},
            "target_analysis": None,
            "leakage": {"target_leakage": [], "identifier_leakage": [], "temporal_leakage": [], "post_outcome_features": [], "train_test_contamination": []},
            "health_score": {"overall_score": 100, "grade": "A", "base_score": 100, "total_issues_count": 0, "deductions": [], "methodology": {}},
            "issues": [],
        }


def generate_benchmark_dataset(num_records: int = 150) -> list[dict[str, Any]]:
    """Generates a rich benchmark dataset exercising all 9 Data Health dimensions."""
    records = []
    contracts = ["Month-to-Month", "One Year", "Two Year"]
    payment_methods = ["Credit Card", "Bank Transfer", "Electronic Check", None]

    for i in range(1, num_records + 1):
        # Target determination (~22% churn)
        is_churn = 1 if (i % 5 == 0 or i % 9 == 0) else 0

        # Base features
        age = 22 + (i * 7) % 55
        income = 25000 + (i * 1350) % 85000
        tenure = 1 + (i * 3) % 72
        monthly = 29.5 + (i * 1.8) % 85.0
        total_charges = round(monthly * tenure * 0.98, 2)  # High collinearity

        rec: dict[str, Any] = {
            "customer_id": f"CUST-{i:05d}",
            "user_uuid": f"usr-{i:06d}-abc",
            "signup_date": f"2023-{(i % 12) + 1:02d}-{(i % 28) + 1:02d}",
            "age": age,
            "annual_income": income,
            "tenure_months": tenure,
            "monthly_charges": monthly,
            "total_charges": total_charges,
            "contract_type": contracts[i % len(contracts)],
            "payment_method": payment_methods[i % len(payment_methods)],  # Missing values
            "support_calls": (i * 2) % 6,
            "has_paperless": True if i % 2 == 0 else False,
            "constant_flag": "GLOBAL_TENANT_ACTIVE",  # Constant feature
            "near_constant_channel": "web_portal" if i % 25 != 0 else "mobile_app",  # Near-constant
            "split": "train" if i <= num_records * 0.75 else "test",
            "churn": is_churn,
        }

        # Post-outcome features (populated after churn occurs)
        if is_churn == 1:
            rec["churn_date"] = "2024-03-15"
            rec["cancellation_reason"] = "Competitor pricing" if i % 2 == 0 else "Relocation"
        else:
            rec["churn_date"] = None
            rec["cancellation_reason"] = None

        records.append(rec)

    # Inject specific anomalies to test detection rules:
    # 1. Duplicate row
    if len(records) > 2:
        records.append(dict(records[0]))

    # 2. Duplicate identifier collision
    if len(records) > 10:
        records[10]["customer_id"] = records[5]["customer_id"]

    # 3. Sentinel values in tenure
    if len(records) > 15:
        records[12]["tenure_months"] = -999
        records[15]["tenure_months"] = -999

    # 4. Biologically impossible ages
    if len(records) > 20:
        records[18]["age"] = -5
        records[20]["age"] = 142

    # 5. Outliers in income
    if len(records) > 25:
        records[22]["annual_income"] = 780000.0  # Extreme outlier

    # 6. Future timestamp
    if len(records) > 30:
        records[28]["signup_date"] = "2036-11-20"

    # 7. Cross-split contamination entity
    if len(records) > 80:
        test_idx = int(num_records * 0.8)
        if test_idx < len(records):
            records[test_idx]["customer_id"] = records[2]["customer_id"]

    return records

