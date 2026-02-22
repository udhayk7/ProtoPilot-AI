"""
Strategist agent: SOW + PRD generator.
Transforms raw startup ideas into structured solution_brief, statement_of_work, product_requirements.
No pricing, cost, or revenue. Output validated against StrategistOutput.
"""

from __future__ import annotations

import json
from typing import Any

from core.schemas import StrategistOutput
from core.validators import safe_parse_json, validate_agent_output
from orchestration.state import IdeaState

SYSTEM_PROMPT = """You are an executive technical strategist. Produce a professional SOW and PRD only.

STRICT RULES:
- Return ONLY valid JSON. No markdown, no code fences, no commentary.
- Output is short, bullet-based, executive-level. No paragraph longer than 2 lines.
- Do NOT mention pricing, cost, revenue, or business model.
- All fields must be present. Use empty strings or empty arrays if unknown.
- feasibility_score is an integer 0–100.
- Keep solution_brief, statement_of_work, and product_requirements concise and scannable."""

CTO_REQUIRED_KEYS = [
    "solution_brief",
    "statement_of_work",
    "product_requirements",
]

USER_PROMPT_TEMPLATE = """Idea:
Problem: {problem_statement}
Target audience: {target_audience}
Key features: {key_features}

Preferences (use where relevant):
- Frontend: {preferred_frontend}
- Backend: {preferred_backend}
- Database: {preferred_database}
- AI: {preferred_ai_model}
- Deployment: {deployment_preference}
- Scalability: {scalability_level}

Return JSON only, this exact structure:

{{
  "solution_brief": {{
    "problem_summary": "",
    "solution_overview": [],
    "target_users": [],
    "key_differentiators": []
  }},
  "statement_of_work": {{
    "scope_of_work": [],
    "in_scope_deliverables": [],
    "out_of_scope": [],
    "assumptions": [],
    "milestones": [
      {{ "phase": "", "description": "", "deliverables": [] }}
    ],
    "acceptance_criteria": []
  }},
  "product_requirements": {{
    "functional_requirements": [],
    "non_functional_requirements": [],
    "architecture_summary": "",
    "tech_stack": {{
      "frontend": "",
      "backend": "",
      "database": "",
      "ai_components": "",
      "deployment": ""
    }},
    "success_metrics": []
  }},
  "feasibility_score": 0
}}"""


def _build_user_prompt(state: IdeaState) -> str:
    return USER_PROMPT_TEMPLATE.format(
        problem_statement=state.problem_statement or state.idea or "",
        target_audience=state.target_audience or "",
        key_features=state.key_features or "",
        preferred_frontend=state.preferred_frontend or "Any",
        preferred_backend=state.preferred_backend or "Any",
        preferred_database=state.preferred_database or "Any",
        preferred_ai_model=state.preferred_ai_model or "None",
        deployment_preference=state.deployment_preference or "Any",
        scalability_level=state.scalability_level or "standard",
    )


def _mock_response(state: IdeaState) -> dict[str, Any]:
    """Return valid StrategistOutput-shaped JSON from state."""
    problem = (state.problem_statement or state.idea or "").strip() or "To be defined"
    target = (state.target_audience or "").strip() or "To be defined"
    features_str = (state.key_features or "").strip()
    solution_overview = [f.strip() for f in features_str.split(",") if f.strip()] if features_str else ["Core value to be defined"]
    return {
        "solution_brief": {
            "problem_summary": problem[:400],
            "solution_overview": solution_overview[:8],
            "target_users": [target] if target else ["To be defined"],
            "key_differentiators": [],
        },
        "statement_of_work": {
            "scope_of_work": ["MVP scope to be defined with stakeholder."],
            "in_scope_deliverables": ["Working MVP", "Documentation"],
            "out_of_scope": [],
            "assumptions": ["Requirements may be refined."],
            "milestones": [
                {"phase": "Phase 1", "description": "Discovery & design", "deliverables": ["Spec", "Wireframes"]},
                {"phase": "Phase 2", "description": "Build MVP", "deliverables": ["Core features", "Tests"]},
            ],
            "acceptance_criteria": ["MVP meets core requirements."],
        },
        "product_requirements": {
            "functional_requirements": solution_overview[:5],
            "non_functional_requirements": ["Performance", "Security"],
            "architecture_summary": "Standard web stack; scale as needed.",
            "tech_stack": {
                "frontend": state.preferred_frontend or "Next.js",
                "backend": state.preferred_backend or "FastAPI",
                "database": state.preferred_database or "PostgreSQL",
                "ai_components": state.preferred_ai_model or "None",
                "deployment": state.deployment_preference or "Cloud",
            },
            "success_metrics": ["Launch MVP", "User feedback"],
        },
        "feasibility_score": 65,
    }


class Strategist:
    """Strategist agent: SOW + PRD. Returns valid JSON; pipeline validates against output_schema."""

    name = "strategist"
    output_schema = StrategistOutput

    async def process(self, state: IdeaState) -> str:
        """Call LLM (OpenRouter) or mock; parse, validate; return JSON string."""
        import os
        cto_key = (os.environ.get("OPENROUTER_CTO_KEY") or os.environ.get("OPENROUTER_API_KEY") or "").strip()
        if not cto_key:
            out = _mock_response(state)
            return json.dumps(out)

        user_prompt = _build_user_prompt(state)
        from core.llm_client import generate
        cto_model = (os.environ.get("OPENROUTER_CTO_MODEL") or os.environ.get("OPENROUTER_MODEL") or "").strip() or "openai/gpt-oss-120b"
        raw = await generate(user_prompt, system_prompt=SYSTEM_PROMPT, api_key=cto_key, model=cto_model)

        parsed = safe_parse_json(raw)
        if not parsed:
            raise ValueError("Invalid JSON from LLM")

        for key in CTO_REQUIRED_KEYS:
            if key not in parsed:
                raise ValueError(f"Missing key: {key}")

        validated = validate_agent_output(parsed, self.output_schema, agent_name=self.name)
        return json.dumps(validated.model_dump())
