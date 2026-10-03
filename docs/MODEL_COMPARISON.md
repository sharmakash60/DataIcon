# DataPilot Model Comparison & Decision Center

## 1. Overview & Architectural Principles

The **DataPilot Model Comparison & Decision Center** provides enterprise-grade, side-by-side empirical evaluation of machine learning experiments and candidate models. Grounded in the core philosophy of **verifiable telemetry over black-box assertions**, it enables Data Scientists, Lead Architects, and Governance Officers to dissect performance tradeoffs across accuracy, generalization stability, inference latency, memory footprint, and architectural parsimony.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                        DATA-PLANE EXPERIMENT RUNS                                │
│       [ Logistic Reg ]     [ Random Forest ]     [ XGBoost ]     [ CatBoost ]    │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                     REST COMPARISON ENGINE (/experiments/compare)                │
│   • Dataset Version & Fingerprint Consistency Verification                       │
│   • Empirical Metric Delta & Best-Model Matrix Evaluation                        │
│   • Cross-Validation Variance Analysis & Fold Stability Bounds                   │
│   • Diagnostic Visualizations (ROC, PR Curve, Confusion Matrix, Residuals)       │
│   • Transparent Multi-Criteria Composite Utility Scoring (No black-box scores)   │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
                                         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                       GOVERNANCE & LIFECYCLE DECISION                            │
│   • Status Transition: [ Candidate ] ──► [ Approved ] / [ Rejected ]             │
│   • Role-Based Access Control (Separation of Duties: MODEL_APPROVE required)     │
│   • Immutable Audit Logging (Actor, Decision, Justification Notes, Timestamps)    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Core Tenets
1. **Client Data Plane Isolation**: Model comparison operates strictly on metadata, metrics, and statistical aggregations computed in the Client Data Plane. Raw dataset rows are never transferred or exposed.
2. **Strict Apples-to-Apples Verification**: Automated dataset consistency checks verify that compared models share identical dataset versions and dataset fingerprints (`sha256`), alerting the user when cross-validation variances might reflect data shifts rather than model differences.
3. **No Unexplained "AI Scores"**: Every summary index is completely transparent and mathematically auditable. Black-box opaque scores are strictly prohibited.
4. **Separation of Duties (SoD)**: Data Scientists can mark models as `Candidate` or `Rejected`. Promoting a model to `Approved` for production deployment strictly requires `Permissions.MODEL_APPROVE` (Owner or Admin role).

---

## 2. Side-by-Side Evaluation Dimensions

The side-by-side matrix exposes comprehensive telemetry across 11 core dimensions:

| Dimension | Schema Property | Description & Methodology |
| :--- | :--- | :--- |
| **Model Name & Algorithm** | `model`, `best_model_name` | Name of the evaluated algorithm (e.g., *XGBoost Classifier*, *Random Forest Regressor*, *Logistic Regression*). |
| **Dataset Version** | `dataset_version`, `dataset_fingerprint` | Version tag and cryptographic SHA-256 fingerprint of the evaluation dataset. |
| **Validation Strategy** | `validation_strategy` | Resampling regime utilized (e.g., *5-fold StratifiedKFold*, *3-fold TimeSeriesSplit*). |
| **Primary Metric** | `primary_metric`, `best_score` | Core objective metric defined during Problem Formulation (e.g., *ROC-AUC*, *F1-Score*, *Recall*, *RMSE*, *MAE*). |
| **Secondary Metrics** | `metrics` | Full multi-metric evaluation dictionary (Accuracy, Precision, Recall, F1, Log-Loss; MAE, MSE, RMSE, R², MAPE). |
| **Mean CV Score** | `mean_cv_score` | Arithmetic mean of validation fold scores: $\mu = \frac{1}{K} \sum_{k=1}^K s_k$. |
| **CV Standard Deviation** | `std_cv_score` | Standard deviation across validation folds: $\sigma = \sqrt{\frac{1}{K-1} \sum_{k=1}^K (s_k - \mu)^2}$. Measures generalization variance. |
| **Training Duration** | `training_duration` | Wall-clock execution time in seconds required for feature engineering, preprocessing, and model fitting. |
| **Inference Latency** | `inference_latency_ms` | Single-sample P95 prediction latency in milliseconds measured under benchmark load against SLA targets. |
| **Memory Usage** | `memory_usage_mb` | Peak runtime RAM consumption in megabytes during model inference and serialization. |
| **Model Complexity** | `model_complexity` | Structural breakdown: tier (*Linear*, *Tree Ensemble*, *Boosted Trees*), parameter count, tree count, and maximum depth. |
| **Explainability Status** | `explainability` | Availability of SHAP values, TreeSHAP, permutation importances, and local feature attributions. |

---

## 3. Diagnostic Visualizations

The Model Comparison Center provides 5 specialized visualization sub-tabs:

