# DataPilot: PRD review and proposed V1 architecture

Status: architecture approved by the user. A subsequent instruction authorizes the initial development
foundation only: frontend, backend, PostgreSQL, Redis, migrations and health checks. ML implementation
remains out of scope. The recommendations and assumptions below are preserved as the approved review.

Source of truth: the supplied 69-section DataPilot PRD. Section references below refer to that PRD. Recommendations that narrow, extend, or resolve its requirements are explicitly proposed changes, not accepted requirements. Technical references were checked on 26 September 2026.

**1. PRD analysis and explicit assumptions**

The PRD establishes a coherent product direction: evidence-based tabular machine learning with customer-controlled computation, optional AI assistance, reproducible experiments, and human deployment approval. It is not yet an implementation specification. The largest missing contract is the exact boundary between local information and cloud-visible information.

The recommended architecture is a modular FastAPI control plane, a React application, and an independently installed agent that owns data access and execution. PostgreSQL owns cloud business state; Redis supports caching, rate limits, and worker notifications. The agent owns authoritative execution records and local artifacts. A durable protocol reconciles these two kinds of state.

The AI layer proposes structured decisions. Deterministic validators, permission checks, experiment evidence, and humans govern what is executed. The PRD's specialized AI agents should initially be logical modules within a workflow, rather than independently autonomous services.

The following are assumptions for this proposal, all subject to approval:

| ID | Proposed assumption | Consequence if changed |
|---|---|---|
| A1 | V1 serves a limited B2B pilot with tabular binary/multiclass classification and single-target regression. | Multilabel, ranking, survival analysis, forecasting, and regulated autonomous decisions require additional methodology. |
| A2 | An organization is the tenant boundary; projects have explicit access grants. One default workspace is exposed initially. | Cross-organization sharing or complex workspace inheritance requires a broader authorization design. |
| A3 | V1 supports one customer organization per agent installation, with separate processes/storage for separate organizations. | Shared multi-tenant agents require substantially stronger isolation. |
| A4 | The supported execution runtime is a Linux x86-64 container. Windows/macOS hosts may use a supported container runtime after compatibility validation. | Native desktop installers, ARM, GPUs, and customer Kubernetes are separate delivery commitments. |
| A5 | The connected pilot permits outbound HTTPS to an allowlisted control-plane endpoint. A local-only CLI workflow supports no outbound communication. | An air-gapped graphical experience requires a local control plane/UI and offline identity, update, and licensing workflows. |
| A6 | Customer data, detailed profiles, model binaries, predictions, and row-level explanations stay local. Each metadata export needs a customer policy or an explicit one-time approval. | Cloud hosting of these artifacts changes the privacy promise and threat model. |
| A7 | Authentication uses an established OIDC identity service; password verification and recovery are delegated to it. | Building password authentication ourselves adds security scope and operating responsibility. |
| A8 | No-LLM operation is the default. V1 may enable one reviewed cloud provider for specifically approved inputs; private/local LLM adapters are later work. | Local AI in V1 requires model distribution, hardware support, and local inference operations. |
| A9 | V1 inference runs only in customer infrastructure; activation is performed by a local authorized operator after model approval. | Cloud-hosted inference would receive prediction inputs and contradict the proposed boundary. |
| A10 | Planning assumes 4–6 engineers, including ML and infrastructure/security ownership, plus product/design and QA support. | Milestone dates must change with staffing, procurement, or broader support commitments. |

These are deliberately visible assumptions, not claims about customer needs. Cloud provider, region, identity vendor, LLM provider, target hardware, dataset scale, budget, and production availability commitments remain undecided.

**2. Missing requirements**

| Area | Missing decision or acceptance requirement | Proposed V1 treatment |
|---|---|---|
| Permitted exports | Which fields, precision, recipients, purpose, retention, and approval apply? | Versioned typed export schemas; default deny; policy checked locally immediately before transmission. |
| Customer boundary | Does it include browser, support tools, model storage, backups, and subprocesses? | Treat the customer runtime and customer-owned storage as the data boundary. The cloud browser sees permitted summaries only. |
| Dataset connection | How does a user choose a local file without uploading it? | Local CLI registers an allowlisted path and creates an opaque dataset reference; cloud UI selects approved registrations. No cloud file picker/upload flow. |
| Data ownership | Who can authorize processing, sensitive attributes, retention, and export? | Record project purpose and customer authority; separate processing permission from export permission. |
| Authorization | Role actions, project scope, invitations, offboarding, and approval separation are unspecified. | Fixed roles with explicit project grants; distinct execution, export, approval, and deployment permissions. |
| Dataset semantics | Target type, positive class, units, time column, entity/group ID, label availability, prediction event and horizon. | Require a confirmed formulation; block invalid or ambiguous configurations. |
| Validation | Holdout use, grouped records, rare classes, missing targets, temporal dependence. | Persist a split specification and local split membership; refuse unsafe random splitting. |
| Statistical claims | What establishes superiority and how is uncertainty estimated? | Same splits across candidates; fold results plus descriptive variability; independent final holdout; no automatic claim of significance. |
| Business utility | Cost matrix, operating threshold, capacity limits, calibration and constraint priorities. | User-editable costs/constraints, predefined utility calculations, threshold selection within training validation only. |
| Experiment budgets | CPU/RAM/disk/concurrency/runtime limits, cancellation, resume behavior, maximum trials. | Enforced per-job resource budgets and bounded search spaces; configuration records both requested and actual budgets. |
| Immutable inputs | Files can change between profiling and training. | Local snapshots or verified immutable versions; refuse a version mismatch. |
| Reliability | Offline behavior, expired credentials, duplicate delivery, partial results, missed heartbeats. | Durable local journal, job leases, fencing tokens, idempotent submissions, explicit stale/unknown states. |
| Explanations | SHAP sampling, supported estimators, background data, row-level disclosure. | Bounded local computation; document method and sampling; local-only detailed output. |
| Model lifecycle | What exactly does approval cover; who can revoke it; what invalidates it? | Approval binds model, preprocessing, evaluation, input schema, destination, and policy versions. |
| Deployment | Authentication, schema compatibility, health checks, rollback, batch failures, latency budgets. | Local serving/batch runtime with explicit activation and rollback; no SaaS prediction proxy. |
| Deletion | Source files versus managed copies, offline agents, backups, artifacts and derived models. | Delete managed outputs explicitly; preserve original source files by default; show partial/pending deletion until confirmed. |
| Reports | Evidence links, unavailable information, localization, local versus cloud generation. | Local full report plus optional sanitized cloud report; immutable artifact references; unsupported claims rejected. |
| Operations | Availability, recovery targets, region, alerts, support access, incident response. | Set release targets before infrastructure implementation; verify restore and tenant-isolation behavior before pilot. |
| Compatibility | Supported OS/runtime, file variants, package versions, hardware and upgrade window. | Publish a tested support matrix; reject incompatible jobs before execution. |
| Commercial controls | Subscription states, seat limits, usage definitions, metering privacy. | Pilot entitlements and aggregate usage only; payment collection and invoicing deferred. |
| UX quality | Accessibility, error recovery, localization, stale data, restricted results. | Keyboard-accessible critical flow; explicit pending, redacted, unavailable, failed and offline states. |

