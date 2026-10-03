# DataPilot Senior Data Scientist Report Generator

## 1. Architectural Overview & Design Philosophy

The **DataPilot Senior Data Scientist Report Generator** compiles an authoritative, end-to-end technical report from verified experiment benchmarks, data profiling telemetry, cross-validation metrics, and explainability artifacts.

### Core Tenet: Zero-Fabrication Guarantee
A core tenet of DataPilot is that **every quantitative statement must be traceable to verified execution artifacts**. 
- Automated machine learning outputs, data quality audits, validation scores, and explainability attributions are computed locally within the customer's data boundary (Client Data Plane).
- The LLM is **never permitted to invent, extrapolate, or hallucinate** metrics, sample counts, feature attributions, model names, or training times.
- If an LLM is not configured or disabled, the complete technical report compiles deterministically with 100% comprehensive data science analysis.

---

## 2. Standard 23-Section Report Taxonomy

The report adheres to the 23-section standard required for executive review, peer data science audits, and model risk management:

| # | Section Key | Section Title | Primary Provenance | Grounded Content & Metrics |
|---|---|---|---|---|
| 1 | `executive_summary` | 1. Executive Summary | `composite` | Winning model candidate, primary metric score, delta vs baseline (%), validation scheme, dataset volume, and operational deployment verdict. |
| 2 | `business_understanding` | 2. Business Understanding | `user_assumption` | Business objective, prediction objective, operational horizon, business constraints, and secondary metrics. |
| 3 | `problem_formulation` | 3. Problem Formulation | `measured_result` | Supervised learning paradigm, target variable, feature dimensionality, loss criteria, and decision threshold formulation. |
| 4 | `dataset_overview` | 4. Dataset Overview | `measured_result` | Dataset version, SHA256 cryptographic fingerprint, validated sample count, column count, storage volume, and air-gapped data plane guarantee. |
| 5 | `data_quality` | 5. Data Quality | `measured_result` | Automated profiling telemetry, missing values, duplicates, and anomaly findings table (Code, Column, Severity, Message). |
| 6 | `privacy_classification` | 6. Privacy/Data Classification | `composite` | Data governance tier (internal/confidential/restricted/pii), identifier redaction, multi-tenant isolation boundary, and control plane zero-exfiltration verification. |
| 7 | `leakage_analysis` | 7. Leakage Analysis | `measured_result` | Pre-flight target correlation checks, out-of-fold transformer fitting audit, and strict partition isolation. |
| 8 | `exploratory_analysis` | 8. Exploratory Analysis | `measured_result` | Pairwise Pearson/Spearman collinearity coefficients, variance dispersion, and independent factor distribution. |
| 9 | `feature_engineering` | 9. Feature Engineering | `measured_result` | Imputation protocol, feature scaling (`StandardScaler`/`RobustScaler`), categorical encoding strategies, and configured exclusions/interactions. |
| 10 | `baseline` | 10. Baseline | `measured_result` | Identity of baseline model (e.g., LogisticRegression/DummyClassifier), baseline CV score, standard error, latency benchmark, and minimum hurdle definition. |
| 11 | `experiment_methodology` | 11. Experiment Methodology | `measured_result` | Validation scheme (`StratifiedKFold`, `KFold`, `TimeSeriesSplit`), fold count, deterministic seed, candidate pool, and metric aggregation protocol. |
| 12 | `models_evaluated` | 12. Models Evaluated | `measured_result` | Exhaustive catalog of candidate model architectures evaluated, algorithm keys, run status, and wall-clock training durations. |
| 13 | `cross_validation` | 13. Cross Validation | `measured_result` | Out-of-fold fold-by-fold score breakdown table (`Fold 1`, `Fold 2`, etc.), mean score, standard error, and stability index. |
| 14 | `hyperparameter_optimization` | 14. Hyperparameter Optimization | `measured_result` | Optuna Tree-structured Parzen Estimator (TPE) study summary, total trials evaluated, trial duration, and optimal parameter sets. |
| 15 | `model_comparison` | 15. Model Comparison | `measured_result` | Candidate leaderboard matrix: Rank, Model, Algorithm, Mean CV Score, Std Error, Training Time (s), Latency (ms), and % Delta vs Baseline. |
| 16 | `recommended_candidate` | 16. Recommended Candidate | `composite` | Winning production candidate profile, optimal hyperparameters JSON dump, Pareto justification (accuracy vs latency), and operational feasibility. |
| 17 | `explainability` | 17. Explainability | `measured_result` | Global SHAP feature attributions table (Rank, Feature, Mean \|SHAP\|, Std Error, Source), permutation importance, and non-causal statistical attribution disclaimer. |
| 18 | `error_analysis` | 18. Error Analysis | `measured_result` | Confusion matrix distribution / regression residual diagnostics (RMSE, MAE, max error), and underperforming subgroup slices. |
| 19 | `risk_analysis` | 19. Risk Analysis | `ai_interpretation` | Vulnerability to subgroup disparity, sensitivity to covariate shift on top SHAP drivers, and asymmetric business cost of false positives vs false negatives. |
| 20 | `limitations` | 20. Limitations | `composite` | Empirical sample boundary (`n_samples`), stationary tabular assumptions, and non-causal disclaimer (association vs causal intervention). |
| 21 | `deployment_recommendation` | 21. Deployment Recommendation | `ai_interpretation` | Recommended rollout topology: Staged Canary Rollout (10% $\to$ 50% $\to$ 100%), containerized microservice runtime, latency SLA compliance, and automated fallback triggers. |
| 22 | `monitoring_recommendation` | 22. Monitoring Recommendation | `ai_interpretation` | Post-deployment observability: Population Stability Index (PSI alert at > 0.20), Kolmogorov-Smirnov distribution checks, concept drift tracking, and retraining triggers. |
| 23 | `reproducibility_information` | 23. Reproducibility Information | `measured_result` | Deterministic random seed, dataset SHA256 checksum, Python runtime version, OS/hardware platform, execution plane, and manifest timestamp. |

