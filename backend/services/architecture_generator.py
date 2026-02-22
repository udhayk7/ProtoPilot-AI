"""
Generate deterministic ASCII architecture diagram from project config.
No LLM. Tech-aware, port-accurate, scalability-aware.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

# Runtime ports (config)
PORT_MAIN_APP = 3000
PORT_DEMO_FRONTEND = 5180
PORT_DEMO_BACKEND = 8002

BOX_WIDTH = 36
INDENT = 16


@dataclass
class ProjectConfig:
    frontend: str = "React"
    backend: str = "FastAPI"
    database: str = "SQLite"
    ai_model: str = "None"
    deployment: str = "Vercel"
    scalability_level: str = "MVP"

    @classmethod
    def from_strategy_and_overrides(
        cls,
        strategy_data: dict,
        *,
        scalability_level: Optional[str] = None,
        preferred_frontend: Optional[str] = None,
        preferred_backend: Optional[str] = None,
        preferred_database: Optional[str] = None,
        preferred_ai_model: Optional[str] = None,
        deployment_preference: Optional[str] = None,
    ) -> "ProjectConfig":
        pr = strategy_data.get("product_requirements") or {}
        ts = pr.get("tech_stack") or {}
        return cls(
            frontend=(preferred_frontend or ts.get("frontend") or "React").strip() or "React",
            backend=(preferred_backend or ts.get("backend") or "FastAPI").strip() or "FastAPI",
            database=(preferred_database or ts.get("database") or "SQLite").strip() or "SQLite",
            ai_model=(preferred_ai_model or ts.get("ai_components") or ts.get("ai_model") or "None").strip() or "None",
            deployment=(deployment_preference or ts.get("deployment") or "Vercel").strip() or "Vercel",
            scalability_level=(scalability_level or "MVP").strip() or "MVP",
        )


def _has_ai(config: ProjectConfig) -> bool:
    v = (config.ai_model or "").lower()
    return v not in ("none", "no ai required", "")


def _has_docker(config: ProjectConfig) -> bool:
    v = (config.deployment or "").lower()
    return "docker" in v


def _is_high_scalability(config: ProjectConfig) -> bool:
    v = (config.scalability_level or "").lower()
    return v in ("high scale", "high", "enterprise grade", "enterprise")


def _pad(s: str, width: int) -> str:
    s = s[:width]
    return s + " " * (width - len(s))


def _box(title: str, subtitle: Optional[str] = None) -> list[str]:
    top = "┌" + "─" * (BOX_WIDTH + 2) + "┐"
    mid = "│ " + _pad(title, BOX_WIDTH) + " │"
    lines = [top, mid]
    if subtitle and subtitle.strip():
        lines.append("│ " + _pad(subtitle.strip(), BOX_WIDTH) + " │")
    lines.append("└" + "─" * (BOX_WIDTH + 2) + "┘")
    return lines


def _arrow() -> str:
    return " " * INDENT + " " * ((BOX_WIDTH + 2) // 2 - 1) + "▼"


def _indent_block(lines: list[str]) -> list[str]:
    pad = " " * INDENT
    return [pad + line for line in lines]


def generate_architecture(config: ProjectConfig) -> str:
    """
    Build ASCII architecture diagram deterministically from config.
    MVP: 3-tier only (End Users → Frontend → Backend → Database).
    High scalability: add API Gateway, Redis, Load Balancer, Worker Queue, Object Storage, Container.
    No Auth/JWT/API Gateway in MVP. No AI layer if ai_model is None. No container if Docker not selected.
    """
    out: list[str] = []
    indent = " " * INDENT

    # ---- End Users (always) ----
    out.extend(_indent_block(_box("End Users", f"(Browser - {PORT_DEMO_FRONTEND})")))
    out.append(_arrow())

    # ---- Frontend (always) ----
    out.extend(_indent_block(_box(f"{config.frontend} Frontend", f"(Vite - {PORT_DEMO_FRONTEND})")))
    out.append(_arrow())

    # ---- MVP: simple path to backend then database ----
    if not _is_high_scalability(config):
        out.extend(_indent_block(_box(f"{config.backend} Backend", f"(Port {PORT_DEMO_BACKEND})")))
        out.append(_arrow())
        out.extend(_indent_block(_box(f"{config.database} Database", "")))
        if _has_ai(config):
            out.append(_arrow())
            out.extend(_indent_block(_box("AI / LLM", config.ai_model)))
        return "\n".join(out)

    # ---- High scalability: API Gateway, then backend, then data layer ----
    out.extend(_indent_block(_box("Load Balancer", "")))
    out.append(_arrow())
    out.extend(_indent_block(_box("API Gateway", "")))
    out.append(_arrow())
    out.extend(_indent_block(_box(f"{config.backend} Backend", f"(Port {PORT_DEMO_BACKEND})")))
    out.append(_arrow())

    # Data layer: Redis, DB, Object Storage, Worker Queue
    out.extend(_indent_block(_box("Redis Cache", "")))
    out.append(_arrow())
    out.extend(_indent_block(_box(f"{config.database} Database", "")))
    out.append(_arrow())
    out.extend(_indent_block(_box("Object Storage", "")))
    out.append(_arrow())
    out.extend(_indent_block(_box("Worker Queue", "")))

    if _has_ai(config):
        out.append(_arrow())
        out.extend(_indent_block(_box("AI / LLM", config.ai_model)))

    if _has_docker(config):
        out.append("")
        out.append(indent + "┌" + "─" * (BOX_WIDTH + 2) + "┐")
        out.append(indent + "│ " + _pad("Container boundary (Docker)", BOX_WIDTH) + " │")
        out.append(indent + "└" + "─" * (BOX_WIDTH + 2) + "┘")

    return "\n".join(out)


async def generate_architecture_diagram(
    strategy_data: dict,
    *,
    scalability_level: Optional[str] = None,
    preferred_frontend: Optional[str] = None,
    preferred_backend: Optional[str] = None,
    preferred_database: Optional[str] = None,
    preferred_ai_model: Optional[str] = None,
    deployment_preference: Optional[str] = None,
) -> str:
    """
    Build deterministic ASCII diagram from strategy + optional form overrides.
    No LLM. No hallucinated components.
    """
    config = ProjectConfig.from_strategy_and_overrides(
        strategy_data,
        scalability_level=scalability_level,
        preferred_frontend=preferred_frontend,
        preferred_backend=preferred_backend,
        preferred_database=preferred_database,
        preferred_ai_model=preferred_ai_model,
        deployment_preference=deployment_preference,
    )
    return generate_architecture(config)
