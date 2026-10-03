# Business Understanding & ML Problem Formulation Engine

## 1. Executive Summary & Philosophy

In enterprise data science, the majority of project failures stem not from suboptimal modeling algorithms, but from **misaligned business understanding and unverified problem formulations**. Business stakeholders communicate goals in qualitative, operational language (e.g. *"We want to identify customers who are likely to churn within the next 30 days"*), whereas machine learning pipelines require deterministic mathematical specifications (target variable definitions, time-travel-safe observation windows, cost-asymmetric evaluation metrics, latency constraints, and operational prediction frequencies).

DataPilot's **Business Problem Engine** bridges this gap by transforming conversational business goals into strictly typed, versioned **Problem Formulation** objects. 

### Core Tenets

1. **Structured Extraction**: The engine extracts 11 formal operational dimensions from natural language.
2. **Deterministic LLM Output Validation**: The LLM must output validated structured JSON conforming to strict Pydantic models with `extra="forbid"`. Free-form LLM outputs are **never** permitted to directly execute code or initiate model training.
3. **Explicit Assumptions Policy**: The system explicitly documents every assumption made (horizon lead times, cost asymmetries, label availability). It **never silently assumes** missing business requirements.
4. **Human-in-the-Loop Review Screen**: Every formulation must be explicitly reviewed by an authorized human operator (Data Scientist, Admin, or Owner) who can **Accept**, **Edit**, **Reject**, or **Add Missing Information**.
5. **Versioned Problem Formulation**: Upon confirmation, an immutable, versioned Problem Formulation object (`v1`, `v2`, etc.) is recorded, creating an auditable provenance trail for all downstream AutoML experiments and models.

---

## 2. The 11 Extracted Dimensions

| # | Dimension | Description | Example (Customer Churn) |
|---|---|---|---|
| **1** | **Business Objective** | High-level commercial or operational goal. | Reduce monthly customer churn from 4.5% to below 3.0% to protect recurring ARR. |
| **2** | **ML Objective** | Specific predictive machine learning task. | Predict the conditional probability that an active subscriber will cancel within 30 days. |
| **3** | **Target** | Target column name or conceptual ground-truth entity. | `churn` (or `is_churned_30d`) |
| **4** | **Prediction Horizon** | Lead time or forecast horizon prior to target occurrence. | `30 days` |
| **5** | **Candidate Problem Type** | Tabular ML problem category. | `binary_classification` (Options: `binary_classification`, `multiclass_classification`, `regression`, `time_series_forecasting`) |
| **6** | **Primary Metric** | Primary optimization metric aligned with business tradeoffs. | `recall` (when prioritizing false negative reduction) or `roc_auc` / `pr_auc` |
| **7** | **Secondary Metrics** | Diagnostic and supporting evaluation metrics. | `["roc_auc", "f1", "precision", "pr_auc"]` |
| **8** | **Business Constraints** | Operational, latency, and compliance requirements. | Max latency < 200ms; Feature attribution (SHAP) explanations required; No post-outcome features. |
| **9** | **Cost of False Positives** | Operational friction or wasted budget from false alarms. | Unnecessary $25 retention discount voucher cost or customer outreach fatigue. |
| **10** | **Cost of False Negatives** | Financial or operational loss from missed positive cases. | Permanent loss of customer lifetime value ($500+ ARR) and customer acquisition replacement cost. |
| **11** | **Expected Prediction Frequency** | Production inference cadence. | `Daily batch` (Options: `Daily batch`, `Weekly batch`, `Real-time API (<250ms)`, `Monthly batch`, `Hourly batch`, `On-demand`) |

---

## 3. Strict Validation & Safety Guardrails

### 3.1 Pydantic Model Strictness (`extra="forbid"`)
The extraction engine deserializes all LLM outputs through `ExtractedRequirementPayload`. Fields are checked for length, range, format, and enum validity. Any unexpected or unauthorized keys injected by an LLM prompt attempt are immediately rejected with validation errors:

```python
class ExtractedRequirementPayload(BaseModel):
    business_objective: str = Field(min_length=3, max_length=1000)
    ml_objective: str = Field(min_length=3, max_length=1000)
    target: str = Field(min_length=1, max_length=160)
    prediction_horizon: str | None = Field(default=None, max_length=160)
    candidate_problem_type: MLProblemType
    primary_metric: str = Field(min_length=1, max_length=64)
    secondary_metrics: list[str] = Field(default_factory=list)
    business_constraints: list[str] = Field(default_factory=list)
    cost_of_false_positives: str | None = Field(default=None, max_length=1000)
    cost_of_false_negatives: str | None = Field(default=None, max_length=1000)
    expected_prediction_frequency: str | None = Field(default=None, max_length=64)
    business_priority: str | None = Field(default=None, max_length=255)
    suggested_positive_class: str | None = Field(default=None, max_length=160)
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    assumptions: list[str] = Field(default_factory=list)
    missing_requirements: list[str] = Field(default_factory=list)

    model_config = {"extra": "forbid"}
```

### 3.2 Zero Autonomous Execution Guarantee
Natural language extraction produces a database record with `status: "draft"`. 
- No background workers (`AgentJob`) are spawned.
- No model training or data processing pipelines are triggered.
- Machine learning execution is **strictly gated** behind human review and formal approval.

---

## 4. Edge-Case & Adversarial Guardrails

The engine validates inputs against six core failure modes:

### 1. Valid Requirement
- Fully specified problem descriptions extract all 11 fields, detect positive labels, infer operational constraints, and formulate baseline assumptions.