### 3.1. Grouped Metric Comparison Chart
- **Visualization**: Multi-model grouped SVG bar chart comparing normalized performance across all shared metrics.
- **Normalization Toggle**: Switches between percentage-normalized view ($s_i / \max(s)$) and absolute raw values.
- **Winner Indicator**: Automatically highlights the winning model per metric with color-coded badges and star markers.

### 3.2. Cross-Validation Stability & Generalization Bounds
- **Visualization**: Multi-line fold-by-fold validation trajectory plot with variance bounds ($\mu \pm 1\sigma$).
- **Variance Analysis**: Directly visualizes stability across folds. Models with lower $\sigma$ exhibit tighter bands, ensuring that performance is not an artifact of favorable splits.

### 3.3. ROC Curves & AUC Analysis (Classification)
- **Visualization**: True Positive Rate (TPR) vs False Positive Rate (FPR) plotted across 21 discrimination thresholds.
- **Comparative Overlay**: Overlays all candidate models on the same canvas alongside the diagonal random-guess baseline ($AUC = 0.50$).
- **AUC Legend**: Ranks models by Area Under the ROC Curve.

### 3.4. Precision-Recall Curves & Baseline Prevalence (Classification)
- **Visualization**: Precision vs Recall curve tracking Positive Predictive Value against detection sensitivity.
- **Baseline Prevalence Reference**: Displays horizontal dashed line corresponding to target class prevalence in the dataset ($\frac{P}{P + N}$).
- **PR-AUC Metric**: Quantifies performance under severe class imbalance where ROC curves can be deceptively optimistic.

### 3.5. Confusion Matrix & Error Profiling (Classification)
- **Visualization**: Side-by-side 2×2 heatmaps with counts and percentage distributions:
  $$\begin{bmatrix} TN & FP \\ FN & TP \end{bmatrix}$$
- **Derived Diagnostics**: Explicit display of False Positive Rate ($FPR = \frac{FP}{FP + TN}$), False Negative Rate ($FNR = \frac{FN}{FN + TP}$), Precision, and Recall.
- **Cost Alignment**: Enables verifying whether candidate models satisfy asymmetric business costs (e.g., minimizing $FN$ for churn/fraud vs minimizing $FP$ for spam).

### 3.6. Residual Analysis (Regression)
- **Scatter Plot**: Predicted Value ($\hat{y}$) vs Residual ($y - \hat{y}$) with a zero-residual reference line. Verifies homoscedasticity and detects non-linear error patterns.
- **Error Distribution Histogram**: Gaussian-fitted distribution of residuals verifying normality and skewness.
- **Error Metrics**: Displays Median Absolute Error, P95 Error Bound, and Max Error Recorded.

---

## 4. Transparent Composite Utility Score

To avoid subjective model selection without resorting to unexplained "AI ratings", DataPilot employs an **auditable, 4-factor Composite Utility Score**:

### Mathematical Formulation
$$\text{Score} = (w_{\text{perf}} \cdot S_{\text{perf}}) + (w_{\text{stab}} \cdot S_{\text{stab}}) + (w_{\text{lat}} \cdot S_{\text{lat}}) + (w_{\text{simp}} \cdot S_{\text{simp}})$$

Where weights are calibrated to production requirements:
- $w_{\text{perf}} = 0.50$ (50% Primary Metric Effectiveness)
- $w_{\text{stab}} = 0.20$ (20% Cross-Validation Generalization Stability)
- $w_{\text{lat}} = 0.15$ (15% Inference Latency SLA Adherence)
- $w_{\text{simp}} = 0.15$ (15% Model Parsimony & Simplicity)

### Component Definitions
1. **Performance Index ($S_{\text{perf}}$)**:
   - For classification: $S_{\text{perf}} = \text{clamp}(0, 100, s_{\text{primary}} \times 100)$.
   - For regression: $S_{\text{perf}} = \text{clamp}\left(10, 100, 50.0 + \frac{\text{Base} - s_{\text{primary}}}{\text{Base}} \times 50.0\right)$.
2. **Stability Index ($S_{\text{stab}}$)**:
   - Measures relative CV variance: $CV_{\text{var}} = \frac{\sigma_{\text{cv}}}{\max(0.01, |\mu_{\text{cv}}|)}$.
   - $S_{\text{stab}} = \text{clamp}(0, 100, 100.0 - (CV_{\text{var}} \times 300.0))$.
3. **Latency SLA Adherence ($S_{\text{lat}}$)**:
   - Evaluated against a default 50ms SLA target:
   - $S_{\text{lat}} = \text{clamp}\left(10, 100, 100.0 - \left(\frac{\text{Latency}_{\text{ms}}}{50.0}\right) \times 40.0\right)$.
4. **Model Parsimony ($S_{\text{simp}}$)**:
   - Penalizes parameter bloat according to Occam's razor:
   - $S_{\text{simp}} = \text{clamp}\left(20, 100, \frac{100.0}{1.0 + 0.08 \times \ln(\max(1, N_{\text{params}}))}\right)$.

### Interactive Inspection
Users can click **Formula ℹ** next to any score to inspect the complete arithmetic breakdown modal, showing raw values, normalized scores, and exact point contributions.

