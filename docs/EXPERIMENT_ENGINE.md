# DataPilot V1 Experiment Engine Specification

## 1. Architectural Overview & Workflow Lifecycle

The DataPilot V1 Experiment Engine is an enterprise-grade automated machine learning (AutoML) engine operating strictly inside the **Client Data Plane**. 

### Core Architectural Mandates
1. **Zero Autonomous LLM Model Selection**: Under no circumstances does an LLM pick or recommend a machine learning model without measured empirical validation results.
2. **Multi-Criteria Ranking (No Accuracy Alone)**: Accuracy alone is never used to select a winning model. Models are ranked on task-appropriate primary metrics (ROC-AUC, Recall, F1, PR-AUC, RMSE, MAE, R²) and evaluated against business constraints and operational latency SLAs.
3. **Client Data Plane Isolation**: All model training, preprocessing, cross-validation, hyperparameter tuning, and error analysis execute locally inside the customer perimeter. Only permitted statistical aggregates, leaderboard summaries, and trial parameters are reported to the cloud control plane. Zero raw client rows ever leave the perimeter.
4. **Comprehensive Reproducibility Storage**: Every experiment run persists all 11 required metadata attributes for enterprise auditability.

---

## 2. The 12-Stage Sequential Workflow

```
[1] Business Requirement
          ↓
[2] Problem Formulation
          ↓
[3] Dataset Profile
          ↓
[4] Baseline Model
          ↓
[5] Candidate Models
          ↓
[6] Preprocessing Pipeline
          ↓
[7] Cross Validation
          ↓
[8] Hyperparameter Optimization (Optuna)
          ↓
[9] Evaluation & Metrics
          ↓
[10] Error Analysis
          ↓
[11] Business Constraints
          ↓
[12] Model Recommendation
```

### Stage Breakdown

| Stage # | Stage Name | Responsibility | Output Artifact |
|---|---|---|---|
| **1** | **Business Requirement** | Ingests business objective, prediction horizon, primary metric preference, latency SLA, and cost matrix ($/FP, $/FN). | `business_requirements` dictionary |
| **2** | **Problem Formulation** | Validates problem type (`classification` or `regression`), target variable, and determines secondary evaluation metrics. | `problem_formulation` specification |
| **3** | **Dataset Profile** | Computes cryptographic SHA-256 fingerprint from schema + row content; computes missingness, type counts, and class balance. | `dataset_fingerprint`, profile stats |
| **4** | **Baseline** | Evaluates empirical non-learning or simple linear baseline across folds to set the performance floor. | `baseline_score`, `metrics` |
| **5** | **Candidate Models** | Instantiates candidate model algorithms suite (all 6 supported algorithms per task type). | Initialized estimator suite |
| **6** | **Preprocessing** | Prunes identifiers and zero-variance features; extracts datetime components; applies median/mode imputation; encodes categoricals; scales numerics. | Transformed matrix `X`, `preprocessing_config` |
| **7** | **Cross Validation** | Sets up 5-fold StratifiedKFold (classification) or 5-fold KFold (regression) with fixed seed. | Fold split indices |
| **8** | **Hyperparameter Optimization** | Optional Optuna Bayesian optimization over top candidates. Records trial parameters, scores, and execution durations. | `tuning_trials`, tuned estimators |
| **9** | **Evaluation** | Calculates comprehensive metric suites on out-of-fold predictions. Measures train duration and inference latency per prediction. | `leaderboard`, `benchmarks` |
| **10** | **Error Analysis** | Inspects failure modes: confusion matrix, FP/FN rates for classification; residual distribution, max error, P95 error for regression. | `error_analysis` diagnostic report |
| **11** | **Business Constraints** | Checks latency SLA (< max_latency_ms); evaluates minimum metric thresholds; computes total business error cost. | Constraint compliance status |
| **12** | **Model Recommendation** | Synthesizes multi-criteria ranking into transparent empirical rationale detailing score lift vs baseline and SLA compliance. | `model_recommendation` evidence card |

---

## 3. Supported Model Algorithms (V1)