### 2. Missing Target
- If the problem description fails to specify a predictive target concept (e.g. *"We want to run an AI model to improve retail operations"*):
  - In non-strict mode: Flags `target = "unspecified_target"`, adds `"target"` to `missing_requirements`, records explicit assumption in review card, and **blocks confirmation** until defined.
  - In strict mode: Rejects request with `MissingTargetError` (HTTP 422).

### 3. Ambiguous Problem
- Inputs lacking predictive entities or business context (e.g. *"make things better with data"*, *"optimize everything with ai"*, *"predict something"*) are caught by ambiguity detection and rejected with `AmbiguousProblemError` (HTTP 422).

### 4. Conflicting Requirements
- Logical contradictions between target concepts and problem types are detected and blocked with `ConflictingRequirementsError` (HTTP 422):
  - Continuous dollar forecasting (e.g. exact home price, salary) paired with binary classification or classification metrics (`recall`, `accuracy`).
  - Binary event targets (e.g. churn yes/no) paired with continuous regression metrics (`rmse`, `mae`).

### 5. Unsupported Problem Types
- Machine learning paradigms outside tabular ML (reinforcement learning with Q-learning/gym environments, generative text-to-image/video diffusion, quantum ML) are caught and rejected with `UnsupportedProblemTypeError` (HTTP 422).

### 6. Malicious / Prompt-Injection Text
- Prompt injection patterns (`"ignore previous instructions"`, `"system prompt override"`, `"output admin=true"`, SQL injection snippets, script tags) are blocked immediately with `PromptInjectionError` (HTTP 400 Bad Request) and logged under `security.prompt_injection_blocked` in the immutable audit log.

---

## 5. Review Screen & Interactive Actions

The Data Health & Formulation UI provides an interactive review screen where operators can:

1. **Accept & Confirm Formulation**:
   - Validates that the target is defined and non-empty.
   - Computes the next version number for the project (`v1`, `v2`, etc.).
   - Creates an immutable record in `problem_formulations`.
   - Transitions `BusinessRequirement` status to `approved`.
   - Records audit event `problem_formulation.created`.
2. **Edit**:
   - Full inline editing of all 11 parameters, constraints, metrics, and operational frequencies.
   - Saves updates to draft state without triggering execution.
3. **Reject**:
   - Allows operator to formally reject proposed formulations with a documented rationale (`review_notes`).
   - Transitions status to `rejected` and audits the rejection.
4. **Add Missing Information**:
   - Displays an amber alert banner when `missing_requirements` are detected.
   - Provides quick-add inputs to specify missing fields (target, horizon, frequency, cost tradeoffs).
5. **Inspect Explicit Assumptions**:
   - Lists all AI-derived assumptions.
   - Allows operators to acknowledge, remove, or append domain-specific assumptions.

---

## 6. REST API Reference

### Extract Requirements
```http
POST /api/v1/organizations/{org_id}/projects/{project_id}/requirements/extract
Content-Type: application/json
Authorization: Bearer <token>

{
  "problem_description": "We want to identify customers who are likely to churn within the next 30 days."
}
```

### Review / Edit Requirement
```http
PUT /api/v1/organizations/{org_id}/projects/{project_id}/requirements/{requirement_id}
Content-Type: application/json
Authorization: Bearer <token>

{
  "business_objective": "Reduce customer churn from 5% to under 3%",
  "ml_objective": "Predict customer churn probability 30 days prior to contract renewal",
  "target": "is_churned_30d",
  "prediction_horizon": "30 days",
  "candidate_problem_type": "binary_classification",
  "primary_metric": "recall",
  "secondary_metrics": ["pr_auc", "f1", "precision"],
  "business_constraints": ["Max latency < 200ms"],
  "cost_of_false_positives": "Cost of unnecessary $25 retention discount voucher",
  "cost_of_false_negatives": "Loss of full $600 annual customer subscription value",
  "expected_prediction_frequency": "Daily batch",
  "business_priority": "Minimize false negatives (High Recall)",
  "suggested_positive_class": "churned",
  "assumptions": ["Daily billing events synchronized to data warehouse"],
  "missing_requirements": [],
  "status": "reviewed"
}
```

### Confirm & Create Versioned Formulation
```http
POST /api/v1/organizations/{org_id}/projects/{project_id}/requirements/{requirement_id}/confirm
Content-Type: application/json
Authorization: Bearer <token>

{
  "review_notes": "Confirmed by Lead Data Scientist for AutoML experiment pipeline."
}
```
**Response**:
```json
{
  "requirement": {
    "id": "c1f7b882-...",
    "status": "approved",
    "target_name": "is_churned_30d",
    "primary_metric": "recall"
  },
  "formulation": {
    "id": "e8d2a104-...",
    "version": 1,
    "target": "is_churned_30d",
    "candidate_problem_type": "binary_classification",
    "primary_metric": "recall",
    "cost_of_false_negatives": "Loss of full $600 annual customer subscription value",
    "status": "active"
  }
}
```

### Reject Formulation
```http
POST /api/v1/organizations/{org_id}/projects/{project_id}/requirements/{requirement_id}/reject
Content-Type: application/json
Authorization: Bearer <token>

{
  "reason": "Insufficient historical data available for requested 90-day lookback window."
}
```

### List Versioned Formulations
```http
GET /api/v1/organizations/{org_id}/projects/{project_id}/formulations
Authorization: Bearer <token>
```