---

## 3. Strict Provenance Taxonomy & Grounding Contract

Every report section and text block explicitly declares its evidentiary origin:

### Provenance Classes
1. `[MEASURED RESULT]` (`source="measured_result"`):
   - Directly recorded execution telemetry, test metrics, model leaderboard tables, SHAP values, and dataset profiles.
   - Enforced by server-side schemas (`extra="forbid"`).
2. `[AI INTERPRETATION]` (`source="ai_interpretation"`):
   - Qualitative synthesis, risk analysis, deployment topology suggestions, and observability guidelines.
   - Guarded by the narrative sanitizer: any AI attempts to inject ungrounded numeric metrics are automatically blocked or stripped.
3. `[USER-PROVIDED ASSUMPTION]` (`source="user_assumption"`):
   - Business objectives, stakeholder constraints, prediction horizons, and target cost matrices declared by practitioners.
4. `[VERIFIED COMPOSITE]` (`source="composite"`):
   - Sections containing both grounded quantitative measurements and qualitative strategic commentary (e.g., Executive Summary, Recommended Candidate, Limitations).

---

## 4. Sequential Report Versioning

- Reports generated for a given experiment are sequentially versioned (`v1`, `v2`, `v3`, ...).
- When a new report is generated, the system computes `version = existing_reports_count + 1` and embeds this into the report metadata and verified artifacts store.
- Users can switch between historical versions via the interactive version selector, maintaining a permanent audit trail of model reviews.
- File downloads incorporate the sequential version number into the filename (e.g., `senior_ds_report_v1_exp123.pdf`).

---

## 5. Multi-Format Export Engine

The report generator natively outputs 3 presentation formats without third-party external binary dependencies:

### 1. Markdown (`.md`)
- Complete GitHub-flavored Markdown document with Table of Contents, anchor navigation links, and GitHub-style alerts (`> [!IMPORTANT]`).
- Download endpoint: `GET /experiments/{experiment_id}/reports/{report_id}/markdown`.

### 2. Standalone Styled HTML (`.html`)
- Complete responsive HTML5 document styled with CSS custom properties (`--bg-color`, `--card-bg`, `--accent-cyan`, `--accent-green`).
- Includes interactive navigation, provenance status badges, responsive tables, and clean print styles (`@media print`).
- Download endpoint: `GET /experiments/{experiment_id}/reports/{report_id}/html`.

### 3. Pure-Python Multi-Page Binary PDF (`.pdf`)
- Compiled via a pure-Python PDF 1.4 binary engine (`app.reports.formatters.build_report_pdf`).
- Standard Letter dimensions (612 $\times$ 792 pt), text line-wrapping, section headings, metadata headers, pagination footers (`Page X of Y`), and PDF cross-reference (`xref`) indexing.
- Zero external C-library or headless browser dependencies (`weasyprint` or `wkhtmltopdf` not required).
- Download endpoint: `GET /experiments/{experiment_id}/reports/{report_id}/pdf`.

---

## 6. Security, RBAC & Tenant Isolation

- **Role-Based Access Control:**
  - Generating reports requires `report:create` permission (`lead_data_scientist`, `data_scientist`, `ml_engineer`, `admin`).
  - Viewing or downloading reports requires `report:view` permission (`viewer`, `business_stakeholder`, and above).
- **Multi-Tenant Isolation:**
  - Queries are filtered by `organization_id` derived exclusively from the authenticated JWT session.
  - Cross-tenant requests immediately reject with `403 Forbidden`.
- **Zero Raw Data Transmission:**
  - Raw rows are never transmitted across the control plane boundary. The report is compiled entirely from statistical profile summaries, model weights metrics, and aggregated explanations.

---

## 7. Verification & Automated Test Coverage

The reporting module is covered by automated unit and integration tests:
- `tests/backend/test_senior_report.py`:
  - `test_all_23_sections_generated`: Verifies deterministic generation of all 23 standard sections in exact sequence.
  - `test_provenance_tagging_distinction`: Validates `[MEASURED RESULT]`, `[AI INTERPRETATION]`, and `[USER-PROVIDED ASSUMPTION]` tagging.
  - `test_verified_artifacts_accurately_represented`: Ensures zero deviation from recorded metrics.
  - `test_markdown_rendering`: Validates Markdown TOC, anchors, and provenance headers.
  - `test_html_rendering`: Validates HTML formatting, tags, and CSS classes.
  - `test_pdf_rendering`: Validates valid binary PDF 1.4 output with `%%EOF` and valid trailer structure.
  - `test_generate_request_schema_strictness`: Confirms `extra="forbid"` on API request schemas.
- `tests/backend/test_http_explainability_reports.py`:
  - End-to-end HTTP authenticated tests verifying RBAC, cross-tenant isolation, 401/403/404 handling, and 23-section creation.
- `frontend/src/SeniorReportView.test.tsx`:
  - Unit tests verifying frontend component rendering, sticky Table of Contents, provenance guarantee banners, export buttons (`.md`, `.html`, `.pdf`, `Print`), and version selector.