Proposed benchmark target, not an existing requirement: characterize a 100,000-row, 100-column mixed tabular dataset on a documented 8-vCPU/16-GB reference machine. Measure memory, profiling time, training time, and report time during the feasibility milestone. File size alone is not a safe capacity limit; cardinality and preprocessing expansion also matter. Larger workloads are admitted only after local resource estimation.

Proposed pilot operational targets, subject to budget approval: 99.5% monthly control-plane availability; metadata RPO of 24 hours and RTO of 8 hours; p95 ordinary API requests below 500 ms under a documented pilot load. These exclude long-running jobs and are targets to test, not promised SLAs. Customer-plane backups require a separate customer-owned policy.

**3. Contradictions and proposed resolutions**

| PRD references | Conflict or ambiguity | Proposed resolution |
|---|---|---|
| §§36, 61, 64 | Registry is foundational, MLflow is listed, but model registry appears again in V2. | V1 includes minimal immutable versions, lineage and approval. Advanced promotion workflows and enterprise registry integrations belong to V2. |
| §§43–46, 62–64 | Deployment is in the V1 journey; monitoring and drift appear in V2. | V1 includes local deployment and basic operational health. Drift and production performance monitoring are V2. |
| §§8, 15, 56–57, 66 | Cloud orchestration, no-egress, no-LLM, and air-gapped deployment are not distinguished. | Define connected, temporarily disconnected, local-only, and full air-gapped modes separately. No LLM does not imply no network. |
| §§13, 62 | JSON and databases appear in general connection scope; V1 names CSV, Parquet and Excel. | V1 supports CSV, Parquet and .xlsx only. SQL connectors and JSON are deferred. |
| §§23, 25, 62, 64 | Detection includes forecasting, clustering and anomaly detection; V1 engine is supervised tabular ML. | Detect unsupported formulations as unsupported; never force them into classification/regression. |
| §§10, 49, 66 | SSO/MFA are broad requirements; SSO is also V4 enterprise scope. | V1 has secure identity and MFA, with mandatory MFA for privileged users. Customer SAML/SCIM federation is deferred. |
| §§19, 33–40 versus §§6–7 | Cloud reporting/explanations can require sensitive values even without uploading datasets. | Full profiles and reports remain local; cloud sees only permitted projections. Show withholding explicitly. |
| §§25, 62 | HistGradientBoosting versus Gradient Boosting terminology differs. | Publish an exact estimator matrix and distinguish classic and histogram variants. |
| §§22, 30, 31 | Business objective may prioritize recall while examples select highest ROC-AUC. | Select on the confirmed utility/metric and hard constraints; show trade-offs and uncertainty. |
| §§23, 40 | Problem recommendations use percentages without a calibration method. | Use evidence-backed heuristic confidence labels until probabilities are validated. |
| §§24, 29, 62 versus §4 | Custom experimentation can be interpreted as arbitrary customer code. | V1 accepts only declarative configurations and supported metrics/transformations. |
| §§37, 47 | Reproducibility and deletion can conflict. | Preserve approved non-sensitive provenance after deletion; mark experiments no longer rerunnable when source snapshots or environments are gone. |
| §§35, 64 | Fairness appears core, but advanced fairness is V2. | V1 includes descriptive segment performance when authorized; formal fairness analysis is V2. |

**4. Security and privacy risks**

The security claim should be: DataPilot provides controls to keep raw customer datasets and execution artifacts inside the customer environment, while exporting only information explicitly authorized by customer policy. It must not claim that aggregate results are inherently anonymous or that software controls eliminate every host compromise risk.

| Priority | Risk | Required architectural control |
|---|---|---|
| Critical | Sensitive values escape through profiles, category names, min/max values, exceptions, logs or report text. | Typed export allowlists, field-level rules, local rendering, sanitized errors, no arbitrary result dictionaries or free-form telemetry. |
| Critical | A validly signed cloud job becomes a remote execution or data-exfiltration mechanism. | Fixed operation registry, immutable runtime images, strict schema validation, local independent policy, no scripts/packages/commands in jobs. Signatures authenticate origin, not safety. |
| Critical | Cross-tenant access through APIs, workers, caches, object storage or agent routing. | Organization-scoped authorization and composite foreign keys; PostgreSQL RLS; tenant-aware cache keys, storage paths and worker context; adversarial isolation tests. |
| Critical | Network paths bypass the export gate. | Training/parser subprocesses have no network; only a narrowly scoped supervisor can communicate; disable third-party telemetry and runtime downloads. |
| High | Tokens or approval messages are replayed. | Short-lived agent credentials, audience/agent binding, nonce, expiry, durable replay records, job attempt fencing and revocation. |
| High | A local endpoint is reachable by a malicious website or another local user. | No browser-facing local API in the pilot; use OS-protected CLI/IPC. Future local web UI needs authenticated pairing, origin/host checks and CSRF protection. |
| High | Files exploit parsers or traverse permitted paths. | Resolve and verify paths/handles, reject symlink escapes and URL sources, read-only dataset mounts, file-size/decompression limits, sandboxed parsers; reject macros and external workbook links. |
| High | Model deserialization executes code. | Load only locally produced, integrity-checked artifacts in a restricted runtime; prefer safe/native formats where supported; no arbitrary external model imports. |
| High | Cloud LLMs receive sensitive goals, feature names, traces, or sample values. | Separate LLM-input export policy; provider approval, retention review, minimal structured context, disabled tracing by default; no-LLM fallback. |
| High | Dataset text or labels manipulate an LLM's plan. | Treat all dataset-derived text as untrusted; validate outputs independently; LLM cannot grant access, approve exports, or invoke unrestricted tools. |
| High | Approval becomes stale after retraining, schema change or policy change. | Immutable model bundles and approval-bound digests; recheck at activation; require renewed approval for relevant changes. |
| High | Deletion is reported complete while an agent or backup still holds artifacts. | Per-location deletion receipts, offline pending state, backup retention disclosure, local derived-artifact inventory. |
| High | Small groups and repeated aggregate queries reveal people. | Suppression/coarsening rules, restricted query combinations, export history and limits. Do not describe suppression as a formal privacy guarantee. |
| High | A compromised update replaces the trusted agent. | Signed releases, digest pinning, staged manual updates, rollback control, software inventory and vulnerability response. |

