# Data Health Center Specification & Architecture

## 1. Overview & Executive Summary

The **Data Health Center** in DataPilot provides an automated, professional **Senior Data Scientist-level diagnostic assessment** of connected datasets prior to pipeline ingestion and model training.

It evaluates dataset fitness across **9 comprehensive statistical dimensions**, identifying critical data quality defects, silent schema corruptions, distribution anomalies, and devastating machine learning failure modes such as **target leakage**, **temporal leakage**, and **train/test contamination**.

```
+--------------------------------------------------------------------------+
|                     CLIENT DATA PLANE (Isolated Execution)              |
|                                                                          |
|   +-----------------------+          +-------------------------------+   |
|   | Raw Dataset Records   | -------> | DataHealthAnalyzer Engine     |   |
|   | (CSV / Parquet / DB)  |          | - 9 Diagnostic Dimensions     |   |
|   +-----------------------+          | - Tukey IQR / Pearson Math    |   |
|                                      | - Transparent Deduction Score |   |
|                                      +-------------------------------+   |
|                                                      |                   |
|                                                      v                   |
|                                      +-------------------------------+   |
|                                      | Permitted Profile Summary     |   |
|                                      | (Aggregated Counts & Findings)|   |
|                                      | [ZERO Raw Records Transferred]|   |
+--------------------------------------------------------------------------+
                                                       |
                                    HTTPS Encrypted JSON Metadata
                                                       |
                                                       v
+--------------------------------------------------------------------------+
|                     CLOUD CONTROL PLANE (Governance & UI)                |
|                                                                          |
|   +-----------------------+          +-------------------------------+   |
|   | FastAPI Health Router | -------> | Data Health Center Dashboard  |   |
|   | - RBAC Authorization  |          | - Score Gauge & Grade         |   |
|   | - Immutable Audit Log |          | - 9 Dimension Subtabs         |   |
|   +-----------------------+          | - Issue Inspection Drawer     |   |
+--------------------------------------------------------------------------+
```

---

## 2. Core Privacy & Containment Guarantee

### Client Data Plane Containment
To strictly adhere to enterprise banking, healthcare, and defense confidentiality requirements:
- **Zero raw dataset rows** are ever transmitted across the boundary to the Cloud Control Plane.
- All computing, statistical scans, outlier detections, and string matching happen **entirely inside the Client Data Plane**.
- Only bounded, aggregated summaries (counts, percentages, correlation matrices, boxplot percentiles, and issue records) are uploaded and saved to `ProfileSummary.permitted_payload`.
- The API responses reject any payload containing raw cell arrays or unaggregated row data.

---

## 3. The 9 Diagnostic Assessment Dimensions

### Dimension 1: Dataset Overview & Semantic Classification
Provides macro-level shape and structural profiling:
- **Total Rows & Columns**: Dimension counts and sample sizes.
- **Memory Footprint**: Estimated in-memory bytes and human-formatted footprint (e.g. `1.05 MB`).
- **Semantic Type Classification**:
  - `Numerical`: Continuous and discrete integers/floats.
  - `Categorical`: Low-to-moderate cardinality discrete labels.
  - `Datetime`: ISO 8601 strings and date/timestamp fields.
  - `Boolean`: Binary flags (`True`/`False`, `0`/`1`, `yes`/`no`).
  - `Text`: Freeform unstructured strings with high average character length (>40 chars).

### Dimension 2: Completeness & Synchronized Patterns
Evaluates missingness beyond simple null counts:
- **Total Missing Values**: Aggregate missing cell tally.
- **Overall Missing Ratio**: Dataset-wide missingness percentage.
- **Per-Column Missingness Table**: Detailed null counts and percentages with visual fill bars.
- **Synchronized Missingness Patterns**: Identifies non-random missingness (MNAR - Missing Not At Random) using pairwise Jaccard co-occurrence indices ($J \ge 0.80$). This flags features that drop out simultaneously due to upstream ETL failures.

### Dimension 3: Duplicates & Key Collisions
Detects sample inflation and candidate key corruptions:
- **Duplicate Rows**: Exact identical row matches and duplicate ratio.
- **Duplicate Candidate Identifiers**: Primary key collisions in columns named `*id*`, `*key*`, or `*code*`. Uncovers bad join cartesian products or duplicate ingestions.
- **Potential Near-Duplicates**: Heuristic counts of rows matching on $\ge 90\%$ of non-identifier feature fields.

### Dimension 4: Data Validity & Domain Bounds
Flags malformed, corrupted, or biologically impossible data points:
- **Invalid Sentinel Placeholders**: Detects legacy fallback tokens (`-999`, `9999`, `99999`, `N/A`) masquerading as valid numbers.
- **Impossible Physical Values**:
  - Biological human age violations ($age < 0$ or $age > 125$).
  - Negative values in non-negative domains (price, salary, income, tenure, cost).
