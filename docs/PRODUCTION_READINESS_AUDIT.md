# DataPilot Production Readiness & Security Audit Report

**Date**: 2026-09-26  
**Auditor**: Antigravity Autonomous Security & Engineering Auditor  
**Scope**: Complete repository audit (Cloud Control Plane, Client Data Plane, Data Agent, Backend, Frontend, Database, ML Engine, Security, Privacy, and Deployment).  
**Status**: Completed. Awaiting review prior to remediation.

---

## Executive Summary

A comprehensive, zero-assumption inspection was conducted across the DataPilot platform. The audit verified actual code paths, data flows, cryptographic operations, access control dependencies, and privacy boundaries.

### Key Audit Verdict
- **Core Architecture Soundness**: The separation between the Cloud Control Plane and Client Data Plane is conceptually strong. Metadata ingestion schemas strictly enforce `extra="forbid"`, and statistical profilers operate in-memory on the client machine.
- **Identified Production Blockers**: **7 Critical/High severity issues** were uncovered that block production launch, including:
  1. Broken authorization permissions (`"project:write"`) in Explainability and Senior Report routers resulting in unconditional HTTP 403 errors.
  2. Runtime crash (`AttributeError: 'TenantContext' object has no attribute 'user_id'`) in Report Generation.
  3. Multi-project cross-scoping in Report Generation where an experiment in Project B accesses dataset profiles from Project A.
  4. Missing module files in the Docker Deployment packager causing immediate container boot crashes.
  5. Insecure deserialization via unsigned `joblib.load` (arbitrary code execution vulnerability).
  6. Static fallback JWT secret and database credentials in configuration.
  7. Potential raw categorical value egress in local profiler under low-cardinality conditions without explicit client policy consent.

---

## A. Completed Functionality

1. **Client Data Plane Profiling**: Local in-memory structural, numeric, categorical, distribution, outlier, correlation, constant column, and suspicious column analysis.
2. **PII Detection Engine**: Heuristic and regex scanning for Email, Phone, SSN, Credit Card (Luhn checked), IP addresses, and physical addresses.
3. **Business Requirement Engine**: Natural language requirement extraction with Pydantic schema validation, heuristic fallback, user review/approval workflow, and zero autonomous execution.
4. **AutoML Tabular Engine**:
   - Classification: Logistic Regression, Random Forest, XGBoost, LightGBM, CatBoost.
   - Regression: Linear Regression, Random Forest, XGBoost, LightGBM, CatBoost.
   - Cross-validation splitting, fold-isolated preprocessing, baseline model benchmarking, Optuna hyperparameter optimization.
5. **Experiment Management & Tracking**: Multi-run tracking, parameter logging, leaderboard ranking, and side-by-side experiment comparison in React.
6. **Model Explainability**: Global SHAP feature importances, permutation importance, local sample explanations (capped at 20), error analysis, and tripartite provenance tagging (`model_derived`, `ai_generated`, `user_assumption`).
7. **Senior Data Scientist Report Generator**: Deterministic 18-section technical report synthesis with TOC, formatted markdown export, and anti-hallucination sanitization.
8. **Model Deployment**: Local serving microservice with `POST /predict`, `GET /health`, `GET /ready`, `GET /metadata`, Docker air-gapped packaging, and approval/rollback lifecycles.
9. **Model Monitoring & Drift Detection**:
   - Local telemetry tracking: prediction distributions, latency percentiles (`p50`, `p90`, `p95`, `p99`), throughput, error rates, feature drift (KS-test and PSI), and dataset drift.
   - Delayed ground truth matching and real-time performance evaluation.
   - Multi-dimensional alerting with severity levels.
   - Cloud aggregate telemetry synchronization with zero raw data egress.
10. **Multi-Tenant Foundation**: Organization and project tenancy, JWT access tokens, rotating refresh tokens with server-side revocation, progressive login throttling, and append-only audit logging.

---

## B. Incomplete Functionality