PostgreSQL table owners and privileged roles can bypass row-level security. The application runtime must use a restricted non-owner role without BYPASSRLS; migrations use a separate identity, and tenant context must be transaction-scoped when pooling connections. [PostgreSQL row security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

Pickle-compatible model formats can execute arbitrary code on load. A familiar model filename does not establish trust. [scikit-learn model persistence guidance](https://scikit-learn.org/stable/model_persistence.html).

Prompt instructions alone are insufficient protection against direct or indirect prompt injection. Product authority must remain outside the model. [OWASP prompt injection guidance](https://genai.owasp.org/llmrisk/llm01-prompt-injection/).

PII detection is advisory: a column classified as non-sensitive is not automatically exportable. Models themselves can reveal training information and remain local under the proposed V1 policy. Full local explanations may contain original feature values.

The vendor still processes account identities, security logs, and any permitted metadata. DPDP requirements therefore cannot be reduced to where dataset files reside. Before release, counsel must map the applicable Act, notified Rules, commencement provisions, roles, contracts, notices, rights handling and breach response to the actual deployment. This proposal does not make a legal compliance finding. Use the [MeitY publication for the DPDP Rules](https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025), rather than relying on the older draft.

**5. Architectural risks and proposed design**

| Risk | Proposed decision |
|---|---|
| Premature microservices increase deployment and consistency work. | One modular control-plane codebase, separately running API and durable worker processes. Split services only after evidence of need. |
| Redis or an API process loses an experiment request. | PostgreSQL is authoritative for desired jobs; transactional outbox plus durable delivery reconciliation. Redis loss must not lose work. |
| Long computations exhaust API workers. | All ML runs in the agent; cloud background jobs use dedicated workers. |
| Cloud status disagrees with the agent. | Distinguish requested, locally observed and cloud-received state; reconcile with sequence numbers and attempt fencing. |
| MLflow becomes an accidental cloud artifact uploader. | Local-only MLflow with explicit artifact destinations and curated logging; never use general cloud autologging for customer runs. |
| MLflow and DataPilot both own business lifecycle state. | MLflow owns local run tracking; DataPilot owns project permissions, approved metadata, decisions and deployment workflow. |
| Pandas and Polars silently diverge in types or null semantics. | Pandas-first ML interface; optional Polars ingestion/profiling behind a tested canonical schema. Preserve parsing/type decisions in manifests. |
| Automatic feature engineering causes leakage or resource explosion. | Allowlisted transformations, bounded cardinality/feature counts, fold-local fitting; no arbitrary aggregations without entity/time semantics. |
| Best-model claims overstate evidence. | Common splits, untuned dummy baseline, bounded tuning, locked holdout, business constraints and explicitly qualified comparisons. |
| Reproducibility promises exceed reality. | Preserve runtime digest, dependency lock, seeds, data fingerprint, splits and config. Define numerical tolerance; do not promise universal bitwise equality. |
| Unsupported configurations fail late. | Agent capability advertisement and preflight validation before leasing a job. |

FastAPI's request-adjacent background task facility is not the durable execution layer for heavy computation. Its own documentation distinguishes heavier workloads that benefit from separate worker tooling. [FastAPI background tasks](https://fastapi.tiangolo.com/tutorial/background-tasks/).

MLflow separates run metadata from artifacts, and artifacts can include model weights and dataset files. Its storage paths and credentials must remain inside the customer boundary. [MLflow artifact-store documentation](https://mlflow.org/docs/latest/self-hosting/architecture/artifact-store/).

Proposed data flow:

```text
Customer browser -> Cloud React application -> FastAPI control API
                                              |-> PostgreSQL
                                              |-> Redis / worker notifications
                                              |-> Approved report storage
                                              |-> Policy-gated optional LLM adapter

Customer agent -- outbound authenticated HTTPS --> Agent gateway
      |
      |-> Durable local journal and local policy
      |-> Read-only registered dataset access
      |-> Isolated profiling / ML / explanation worker (no network)
      |-> Local MLflow and artifact store
      |-> Local report / serving / batch-prediction runtime
      |
      +-> Typed export gate -> Permitted summaries only -> Agent gateway
```

The cloud never opens an inbound connection to the agent. The gateway is a separately secured router/interface within the FastAPI service initially, not a mandatory new microservice. The serving runtime is separate from the training worker and binds only to customer-approved interfaces.

**6. Proposed V1 scope and release criteria**

V1 is a complete, constrained tabular workflow: register data locally, confirm an objective, profile, review issues, approve a plan, run bounded experiments locally, compare evidence, inspect explanations, approve a model, generate a report and activate an inference bundle locally.

| Capability | Included in V1 | Deferred |
|---|---|---|
| Identity and tenancy | OIDC-backed sign-in, MFA, organizations, invitations, fixed roles, project grants, service identities | Custom roles, customer SAML/SCIM federation |
| Projects | Default workspace, purposes, classifications, ownership, project lifecycle | Complex workspace policies and cross-tenant sharing |
| Data | Local CSV, Parquet and .xlsx; immutable versions; explicit parsing options | JSON, databases, warehouses, streaming |
| Analysis | Profiles, quality checks, potential PII, identifier/duplicate/leakage heuristics and review decisions | Exhaustive PII discovery, causal discovery, automatic proof of no leakage |
| Problems | Binary/multiclass classification and single-target regression | Forecasting, clustering, anomaly detection, NLP/CV, multilabel |
| Models | Dummy baselines; Logistic/Linear Regression; Random Forest; XGBoost; LightGBM; CatBoost; classic Gradient Boosting and HistGradientBoosting where appropriate | Custom algorithms, arbitrary Python and deep learning |
| Preprocessing | Imputation, supported encoders, scaling, bounded approved date/log features, explicit exclusions | Unrestricted formulas, automatic cross-table joins, complex target encoding |
| Validation | Stratified/K-fold, group-aware splits, time-aware supervised splits; held-out final evaluation | Forecasting-specific evaluation and broad automated statistical inference |
| Search | Optuna with trial/time/resource limits and cancellation | Distributed tuning and unbounded search |
| Evaluation | Relevant metrics, fold dispersion, confusion/residual analysis, user costs, latency measurements on named hardware | Claims of universal model superiority or causal business impact |
| Explanations | Bounded local SHAP, permutation importance, supported global/local views | Arbitrary interactive explanation queries in the cloud |
| Registry | Immutable local models, cloud metadata, lineage, approval/revocation | Advanced enterprise promotion and registry integrations |
| Reports | Local HTML/PDF/Markdown/JSON; optional sanitized cloud variants | PowerPoint, Word, automated publication |
| Deployment | Local authenticated REST serving and batch prediction from approved bundles; manual activation/rollback | Cloud inference, automatic production rollout |
| Monitoring | Job/agent/service health and opt-in aggregate operational metrics | Feature/prediction drift, delayed-label model monitoring, automatic retraining |
| AI | Editable formulation/plan suggestions, evidence-based explanations and report drafts; deterministic no-LLM path | Autonomous agents, mandatory external AI, local LLM distribution |
| Privacy | Independent local policy, export review, audit, managed-artifact deletion, retention settings | Claims of formal anonymity, turnkey air-gapped enterprise platform |
| Commercial | Pilot entitlements and aggregate metering | Self-service billing, payments and tax workflows |

Full no-egress operation uses the local CLI for planning, execution, evaluation and reports. The cloud UI cannot display live results or deliver new jobs while disconnected. Temporarily disconnected connected-mode jobs may finish within their existing authorization window; exports wait and are rechecked against current policy before reconnect transmission. Full air-gapped graphical administration remains a separate enterprise milestone.

Role defaults proposed for approval: Owner manages the organization; Admin manages members, agents and policies; Data Scientist configures and runs experiments; Analyst profiles and explores permitted results; Viewer reads permitted summaries; Security Auditor reads governance and audit records. Model approval and deployment activation are explicit grants, not automatic Data Scientist privileges. Project access is checked independently of role. Separation of requester and approver is mandatory for production promotion under the proposed pilot policy.

ML acceptance requirements:

- Reserve a final holdout before model selection. Fit imputation, encoders, scaling and feature selection within each training fold. Persist local split assignments. This follows [scikit-learn's leakage-prevention guidance](https://scikit-learn.org/stable/common_pitfalls.html).
- User confirms target, positive class, prediction event, group/time structure and optimization metric. Missing targets and insufficient class support block or require an explicit supported resolution.
- Tune hyperparameters, thresholds and calibration within the development data. Evaluate the chosen frozen candidate once on the final holdout; document any subsequent reuse.
- Compare candidates on identical splits. Fold standard deviation is descriptive and must not be labelled a confidence interval. Any confidence interval must name its method, evaluation population and independence assumptions.
- Do not rank failed or incomparable runs as successful. If no candidate meets the user's constraints, return “no feasible candidate.”
- Local reports must distinguish measured evidence, proposed interpretation and missing evidence. SHAP describes model behavior, not causal effects.

Product release gates: the full journey works with LLM access disabled; unauthorized exports and tenant access fail closed; reconnect/replay cannot publish stale results; controlled data and network tests verify the boundary; an approved bundle can be reproduced within a declared tolerance; deployment cannot bypass approval; restore and deletion behavior are demonstrated.

**7. Proposed complete repository structure**

Use one monorepo, with independently buildable and deployable cloud, agent and inference artifacts. The following is a proposed layout only; these application directories and files have not been created.

```text
datapilot/
  README.md
  AGENTS.md
  SECURITY.md
  CONTRIBUTING.md
  LICENSE
  .gitignore
  .env.example
  pyproject.toml                  Python workspace / shared tooling
  uv.lock
  package.json                   Frontend workspace commands
  pnpm-workspace.yaml
  pnpm-lock.yaml
  apps/
    web/
      package.json
      vite.config.ts
      tsconfig.json
      src/
        app/                     Routing, providers, authenticated shell
        features/
          auth/
          organizations/
          projects/
          agents/
          datasets/
          formulations/
          experiment-plans/
          experiments/
          model-comparison/
          models/
          deployments/
          reports/
          governance/
          settings/
        components/
        lib/
        styles/
      tests/
    control-plane/
      pyproject.toml
      src/datapilot_control/
        main.py
        api/                     Dependencies, middleware, public/agent routers
        modules/
          identity/
          organizations/
          projects/
          agent_management/
          dataset_catalog/
          experiment_management/
          model_registry/
          deployments/
          reporting/
          governance/
          audit/
          entitlements/
        workers/                 Outbox, reconciliation, approved report work
        persistence/             SQLAlchemy models and repositories
        security/                Authorization, credentials, signing
        observability/
      migrations/                Alembic revisions
      tests/
    data-agent/
      pyproject.toml
      src/datapilot_agent/
        cli/
        enrollment/
        transport/
        job_validation/
        policy/
        export_gate/
        dataset_registry/
        scheduler/
        sandbox/
        execution/
        journal/
        artifact_store/
        audit/
        updates/
      migrations/                Local agent state schema
      tests/
    inference-runtime/
      pyproject.toml
      src/datapilot_inference/
        api/
        batch/
        bundle_validation/
        authentication/
        activation/
        health/
      tests/
  packages/
    contracts/
      pyproject.toml
      src/datapilot_contracts/    Canonical Pydantic wire contracts
      schemas/                   Generated JSON Schema
      openapi/                   Generated public and agent specifications
      fixtures/                  Synthetic valid/invalid payloads
    api-client-ts/               Generated browser client and types
    ui/                         Shared accessible React components
    ml-engine/
      pyproject.toml
      src/datapilot_ml/
        ingestion/
        schema/
        profiling/
        pii/
        quality/
        leakage/
        splitting/
        preprocessing/
        feature_engineering/
        estimators/
        tuning/
        evaluation/
        selection/
        explainability/
        reproducibility/
        tracking/                Local MLflow adapter
        packaging/
      tests/
    ai-workflows/
      pyproject.toml
      src/datapilot_ai/
        providers/
        business_requirements/
        planning/
        explanations/
        reporting/
        evidence_validation/
        deterministic_fallbacks/
      tests/
    policy-contracts/            Rules/schemas shared without runtime authority
    report-rendering/            Structured evidence -> local/sanitized formats
    test-support/                Synthetic datasets and protocol simulators
  infra/
    docker/                      Separate minimal runtime images
    compose/                     Local cloud stack and agent development stack
    terraform/                   Modules after provider/region approval
    observability/
    signing/                     Public trust configuration; no private keys
  tests/
    contracts/
    integration/
    e2e/
    security/
    tenant-isolation/
    privacy-egress/
    agent-recovery/
    reproducibility/
    performance/
  docs/
    prd/
    architecture/
    adr/
    threat-model/
    data-contracts/
    api/
    deployment/
    runbooks/
    compliance/
    user-guides/
  scripts/                       Reproducible developer/release tasks only
  .github/workflows/             CI, scans, contract checks, signed releases
```

Dependency direction: web uses generated public contracts; control plane uses contracts and cloud domain modules; agent uses contracts, local policy, ML engine and report rendering; inference uses approved bundle loading and prediction dependencies. The control-plane runtime must not depend on the ML engine or acquire local filesystem access. Shared contracts do not imply shared secrets or trust.

Within each control-plane module, separate API handlers, application services, domain rules, persistence adapters and public schemas. Avoid a universal shared utilities package that lets modules bypass authorization or couple to each other's database internals.

Use React Query for server state and a small Zustand store for local UI state; do not copy all server records into both. Use Tailwind/shadcn components and ECharts as specified. Keep independent dependency locks/build checks where runtime environments differ; exact versions are selected during the compatibility milestone.

**8. Proposed database schema**

This is a logical schema, not migration code. Field lists show the principal keys and business fields; routine timestamps and creator/updater fields are implicit. UUID identifiers, UTC timestamps, explicit status checks and versioned contracts are proposed defaults.

There are two storage domains: cloud PostgreSQL contains identity, authorization, orchestration and permitted metadata; local agent storage contains data references, execution evidence and artifacts. A cloud row must never become a shortcut for uploading its richer local counterpart.

Cloud identity and authorization:

| Table | Principal columns / relationships |
|---|---|
| users | id PK, display_name, status, last_login_at |
| auth_identities | id PK, user_id FK, issuer, subject, verified_email; UNIQUE(issuer, subject) |
| organizations | id PK, name, status, residency_region, settings_version |
| memberships | id PK, organization_id FK, user_id FK, status; UNIQUE(organization_id, user_id) |
| invitations | id PK, organization_id, invited_email, token_hash, expires_at, accepted_at, inviter_id |
| roles / permissions / role_permissions | Fixed role codes and permission catalogue; no user-authored roles in V1 |
| role_assignments | organization_id, membership_id, role_id; organization-level authority |
| workspaces | id PK, organization_id, name; one default exposed in V1 |
| projects | id PK, organization_id, workspace_id, name, purpose, classification, owner_membership_id, status, revision |
| project_grants | organization_id, project_id, membership_id, role_id; explicit project scope |
| service_accounts / service_account_grants | Service identity plus separately constrained organization/project permissions |
| api_keys | id PK, organization_id, service_account_id, key_hash, scopes, expires_at, revoked_at; never plaintext keys |

Cloud dataset and methodology catalogue:

| Table | Principal columns / relationships |
|---|---|
| datasets | id PK, organization_id, project_id, agent_id, opaque_local_ref, approved_alias, status |
| dataset_versions | id PK, organization_id, dataset_id, version_number, opaque_local_version_ref, permitted_schema_digest, privacy_policy_version_id, export_receipt_id |
| dataset_columns | id PK, organization_id, dataset_version_id, opaque_column_ref, permitted_alias/type/classification; optional row if metadata is withheld |
| profile_summaries | id PK, organization_id, dataset_version_id, job_id, schema_version, permitted_payload, export_receipt_id |
| data_findings | id PK, organization_id, dataset_version_id, type, severity, opaque_column_ref, permitted_evidence, detector_version, review_status |
| finding_reviews | id PK, organization_id, finding_id, decision, reason, actor_id; append-only history |
| business_requirement_versions | id PK, organization_id, project_id, version_number, permitted_objective, constraints, author_id, origin |
| problem_formulations | id PK, organization_id, requirement_version_id, dataset_version_id, problem_type, opaque_target_ref, positive_class_ref, confirmed_by, confirmed_at |
| validation_specs | id PK, organization_id, formulation_id, method, group/time_column_refs, fold_count, holdout_rule, seed, permitted_manifest_digest |
| experiment_plans | id PK, organization_id, project_id, formulation_id, validation_spec_id, version_number, estimator_specs, preprocessing_spec, metric_spec, budgets, status, confirmed_by |

Classification overrides affect local training configuration through an authorized job and the next versioned manifest; a cloud display edit alone must not silently change local data processing. Dataset version IDs are not globally comparable file hashes. Content fingerprints stay local unless a reviewed policy permits a tenant-scoped digest.

Cloud experiments, models and reports:

| Table | Principal columns / relationships |
|---|---|
| experiments | id PK, organization_id, project_id, plan_id, dataset_version_id, requested_by, desired_status, observed_status |
| experiment_runs | id PK, organization_id, experiment_id, agent_job_id, attempt_number, estimator_code, config_digest, opaque_local_run_ref, status, started_at, completed_at |
| evaluation_results | id PK, organization_id, run_id, evaluation_kind, split_ref, segment_ref, method, sample_count_if_permitted, export_receipt_id |
| metric_values | id PK, organization_id, evaluation_result_id, metric_code, value, direction, unit, uncertainty_method, lower_bound, upper_bound; UNIQUE(result_id, metric_code) |
| model_selection_decisions | id PK, organization_id, experiment_id, selected_run_id nullable, constraints_snapshot, evidence_refs, rationale, actor_id |
| models | id PK, organization_id, project_id, approved_name |
| model_versions | id PK, organization_id, model_id, version_number, source_run_id, dataset_version_id, opaque_local_bundle_ref, bundle_digest, input_schema_digest, environment_digest; immutable |
| model_artifact_manifests | id PK, organization_id, model_version_id, artifact_kind, opaque_local_ref, approved_digest; no model bytes or real local paths |
| deployment_targets | id PK, organization_id, project_id, agent_id, opaque_local_target_ref, approved_alias, permitted_runtime_spec |
| approvals | id PK, organization_id, model_version_id, target_id, bundle_digest, evaluation_digest, policy_version_id, decision, approver_id, expires_at, supersedes_id |
| deployments | id PK, organization_id, target_id, model_version_id, approval_id, desired_status, observed_status, observed_at, previous_deployment_id |
| reports | id PK, organization_id, project_id, version_number, experiment_id, model_version_id, evidence_manifest_digest, template_version, generator_version, status |
| report_artifacts | id PK, organization_id, report_id, format, location_kind, opaque_local_ref OR cloud_object_key, checksum, export_receipt_id |
| ai_invocations | id PK, organization_id, project_id, purpose, provider/model identifiers, prompt_template_version, approved_input_digest, output_digest, validation_status, usage; no full prompt capture by default |

Full hyperparameters or feature names are metadata too. Only approved configuration fields are mirrored; the local manifest preserves the complete version. Metrics distinguish development CV, validation, final holdout and training scores so the UI cannot accidentally compare different evidence types.

Cloud agent protocol, governance and operations:

| Table | Principal columns / relationships |
|---|---|
| agents | id PK, organization_id, approved_name, status, runtime_version, protocol_version, capabilities, last_seen_at, effective_policy_digest |
| agent_project_bindings | organization_id, agent_id, project_id; narrows dataset/job access |
| agent_enrollments | id PK, organization_id, token_hash, expires_at, used_at, approved_by |
| agent_credentials | id PK, organization_id, agent_id, public_key/certificate_thumbprint, scopes, expires_at, revoked_at |
| agent_releases | version, platform, image_digest, signature_metadata, protocol_range, support_status; global catalogue, no tenant data |
| agent_jobs | id PK, organization_id, agent_id, project_id, operation, immutable_payload, payload_digest, policy_version_id, expires_at, desired_state |
| job_attempts | id PK, organization_id, job_id, attempt_number, lease_id, fencing_token, lease_expires_at, observed_state, last_sequence |
| job_events | id PK, organization_id, attempt_id, sequence, event_type, permitted_payload, occurred_at, received_at; UNIQUE(attempt_id, sequence) |
| policy_versions | id PK, organization_id, policy_kind, scope, version_number, schema_version, rules, digest, effective_at, approved_by |
| policy_assignments | organization_id, policy_version_id, project_id/agent_id; enforce valid scope combinations |
| export_authorizations | id PK, organization_id, project_id, policy_version_id, recipient, purpose, schema_id, limits, expiry, approver_id |
| export_receipts | id PK, organization_id, agent_id, job_id, schema_id, policy_digest, authorization_id, payload_digest, transmitted_at, received_at |
| audit_events | id PK, organization_id, actor_type/id, action, resource_type/id, outcome, request_id, permitted_details, occurred_at; append-only |
| deletion_requests / deletion_items | Request scope, authorizer, location, artifact reference, status, deadline, completion receipt; per-location progress |
| usage_records / entitlements | Organization, permitted usage unit, period, deduplication key; plan limits and pilot access |
| outbox_events | id PK, organization_id, event_type, reference, committed_at, published_at, retry_count |
| idempotency_records | organization_id, principal_id, route, key, request_digest, result_ref, expires_at |

Schema constraints and operating rules:

- Every tenant-owned row carries a non-null organization_id. Use UNIQUE(organization_id, id) and composite child foreign keys so a project, dataset, model or job cannot refer across tenants, even through a coding mistake.
- Project-bearing relationships also enforce consistent project ownership, such as experiment-to-plan-to-dataset and deployment-to-model. Use composite keys where practical and transactional domain validation for remaining cross-resource invariants.
- Runtime RLS denies access without tenant context. Separate migrations, background administration and audited support access. Do not trust organization_id simply because it appears in a request body.
- Immutable records include dataset/plan/model/policy/report versions, approvals and completed evaluation results. Changes create new versions or append revocations; mutable status projections retain event history.
- JSONB is reserved for versioned, validated configuration or permitted payloads. Authorization, lifecycle states, metric values and relationships remain queryable structured fields. No unvalidated JSON as an export bypass.
- Index organization/project/status/time access paths, job leases, pending outbox entries and audit lookups. Partition high-volume events when measurements justify it. Use optimistic concurrency for editable configurations.
- Store private signing keys and infrastructure secrets in secret/key management services, not database payloads. Store local connector secrets only in customer-controlled secret storage.
- Cloud object storage contains only authorized report exports. Tenant-aware download authorization applies even if an object URL or identifier is known.
- Account deletion and project artifact deletion are separate processes. Deletion stops or fences related jobs so delayed results cannot resurrect removed records. Audit retention exceptions and backup expiry must be explicit.

Local storage proposal: SQLite with transactional journaling for a single-agent installation; customer-local filesystem/object storage for immutable artifacts; a separate local MLflow backend/artifact area. Neither SQLite nor ordinary files provide encryption merely by being local: require customer disk encryption or an approved encrypted storage configuration.

| Local table/store | Contents that remain local |
|---|---|
| local_datasets / local_dataset_versions | Real paths, parsing settings, file identities, content fingerprints, immutable snapshots |
| local_columns / classifications / finding_reviews | Original feature names, detector evidence, overrides and excluded features |
| local_profiles / quality_findings | Detailed distributions, potentially sensitive category values and issue locations |
| local_formulations / local_plans / split_manifests | Full objectives when private, configurations, row membership, validation strategy |
| local_jobs / attempts / events / replay_records | Accepted instructions, durable execution state, leases and deduplication evidence |
| local_runs / local_evaluations / local_trials | Complete parameters, fold/trial results, tuning history and local MLflow references |
| local_models / artifact_manifests | Preprocessors, model binaries, signatures, environments and dependency manifests |
| prediction_artifacts / explanation_artifacts | Batch outputs, row-level diagnostics, SHAP values and background datasets |
| local_reports / local_deployments / local_approvals | Full report artifacts, active bundle pointer, rollback history and activation evidence |
| local_policies / export_approvals / export_ledger | Customer-controlled restrictions, preview/approval evidence and transmitted payload digests |
| local_audit / deletion_receipts | Local actions, cleanup outcomes and retained evidence under customer policy |

Core lineage is organization → workspace → project → dataset version → confirmed formulation/plan → experiment → run → model version → approval → deployment. Reports reference frozen evidence rather than mutable dashboard state.

**9. Proposed API architecture**

Use three separately authenticated surfaces. Public SaaS APIs manage metadata and desired work; agent APIs handle authenticated pull/reconciliation; local interfaces handle sensitive files and inference. There is no raw dataset upload endpoint on the control plane.

For brevity, `O` below means `/api/v1/organizations/{organization_id}` and `P` means `O/projects/{project_id}`. These are documentation abbreviations, not literal routes.

| Surface | Proposed methods and routes | Responsibility |
|---|---|---|
| Browser identity | GET /auth/login, GET /auth/callback; POST /auth/logout; GET /api/v1/me | OIDC code flow and server session; no password handling by DataPilot |
| Organizations | POST /api/v1/organizations; GET/PATCH O | Organization lifecycle |
| Memberships | GET O/members; POST O/invitations; PATCH/DELETE O/members/{id} | Membership, offboarding and role changes |
| Workspaces/projects | GET/POST O/workspaces; GET/POST O/projects; GET/PATCH P | Project metadata and scope |
| Project access | GET/POST P/grants; DELETE P/grants/{id} | Explicit project grants |
| Service identity | GET/POST O/service-accounts; POST O/service-accounts/{id}/keys; POST O/api-keys/{id}/revoke | Scoped automation credentials |
| Agent management | POST O/agent-enrollments; GET O/agents; POST O/agents/{id}/revoke | Enrollment, capability and lifecycle control |
| Dataset catalogue | GET P/datasets; GET P/datasets/{id}/versions | Only previously authorized local registrations |
| Profiling | POST P/datasets/{id}/profile-jobs; GET P/datasets/{id}/profiles | Request local work; read permitted summaries |
| Data review | GET P/datasets/{id}/findings; POST P/findings/{id}/reviews | Record decisions and request versioned local changes |
| Requirements | POST/GET P/requirement-versions; POST P/problem-analyses | Manual inputs or optional AI draft formulation |
| Formulations | POST P/formulations; POST P/formulations/{id}/confirm | Explicit human confirmation |
| Plans | POST/GET P/experiment-plans; POST P/experiment-plans/{id}/confirm | Immutable configuration revision and confirmation |
| Experiments | POST/GET P/experiments; GET P/experiments/{id}; POST P/experiments/{id}/cancel | Durable run orchestration |
| Evaluation | GET P/experiments/{id}/runs; GET P/runs/{id}/evaluations; POST P/model-comparisons | Evidence retrieval and deterministic comparison |
| Selection/registry | POST P/model-selection-decisions; GET P/models; GET P/models/{id}/versions | Selection record and registered local model metadata |
| Approval | POST P/model-versions/{id}/approval-decisions; POST P/approvals/{id}/revoke | Approve/reject/revoke exact evidence and target |
| Deployment | GET/POST P/deployment-targets; POST/GET P/deployments; POST P/deployments/{id}/rollback-requests | Requests and state only; local activation remains required |
| Reports | POST/GET P/reports; GET P/reports/{id}; GET P/reports/{id}/artifacts/{artifact_id} | Local generation request or authorized cloud export |
| Governance | GET/POST O/policy-versions; POST O/policy-assignments; GET P/export-receipts | Auditable privacy and processing configuration |
| Export decisions | POST P/export-authorizations; POST P/export-authorizations/{id}/revoke | Grants a request subject to independent local restrictions |
| Audit/deletion | GET O/audit-events; POST P/deletion-requests; GET P/deletion-requests/{id} | Audit and location-aware deletion workflow |
| Progress | GET P/events | Authorized server-sent events with reconnect cursor |

Agent surface uses `/agent/v1` and separate credentials/audience:

| Method and route | Contract |
|---|---|
| POST /agent/v1/enroll | Consume one-use enrollment token; register agent public key; bind organization and allowed projects. |
| POST /agent/v1/credentials/rotate | Authenticate existing agent and rotate credentials; support revocation. |
| POST /agent/v1/heartbeat | Minimal version/capability/health fields; no usernames, real file paths or raw logs. |
| POST /agent/v1/dataset-registrations | Publish only locally authorized dataset aliases and opaque version references. |
| POST /agent/v1/job-leases | Atomically claim compatible queued work through outbound long polling. |
| POST /agent/v1/jobs/{id}/lease-renewals | Renew the current attempt with a fencing token. |
| POST /agent/v1/jobs/{id}/events | Submit ordered, bounded, schema-validated progress events. |
| POST /agent/v1/jobs/{id}/results | Submit an idempotent permitted result envelope plus export receipt. |
| GET /agent/v1/policy-updates | Fetch proposed restrictions and revocations; cannot silently loosen local policy. |
| POST /agent/v1/deletion-receipts | Report managed-artifact deletion outcomes. |
| POST /agent/v1/deployment-events | Report local approval checks, activation, health and rollback. |

Local CLI/IPC operations include register-dataset, inspect-profile, review-findings, confirm-plan, run, cancel, review-export, generate-report, approve-local-deployment, activate, rollback and delete-managed-artifacts. The same command contracts power local-only operation, without a cloud dependency.

Local inference routes are `/v1/predict`, `/v1/batch-jobs`, `/v1/batch-jobs/{id}`, `/health/live` and `/health/ready`. Input rows, batch files and prediction outputs terminate in the customer environment. Authentication, rate limits, batch limits and schema validation are required; public health responses disclose no private model details.

Shared protocol requirements:

- Validate identity, organization membership, project permission and resource ownership on every operation. Agent identities are constrained to their registered bindings.
- Browser sessions use secure, HTTP-only cookies with CSRF protection for mutations. Machine credentials are scoped, expiring and independently revocable. Origin checks supplement authentication; CORS is not an authorization mechanism.
- Long work returns 202 with an operation/resource reference. Accepted means queued, not completed. Validation failures are distinct from resource exhaustion, policy denial and unsupported capability.
- Require idempotency keys for experiment creation, approvals, deployment requests and other consequential retries. Reusing a key with a different request digest returns a conflict.
- Use cursor pagination, stable structured error codes, correlation IDs, payload limits and rate limits. Do not return local stack traces or sensitive values in error messages.
- Use ETag/If-Match or equivalent revision checks for editable resources. Immutable revisions prevent approvals from changing underneath an approver.
- Use signed canonical job envelopes and strict wire schemas. Unknown operation types and fields fail validation. Preserve protocol/schema versions and negotiate a supported compatibility window.
- Authenticate and authorize event streams and downloads again; possession of an identifier or event cursor does not grant access.

**10. Data Agent architecture and lifecycle**

The agent is the customer-controlled enforcement boundary. A cloud administrator can request work, but cannot widen filesystem or network permissions established by the customer operator.

Components:

| Component | Responsibility |
|---|---|
| CLI / OS-protected IPC | Setup, dataset registration, local-only workflow, export review and activation |
| Enrollment/identity manager | One-time pairing, device key storage, credential rotation/revocation |
| Supervisor | Outbound transport, job reconciliation, process supervision, minimal credential access |
| Local policy engine | Filesystem roots, permitted operations, resources, recipients, export rules, deployment rights |
| Validator and operation registry | Verify signed job identity, expiry, binding, plan, schema and capability |
| Durable scheduler/journal | Queue, attempts, fencing, cancellation, restarts and result resubmission |
| Dataset manager | Resolve safe references, create/verify versions, preserve input schema |
| Isolated workers | Parse, profile, detect PII, train, evaluate and explain with no network |
| Local tracking/artifact store | MLflow integration, full evidence, immutable bundles and reports |
| Export gate | Generate a permitted projection, apply policy and approval, record receipt, transmit |
| Serving/batch runtime | Load approved bundle, validate inputs, run local inference and expose local health |
| Update manager | Verify customer-approved signed releases and perform recoverable upgrades |

Enrollment starts with a short-lived one-use organization token. The agent generates its private key locally, pins the expected control-plane trust configuration and receives a constrained identity. The local operator selects allowed directories, resource caps and export policy. No long-lived enrollment secret is embedded in an installation image.

Each immutable job envelope includes protocol version, job/attempt identifiers, organization/project/agent bindings, operation, opaque dataset version, confirmed plan digest, local policy reference, resource budget, issuer, issue/expiry times, nonce, signature key ID and signature. It contains no arbitrary executable source or package-install instruction. The agent fetches artifacts only through explicitly supported local mechanisms; a job cannot supply arbitrary URLs.

Job states: created → awaiting_confirmation → queued → leased → validating → running → succeeded / failed / canceled / expired. Additional projections distinguish rejected_policy, blocked_resources, outcome_unknown and completed_locally_pending_export. Cancellation is a request until the worker acknowledges it. Model registration and result publication are separate from process completion.

Delivery is at least once; exactly-once computation is not assumed. The local journal deduplicates accepted work, and server fencing prevents an old attempt from publishing over a newer attempt. A leased job tied to one agent is not reassigned blindly on a missed heartbeat. On lease loss, stop starting new trials, checkpoint where supported, and reconcile before authoritative publication. Automatic resumption applies only to operations with an explicit tested resume contract; other retries start a new recorded attempt.

The worker receives read-only dataset access, a separate writable run directory, only necessary environment values, CPU/RAM/disk/time/process limits, and no network access. It has no cloud credential or signing key. Run as a non-root user without the host container socket or privileged mounts. The trusted customer operator provides the worker execution environment; giving a general agent a privileged container socket would defeat the intended boundary.

Local policy combines platform hard limits, organization/project restrictions and customer-local restrictions by choosing the most restrictive applicable outcome. Missing, expired, conflicting or unsupported policies block processing/export as appropriate. A cloud policy change may restrict the agent; relaxing local limits requires the local operator. Before result transmission, reevaluate current policy and revoke/suppress previously queued exports when necessary.

Export rules proposed for V1:

| Information class | Default | Possible permitted treatment |
|---|---|---|
| Raw rows, samples, direct identifiers, predictions | Local only | No V1 cloud export |
| Local paths, credentials, unfiltered logs and exceptions | Local only | Stable non-sensitive error codes only |
| Real column names and category labels | Local only | Customer-approved aliases or explicit field approval |
| Counts, distributions, missingness, metrics | Denied until authorized | Approved fields with suppression/coarsening and precision rules |
| Full SHAP matrices, background data, row explanations | Local only | Aggregate importance summaries under an export schema |
| Model binaries and preprocessing artifacts | Local only | Opaque IDs and authorized digests/metadata |
| Report content | Local by default | Separate sanitized report built only from approved evidence |
| Agent health | Explicit enrollment agreement | Version, connectivity and approved resource-status fields |

One-time approval can authorize an exact export payload; standing policy can authorize a constrained family of outputs. Both specify destination, purpose, expiry and relevant data versions. A cloud approval cannot override a stricter local rule. Export receipts record what was authorized and transmitted, without duplicating sensitive content in audit logs.

The agent must recheck the dataset fingerprint before execution and avoid time-of-check/time-of-use file replacement. Training and inference use the same fitted preprocessing bundle. SHAP and permutation computations have their own runtime/sample limits, so explanations cannot silently exceed the experiment budget.

On a cloud outage, the local-only CLI continues approved local workflows. In connected mode, already authorized work follows its offline permission and expiry; no new remote authority is invented. Local audits and artifacts remain available. On reconnect, synchronize lifecycle events and permitted results, never an unrestricted folder upload. Subscription or connectivity failures must not erase data or abruptly stop an already deployed customer inference service.

Deletion enumerates owned artifacts, confirms source-data ownership rules and reports each outcome. Source datasets are read-only references by default. Deleting derived artifacts can invalidate reproducibility and model availability; preserve that fact in the remaining permitted lineage. Managed local copies, caches, MLflow artifacts and reports all participate in deletion inventory.

**11. Development milestones and approval decisions**

The following schedule is a planning estimate under A10, not a delivery commitment. Approximately 18–26 elapsed weeks is a reasonable initial planning range for a hardened pilot, subject to milestone-zero findings. Some frontend and backend work can overlap once contracts are stable; security boundaries and evidence correctness must be established before expanding features.

| Milestone | Indicative effort | Deliverables | Exit condition / dependency |
|---|---|---|---|
| M0 — Scope and architecture approval | 1–2 weeks | Approved V1, threat model, export matrix, role matrix, runtime/scale targets, deployment and legal responsibility decisions | Product/privacy owners approve key boundaries; reference hardware and identity approach selected |
| M1 — Contracts and platform foundations | 2–3 weeks | Monorepo, CI, lockfiles, API contracts, identity, organizations/projects, authorization, audit, database migrations | Cross-tenant negative tests pass; repeatable development deployment and restore demonstrated |
| M2 — Agent trust and durable protocol | 2–3 weeks | Enrollment, signing, local policy, isolated execution, journal, leases, reconciliation and revocation | Replayed/stale/foreign jobs rejected; crash and reconnect tests pass; worker network denied |
| M3 — Local data and profiling | 2–3 weeks | CSV/Parquet/.xlsx ingestion, immutable registration, profiles, PII/quality findings, export previews | Sensitive sentinel values never reach test cloud/logs; file isolation and benchmark limits verified |
| M4 — Reproducible ML vertical slice | 2–3 weeks | Confirmed objectives, split manifests, dummy and linear/tree baselines, metrics, cancellation and lineage | Local end-to-end experiment succeeds without LLM; leakage tests and rerun tolerances pass |
| M5 — Full V1 experiment breadth | 2–3 weeks | Remaining estimator families, Optuna budgets, common comparisons, business constraints and error analysis | Supported estimator/task matrix passes; no-feasible-model and rare-class cases handled |
| M6 — Explanations, registry and reports | 2–3 weeks | Bounded SHAP/permutation, immutable model registry, evidence reports, optional AI adapters | Every numeric report claim resolves to evidence; no-LLM parity and export rules verified |
| M7 — Governed customer deployment | 2–3 weeks | Approval binding, local activation, authenticated prediction/batch runtime and rollback | Unapproved/stale bundles rejected; preprocessing parity and rollback demonstrated |
| M8 — Production hardening and pilot | 3–4 weeks | Security assessment, load/restore/recovery tests, deletion and retention, signed upgrades, runbooks, UX/accessibility review | Release gates met; customer pilot findings resolved; operational ownership accepted |

Phase durations are effort ranges with overlap, not values to add as a fixed sequential calendar. At M0, convert them into a dependency-based staffing plan and budget. Forecasting, SQL connectors, drift monitoring, private LLM packaging, full air-gapped UI and enterprise federation are subsequent projects, not hidden V1 tasks.

Testing must focus on product guarantees: cross-tenant access attempts; export leakage through diagnostics and telemetry; malformed files and job envelopes; signature replay and lease races; changed datasets; group/time leakage; preprocessing parity; trial budgets; unsupported estimator/explainer combinations; stale approvals; offline deletion; and failure recovery. Use synthetic sensitive markers and labeled reference tasks so these checks do not introduce real customer data into CI.

Approval is requested for the proposed architecture, with particular attention to these material choices:

1. Approve the constrained V1 scope in section 6, including minimal registry and local deployment, while deferring drift monitoring and full air-gapped graphical administration.
2. Approve the local-artifact boundary and explicit export policy in sections 4 and 10. Confirm whether any customer use case requires cloud storage of models, full reports or feature names.
3. Confirm the Linux-container agent approach, local CLI onboarding, expected customer hardware, and dataset scale targets.
4. Confirm the identity-service approach, role/approval separation, no-LLM default, and whether an opt-in cloud LLM is wanted in V1.
5. Select hosting region/provider and operational targets; confirm staffing and pilot deadline before committing a schedule.

The user subsequently approved this architecture and authorized the initial development foundation.
The requested initial directory names are frontend/, backend/, data-agent/, infrastructure/, docs/ and
tests/, superseding the larger proposed layout for this first milestone. See docs/development.md for
the implemented foundation; the ML engine remains deferred.
