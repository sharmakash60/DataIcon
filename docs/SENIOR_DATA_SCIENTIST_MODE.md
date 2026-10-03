# Senior Data Scientist Mode

## 1. Executive Overview

**Senior Data Scientist Mode** is an enterprise-grade governance and workflow orchestration framework within DataPilot. It guides practitioners and cross-functional teams through a rigorous, 15-stage machine learning lifecycle—from initial commercial scoping to continuous production monitoring.

Senior Data Scientist Mode enforces institutional ML engineering standards:
- **No Unexamined Black Boxes**: Every stage demands verifiable empirical telemetry before advancement.
- **Strict Provenance Separation**: Qualitative AI suggestions are visibly and architecturally segregated from empirically measured experiment results.
- **Zero Fabricated Metrics**: Hallucinated metrics, synthetic baseline numbers, or unverified findings are strictly forbidden across both the control plane and data plane.
- **Human Authority**: The practitioner retains full authority to override AI recommendations, define custom loss parameters, and gate production deployments.

---

## 2. The 15 Structured Stages

The workflow strictly progresses through 15 sequential stages:

```
  1. Business Understanding
            ↓
  2. Data Understanding
            ↓
  3. Data Quality
            ↓
  4. Exploratory Analysis
            ↓
  5. Problem Formulation
            ↓
  6. Feature Engineering
            ↓
  7. Baseline
            ↓
  8. Candidate Models
            ↓
  9. Cross Validation
            ↓
 10. Hyperparameter Optimization
            ↓
 11. Error Analysis
            ↓
 12. Explainability
            ↓
 13. Model Selection
            ↓
 14. Deployment
            ↓
 15. Monitoring
```

### Stage Details & Evidence Specifications

| Stage # | Stage Name | Category | What is Analyzed | Required Empirical Evidence `[EMPIRICALLY MEASURED]` | Findings `[EMPIRICALLY MEASURED]` | AI Peer Guidance `[AI RATIONALE]` | User Decision Options `[USER DECISION]` |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Business Understanding** | Strategy & Scoping | Commercial objectives, prediction horizon, cost asymmetry (FP vs FN), and serving frequency. | Business objective statements, target variable identifier, cost ratio inputs. | Formal problem scope, cost trade-off matrix. | Recommended optimization metric weighting (e.g. Recall over Precision if FN cost is high). | Accept formulation, override cost ratio, customize target variable. |
| **2** | **Data Understanding** | Data Hygiene | Dataset schema, feature datatypes, row/column counts, and target class distributions. | Sample volume, column count, storage checksum, column data types. | Verified dataset dimensions and feature roles. | Data validation constraints and ingestion strategy. | Confirm dataset association, approve feature assignments. |
| **3** | **Data Quality** | Data Hygiene | Missing value rates, duplicate records, constant columns, and format anomalies. | Missing rate per column, duplicate row count, zero-variance feature count. | Data health grade, contamination percentage. | Imputation strategy (median for continuous, mode for categorical). | Override imputation policy, drop problematic features. |
| **4** | **Exploratory Analysis** | Data Hygiene | Feature-target correlations, class balance ratio, mutual information, and multicollinearity. | Target class balance ratio, top correlation coefficients, VIF scores. | Imbalance ratio, top predictive signals, collinearity clusters. | Rebalancing recommendations (SMOTE, class weighting, stratified splits). | Select correlation pruning threshold, toggle rebalancing. |
| **5** | **Problem Formulation** | Strategy & Scoping | Mathematical ML task family (Binary, Multi-class, Regression), primary and secondary metrics. | Target distribution, primary optimization metric, secondary guardrails. | Formal ML problem definition, primary evaluation criterion. | Mathematical loss alignment with business objectives. | Confirm or override task type, target, and primary metric. |
| **6** | **Feature Engineering** | Modeling & Validation | Categorical encoding (One-Hot, Target), numerical scaling (StandardScaler), feature creation. | Transformer pipeline specification, expanded feature dimensionality. | Dimension expansion count, zero-leakage pipeline fit on folds. | Encoding recommendations based on feature cardinality. | Include/exclude specific feature transformations. |
| **7** | **Baseline** | Modeling & Validation | Heuristic baseline benchmark (Majority class / Mean regressor). | Baseline model name, baseline primary metric score, training duration. | Minimum floor benchmark score. | Minimum hurdle criterion (e.g. require +10% over baseline to justify complexity). | Set custom hurdle percentage or custom floor score. |
| **8** | **Candidate Models** | Modeling & Validation | Multi-family model evaluation (Linear/Logistic, RF, XGBoost, LightGBM, CatBoost, HistGradient). | Model names, CV scores, training durations, inference latencies across all candidates. | Ranked candidate leaderboard, capacity-to-speed trade-offs. | Candidate shortlisting for Bayesian optimization. | Exclude/include algorithms, prioritize latency over accuracy. |
| **9** | **Cross Validation** | Modeling & Validation | 5-Fold Stratified K-Fold stability, fold score standard deviation, out-of-fold generalization. | Per-fold CV scores, mean score, fold standard deviation ($\sigma$). | Generalization stability, overfitting risk assessment. | Validation protocol adjustments if fold variance is high. | Accept CV stability interval, approve candidates for HPO. |
| **10** | **Hyperparameter Optimization** | Modeling & Validation | Optuna Bayesian optimization with Tree-structured Parzen Estimator (TPE). | Trial count, best parameters discovered, score uplift over default parameters. | Quantitative tuning gain, parameter sensitivity profile. | Champion parameter freezing recommendations. | Lock custom hyperparameters, trigger additional tuning trials. |
| **11** | **Error Analysis** | Diagnostics & Explainability | Confusion matrix, residual error distributions, false positive / false negative patterns. | Confusion matrix values (TP, FP, TN, FN), residual mean/std, subgroup error rates. | Error breakdown across critical slices and cost impact. | Decision threshold calibration (e.g. lowering threshold to minimize FN cost). | Calibrate decision threshold, approve error distribution. |
| **12** | **Explainability** | Diagnostics & Explainability | Global SHAP feature importance, permutation importance, local decision waterfalls. | Top 10 global SHAP feature impact rankings, permutation importance values. | Top prediction drivers verified against business domain reality. | Sanity check against proxy variables and data leakage. | Document business intuition alignment, flag questionable features. |
| **13** | **Model Selection** | Diagnostics & Explainability | Multi-criteria Pareto trade-off (Score, Stability, Latency, Complexity, Interpretability). | Champion model designation, composite Pareto score, latency SLA verification. | Approved production champion model. | Release recommendation based on operational constraints. | Approve champion, reject candidates, set release gates. |
| **14** | **Deployment** | Production Governance | Deployment specification, container/process runtime, API endpoint contract, schema validation. | Endpoint URL (`/predict`), input schema contract, deployment status, approval timestamp. | Active serving endpoint readiness verification. | Deployment strategy (Canary, Blue/Green, Direct), latency monitoring. | Authorize production deployment, configure traffic allocation. |
| **15** | **Monitoring** | Production Governance | Live inference throughput (RPS), p95 latency, feature drift (PSI), and data distribution shift. | Total inferences, p95 latency ms, data drift score, active drift alerts count. | Real-time health status, drift detection state. | Retraining triggers and alert threshold recalibration. | Acknowledge alerts, trigger retraining pipeline, recalibrate thresholds. |

