"""Business Requirement Extraction Service.

Extracts structured machine learning formulations from natural language problem descriptions.
Validates all outputs against Pydantic models with extra="forbid".
Guarantees zero autonomous execution triggered by LLM outputs.
Explicitly identifies and exposes assumptions and missing business requirements.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.requirements.schemas import ExtractedRequirementPayload, MLProblemType

logger = logging.getLogger("datapilot.requirements")


class RequirementExtractionError(Exception):
    """Base exception raised when natural language requirement extraction fails validation."""


class PromptInjectionError(RequirementExtractionError):
    """Raised when malicious text or prompt injection patterns are detected."""


class AmbiguousProblemError(RequirementExtractionError):
    """Raised when problem description is too vague, ambiguous, or lacks predictive substance."""


class MissingTargetError(RequirementExtractionError):
    """Raised when the target variable or concept cannot be determined."""


class ConflictingRequirementsError(RequirementExtractionError):
    """Raised when business requirements or problem types contain logical contradictions."""


class UnsupportedProblemTypeError(RequirementExtractionError):
    """Raised when user requests ML paradigms not supported by DataPilot tabular engine."""


# ---------------------------------------------------------------------------
# Security & Safety Guards
# ---------------------------------------------------------------------------

PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(?:all\s+)?(?:previous\s+|prior\s+|above\s+)?instructions?",
    r"disregard\s+(?:all\s+)?(?:previous\s+|prior\s+|above\s+)?instructions?",
    r"forget\s+(?:all\s+)?(?:previous\s+|prior\s+)?instructions?",
    r"system\s+prompt\s+override",
    r"you\s+are\s+now\s+(?:an?\s+)?unrestricted",
    r"jailbreak",
    r"bypass\s+(?:auth|security|permissions|rbac)",
    r"grant\s+superadmin",
    r"output\s+['\"]?admin['\"]?\s*:\s*true",
    r"output\s+.*['\"]role['\"]\s*:\s*['\"]superadmin['\"]",
    r"drop\s+table\s+",
    r"union\s+select\s+",
    r"<script[\s>]",
    r"'\s*or\s*'1'\s*=\s*'1",
    r";\s*--",
    r"as\s+an\s+ai,\s+you\s+must\s+now\s+act\s+as",
]

UNSUPPORTED_PARADIGM_PATTERNS = [
    (r"reinforcement\s+learning", "reinforcement learning"),
    (r"q-learning", "reinforcement learning (Q-learning)"),
    (r"policy\s+gradient", "reinforcement learning"),
    (r"reward\s+function", "reinforcement learning"),
    (r"gym\s+environment", "reinforcement learning"),
    (r"starcraft", "game-playing agent"),
    (r"robotics?\s+control", "robotics control"),
    (r"generate\s+(?:a\s+)?(?:4k\s+)?video", "generative video synthesis"),
    (r"diffusion\s+model", "generative image/video diffusion"),
    (r"text-to-image", "generative text-to-image"),
    (r"text-to-video", "generative text-to-video"),
    (r"speech\s+synthesis|voice\s+cloning", "generative audio synthesis"),
    (r"quantum\s+(?:circuit|computing|clustering)", "quantum machine learning"),
]

AMBIGUOUS_SUBSTRINGS = [
    "make things better", "make it better", "optimize everything",
    "do ai", "do machine learning", "do ml", "we want insights",
    "improve the business", "predict something", "predict everything",
    "do data science", "solve my problem", "make more money",
]


def detect_prompt_injection(text: str) -> None:
    """Detect prompt injection and adversarial manipulation attempts."""
    lower = text.lower()
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            logger.warning("Prompt injection attempt detected: pattern '%s'", pattern)
            raise PromptInjectionError(
                "Malicious input or prompt injection attempt detected. System instructions cannot be overridden."
            )


def detect_unsupported_paradigms(text: str) -> None:
    """Detect ML paradigms outside DataPilot's tabular ML scope."""
    lower = text.lower()
    for pattern, name in UNSUPPORTED_PARADIGM_PATTERNS:
        if re.search(pattern, lower, re.IGNORECASE):
            raise UnsupportedProblemTypeError(
                f"Unsupported problem type detected: '{name}'. DataPilot specializes in tabular machine learning "
                f"(binary classification, multiclass classification, regression, and time series)."
            )