- **Type Inconsistencies**: Mixed text tokens detected inside predominantly numeric columns.
- **Unexpected Ranges**: Probabilities or ratios falling outside $[0.0, 1.0]$.

### Dimension 5: Feature Quality & Cardinality Risks
Flags uninformative or dangerous inputs prior to encoding:
- **Constant Features (Zero Variance)**: Columns with exactly 1 unique value across all rows (wastes compute and risks singular matrix inversion errors).
- **Near-Constant Features**: Features where a single dominant value exceeds $95\%$ of all observations.
- **High-Cardinality Categoricals**: Categorical variables with $>50$ distinct categories and high unique ratios ($>0.40$), warning against dimensional explosion with one-hot encoding.
- **Unique Identifiers**: Columns exhibiting $>98\%$ uniqueness that risk decision tree memorization and overfitting.
- **Suspicious Features / PII**: Regex scans for raw Email addresses and Social Security Numbers (SSN).

### Dimension 6: Outlier Analysis
Visualizes and quantifies distributional extremes using **Tukey's IQR Rule**:
- **Interquartile Range**: $IQR = Q_3 - Q_1$.
- **Outlier Bounds**: $[Q_1 - 1.5 \times IQR, \; Q_3 + 1.5 \times IQR]$.
- **Metrics Computed**: Outlier count, outlier percentage, Min, $Q_1$ (25th percentile), Median (50th percentile), $Q_3$ (75th percentile), and Max.
- Highlights heavy-tailed features that would distort linear gradients or require power transformations (log / Yeo-Johnson / Winsorization).

### Dimension 7: Correlation Analysis & Multicollinearity
Evaluates pairwise linear relationships between numerical features:
- **Pearson Correlation Matrix**: Pairwise coefficients $r \in [-1.0, 1.0]$.
- **Suspicious Multicollinearity Alerts**:
  - Near-perfect collinearity ($|r| > 0.98$): Redundant duplicate feature pairs.
  - High collinearity ($|r| > 0.85$): Features inflating parameter variance in regression and obscuring feature importance.

### Dimension 8: Target Analysis & Class Balance
Analyzes outcome distribution and predictive feature affinity:
- **Target Distribution**: Proportions and sample counts per class label.
- **Class Imbalance Assessment**: Class ratio check flagging severe imbalance ($>80\%$ majority class), prompting Stratified K-Fold and PR-AUC metric prioritization.
- **Continuous Target Statistics**: Mean, standard deviation, minimum, and maximum for regression targets.
- **Predictive Feature Associations**: Rank-ordered correlation of features with target variable to surface primary signal carriers.

### Dimension 9: Leakage Detection (Production Critical)
Identifies fatal flaws that cause offline metrics to look near-perfect while live models fail:
- **Target Leakage**: Features with $|r| > 0.95$ correlation with target or direct duplicate columns.
- **Post-Outcome Features**: Features populated chronologically after the event (e.g. `cancellation_reason`, `churn_date`, `refund_amount`, `default_date`, `exit_interview`).
- **Identifier Leakage**: Customer IDs, account numbers, or UUIDs passed directly as model training inputs.
- **Temporal Leakage**: Timestamps occurring in the future ($>2030$) or feature dates recorded after the event horizon.
- **Train/Test Contamination**: Cross-split entity overlap where the same entity identifier appears in both training and test/validation partitions.

---

## 4. Transparent Health Scoring Methodology

The overall Data Health Score is **fully transparent, additive, and explainable**. No black-box formulas or hidden heuristics are used.

### Scoring Formula
$$\text{Health Score} = \max\left(0, \; 100 - \sum \text{Severity Deductions}\right)$$

### Penalty Deductions by Severity
| Severity | Deduction | Defect Types Included |
| :--- | :---: | :--- |
| **Critical** | **-15 pts** | Target leakage, post-outcome features, train/test split contamination, catastrophic data corruption. |
| **High** | **-8 pts** | Biologically impossible values, severe target class imbalance, primary key collisions, severe missingness ($>40\%$). |
| **Medium** | **-4 pts** | Constant features (zero variance), high multicollinearity ($|r| > 0.85$), legacy numeric sentinels (`-999`), extreme outliers ($>5\%$). |
| **Low** | **-2 pts** | Near-constant features ($>95\%$ dominant value), mild skewness, minor outlier tails. |

### Letter Grade Scale
- **Grade A (90 - 100 pts)**: Production-ready dataset with minimal clean-up required.
- **Grade B (80 - 89 pts)**: High quality; minor feature engineering or imputation needed.
- **Grade C (70 - 79 pts)**: Moderate quality; multiple collinearities or outliers require remediation.
- **Grade D (60 - 69 pts)**: Degraded health; severe imbalances or sentinel values present.
- **Grade F (< 60 pts)**: High risk; target leakage, split contamination, or critical validity failures detected. Training blocked.

Every deducted point is tracked in a transparent audit ledger accessible through the **Methodology & Deductions** modal.

---

## 5. Standardized Issue Schema

