"""
Generate clean ASCII architecture diagram via OpenRouter (openai/gpt-oss-120b).
Uses strategy data for tech stack; no markdown, no backticks, max 60 lines.
"""

from __future__ import annotations

import json
import os
import re

from core.llm_client import generate as llm_generate

ARCHITECTURE_SYSTEM_PROMPT = """You are an enterprise system architect. Your only output is a clean ASCII diagram.

RULES:
- Output ONLY the diagram. No explanations, no preamble, no markdown, no code fences, no backticks.
- Use box-drawing characters: ┌ ─ ┐ │ └ ┴ ┬ ├ ┤ ▼ ▲
- Max 60 lines. Keep it readable.
- Include: End Users / Clients, API Gateway or Auth layer (JWT/validation), Backend Application, Data layer (DB, cache, storage as needed).
- If AI/LLM is in the tech stack, add an AI processing node.
- If scalability is "high", add a scaling/load-balancing layer.
- Reflect the exact frontend, backend, database, and deployment from the input.
- Clean, enterprise-style system diagram. No decorative text."""

USER_TEMPLATE = """Tech stack and context:
- Frontend: {frontend}
- Backend: {backend}
- Database: {database}
- AI components: {ai_components}
- Deployment: {deployment}
- Scalability: {scalability}

Generate a single ASCII architecture diagram that reflects this stack. Include security (JWT/Auth), and scaling layer only if scalability is high. Include AI node only if AI components are specified."""


def _extract_tech_from_strategy(strategy_data: dict) -> dict:
    """Get tech stack and context from strategy JSON (product_requirements.tech_stack)."""
    pr = strategy_data.get("product_requirements") or {}
    ts = pr.get("tech_stack") or {}
    return {
        "frontend": ts.get("frontend") or "Web/Mobile",
        "backend": ts.get("backend") or "Backend",
        "database": ts.get("database") or "Database",
        "ai_components": ts.get("ai_components") or "None",
        "deployment": ts.get("deployment") or "Cloud",
    }


def _clean_diagram(raw: str) -> str:
    """Remove markdown/code fences and trim to 60 lines."""
    s = raw.strip()
    for pattern in [r"^```\w*\n?", r"\n?```\s*$", r"^`+", r"`+\s*$"]:
        s = re.sub(pattern, "", s)
    s = s.strip()
    lines = s.split("\n")
    if len(lines) > 60:
        lines = lines[:60]
    return "\n".join(lines).strip()


async def generate_architecture_diagram(
    strategy_data: dict,
    *,
    scalability_level: str | None = None,
) -> str:
    """
    Call OpenRouter with model=openai/gpt-oss-120b; return clean ASCII diagram.
    strategy_data: parsed enhanced_idea (solution_brief, statement_of_work, product_requirements).
    """
    tech = _extract_tech_from_strategy(strategy_data)
    scalability = (scalability_level or "").strip().lower() or "standard"
    user_prompt = USER_TEMPLATE.format(
        frontend=tech["frontend"],
        backend=tech["backend"],
        database=tech["database"],
        ai_components=tech["ai_components"],
        deployment=tech["deployment"],
        scalability=scalability,
    )
    api_key = (
        os.environ.get("OPENROUTER_CTO_KEY") or os.environ.get("OPENROUTER_API_KEY") or ""
    ).strip()
    if not api_key:
        raise RuntimeError("OpenRouter API key not set (OPENROUTER_CTO_KEY or OPENROUTER_API_KEY)")

    raw = await llm_generate(
        user_prompt,
        system_prompt=ARCHITECTURE_SYSTEM_PROMPT,
        model="openai/gpt-oss-120b",
        api_key=api_key,
        max_tokens=2048,
    )
    return _clean_diagram(raw)