1. **Standalone Model Registry Entity**: Model registration is currently distributed across `Experiment` records and `ModelDeployment` records without a unified `models` and `model_versions` catalog table.
2. **Client Data Sharing Policy Governance**: Profiling categorical values currently relies on a fixed heuristic ($\le 25$ unique values) rather than a configurable, tenant-gated Data Sharing Policy.
3. **Automated Asynchronous Background Queue**: Redis is only utilized for login throttling. Background tasks rely on database table polling (`agent_jobs`), with no asynchronous worker process (e.g. Celery/ARQ) for outbox notifications or report compilation.
4. **Data Retention & Pruning Scheduler**: No background cleanup service for expired refresh tokens, old monitoring snapshots, or archived audit events.
5. **Production Docker Container Build & Serve**: Frontend Dockerfile runs `npm run dev` (Vite dev server) and Backend Dockerfile runs `uvicorn --reload` rather than production-grade multi-stage builds.

---

## Detailed Findings & Issues Log

---

### C. Bugs

#### BUG-01: Runtime `AttributeError` in Senior Report Router
- **Severity**: High
- **Location**: `backend/app/reports/router.py` (Line 108)
- **Description**: The endpoint handler calls `generate_senior_report(..., user_id=tenant.user_id)`. However, `TenantContext` does not have a `user_id` attribute; the authenticated user is stored as `tenant.user` (meaning `tenant.user.id`).
- **Why it matters**: Any attempt by an authenticated user to generate a Senior Data Scientist report via HTTP fails with a 500 Internal Server Error due to an unhandled `AttributeError`.
- **Recommended fix**: Update line 108 from `user_id=tenant.user_id` to `user_id=tenant.user.id`.
- **Blocks production**: Yes.

#### BUG-02: Missing Modules in Docker Deployment Packager Context
- **Severity**: Critical
- **Location**: `data-agent/src/datapilot_agent/serving/docker_packager.py` (Lines 207–228)
- **Description**: `server.py` imports `datapilot_agent.monitoring.engine` and `datapilot_agent.monitoring.schema`. When `DockerPackager.package()` builds the deployment directory, it only copies `serving/` and parts of `automl/`. It does not copy `monitoring/`, `export_gate.py`, or `contracts.py`.
- **Why it matters**: Packaging a model and running `docker build` succeeds, but starting the container (`docker run`) crashes immediately with `ModuleNotFoundError: No module named 'datapilot_agent.monitoring'`.
- **Recommended fix**: Update `DockerPackager.package` to copy `monitoring/`, `export_gate.py`, and `contracts.py` into the destination package structure.
- **Blocks production**: Yes.

#### BUG-03: Missing Audit Event Logging on AutoML Experiment Ingestion
- **Severity**: Low
- **Location**: `backend/app/experiments/router.py` (Lines 201–324)
- **Description**: The `/experiments/ingest` endpoint creates persistent `Experiment`, `ExperimentRun`, and `ExperimentTrial` database records but never calls `record_audit_event()`.
- **Why it matters**: Violates global engineering rule: "Every state-changing operation must be authenticated, authorized, validated, and audited."
- **Recommended fix**: Add `record_audit_event(db, action="experiment.ingested", ...)` upon successful ingestion.
- **Blocks production**: No.

---

### D. Security Vulnerabilities

#### SEC-01: Hardcoded Default JWT Secret Key
- **Severity**: Critical
- **Location**: `backend/app/config.py` (Line 20)
- **Description**: `jwt_secret` defaults to `"datapilot-phase1-dev-secret-key-32-chars-minimum-entropy"`.
- **Why it matters**: If an operator deploys DataPilot to staging or production without explicitly overriding `JWT_SECRET` in environment variables, any external attacker can sign valid JWT tokens for arbitrary user and organization IDs.
- **Recommended fix**: Enforce that `jwt_secret` cannot use the default dev value in non-local environments; throw an immediate startup configuration exception if `ENVIRONMENT != "development"` and the default secret is present.
- **Blocks production**: Yes.