---

## 3. Workflow Timeline Status Lifecycle

Each of the 15 stages maintains a verifiable status:

```
  [Not Started] ──► [Running] ──► [Needs Review] ──► [Completed]
        │              │                 ▲
        ▼              ▼                 │
    [Blocked] ◄────────┴─────────────────┘
```

1. **`Completed`** (Green):
   - All empirical prerequisites are satisfied and verified.
   - Practitioner decision is recorded (`accepted` or `overridden`).
2. **`Running`** (Blue, with animated pulse):
   - Telemetry collection, training benchmark, Optuna trial search, or drift calculation is in progress.
3. **`Needs Review`** (Amber):
   - Empirical results are available, and AI peer recommendations are awaiting practitioner review and sign-off.
4. **`Blocked`** (Rose/Red):
   - Stage cannot proceed due to missing prerequisite telemetry (e.g. no dataset attached, baseline failed hurdle, or critical drift detected).
5. **`Not Started`** (Slate):
   - Upstream stages must complete before this stage activates.

---

## 4. Supported Execution Modes

The workflow engine operates in three distinct execution modes, selectable at the project level:

### 1. Automatic Mode (`automatic`)
- **Philosophy**: Autonomous pipeline progression using established best practices.
- **Behavior**:
  - The pipeline executes stages sequentially using validated defaults.
  - Automatically establishes baselines, benchmarks candidate models, and freezes champion hyperparameters.
  - **Safety Circuit Breaker**: Progression automatically pauses and switches to `Needs Review` if a stage hits a blocker, validation variance is excessive ($\sigma > 0.05$), or data drift is detected.

### 2. Assisted Mode (`assisted`)
- **Philosophy**: Collaborative human-AI copilot pair programming.
- **Behavior**:
  - Default operating mode.
  - The AI synthesizes empirical telemetry and formulates structured recommendations (metric suggestions, hurdle thresholds, threshold calibrations).
  - The practitioner reviews, confirms, or overrides each recommendation before the workflow advances to subsequent stages.