### Classification (6 Candidates + Baseline)
1. **Logistic Regression** (`sklearn.linear_model.LogisticRegression`)
2. **Random Forest** (`sklearn.ensemble.RandomForestClassifier`)
3. **XGBoost** (`xgboost.XGBClassifier`)
4. **LightGBM** (`lightgbm.LGBMClassifier`)
5. **CatBoost** (`catboost.CatBoostClassifier`)
6. **HistGradientBoosting** (`sklearn.ensemble.HistGradientBoostingClassifier`)
- **Baseline**: `DummyClassifier(strategy="prior")`

### Regression (6 Candidates + Baseline)
1. **Linear Regression** (`sklearn.linear_model.Ridge`)
2. **Random Forest** (`sklearn.ensemble.RandomForestRegressor`)
3. **XGBoost** (`xgboost.XGBRegressor`)
4. **LightGBM** (`lightgbm.LGBMRegressor`)
5. **CatBoost** (`catboost.CatBoostRegressor`)
6. **Gradient Boosting** (`sklearn.ensemble.GradientBoostingRegressor`)
- **Baseline**: `DummyRegressor(strategy="mean")`

---

## 4. Automatic Preprocessing Pipeline

The `AutomaticPreprocessor` executes within the Client Data Plane:

1. **Identifier & Leakage Column Pruning**:
   - Matches column names matching `id`, `uuid`, `guid`, `code`, or ending with `_id`, `_uuid`, `_code`.
   - Detects high-cardinality string columns where distinct value count equals row count.
2. **Zero-Variance Feature Pruning**:
   - Detects and drops columns with <= 1 unique value across the dataset.
3. **Datetime Expansion**:
   - Infers and decomposes timestamp columns into numerical sub-features: `<col>_year`, `<col>_month`, `<col>_day`, `<col>_dayofweek`.
4. **Missing Value Imputation**:
   - Numerical columns: imputed via `median`.
   - Categorical columns: imputed via `most_frequent` (mode) or marked as `'missing'`.
5. **Categorical Encoding**:
   - `OneHotEncoder(handle_unknown='ignore', sparse_output=False)` produces clean binary indicator columns.
6. **Feature Scaling**:
   - `StandardScaler()` standardizes numeric dimensions to zero mean and unit variance.

---

## 5. Metrics Specification

### Classification Metrics
- **Accuracy**: Overall fraction of correct predictions ($\frac{TP+TN}{Total}$).
- **Precision**: Positive predictive value ($\frac{TP}{TP+FP}$).
- **Recall**: Sensitivity / true positive rate ($\frac{TP}{TP+FN}$).
- **F1-Score**: Harmonic mean of Precision and Recall ($2 \cdot \frac{P \cdot R}{P + R}$).
- **ROC-AUC**: Area under the Receiver Operating Characteristic curve across decision thresholds.
- **PR-AUC**: Area under the Precision-Recall curve (Average Precision score), vital for imbalanced datasets.

### Regression Metrics
- **MAE**: Mean Absolute Error ($\frac{1}{n} \sum |y_i - \hat{y}_i|$).
- **RMSE**: Root Mean Squared Error ($\sqrt{\frac{1}{n} \sum (y_i - \hat{y}_i)^2}$).
- **R²**: Coefficient of Determination ($1 - \frac{SS_{res}}{SS_{tot}}$).
- **MAPE**: Mean Absolute Percentage Error ($\frac{100\%}{n} \sum |\frac{y_i - \hat{y}_i}{y_i}|$).

---

## 6. Experiment Tracking Storage Requirements

The platform stores the following 11 required attributes for every experiment:

```json
{
  "dataset_version": "v1.0-prod",
  "dataset_fingerprint": "sha256:d8a9f...3c",
  "feature_config": {
    "features": ["tenure_months", "monthly_charges", "contract_type_Month-to-month", ...],
    "dropped_identifiers": ["customer_id"],
    "dropped_constant_columns": ["constant_tenant_flag"]
  },
  "preprocessing_config": {
    "numeric_imputation": "median",
    "categorical_imputation": "most_frequent",
    "numerical_scaler": "StandardScaler",
    "categorical_encoder": "OneHotEncoder"
  },
  "model": "CatBoost",
  "hyperparameters": {
    "iterations": 100,
    "depth": 6,
    "learning_rate": 0.08
  },
  "validation_strategy": "5-fold StratifiedKFold",
  "metrics": {
    "accuracy": 0.824,
    "precision": 0.712,
    "recall": 0.768,
    "f1": 0.739,
    "roc_auc": 0.882,
    "pr_auc": 0.795
  },
  "training_duration": 14.28,
  "environment_info": {
    "os": "Windows",
    "python_version": "3.12.13",
    "execution_plane": "Client Data Plane (Zero Raw Data Leakage)"
  },
  "random_seed": 42
}
```

