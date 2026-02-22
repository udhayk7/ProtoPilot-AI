"""
Pydantic models for request/response and pipeline data.
"""

from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = "ok"


# --- Structured error response (validation & reliability layer) ---


class ErrorDetail(BaseModel):
    """Detail payload for structured errors."""

    code: str = Field(..., description="Error code (e.g. validation_error, pipeline_error)")
    message: str = Field(..., description="Human-readable message")
    agent_name: Optional[str] = Field(None, description="Agent that failed, if applicable")
    details: dict = Field(default_factory=dict, description="Extra context (e.g. parse errors)")


class StructuredErrorResponse(BaseModel):
    """API response when pipeline or validation fails. Malformed output never breaks the system."""

    success: bool = False
    error: ErrorDetail = Field(..., description="Structured error detail")


# --- Agent output schemas (guilty until validated) ---

# Each agent output must conform to a schema. Add fields as needed when implementing LLM calls.


class AgentOutputBase(BaseModel):
    """Base for all agent outputs. Ensures a minimal valid structure."""

    content: str = Field(..., min_length=1, description="Primary output content")
    reasoning: Optional[str] = Field(None, description="Optional reasoning or notes")

    class Config:
        extra = "forbid"  # Reject unknown keys from LLM output


# --- Strategist output: SOW + PRD (no business/pricing/cost) ---


class SolutionBriefBlock(BaseModel):
    """Solution brief from Strategist."""

    problem_summary: str = ""
    solution_overview: List[str] = []
    target_users: List[str] = []
    key_differentiators: List[str] = []

    class Config:
        extra = "allow"


class MilestoneItem(BaseModel):
    """Single milestone in SOW."""

    phase: str = ""
    description: str = ""
    deliverables: List[str] = []

    class Config:
        extra = "allow"


class StatementOfWorkBlock(BaseModel):
    """Statement of work from Strategist."""

    scope_of_work: List[str] = []
    in_scope_deliverables: List[str] = []
    out_of_scope: List[str] = []
    assumptions: List[str] = []
    milestones: List[MilestoneItem] = []
    acceptance_criteria: List[str] = []

    class Config:
        extra = "allow"


class TechStackBlock(BaseModel):
    """Tech stack from PRD."""

    frontend: str = ""
    backend: str = ""
    database: str = ""
    ai_components: str = ""
    deployment: str = ""

    class Config:
        extra = "allow"


class ProductRequirementsBlock(BaseModel):
    """Product requirements from Strategist."""

    functional_requirements: List[str] = []
    non_functional_requirements: List[str] = []
    architecture_summary: str = ""
    tech_stack: TechStackBlock = Field(default_factory=TechStackBlock)
    success_metrics: List[str] = []

    class Config:
        extra = "allow"


class CTOStrategyOutput(BaseModel):
    """Strategist output: SOW + PRD. No pricing, cost, or revenue."""

    solution_brief: SolutionBriefBlock = Field(default_factory=SolutionBriefBlock)
    statement_of_work: StatementOfWorkBlock = Field(default_factory=StatementOfWorkBlock)
    product_requirements: ProductRequirementsBlock = Field(default_factory=ProductRequirementsBlock)
    feasibility_score: int = Field(default=0, ge=0, le=100)

    class Config:
        extra = "allow"


class StrategistOutput(CTOStrategyOutput):
    """Strategist uses SOW+PRD format. Alias for pipeline validation."""

    pass


class ArchitectOutput(AgentOutputBase):
    """Schema enforced for Architect agent output."""

    pass


class BusinessOutput(AgentOutputBase):
    """Schema enforced for Business agent output."""

    pass


class RiskOutput(AgentOutputBase):
    """Schema enforced for Risk agent output."""

    pass


class SprintTask(BaseModel):
    """Single task in a sprint."""

    title: str
    description: Optional[str] = None
    task_type: Optional[str] = None
    estimated_effort: Optional[str] = None
    status: str = "todo"

    class Config:
        extra = "allow"


class SprintItem(BaseModel):
    """Sprint with tasks."""

    sprint_index: int
    name: Optional[str] = None
    tasks: List[SprintTask] = []

    class Config:
        extra = "allow"


class ScrumOutput(AgentOutputBase):
    """Schema enforced for Scrum agent output. Optional sprints for DB persistence."""

    sprints: Optional[List[SprintItem]] = None

    class Config:
        extra = "allow"