def detect_ambiguity(text: str) -> None:
    """Detect overly ambiguous or content-free descriptions."""
    clean = text.strip()
    if len(clean) < 10:
        raise AmbiguousProblemError("Problem description is too short to formulate a valid ML specification.")

    lower = clean.lower()
    normalized = re.sub(r"[^\w\s]", "", lower)
    normalized = " ".join(normalized.split())

    # Check against known ambiguous buzzword patterns
    for phrase in AMBIGUOUS_SUBSTRINGS:
        if phrase in normalized:
            # If the user also specifies a concrete domain target (e.g. churn or fraud), it's not ambiguous
            if not any(k in lower for k in ("churn", "fraud", "default", "revenue", "sales", "attrition", "support ticket")):
                raise AmbiguousProblemError(
                    f"Ambiguous problem description ('{clean}'): lacks a concrete business outcome or predictive entity. "
                    f"Please specify what you wish to predict or optimize."
                )

    # Check meaningful token count
    tokens = re.findall(r"\b[a-zA-Z]{3,}\b", lower)
    stop_words = {"the", "and", "our", "for", "with", "this", "that", "want", "like", "from", "data", "using"}
    meaningful = [t for t in tokens if t not in stop_words]
    if len(meaningful) < 2:
        raise AmbiguousProblemError(
            "Ambiguous problem description: insufficient business domain context to formulate predictive requirements."
        )


def detect_conflicts(
    text: str,
    problem_type: MLProblemType,
    primary_metric: str,
    target: str,
) -> None:
    """Detect logical contradictions between target nature, problem type, and metric."""
    lower = text.lower()

    # Conflict 1: Continuous monetary / numeric values paired with binary classification or recall/accuracy
    continuous_patterns = [
        r"\b(?:exact\s+)?price\b", r"\bdollar(?:s)?\b", r"\brevenue\b", r"\bcontinuous\b",
        r"\bsalary\b", r"\bexact\s+cost\b", r"\blifetime\s+value\b", r"\bclv\b", r"\bltv\b",
    ]
    classification_patterns = [
        r"\bbinary\s+classification\b", r"\bclassification\b", r"\brecall\b",
        r"\bprecision\b", r"\baccuracy\b", r"\broc_auc\b",
    ]

    has_continuous = any(re.search(pat, lower) for pat in continuous_patterns)
    has_classification = any(re.search(pat, lower) for pat in classification_patterns)

    if has_continuous and has_classification and (
        problem_type == MLProblemType.BINARY_CLASSIFICATION or primary_metric in {"recall", "precision", "accuracy"}
    ):
        if any(w in lower for w in ["continuous", "dollar", "exact price", "salary"]):
            raise ConflictingRequirementsError(
                "Conflicting requirements: Continuous numerical prediction target (e.g. dollar value/price) "
                "cannot be formulated as binary classification with classification metrics (recall/accuracy)."
            )

    # Conflict 2: Discrete binary event target paired with regression RMSE/MAE
    discrete_binary_terms = ["churn yes/no", "binary churn", "fraud or not", "binary fraud", "will customer churn"]
    regression_metric_terms = ["rmse", "mean squared error", "mae", "r2"]

    has_discrete = any(t in lower for t in discrete_binary_terms)
    has_reg_metric = any(t in lower for t in regression_metric_terms)

    if has_discrete and has_reg_metric:
        raise ConflictingRequirementsError(
            "Conflicting requirements: Discrete binary event target (e.g. churn yes/no) "
            "cannot be evaluated with regression metrics (RMSE/MAE) or formulated as continuous regression."
        )


# ---------------------------------------------------------------------------
# Information Extraction Logic
# ---------------------------------------------------------------------------