#### SEC-02: Insecure Deserialization via Unsigned `joblib.load`
- **Severity**: High
- **Location**: `data-agent/src/datapilot_agent/serving/artifact.py` (Line 113)
- **Description**: `load_model_artifact()` executes `joblib.load(src)` on disk files without verifying a cryptographic hash or signature.
- **Why it matters**: Python's `joblib` relies on `pickle`. If an adversary tampers with or substitutes `model_bundle.joblib` on the filesystem or container volume, loading the bundle executes arbitrary code.
- **Recommended fix**: Generate an HMAC-SHA256 signature when saving `model_bundle.joblib` and verify the signature before calling `joblib.load()`.
- **Blocks production**: Yes.

#### SEC-03: Wildcard CORS and Optional API Key in Serving Microservice
- **Severity**: High
- **Location**: `data-agent/src/datapilot_agent/serving/server.py` (Lines 68–73, 75–84)
- **Description**: `create_serving_app` configures `CORSMiddleware` with `allow_origins=["*"]` and `allow_credentials=True`. If `SERVING_API_KEY` is not provided, authentication is disabled.
- **Why it matters**: Malicious scripts running on a user's browser could send unauthorized cross-origin requests to `http://localhost:8080/predict` or extract local telemetry.
- **Recommended fix**: Require `SERVING_API_KEY` by default or generate a cryptographically random one upon launch. Remove wildcard CORS with credentials; allow only configured client origins.
- **Blocks production**: Yes.

---

### E. Privacy Risks

#### PRIV-01: Local Prediction Collector Retains Inferences Indefinitely in RAM without TTL
- **Severity**: Medium
- **Location**: `data-agent/src/datapilot_agent/monitoring/collector.py` (Lines 20–55)
- **Description**: `PredictionCollector` maintains an in-memory deque of up to 10,000 raw prediction feature dictionaries to support delayed ground truth matching. Records are purged only when the count exceeds 10,000.
- **Why it matters**: Sensitive input data remains resident in process memory indefinitely if traffic volume is low, increasing the window of exposure for memory inspection.
- **Recommended fix**: Add a time-to-live (TTL) eviction policy (e.g. 24 or 48 hours) to purge expired raw feature records from the memory buffer.
- **Blocks production**: No.

---

### F. Raw-Data Egress Risks

#### EGR-01: Low-Cardinality Raw Category Values Transmitted to Cloud Control Plane
- **Severity**: High
- **Location**: `data-agent/src/datapilot_agent/profiler.py` (Lines 150–171, 203, 215)
- **Description**: `is_safe_categorical_feature()` classifies any column with $\le 25$ unique values as safe, transmitting literal string values (`mode` and `top_frequencies`) to the control plane.
- **Why it matters**: Columns with low cardinality may contain sensitive attributes (e.g., medical diagnoses, political parties, internal status codes, religion). If the customer has not explicitly approved sharing categorical values, sending raw text violates the zero-egress mandate.
- **Recommended fix**: Require an explicit client data-sharing policy flag (`allow_category_values: bool`). If disabled (default), categorical values must be replaced with opaque tokens (e.g. `<CLASS_A>`, `<CLASS_B>`) with only counts and ratios sent.
- **Blocks production**: Yes.

---

### G. Authentication Risks

#### AUTH-01: JWT Tokens Stored in Browser `localStorage`
- **Severity**: Medium
- **Location**: `frontend/src/api.ts` (Lines 27–40)
- **Description**: Access and refresh tokens are stored in `window.localStorage`.
- **Why it matters**: Any Cross-Site Scripting (XSS) vulnerability allows malicious scripts to extract access and refresh tokens.
- **Recommended fix**: Migrate refresh tokens to `HttpOnly`, `SameSite=Strict`, `Secure` cookies with anti-CSRF tokens. Store access tokens in memory.
- **Blocks production**: No.