---

## 5. Experiment Configuration Inspection

Users can click **Inspect Full Config 🔍** to examine the end-to-end provenance and execution settings of any candidate model across 5 tabs:

1. **Preprocessing Pipeline**: Missing value imputation strategy, categorical encoding (target/onehot), constant column pruning, and identifier removal.
2. **Estimator Hyperparameters**: Exact key-value table of all model parameters (e.g., `n_estimators`, `max_depth`, `learning_rate`, `subsample`, `C`).
3. **Feature Configuration**: Included features list, feature counts, and target column specification.
4. **Execution Environment**: Client Data Plane execution runtime, Python version, scikit-learn/lightgbm/xgboost package versions, and hardware acceleration metadata.
5. **Raw Serialized JSON**: Full immutable JSON document for reproducibility and compliance export.

---

## 6. Model Decision Lifecycle & Governance

DataPilot enforces a formal model lifecycle with Separation of Duties (SoD):

```
                     ┌──────────────────┐
                     │    Candidate     │  (Default status on training completion)
                     └────────┬─────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
       ┌───────────────┐             ┌───────────────┐
       │   Approved    │             │   Rejected    │
       └───────────────┘             └───────────────┘
  (Owner / Admin Only)        (Data Scientist / Admin / Owner)
```

### Decision States
- **`candidate`**: Default evaluation state. Model is eligible for comparison, explainability analysis, and staging validation.
- **`approved`**: Formally approved for production deployment. **Strictly requires `Permissions.MODEL_APPROVE`** (Owner or Admin role). Data Scientists and Analysts attempting approval receive `403 Forbidden`.
- **`rejected`**: Disqualified from production consideration with mandatory review notes (e.g., excessive variance, latency SLA breach, lack of explainability).

### Audit Trail
Every decision mutation records an immutable audit event:
- **Action**: `experiment.decision_updated`
- **Resource**: `experiment` (`resource_id = exp.id`)
- **Actor**: User ID and verified email
- **Payload Details**: `previous_decision`, `new_decision`, `notes`, `project_id`
- **Timestamp**: ISO-8601 UTC timestamp

---

## 7. REST API Endpoints

### 7.1. Compare Experiments
```http
GET /api/v1/organizations/{organization_id}/projects/{project_id}/experiments/compare?experiment_ids={id1}&experiment_ids={id2}
```
- **Permission**: `EXPERIMENT_VIEW`
- **Parameters**: `experiment_ids` (List of 2 to 10 experiment UUIDs or comma-separated string)
- **Response**: `ExperimentComparisonResponse` containing:
  - `experiments`: Serialized models with metrics, CV stability, telemetry, complexity, and curves.
  - `metric_comparisons`: Grouped metric comparisons with winning models.
  - `hyperparameter_differences`: Parameter diff map with variance highlighting.
  - `dataset_consistency`: Fingerprint and version matching report.
  - `recommendation_summary`: Empirical recommendation based on primary metric lift and latency SLA.

### 7.2. Update Experiment Decision
```http
PATCH /api/v1/organizations/{organization_id}/projects/{project_id}/experiments/{experiment_id}/decision
```
- **Permissions**:
  - `candidate` / `rejected`: `EXPERIMENT_RUN` or `MODEL_CREATE` or `MODEL_APPROVE`
  - `approved`: Strictly `MODEL_APPROVE`
- **Request Body**:
  ```json
  {
    "decision": "approved",
    "notes": "Model achieves 0.9124 ROC-AUC (+26.7% lift vs baseline) with 1.25ms latency. Approved for production."
  }
  ```
- **Response**: Updated `ExperimentOut` object.

---

## 8. Automated Verification & Test Coverage

The comparison architecture is covered by automated backend and frontend test suites:

- **Backend Test Suite**: [`tests/backend/test_model_comparison.py`](file:///tests/backend/test_model_comparison.py)
  - `test_model_comparison_classification_metrics_and_visualizations`: Verifies side-by-side attributes, CV scores, ROC, PR curve, confusion matrix, model complexity, and composite utility formula breakdown.
  - `test_model_comparison_regression_residuals`: Verifies predicted vs residual scatter plot, error histogram, and residual statistics.
  - `test_model_decision_lifecycle_and_rbac_enforcement`: Verifies candidate -> approved -> rejected transitions, Separation of Duties (403 for DS approval), and audit logging.
- **Frontend Test Suite**: [`frontend/src/ExperimentCompareView.test.tsx`](file:///frontend/src/ExperimentCompareView.test.tsx)
  - Matrix rendering of all 11 comparison dimensions.
  - Sub-tab switching (Metric Comparison, CV Stability, ROC & PR Curves, Confusion Matrix, Config Diff).
  - Formula inspection modal displaying the 4-factor arithmetic breakdown.
  - Configuration inspection modal with preprocessing, hyperparameters, and environment tabs.
  - Decision modal updating status with notes and calling `api.updateExperimentDecision`.