Every issue surfaced by the analyzer strictly satisfies the 5-field Data Scientist diagnosis contract:

```typescript
export interface DataHealthIssue {
  id: string                   // e.g. "iss_001"
  title: string                // e.g. "Potential Target Leakage in 'cancellation_fee'"
  category: string             // "leakage" | "validity" | "completeness" | "duplicates" | "quality"
  severity: "critical" | "high" | "medium" | "low"
  column: string | null        // Affected feature name
  evidence: string             // Exact mathematical/telemetry proof (e.g. "|r| = 0.9842")
  explanation: string          // Data Scientist rationale for why this defect occurs
  potential_impact: string     // Consequence on production models and offline evaluation
  recommended_action: string   // Specific, actionable remediation recipe
}
```

Users can click any issue card in the **Issues Registry** to launch the **Issue Inspection Drawer**, displaying the full diagnosis, telemetry, and remediation code recommendations.

---

## 6. Centralized RBAC Integration

The Data Health Center enforces role permissions:
- `DATASET_VIEW`: Read-only access to view dataset health scores, 9-dimension tabs, and inspect issues (Owner, Admin, Data Scientist, Analyst).
- `DATASET_PROFILE`: Authority to trigger or re-run Data Health assessments, configure custom target columns, and update profile summaries (Owner, Admin, Data Scientist).
- **Tenant Isolation**: All database queries and audit events are strictly bound to `organization_id` and `project_id`, preventing cross-tenant information disclosure.

---

## 7. API Reference

### 1. Retrieve Dataset Health Report
```http
GET /api/v1/organizations/{organization_id}/projects/{project_id}/datasets/{dataset_id}/health
```
- **Permission Required**: `DATASET_VIEW`
- **Query Parameters**:
  - `target_column` (optional): Override target feature for leakage analysis.
  - `datetime_column` (optional): Override reference timestamp for temporal checks.
- **Response**: `200 OK` with `HealthAssessmentResponse`.

### 2. Trigger Fresh Client Health Analysis
```http
POST /api/v1/organizations/{organization_id}/projects/{project_id}/datasets/{dataset_id}/health/analyze
```
- **Permission Required**: `DATASET_PROFILE`
- **Request Body**:
  ```json
  {
    "target_column": "churn",
    "datetime_column": "signup_date"
  }
  ```
- **Response**: `200 OK` with updated `HealthAssessmentResponse`.
- **Side Effect**: Emits `dataset.health_analyzed` to the immutable audit log.

---

## 8. Verification & Test Coverage

### Automated Test Suites
1. **Backend Unit & API Tests (`tests/backend/test_data_health.py`)**:
   - `test_dimension_1_overview_and_types`: Validates 5 semantic types and memory estimation.
   - `test_dimension_2_completeness_and_patterns`: Validates missingness percentages and synchronized co-occurrence Jaccard matrices.
   - `test_dimension_3_duplicates_and_identifiers`: Validates duplicate rows and primary key collisions.
   - `test_dimension_4_data_validity_sentinels_and_bounds`: Validates numeric sentinels (`-999`), impossible ages, and out-of-range bounds.
   - `test_dimension_5_feature_quality`: Validates zero-variance constants, near-constants, high-cardinality flags, and PII patterns.
   - `test_dimension_6_outlier_analysis`: Validates Tukey 1.5x IQR boundaries and percentiles.
   - `test_dimension_7_correlation_analysis`: Validates Pearson calculation and multicollinearity alerts ($|r| > 0.85$).
   - `test_dimension_8_target_analysis_classification`: Validates binary classification distributions and class imbalance detection.
   - `test_dimension_9_leakage_detection`: Validates target leakage, post-outcome features, temporal future dates, and cross-split entity contamination.
   - `test_transparent_health_score_and_issue_registry`: Validates additive deduction points, grade calculation, and mandatory issue contract.
   - `test_zero_raw_records_privacy_containment`: Validates that zero raw records or unaggregated rows exist in output.
   - `test_get_dataset_health_endpoint`: Integration test verifying HTTP 200 and schema response.
   - `test_analyze_dataset_health_endpoint`: Integration test verifying HTTP 200, parameter application, and audit event recording.
   - **Result**: `13 passed in 1.96s (100% pass rate)`.

2. **Frontend UI Tests (`frontend/src/DataHealthCenterView.test.tsx`)**:
   - Renders overall score gauge, letter grade, and Client Data Plane isolated badge.
   - Displays severity breakdown cards with issue counts (Critical, High, Medium, Low).
   - Navigates through tabs across dimensions (Overview, Completeness, Outliers, Leakage).
   - Opens issue inspection modal with all 5 mandatory sections (Feature, Evidence, Explanation, Impact, Action).
   - Opens transparent scoring methodology modal showing penalty formulas and deduction ledgers.
   - Allows configuring target/datetime parameters and triggering re-analysis.
   - **Result**: `6 passed in 1.40s (100% pass rate)`.