#### AUTH-02: Database Connection Fallback Uses Static Hardcoded Password
- **Severity**: High
- **Location**: `backend/app/config.py` (Lines 13–15)
- **Description**: `database_url` defaults to `postgresql+psycopg://datapilot:datapilot_dev_only@127.0.0.1:15432/datapilot`.
- **Why it matters**: Fallback to known development credentials in production could result in connection to unsecured database instances.
- **Recommended fix**: Fail fast if `DATABASE_URL` is unset when `ENVIRONMENT=production`.
- **Blocks production**: Yes.

---

### H. Authorization / RBAC Issues

#### RBAC-01: Unrecognized Permission `"project:write"` Blocks Explainability & Report Endpoints
- **Severity**: High
- **Location**: `backend/app/explainability/router.py` (Lines 103, 191, 251), `backend/app/reports/router.py` (Line 94)
- **Description**: Endpoints declare `require_permission("project:write")`. However, `ROLE_PERMISSIONS` in `backend/app/auth/dependencies.py` defines `"project:create"`, `"project:read"`, `"project:update"`, `"project:delete"`. No role possesses `"project:write"`.
- **Why it matters**: Every request to ingest explainability reports, generate narratives, update assumptions, or generate reports is rejected with HTTP 403 Forbidden for all roles, including Owner and Admin.
- **Recommended fix**: Replace `"project:write"` with `"project:update"` in router dependencies, or add `"project:write"` as an alias in `ROLE_PERMISSIONS`.
- **Blocks production**: Yes.

---

### I. Multi-Tenant Isolation Issues

#### TENANT-01: Cross-Project Dataset Scoping in Senior Report Generator
- **Severity**: High
- **Location**: `backend/app/reports/generator.py` (Lines 88–92)
- **Description**: `_gather_verified_artifacts` queries `ProfileSummary` filtering only by `ProfileSummary.organization_id == experiment.organization_id`, without filtering by `project_id` or `dataset_id`.
- **Why it matters**: In an organization with multiple projects, an experiment report generated for Project B will extract dataset statistics and profiles from Project A if Project A's dataset was profiled more recently.
- **Recommended fix**: Filter `ProfileSummary` through `Dataset.project_id == experiment.project_id` to enforce strict project-level isolation.
- **Blocks production**: Yes.

---

### J. ML Reliability Issues

#### ML-01: Dense One-Hot Encoding Memory Exhaustion (OOM)
- **Severity**: Medium
- **Location**: `data-agent/src/datapilot_agent/automl/preprocessing.py` (Lines 98–105)
- **Description**: `TabularPreprocessor` uses `OneHotEncoder(handle_unknown="ignore", sparse_output=False)` with no maximum category threshold.
- **Why it matters**: If a dataset contains categorical columns with thousands of distinct values, generating a dense NumPy matrix causes memory exhaustion and worker crash.
- **Recommended fix**: Configure `max_categories=50` and `min_frequency=0.01` on the `OneHotEncoder`.
- **Blocks production**: No.

#### ML-02: AutoML CV Benchmark Does Not Persist Final Retrained Pipeline to Disk
- **Severity**: Medium
- **Location**: `data-agent/src/datapilot_agent/automl/engine.py` (Lines 160–200)
- **Description**: `AutoMLEngine.run()` benchmarks models across CV folds and returns metric metadata, but does not fit and save a final estimator pipeline on the full dataset into `model_bundle.joblib`.
- **Why it matters**: Deployment serving relies on pre-saved `ModelArtifactBundle` objects. Users must manually construct the bundle rather than receiving it automatically from `AutoMLEngine`.
- **Recommended fix**: Add an automated step in `AutoMLEngine` to fit the winning algorithm on the entire clean dataset and output `model_bundle.joblib`.
- **Blocks production**: No.

---

### K. Data Leakage Risks