### 3. Manual / Advanced Mode (`manual`)
- **Philosophy**: Complete practitioner autonomy and specialized experimentation.
- **Behavior**:
  - Automated heuristics and default pipelines are deferred.
  - The practitioner enters custom preprocessing configs, specifies exact algorithm hyperparameters, designs custom cross-validation schemes, and manually triggers stage executions.
  - The AI provides diagnostic telemetry only upon explicit request.

---

## 5. Provenance & Metric Integrity Guarantees

DataPilot enforces a strict, cryptographically verified integrity contract across the UI, service layer, and database:

### Tripartite Provenance Badges
1. **`[EMPIRICALLY MEASURED]`** (Cyan / Emerald):
   - Derived exclusively from execution plane artifacts (scikit-learn evaluations, Optuna trials, SHAP calculations, inference latency logs).
   - Zero LLM generation or heuristic estimation.
2. **`[AI RATIONALE]`** (Purple / Indigo):
   - Qualitative reasoning, optimization advice, risk commentary, and proposed next steps.
   - Clearly badged to prevent confusion with empirical measurements.
3. **`[USER DECISION]`** (Amber / Gold):
   - Documented practitioner decisions, manual parameter overrides, and audit justifications.

### Anti-Hallucination & Override Policies
- **Zero Fabricated Metrics**: If an experiment or monitoring snapshot has not executed, the API explicitly returns `evidence: []` and status `not_started` or `blocked`. It will **never** synthesize mock numbers.
- **Universal User Override**: Every recommendation generated by the AI can be overridden via the UI or API. Overrides are timestamped, attributed to the authenticated user's email, and permanently recorded in the audit trail.

---

## 6. REST API Endpoints & Contracts

All endpoints are scoped under:  
`/api/v1/organizations/{organization_id}/projects/{project_id}/workflow`

### 1. Retrieve Workflow State
- **Method**: `GET /api/v1/organizations/{organization_id}/projects/{project_id}/workflow`
- **Permission**: `PROJECT_VIEW`
- **Response**: `ProjectWorkflowOut`
  ```json
  {
    "project_id": "54bdb80c-01b8-4c8d-ac45-b9ae170a609b",
    "organization_id": "f8a9e012-34bc-56de-78fa-bcde01234567",
    "project_name": "Customer Retention Initiative",
    "execution_mode": "assisted",
    "current_stage_key": "baseline",
    "current_stage_index": 7,
    "stages": [...],
    "summary": {
      "completed": 6,
      "running": 0,
      "needs_review": 1,
      "blocked": 0,
      "not_started": 8
    },
    "updated_at": "2026-09-29T11:24:00Z"
  }
  ```

### 2. Update Execution Mode
- **Method**: `PATCH /api/v1/organizations/{organization_id}/projects/{project_id}/workflow/mode`
- **Permission**: `PROJECT_UPDATE`
- **Request Body**:
  ```json
  {
    "execution_mode": "automatic"
  }
  ```
- **Audit Action**: `workflow.mode_update`

### 3. Record Stage Override & Decision
- **Method**: `POST /api/v1/organizations/{organization_id}/projects/{project_id}/workflow/stages/{stage_key}/override`
- **Permission**: `PROJECT_UPDATE`
- **Request Body**:
  ```json
  {
    "decision": "overridden",
    "overridden_recommendation": "Enforce custom hurdle threshold of 0.68 due to low tolerance for false negatives.",
    "custom_parameters": {
      "min_improvement_pct": 15.0,
      "required_floor": 0.68
    },
    "user_decision_notes": "Approved by Principal ML Engineer per Q3 Risk Framework.",
    "status": "completed"
  }
  ```
- **Audit Action**: `workflow.stage_override`

### 4. Advance Stage
- **Method**: `POST /api/v1/organizations/{organization_id}/projects/{project_id}/workflow/stages/{stage_key}/advance`
- **Permission**: `PROJECT_UPDATE`
- **Audit Action**: `workflow.stage_advance`

---

## 7. Security, RBAC & Audit Logging

| Role | Access Level | Permissions |
| :--- | :--- | :--- |
| **Owner / Admin** | Full Control | View, Switch Modes, Override Decisions, Advance Stages, Approve Releases. |
| **Data Scientist** | Full Workflow Control | View, Switch Modes, Override Decisions, Advance Stages. |
| **Analyst** | Read-Only Inspection | View 15-stage timeline and empirical evidence; cannot override decisions or advance stages. |
| **Viewer** | Read-Only Inspection | View 15-stage timeline and approved reports; cannot mutate state. |
| **Security Auditor** | Compliance Inspection | View 15-stage timeline, verify provenance badges, inspect immutable audit events. |

### Immutable Audit Events
All state transitions log comprehensive audit records in the database:
- `workflow.mode_update`: Logs old mode, new mode, actor ID, and IP address.
- `workflow.stage_override`: Logs stage key, decision type, custom parameters, notes, and actor ID.
- `workflow.stage_advance`: Logs source stage, target stage, actor ID, and timestamp.