---

## 7. Synthetic Benchmark Datasets

The engine includes built-in realistic benchmark generators:

1. **Customer Churn Benchmark (`generate_churn_benchmark`)**:
   - Task: Binary Classification (~26% positive class).
   - Target: `churn`.
   - Real-world challenges: Contains `customer_id` (identifier leakage), `constant_tenant_flag` (zero-variance), `signup_date` (datetime), and missing values in `total_charges` and `monthly_charges`.
2. **Store Weekly Sales Benchmark (`generate_sales_benchmark`)**:
   - Task: Continuous Regression ($5,000 - $85,000).
   - Target: `weekly_sales`.
   - Real-world challenges: Contains `store_code` (identifier), `zero_variance_benchmark` (constant), `recorded_date` (datetime), and missing values in `foot_traffic` and `competitor_distance_km`.

---

## 8. REST API Endpoints

### Run AutoML Experiment
`POST /api/v1/organizations/{organization_id}/projects/{project_id}/experiments/run`
- **RBAC Requirement**: `EXPERIMENT_RUN`
- **Input**: `RunExperimentWorkflowRequest`
  - `name`: string
  - `benchmark_name`: string ("customer_churn" or "sales_forecasting")
  - `primary_metric`: string (optional, defaults to task-appropriate metric)
  - `enable_optuna`: boolean (default: true)
  - `optuna_trials`: integer (default: 8)
  - `n_splits`: integer (default: 5)
  - `random_seed`: integer (default: 42)
- **Response**: `ExperimentDetailOut` (contains 11 metadata fields, runs leaderboard, trials, 12 workflow stages, and recommendation card).

### Ingest Agent Experiment Results
`POST /api/v1/organizations/{organization_id}/projects/{project_id}/experiments/ingest`
- **RBAC Requirement**: `EXPERIMENT_RUN`
- **Payload**: `IngestAutoMLExperimentPayload` (permitted statistical metrics from external client agent).

### List Experiments
`GET /api/v1/organizations/{organization_id}/projects/{project_id}/experiments`
- **RBAC Requirement**: `EXPERIMENT_VIEW`

### Get Single Experiment Detail
`GET /api/v1/organizations/{organization_id}/projects/{project_id}/experiments/{experiment_id}`
- **RBAC Requirement**: `EXPERIMENT_VIEW`

### Compare Experiments Side-by-Side
`GET /api/v1/organizations/{organization_id}/projects/{project_id}/experiments/compare?experiment_ids={id1},{id2}`
- **RBAC Requirement**: `EXPERIMENT_VIEW`

---

## 9. Verification & Automated Test Coverage

The Experiment Engine is covered by comprehensive automated test suites:
- `tests/backend/test_experiment_engine.py`:
  - `test_synthetic_benchmarks_generation`: Verifies schema, target, and noise generation.
  - `test_automatic_preprocessor_pruning_and_imputation`: Validates ID dropping, zero-variance pruning, imputation, and datetime extraction.
  - `test_engine_classification_workflow_all_12_stages`: Executes all 12 stages, all 6 classification models + baseline, metric calculations, Optuna trials, and error analysis.
  - `test_engine_regression_workflow_all_12_stages`: Executes all 12 stages, all 6 regression models + baseline, residual diagnostics.
  - `test_no_model_selected_on_accuracy_alone`: Confirms multi-criteria selection policy.
  - `test_api_run_experiment_workflow_and_persistence`: Verifies API execution, database storage of all 11 fields, runs, trials, and audit event generation.
- `frontend/src/ExperimentsView.test.tsx`:
  - Verifies leaderboard rendering, 12-stage workflow visual tab, recommendation card, Optuna trials tab, and AutoML launch modal dialog.