#### LEAK-01: Raw Exception Messages in Inference Serving Error Responses
- **Severity**: Medium
- **Location**: `data-agent/src/datapilot_agent/serving/server.py` (Lines 198–200)
- **Description**: `HTTPException(status_code=500, detail=f"Inference failure: {err}")` returns raw exception strings.
- **Why it matters**: Unsanitized exception strings can reveal file paths, memory addresses, or package versions to callers.
- **Recommended fix**: Return generic error envelopes: `detail="Internal inference error"` while logging the full exception internally.
- **Blocks production**: No.

---

### L. AI / LLM Hallucination Risks

#### AI-01: Report Generator LLM Fallback Lacks Grounding Verification on Custom LLM Adapters
- **Severity**: Low
- **Location**: `backend/app/reports/generator.py` (Lines 200–260)
- **Description**: Deterministic sections are 100% grounded in verified artifacts. The optional AI synthesis passes structured metrics and strips numeric claims via regex. However, subtle qualitative hallucination (e.g. claiming a model is "production ready" when baseline accuracy is low) is not bounded by formal assertion rules.
- **Why it matters**: Qualitative conclusions could misrepresent model risks if an LLM is enabled.
- **Recommended fix**: Add qualitative sanity rules (e.g. if metric < 0.7, prohibit terms like "highly effective" or "ready for mission-critical deployment").
- **Blocks production**: No.

---

### M. Performance Bottlenecks

#### PERF-01: Synchronous In-Process Drift Computation on Serving Request Path
- **Severity**: Low
- **Location**: `data-agent/src/datapilot_agent/serving/server.py` (Lines 149–171)
- **Description**: `monitor.record_inference()` is called synchronously within the `POST /predict` handler. While appending to `deque` is $O(1)$, drift computation is executed during `GET /monitoring/metrics`.
- **Why it matters**: High throughput (>1000 req/s) could see minor lock contention on `PredictionCollector._lock`.
- **Recommended fix**: Use a background worker thread or lock-free ring buffer for inference recording.
- **Blocks production**: No.

---

### N. Missing Tests

#### TEST-01: Missing End-to-End HTTP Route Tests for Explainability and Senior Report Routers
- **Severity**: High
- **Location**: `tests/backend/test_explainability.py`, `tests/backend/test_senior_report.py`
- **Description**: Tests in these files tested helper functions and Pydantic schemas in isolation rather than making HTTP calls through `TestClient(app)` with authenticated tenant headers.
- **Why it matters**: The invalid permission string `"project:write"` and the `AttributeError: tenant.user_id` bug were hidden from the test runner.
- **Recommended fix**: Add comprehensive integration tests using `TestClient` covering `POST /reports` and `POST /explainability`.
- **Blocks production**: Yes.

---

### O. Deployment Risks

#### DEP-01: Container Images Configured with Development Entrypoints
- **Severity**: High
- **Location**: `infrastructure/backend.Dockerfile` (Line 15), `infrastructure/frontend.Dockerfile` (Line 9)
- **Description**: Backend container runs `CMD ["uvicorn", "app.main:app", ..., "--reload"]`. Frontend container runs `CMD ["npm", "run", "dev"]`.
- **Why it matters**: Reload watchers add CPU/RAM overhead and can crash or trigger unexpected restarts in containerized production environments.
- **Recommended fix**: Provide production Dockerfiles (Multi-stage build for frontend with Nginx; multi-worker Gunicorn/Uvicorn without `--reload` for backend).
- **Blocks production**: Yes.

---

### P. Observability Gaps

#### OBS-01: Lack of Standard Prometheus `/metrics` and Distributed Tracing
- **Severity**: Medium
- **Location**: `backend/app/main.py`
- **Description**: System health is tracked via `/health/ready`, but there is no Prometheus `/metrics` endpoint (request rates, error rates, p99 latency, DB pool saturation) or OpenTelemetry tracing headers.
- **Why it matters**: Operations teams cannot monitor platform infrastructure health using standard APM tools (Prometheus, Grafana, Datadog).
- **Recommended fix**: Add `prometheus-fastapi-instrumentator` and OpenTelemetry tracing middleware.
- **Blocks production**: No.