def _extract_prediction_horizon(text: str) -> str | None:
    """Detect time horizon phrases (e.g. 'next 30 days', 'within 3 months', 'quarterly')."""
    patterns = [
        r"(?:within|in|over|for)\s+(?:the\s+)?(?:next\s+)?(\d+\s+(?:days?|weeks?|months?|years?|hours?))",
        r"(?:next|upcoming)\s+(\d+\s+(?:days?|weeks?|months?|years?|hours?))",
        r"(?:next|upcoming)\s+(quarter|month|year|week)",
        r"(\d+[- ]days?)",
    ]
    for pat in patterns:
        match = re.search(pat, text, re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _extract_target(text: str) -> str | None:
    """Extract target variable or predictive concept from natural language."""
    lower = text.lower()

    target_map = [
        (r"\bchurn(?:ed|ing)?\b", "churn"),
        (r"\bfraud(?:ulent)?\b", "is_fraud"),
        (r"\bdefault(?:ed|ing)?\b", "defaulted"),
        (r"\battrition\b", "attrition"),
        (r"\bretention\b", "churn"),
        (r"\bconvert(?:ed|ing|ion)?\b", "converted"),
        (r"\bclick(?:ed|ing)?\b", "clicked"),
        (r"\brevenue\b", "revenue"),
        (r"\bsales\b", "sales_amount"),
        (r"\bprice\b", "price"),
        (r"\bdemand\b", "demand_volume"),
        (r"\blifetime\s+value\b|\bclv\b|\bltv\b", "customer_lifetime_value"),
        (r"\bticket(?:s)?\b|\bsupport\s+ticket", "ticket_category"),
        (r"\bsentiment\b", "sentiment"),
        (r"\bspend(?:ing)?\b", "spend_amount"),
        (r"\breadmission\b", "hospital_readmission"),
    ]

    for pat, label in target_map:
        if re.search(pat, lower):
            return label

    # Fallback heuristic: check for phrases like "predict <noun>" or "identify <noun>"
    match = re.search(r"(?:predict|forecast|identify|estimate)\s+(?:the\s+)?([a-z_]{3,30})", lower)
    if match:
        noun = match.group(1).strip()
        if noun not in {"which", "who", "customers", "users", "items", "entities", "likely", "whether"}:
            return noun

    return None


def _heuristic_rule_extractor(text: str, strict_target: bool = False) -> dict[str, Any]:
    """Deterministic NLP extractor serving as a reliable engine and offline fallback."""
    lower = text.lower()
    horizon = _extract_prediction_horizon(text)
    target = _extract_target(text)

    assumptions: list[str] = []
    missing_requirements: list[str] = []

    # 1. Target Validation
    if not target:
        if strict_target:
            raise MissingTargetError(
                "Target variable is missing or unspecified in the problem description. "
                "Please indicate what outcome or variable you want to predict."
            )
        target = "unspecified_target"
        missing_requirements.append("target")
        assumptions.append(
            "Target variable was not explicitly named in the description and must be specified during review."
        )

    # 2. Determine ML Problem Type with exact word boundaries
    regression_keywords = (
        r"\bhow\s+much\b", r"\bprice\b", r"\brevenue\b", r"\bsales\b", r"\bcost\b",
        r"\bdemand\b", r"\bcount\b", r"\bspend\b", r"\bforecast\b",
        r"\bamount\b", r"\bduration\b", r"\btime\s+to\b", r"\bquantity\b", r"\bsalary\b",
        r"\bmargin\b", r"\bloss\s+amount\b", r"\blifetime\s+value\b", r"\bclv\b", r"\bltv\b",
    )
    multiclass_keywords = (
        r"\bcategory\b", r"\bcategories\b", r"\bcategorize\b", r"\bsegment\b", r"\bpriority\b",
        r"\bmulti-class\b", r"\bmulticlass\b", r"\btriage\b", r"\btopic\b", r"\bsentiment\b",
        r"\bclasses\b", r"\broute\b", r"\brouting\b", r"\bdepartment\b",
    )
    binary_keywords = (
        r"\bchurn\b", r"\bfraud\b", r"\bdefault\b", r"\battrition\b", r"\bclick\b",
        r"\bconvert\b", r"\bretention\b", r"\bbinary\b", r"\breadmission\b",
    )

    is_binary = any(re.search(kw, lower) for kw in binary_keywords)
    is_multiclass = any(re.search(kw, lower) for kw in multiclass_keywords) and not is_binary
    is_regression = any(re.search(kw, lower) for kw in regression_keywords) and not is_binary and not is_multiclass

    suggested_positive: str | None = None
    cost_fp: str | None = None
    cost_fn: str | None = None
    expected_freq: str = "Daily batch"
    business_priority: str = "Balance precision and recall (F1)"

    if is_multiclass:
        problem_type = MLProblemType.MULTICLASS_CLASSIFICATION
        primary_metric = "log_loss"
        secondary_metrics = ["accuracy", "f1_macro", "precision_macro"]
        business_priority = "Maximize multi-class categorization accuracy"
        cost_fp = "Misrouted category re-triage latency and human operator reassignment cost"
        cost_fn = "Delayed resolution of critical priority or urgent ticket classifications"
        business_objective = f"Automate categorization and routing of {target} to streamline operational workflows."
        prediction_objective = f"Assign the most probable class category for {target}."
    elif is_regression:
        problem_type = MLProblemType.REGRESSION
        primary_metric = "rmse"
        secondary_metrics = ["mae", "r2", "mape"]
        business_priority = "Minimize mean absolute forecast error (MAE)"
        cost_fp = "Over-allocation of inventory, budget, or resources resulting from over-prediction"
        cost_fn = "Stockout loss, unmet customer demand, or emergency procurement rush cost"
        business_objective = f"Optimize planning, budgeting, and resource allocation through accurate forecasting of {target}."
        if horizon:
            prediction_objective = f"Estimate the expected continuous numerical value of {target} for {horizon}."
        else:
            prediction_objective = f"Estimate the continuous numerical value of {target}."
    else:
        # Binary classification
        problem_type = MLProblemType.BINARY_CLASSIFICATION

        if any(re.search(p, lower) for p in [r"\brecall\b", r"\bfalse\s+negative\b", r"\bchurn\b", r"\bfraud\b", r"\bdefault\b"]):
            primary_metric = "recall"
            business_priority = "Minimize false negatives (High Recall)"
        else:
            primary_metric = "roc_auc"
            business_priority = "Maximize discriminative ranking (ROC-AUC)"

        secondary_metrics = ["roc_auc", "precision", "f1", "pr_auc"]
        suggested_positive = "positive_event"

        if "churn" in target or "attrition" in target:
            suggested_positive = "churned"
            business_objective = "Reduce customer churn to protect recurring revenue."
            cost_fp = "Unnecessary retention incentive discount cost ($25-$50) or customer outreach fatigue"
            cost_fn = "Permanent loss of customer lifetime value ($500+ ARR)"
        elif "fraud" in target:
            suggested_positive = "fraudulent"
            business_objective = "Minimize financial losses and chargebacks from unauthorized fraudulent transactions."
            cost_fp = "Customer friction or false decline on high-value legitimate purchases"
            cost_fn = "Direct unrecoverable chargeback loss, reimbursement payout, and network fees"
        elif "default" in target:
            suggested_positive = "defaulted"
            business_objective = "Proactively mitigate credit default losses across the loan portfolio."
            cost_fp = "Lost interest revenue from rejecting a creditworthy applicant"
            cost_fn = "Unrecoverable loan principal write-off and collection agency legal expenses"
        else:
            business_objective = f"Proactively identify entities likely to {target} to enable targeted operational intervention."
            cost_fp = "Operational intervention cost on false alarms"
            cost_fn = "Business loss resulting from missed positive events"

        if horizon:
            prediction_objective = f"Predict the probability that an entity will {target} within {horizon}."
        else:
            prediction_objective = f"Predict whether an entity will {target}."

    # 3. Check for Prediction Horizon
    if not horizon:
        horizon = "30 days"
        missing_requirements.append("prediction_horizon")
        assumptions.append("Defaulted prediction horizon to 30 days based on monthly business cycle.")
    else:
        assumptions.append(f"Derived prediction lead time of {horizon} directly from problem text.")

    # 4. Check for Frequency
    if "daily" in lower:
        expected_freq = "Daily batch"
    elif "weekly" in lower:
        expected_freq = "Weekly batch"
    elif "real-time" in lower or "realtime" in lower or "stream" in lower or "instant" in lower:
        expected_freq = "Real-time API (<250ms)"
    elif "monthly" in lower:
        expected_freq = "Monthly batch"
    else:
        missing_requirements.append("expected_prediction_frequency")
        assumptions.append("Assumed expected prediction frequency is Daily batch for operational workflow.")

    # 5. Check for Cost Tradeoffs in prompt
    if not any(kw in lower for kw in ("cost", "dollar", "loss", "expensive", "false positive", "false negative")):
        missing_requirements.append("cost_tradeoffs")
        assumptions.append(
            f"Assumed standard cost asymmetry for {problem_type.value}: false negative cost exceeds false positive cost."
        )

    # 6. Operational Constraints
    constraints = [
        "Inference latency must satisfy operational SLA for downstream consumption",
        "Predictions require feature attribution explanations (SHAP) for stakeholder compliance",
        f"Model training must strictly prevent data leakage beyond the {horizon} observation point",
    ]

    # Check for conflicts
    detect_conflicts(text, problem_type, primary_metric, target)

    return {
        "business_objective": business_objective,
        "ml_objective": prediction_objective,
        "prediction_objective": prediction_objective,
        "target": target,
        "target_name": target,
        "prediction_horizon": horizon,
        "candidate_problem_type": problem_type,
        "ml_problem_type": problem_type,
        "primary_metric": primary_metric,
        "secondary_metrics": secondary_metrics,
        "business_constraints": constraints,
        "cost_of_false_positives": cost_fp,
        "cost_of_false_negatives": cost_fn,
        "expected_prediction_frequency": expected_freq,
        "business_priority": business_priority,
        "suggested_positive_class": suggested_positive,
        "confidence_score": 0.95,
        "assumptions": assumptions,
        "missing_requirements": missing_requirements,
    }


def validate_llm_json(raw_json: str) -> ExtractedRequirementPayload:
    """Validate raw LLM JSON response against ExtractedRequirementPayload with extra='forbid'."""
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw_json.strip())
    cleaned = re.sub(r"\s*```$", "", cleaned).strip()

    try:
        parsed = json.loads(cleaned)
    except Exception as err:
        raise RequirementExtractionError(f"LLM output could not be parsed as valid JSON: {err}") from err

    try:
        return ExtractedRequirementPayload.model_validate(parsed)
    except Exception as err:
        raise RequirementExtractionError(f"LLM output failed Pydantic schema validation: {err}") from err


