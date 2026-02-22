"""
API route definitions. Uses Supabase REST (idea_store) for persistence.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from core.config import Settings, get_settings
from core.idea_store import (
    create_idea,
    create_pipeline_run,
    get_agent_outputs_for_run,
    get_idea,
    get_ideas_list,
    get_latest_pipeline_run_for_idea,
    get_pipeline_run,
    get_pipeline_runs_for_idea,
    get_sprints_for_run,
    get_tasks_for_sprint,
    update_idea,
)
from core.schemas import ErrorDetail, HealthResponse, StructuredErrorResponse
from core.supabase_client import get_supabase, get_supabase_or_raise
from orchestration.pipeline import PipelineRunner
from orchestration.state import IdeaState
from services.architecture_generator import generate_architecture_diagram
from services.mvp_generator import generate_mvp_files, start_generated_mvp_servers, write_mvp_files
from services.mvp_improver import improve_mvp_files

router = APIRouter()


def _get_supabase():
    """Dependency: Supabase client or 503."""
    try:
        return get_supabase_or_raise()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)")


@router.get("/health", response_model=HealthResponse)
async def health(settings: Settings = Depends(get_settings)):
    return HealthResponse(status="ok")


# --- Idea (workspace) endpoints ---


class CreateIdeaBody(BaseModel):
    problem_statement: str = ""
    target_audience: Optional[str] = None
    key_features: Optional[str] = None
    budget: Optional[str] = None
    timeline: Optional[str] = None


@router.post("/ideas", tags=["ideas"])
async def create_idea_route(body: Optional[CreateIdeaBody] = None, supabase=Depends(_get_supabase)):
    """Create a new idea. Returns id (UUID) and created_at."""
    b = body or CreateIdeaBody()
    idea = create_idea(
        supabase,
        problem_statement=b.problem_statement,
        target_audience=b.target_audience,
        key_features=b.key_features,
        budget=b.budget,
        timeline=b.timeline,
    )
    if idea is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"id": idea.id, "created_at": idea.created_at}


@router.post("/projects", tags=["projects"])
async def create_project(supabase=Depends(_get_supabase)):
    """Create a new project (idea). Returns id and created_at."""
    idea = create_idea(supabase, problem_statement="")
    if idea is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"id": idea.id, "created_at": idea.created_at}


@router.get("/projects", tags=["projects"])
async def list_projects(supabase=Depends(_get_supabase)):
    """List all projects (ideas) ordered by created_at desc."""
    ideas = get_ideas_list(supabase, limit=50)
    return {
        "projects": [
            {
                "id": i.id,
                "created_at": i.created_at,
                "problem_statement": (i.problem_statement or "")[:100],
            }
            for i in ideas
        ],
    }


def _idea_to_state_payload(idea, pipeline_run, agent_outputs, sprints_with_tasks):
    """Build full state payload for frontend."""
    out = {
        "idea_id": idea.id,
        "problem_statement": idea.problem_statement,
        "target_audience": idea.target_audience,
        "key_features": idea.key_features,
        "budget": idea.budget,
        "timeline": idea.timeline,
        "idea": idea.problem_statement or None,
        "enhanced_idea": None,
        "product_model": None,
        "architecture_model": None,
        "business_model": None,
        "risk_model": None,
        "sprint_model": None,
        "agent_outputs": [],
        "sprints": sprints_with_tasks,
        "pipeline_run_id": pipeline_run.id if pipeline_run else None,
        "pipeline_status": pipeline_run.status if pipeline_run else None,
    }
    for ao in agent_outputs:
        content = ao.output_json.get("content", "") if isinstance(ao.output_json, dict) else ""
        if ao.agent_name == "strategist":
            out["enhanced_idea"] = content
            out["product_model"] = content
        elif ao.agent_name == "architect":
            out["architecture_model"] = content
        elif ao.agent_name == "business":
            out["business_model"] = content
        elif ao.agent_name == "risk":
            out["risk_model"] = content
        elif ao.agent_name == "scrum":
            out["sprint_model"] = content
        out["agent_outputs"].append(
            {"agent_name": ao.agent_name, "output_json": ao.output_json, "latency_ms": ao.latency_ms}
        )
    return out


@router.get("/ideas/{idea_id}", tags=["ideas"])
async def get_idea_route(idea_id: str, supabase=Depends(_get_supabase)):
    """Return idea plus latest pipeline run, agent outputs, sprints, and tasks."""
    idea = get_idea(supabase, idea_id)
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    run = get_latest_pipeline_run_for_idea(supabase, idea_id)
    agent_outputs = get_agent_outputs_for_run(supabase, run.id) if run else []
    sprints = get_sprints_for_run(supabase, run.id) if run else []
    sprints_with_tasks = []
    for s in sprints:
        tasks = get_tasks_for_sprint(supabase, s.id)
        sprints_with_tasks.append(
            {
                "id": s.id,
                "sprint_index": s.sprint_index,
                "name": s.name,
                "tasks": [
                    {
                        "id": t.id,
                        "title": t.title,
                        "description": t.description,
                        "task_type": t.task_type,
                        "estimated_effort": t.estimated_effort,
                        "status": t.status,
                    }
                    for t in tasks
                ],
            }
        )
    return _idea_to_state_payload(idea, run, agent_outputs, sprints_with_tasks)


@router.get("/ideas/{idea_id}/runs", tags=["ideas"])
async def list_runs_route(idea_id: str, supabase=Depends(_get_supabase)):
    """List pipeline runs for an idea (project history)."""
    idea = get_idea(supabase, idea_id)
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    runs = get_pipeline_runs_for_idea(supabase, idea_id, limit=50)
    return {
        "runs": [
            {
                "id": r.id,
                "idea_id": r.idea_id,
                "status": r.status,
                "started_at": r.started_at,
                "completed_at": r.completed_at,
                "total_latency_ms": r.total_latency_ms,
            }
            for r in runs
        ],
    }


@router.get("/ideas/{idea_id}/runs/{run_id}", tags=["ideas"])
async def get_run_state_route(idea_id: str, run_id: str, supabase=Depends(_get_supabase)):
    """Return full state for a specific pipeline run (view history)."""
    idea = get_idea(supabase, idea_id)
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    run = get_pipeline_run(supabase, run_id)
    if run is None or run.idea_id != idea_id:
        raise HTTPException(status_code=404, detail="Run not found")
    agent_outputs = get_agent_outputs_for_run(supabase, run_id)
    sprints = get_sprints_for_run(supabase, run_id)
    sprints_with_tasks = []
    for s in sprints:
        tasks = get_tasks_for_sprint(supabase, s.id)
        sprints_with_tasks.append(
            {
                "id": s.id,
                "sprint_index": s.sprint_index,
                "name": s.name,
                "tasks": [
                    {"id": t.id, "title": t.title, "description": t.description, "task_type": t.task_type, "estimated_effort": t.estimated_effort, "status": t.status}
                    for t in tasks
                ],
            }
        )
    payload = _idea_to_state_payload(idea, run, agent_outputs, sprints_with_tasks)
    payload["run_started_at"] = run.started_at
    payload["run_completed_at"] = run.completed_at
    return payload


@router.get("/projects/{project_id}/state", tags=["projects"])
async def get_project_state_route(project_id: str, supabase=Depends(_get_supabase)):
    """Return latest state for project (idea). Backward compat: returns { state }."""
    data = await get_idea_route(project_id, supabase)
    state = {k: v for k, v in data.items() if k != "agent_outputs"}
    return {"state": state}


@router.post("/ideas/{idea_id}", tags=["ideas"])
async def update_idea_route(idea_id: str, body: dict, supabase=Depends(_get_supabase)):
    """Update idea fields."""
    idea = get_idea(supabase, idea_id)
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    update_idea(
        supabase,
        idea_id,
        problem_statement=body.get("problem_statement"),
        target_audience=body.get("target_audience"),
        key_features=body.get("key_features"),
        budget=body.get("budget"),
        timeline=body.get("timeline"),
    )
    return {"ok": True}


@router.post("/projects/{project_id}/state", tags=["projects"])
async def save_project_state_route(project_id: str, body: dict, supabase=Depends(_get_supabase)):
    """Append/update state. Body: { state_json }. Updates idea fields."""
    state_json = body.get("state_json", body)
    if not isinstance(state_json, dict):
        raise HTTPException(status_code=400, detail="state_json must be an object")
    idea = get_idea(supabase, project_id)
    if idea is None:
        raise HTTPException(status_code=404, detail="Project not found")
    update_idea(
        supabase,
        project_id,
        problem_statement=state_json.get("problem_statement") or state_json.get("idea"),
        target_audience=state_json.get("target_audience"),
        key_features=state_json.get("key_features"),
        budget=state_json.get("budget"),
        timeline=state_json.get("timeline"),
    )
    return {"ok": True}


# --- Pipeline ---


class PipelineRunBody(BaseModel):
    idea_id: str
    idea: Optional[str] = None
    problem_statement: Optional[str] = None
    target_audience: Optional[str] = None
    key_features: Optional[str] = None
    budget: Optional[str] = None
    timeline: Optional[str] = None
    preferred_frontend: Optional[str] = None
    preferred_backend: Optional[str] = None
    preferred_database: Optional[str] = None
    preferred_ai_model: Optional[str] = None
    deployment_preference: Optional[str] = None
    scalability_level: Optional[str] = None

    class Config:
        extra = "allow"


@router.post("/pipeline/run", tags=["pipeline"])
async def run_pipeline(body: PipelineRunBody, supabase=Depends(_get_supabase)):
    """Run the multi-agent pipeline for an idea. Persists via Supabase REST."""
    idea = get_idea(supabase, body.idea_id)
    if idea is None:
        raise HTTPException(status_code=404, detail="Idea not found")
    run_id = create_pipeline_run(supabase, body.idea_id)
    if run_id is None:
        raise HTTPException(status_code=503, detail="Database unavailable")
    state = IdeaState(
        idea_id=body.idea_id,
        idea=body.idea or body.problem_statement or idea.problem_statement,
        problem_statement=body.problem_statement or idea.problem_statement,
        target_audience=body.target_audience or idea.target_audience,
        key_features=body.key_features or idea.key_features,
        budget=body.budget or idea.budget,
        timeline=body.timeline or idea.timeline,
        preferred_frontend=body.preferred_frontend,
        preferred_backend=body.preferred_backend,
        preferred_database=body.preferred_database,
        preferred_ai_model=body.preferred_ai_model,
        deployment_preference=body.deployment_preference,
        scalability_level=body.scalability_level,
    )
    runner = PipelineRunner()
    result = await runner.run(state, supabase=supabase, pipeline_run_id=run_id)
    if result.success and result.state is not None:
        data = await get_idea_route(body.idea_id, supabase)
        state_dict = result.state.model_dump()
        merged = {**state_dict, **{k: v for k, v in data.items() if k in ("sprints", "agent_outputs", "pipeline_run_id", "pipeline_status")}}
        return merged
    error = result.error or ErrorDetail(code="pipeline_error", message="Pipeline failed")
    return JSONResponse(
        status_code=422,
        content=StructuredErrorResponse(success=False, error=error).model_dump(),
    )


@router.get("/ideas/{idea_id}/sprints", tags=["ideas"])
async def get_sprints_route(idea_id: str, supabase=Depends(_get_supabase)):
    """Return sprints and tasks for the latest pipeline run of an idea."""
    run = get_latest_pipeline_run_for_idea(supabase, idea_id)
    if run is None:
        return {"sprints": []}
    sprints = get_sprints_for_run(supabase, run.id)
    out = []
    for s in sprints:
        tasks = get_tasks_for_sprint(supabase, s.id)
        out.append(
            {
                "id": s.id,
                "sprint_index": s.sprint_index,
                "name": s.name,
                "tasks": [
                    {"id": t.id, "title": t.title, "description": t.description, "task_type": t.task_type, "estimated_effort": t.estimated_effort, "status": t.status}
                    for t in tasks
                ],
            }
        )
    return {"sprints": out}


# --- Architecture diagram (OpenRouter gpt-oss-120b, ASCII only) ---


class ArchitectureGenerateBody(BaseModel):
    strategy_json: str = ""
    scalability_level: Optional[str] = None
    preferred_frontend: Optional[str] = None
    preferred_backend: Optional[str] = None
    preferred_database: Optional[str] = None
    preferred_ai_model: Optional[str] = None
    deployment_preference: Optional[str] = None


@router.post("/architecture/generate", tags=["architecture"])
async def architecture_generate_route(body: ArchitectureGenerateBody):
    """Generate deterministic ASCII architecture diagram from strategy + tech stack."""
    if not (body.strategy_json or "").strip():
        raise HTTPException(status_code=422, detail="strategy_json is required")
    try:
        import json as _json
        data = _json.loads(body.strategy_json)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Invalid strategy_json: {e}")
    try:
        diagram = await generate_architecture_diagram(
            data,
            scalability_level=body.scalability_level,
            preferred_frontend=body.preferred_frontend,
            preferred_backend=body.preferred_backend,
            preferred_database=body.preferred_database,
            preferred_ai_model=body.preferred_ai_model,
            deployment_preference=body.deployment_preference,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"diagram": diagram}


# --- MVP generation (LLM → files JSON → write to disk) ---

MVP_OUTPUT_DIR = "generated-mvp"


class MVPGenerateBody(BaseModel):
    enhanced_problem: str = ""
    target_user: str = ""
    core_features: str = ""


class MVPImproveBody(BaseModel):
    files: list[dict[str, str]]  # [{"path": "...", "content": "..."}, ...]
    instruction: str = ""


@router.post("/mvp/generate", tags=["mvp"])
async def mvp_generate_route(body: MVPGenerateBody):
    """Generate full-stack MVP from CTO summary; validate; write to generated-mvp/; return files."""
    try:
        files = await generate_mvp_files(
            enhanced_problem=body.enhanced_problem,
            target_user=body.target_user,
            core_features=body.core_features,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    from pathlib import Path
    project_root = Path(__file__).resolve().parent.parent.parent
    output_dir = str(project_root / MVP_OUTPUT_DIR)
    write_mvp_files(files, output_dir)
    start_generated_mvp_servers(output_dir)
    return {"ok": True, "files": files, "output_dir": output_dir}


@router.post("/mvp/improve", tags=["mvp"])
async def mvp_improve_route(body: MVPImproveBody):
    """Improve existing MVP: send current files + instruction; get back modified_files only."""
    try:
        modified = await improve_mvp_files(
            files=body.files,
            instruction=body.instruction,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return {"ok": True, "modified_files": modified}