---

## Production Readiness Matrix

| Area | Current State | Production Ready? | Blocker Count |
|---|---|---|---|
| **1. Cloud Control Plane** | FastAPI routers with tenant validation | ⚠️ Needs Fixes | 2 (RBAC typo, Audit log) |
| **2. Client Data Plane** | In-memory profiling & ML execution | ⚠️ Needs Fixes | 1 (Categorical egress) |
| **3. Data Agent** | Local CLI, secure client, gatekeeper | ✅ Ready | 0 |
| **4. FastAPI Backend** | Async lifespan, error envelopes | ⚠️ Needs Fixes | 2 (CORS/Headers, JWT secret) |
| **5. React Frontend** | Full workflow UI, Vitest passed | ✅ Ready | 0 |
| **6. PostgreSQL Database** | Versioned Alembic migrations (0001–0010) | ✅ Ready | 0 |
| **7. Redis / Background** | Throttling cache active; no worker queue | ⚠️ Functional | 0 |
| **8. ML Engine** | 5 classification + 5 regression models | ✅ Ready | 0 |
| **9. Experiment Tracking** | Comparison & metric diffing active | ✅ Ready | 0 |
| **10. Model Registry** | Distributed across Deployment & Experiment | ⚠️ Functional | 0 |
| **11. Explainability** | SHAP, permutation, error analysis | ⚠️ Needs Fixes | 1 (RBAC typo) |
| **12. Report Generation** | 18-section deterministic report | ⚠️ Needs Fixes | 2 (Scoping leak, AttributeError) |
| **13. Deployment** | Serving server & Docker packager | ⚠️ Needs Fixes | 1 (Docker packaging bug) |
| **14. Monitoring** | Real-time drift, percentiles & alerts | ✅ Ready | 0 |
| **15. Authentication** | JWT, rotating refresh, progressive lockout | ⚠️ Needs Fixes | 1 (Hardcoded dev secret) |
| **16. RBAC** | Role permissions defined | ⚠️ Needs Fixes | 1 (Missing permission mapping) |
| **17. Multi-Tenant Isolation** | Organization & project scoping | ⚠️ Needs Fixes | 1 (Report dataset scoping) |
| **18. Audit Logging** | Append-only event table | ⚠️ Needs Fixes | 1 (Missing ingest event) |
| **19. Privacy Controls** | Export gatekeeper allowlist active | ⚠️ Needs Fixes | 1 (Low-cardinality strings) |
| **20. Data Retention** | Ring buffer bounded; DB unbounded | ⚠️ Functional | 0 |
| **21. PII Detection** | Regex & Luhn algorithms active | ✅ Ready | 0 |
| **22. Raw-Data Egress Protection** | ExportGate enforcer active | ⚠️ Needs Fixes | 1 (Low-cardinality strings) |

---

## Action Plan for Production Readiness

1. **Phase 1: Critical Security & RBAC Fixes** (Immediate Blockers)
   - Align `"project:write"` to `"project:update"` in `explainability/router.py` and `reports/router.py`.
   - Fix `tenant.user_id` -> `tenant.user.id` in `reports/router.py`.
   - Fix `ProfileSummary` query in `reports/generator.py` to scope strictly to `experiment.project_id`.
   - Fix `DockerPackager` to include `monitoring/`, `export_gate.py`, and `contracts.py`.
   - Prevent default fallback secret keys in production config.
   - Enforce explicit client policy gate for categorical values in `profiler.py`.
2. **Phase 2: Reliability & Packaging Hardening**
   - Add HMAC signature verification to `load_model_artifact`.
   - Provide production Dockerfiles (non-reload backend, static frontend).
   - Add `max_categories=50` to `OneHotEncoder`.
3. **Phase 3: Automated Testing & Observability**
   - Add end-to-end `TestClient` tests for Explainability and Report routers.
   - Add Prometheus metrics endpoint and security headers middleware.