def extract_requirements(
    problem_description: str,
    raw_llm_json: str | None = None,
    strict_target: bool = False,
) -> ExtractedRequirementPayload:
    """Extract and strictly validate structured ML problem requirements from natural language.

    1. Checks for prompt injection and malicious security attacks.
    2. Checks for unsupported ML paradigms.
    3. Checks for ambiguous or empty descriptions.
    4. If raw LLM JSON is supplied, validates strictly through Pydantic.
    5. Runs deterministic NLP rule extraction.
    6. Ensures zero free-form output directly controls ML execution.
    """
    clean_text = problem_description.strip()

    # Step 1: Security guard - prompt injection
    detect_prompt_injection(clean_text)

    # Step 2: Paradigm guard - unsupported ML problems
    detect_unsupported_paradigms(clean_text)

    # Step 3: Ambiguity guard - vague buzzwords
    detect_ambiguity(clean_text)

    # Step 4: If LLM JSON override provided, validate
    if raw_llm_json:
        return validate_llm_json(raw_llm_json)

    # Step 5: Deterministic NLP extraction
    extracted_dict = _heuristic_rule_extractor(clean_text, strict_target=strict_target)

    # Step 6: Validate through Pydantic with extra="forbid"
    try:
        return ExtractedRequirementPayload.model_validate(extracted_dict)
    except Exception as err:
        raise RequirementExtractionError(f"Failed to validate extracted requirements: {err}") from err
