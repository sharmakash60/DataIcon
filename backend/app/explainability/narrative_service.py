"""LLM narrative service for explainability.

STRICT PROVENANCE RULES:
1. This service ONLY generates narrative TEXT for the ai_narrative block.
2. It CANNOT modify, override, or fabricate any numeric model facts.
3. The LLM is given model-derived facts as READ-ONLY context.
4. All output is tagged source='ai_generated' and carries a mandatory warning.
5. Numeric claims in LLM output are stripped / rejected by the sanitizer.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any, Dict, Optional

from app.config import Settings


# Patterns that indicate a numeric claim being fabricated by the LLM
# If these appear in the narrative, they are replaced with a safe warning.
_NUMERIC_CLAIM_PATTERN = re.compile(
    r"\b(accuracy|roc_auc|roc-auc|auc|roc|f1|rmse|mae|precision|recall|score|r2|loss)\s*[:=of\s]+\s*\d+\.?\d*%?",
    re.IGNORECASE,
)

_NUMERIC_OVERRIDE_WARNING = (
    "[Numeric claim removed — model-derived values are authoritative. "
    "See the report's model_derived sections for exact figures.]"
)


def _sanitize_narrative(text: str) -> str:
    """Strip any numeric claim patterns the LLM might have fabricated."""
    return _NUMERIC_CLAIM_PATTERN.sub(_NUMERIC_OVERRIDE_WARNING, text)


def _build_prompt(
    global_shap: Optional[Dict[str, Any]],
    error_analysis: Optional[Dict[str, Any]],
    model_name: str,
    problem_type: str,
    target_name: str,
    primary_metric: str,
    primary_metric_value: float,
    user_context: str,
) -> str:
    """Build a safe, grounded prompt for the LLM.

    The prompt:
    - Provides model-derived facts as READ-ONLY context.
    - Explicitly prohibits the LLM from inventing numeric metrics.
    - Asks for qualitative business interpretation only.
    """
    top_features = []
    if global_shap and global_shap.get("features"):
        top_features = [
            f["feature_name"]
            for f in sorted(global_shap["features"], key=lambda x: x.get("importance_rank", 999))[:5]
        ]

    worst_segs = []
    if error_analysis and error_analysis.get("worst_segments"):
        worst_segs = [
            f"{s['feature_name']}={s['segment_label']}"
            for s in error_analysis["worst_segments"][:3]
        ]

    prompt = f"""You are a senior data scientist providing business-level interpretation of an ML model.

## READ-ONLY MODEL FACTS (do not repeat, invent, or override these numbers)
- Model: {model_name}
- Problem: {problem_type}
- Target: {target_name}
- Primary metric ({primary_metric}): {primary_metric_value:.4f}
- Top 5 important features (by mean |SHAP|): {', '.join(top_features) if top_features else 'N/A'}
- Highest-error segments: {', '.join(worst_segs) if worst_segs else 'None identified'}

## USER CONTEXT
{user_context or 'No additional context provided.'}

## YOUR TASK
Write THREE short paragraphs (3–5 sentences each):
1. GLOBAL_IMPORTANCE: Explain what the top features suggest about the model's decision-making in plain business language. Do NOT state or invent any metric numbers.
2. ERROR_ANALYSIS: Describe what the error segments indicate about model limitations or data distribution gaps, without inventing numbers.
3. BUSINESS_CONTEXT: Provide actionable recommendations based on the above, incorporating the user context if provided.

RULES:
- Do NOT state numeric metric values (the reader sees them in the report).
- Do NOT claim the model achieves any specific accuracy, AUC, F1, etc.
- Keep language accessible to business stakeholders.
- Mark any claim based on user context as an assumption, not a model fact.
"""
    return prompt


async def generate_ai_narrative(
    report_data: Dict[str, Any],
    user_context: str,
    settings: Settings,
) -> Optional[Dict[str, Any]]:
    """Call the LLM to generate a narrative, returning an ai_narrative dict.

    Returns None if no LLM key is configured or on failure.
    The returned dict has source='ai_generated' always.
    """
    api_key = getattr(settings, "openai_api_key", None) or getattr(settings, "gemini_api_key", None)
    if not api_key:
        return None

    prompt = _build_prompt(
        global_shap=report_data.get("global_shap"),
        error_analysis=report_data.get("error_analysis"),
        model_name=report_data.get("model_name", "Unknown"),
        problem_type=report_data.get("problem_type", "unknown"),
        target_name=report_data.get("target_name", "target"),
        primary_metric=report_data.get("primary_metric", "metric"),
        primary_metric_value=float(report_data.get("primary_metric_value", 0.0)),
        user_context=user_context,
    )

    model_id = "gpt-4o-mini"
    generated_at = datetime.now(UTC).isoformat()

    try:
        # Try OpenAI first
        if getattr(settings, "openai_api_key", None):
            import openai  # type: ignore
            client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
            response = await client.chat.completions.create(
                model=model_id,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a cautious data scientist. Never fabricate numeric metrics. "
                            "Provide only qualitative, grounded interpretation."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=600,
            )
            raw_text = response.choices[0].message.content or ""
        else:
            return None

        # Parse into three paragraphs
        paragraphs = [p.strip() for p in raw_text.strip().split("\n\n") if p.strip()]
        gi_narrative = _sanitize_narrative(paragraphs[0] if len(paragraphs) > 0 else "")
        ea_narrative = _sanitize_narrative(paragraphs[1] if len(paragraphs) > 1 else "")
        bc_narrative = _sanitize_narrative(paragraphs[2] if len(paragraphs) > 2 else "")

        return {
            "source": "ai_generated",
            "model_used": model_id,
            "generated_at": generated_at,
            "global_importance_narrative": gi_narrative,
            "error_analysis_narrative": ea_narrative,
            "business_context_narrative": bc_narrative,
            "warning": (
                "AI-generated text. Not a substitute for quantitative model facts. "
                "Numeric values in this report are model-derived and authoritative."
            ),
        }

    except Exception:
        return None
