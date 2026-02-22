"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type ApiError,
  type PipelineRunSummary,
  type PipelineState,
  type Project,
  EMPTY_PROJECT_STATE,
  createProject,
  generateMvp,
  getHealth,
  getProjectRuns,
  getProjectRunState,
  getProjectState,
  listProjects,
  runPipeline,
  saveProjectState,
} from "@/lib/apiClient";
import { createClient } from "@/lib/supabase/client";
import CTOStrategyView, { parseCTOStrategy } from "./CTOStrategyView";
import ExecutionSection from "./ExecutionSection";
import MVPGeneratedView from "./MVPGeneratedView";
import MVPGeneration, { type FileNode } from "./MVPGeneration";

const PROJECT_ID_KEY = "protopilot_project_id";

type WorkspacePhase = "no_project" | "active" | "loading" | "saving" | "error";
type PipelinePhase = "idle" | "loading" | "success" | "error";
type MVPGeneratePhase = "idle" | "loading" | "success" | "error";

function safeString(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value;
  return "—";
}

function mergeState(base: PipelineState, patch: Partial<PipelineState>): PipelineState {
  return { ...base, ...patch };
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(s).slice(0, 16);
  }
}

export default function Dashboard() {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<"ok" | "error" | null>(null);
  const [workspacePhase, setWorkspacePhase] = useState<WorkspacePhase>("no_project");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<PipelineState | null>(null);
  const [workspaceError, setWorkspaceError] = useState<ApiError | null>(null);
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("idle");
  const [pipelineError, setPipelineError] = useState<ApiError | null>(null);
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [runList, setRunList] = useState<PipelineRunSummary[]>([]);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [mvpGeneratePhase, setMvpGeneratePhase] = useState<MVPGeneratePhase>("idle");
  const [mvpGenerateError, setMvpGenerateError] = useState<string | null>(null);
  const [mvpGeneratedFiles, setMvpGeneratedFiles] = useState<{ path: string; content: string }[]>([]);
  const latestWorkspaceStateRef = useRef<PipelineState | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const name = (user?.user_metadata?.full_name as string) || user?.email || null;
      setUserName(name ?? null);
    });
  }, []);

  const persistProjectId = useCallback((id: string | null) => {
    setProjectId(id);
    if (id) {
      try {
        localStorage.setItem(PROJECT_ID_KEY, id);
      } catch {
        /* ignore */
      }
    } else {
      try {
        localStorage.removeItem(PROJECT_ID_KEY);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const loadProjectState = useCallback(
    async (pid: string) => {
      setWorkspacePhase("loading");
      setWorkspaceError(null);
      setViewingRunId(null);
      const result = await getProjectState(pid);
      if (result.ok) {
        setWorkspaceState(result.state ?? { ...EMPTY_PROJECT_STATE });
        setWorkspacePhase("active");
      } else {
        setWorkspaceError(result.error);
        setWorkspacePhase("error");
      }
    },
    []
  );

  const loadProjectHistory = useCallback(async () => {
    setHistoryLoading(true);
    const result = await listProjects();
    if (result.ok) {
      setProjectList(result.projects);
    }
    setHistoryLoading(false);
  }, []);

  const loadRunHistory = useCallback(async (pid: string) => {
    const result = await getProjectRuns(pid);
    if (result.ok) {
      setRunList(result.runs);
    } else {
      setRunList([]);
    }
  }, []);

  const handleSelectProject = useCallback(
    async (pid: string) => {
      persistProjectId(pid);
      await loadProjectState(pid);
    },
    [persistProjectId, loadProjectState]
  );

  const handleViewRun = useCallback(
    async (runId: string) => {
      if (!projectId) return;
      const result = await getProjectRunState(projectId, runId);
      if (result.ok) {
        setWorkspaceState(result.state);
        setViewingRunId(runId);
      }
    },
    [projectId]
  );

  const handleBackToLatest = useCallback(async () => {
    if (!projectId) return;
    setViewingRunId(null);
    await loadProjectState(projectId);
  }, [projectId, loadProjectState]);

  const handleNewProject = useCallback(async () => {
    setWorkspacePhase("loading");
    setWorkspaceError(null);
    try {
      const result = await createProject();
      if (result.ok) {
        persistProjectId(result.project.id);
        setWorkspaceState({ ...EMPTY_PROJECT_STATE, idea_id: result.project.id });
        setWorkspacePhase("active");
        loadProjectHistory();
        setRunList([]);
      } else {
        setWorkspaceError(result.error);
        setWorkspacePhase("error");
      }
    } catch (e) {
      setWorkspaceError({
        message: e instanceof Error ? e.message : "Failed to create project",
        agent_name: null,
      });
      setWorkspacePhase("error");
    }
  }, [persistProjectId, loadProjectHistory]);

  const handleEditState = useCallback(
    (patch: Partial<PipelineState>) => {
      if (!projectId || !workspaceState) return;
      const next = mergeState(workspaceState, patch);
      setWorkspaceState(next);
      latestWorkspaceStateRef.current = next;
    },
    [projectId, workspaceState]
  );

  const handleBlurSave = useCallback(async () => {
    const state = latestWorkspaceStateRef.current ?? workspaceState;
    if (!projectId || !state) return;
    setWorkspacePhase("saving");
    setWorkspaceError(null);
    const result = await saveProjectState(projectId, state);
    if (result.ok) {
      setWorkspacePhase("active");
    } else {
      setWorkspaceError(result.error);
      setWorkspacePhase("error");
    }
  }, [projectId, workspaceState]);

  const handleRunPipeline = useCallback(async () => {
    if (!projectId || !workspaceState) return;
    setPipelinePhase("loading");
    setPipelineError(null);
    const payload = {
      idea_id: projectId,
      idea: workspaceState.idea ?? workspaceState.problem_statement ?? null,
      problem_statement: workspaceState.problem_statement ?? workspaceState.idea ?? null,
      target_audience: workspaceState.target_audience ?? null,
      key_features: workspaceState.key_features ?? null,
      budget: workspaceState.budget ?? null,
      timeline: workspaceState.timeline ?? null,
      preferred_frontend: workspaceState.preferred_frontend ?? null,
      preferred_backend: workspaceState.preferred_backend ?? null,
      preferred_database: workspaceState.preferred_database ?? null,
      preferred_ai_model: workspaceState.preferred_ai_model ?? null,
      deployment_preference: workspaceState.deployment_preference ?? null,
      scalability_level: workspaceState.scalability_level ?? null,
    };
    const result = await runPipeline(payload);
    if (result.ok) {
      const next = mergeState(workspaceState, result.state);
      setWorkspaceState(next);
      setPipelinePhase("success");
      loadRunHistory(projectId);
      loadProjectHistory();

      setWorkspacePhase("saving");
      const saveResult = await saveProjectState(projectId, next);
      if (saveResult.ok) {
        setWorkspacePhase("active");
      } else {
        setWorkspaceError(saveResult.error);
        setWorkspacePhase("error");
      }
    } else {
      setPipelineError(result.error);
      setPipelinePhase("error");
    }
  }, [projectId, workspaceState, loadRunHistory, loadProjectHistory]);

  const handleGenerateMvp = useCallback(async () => {
    const state = latestWorkspaceStateRef.current ?? workspaceState;
    if (!state) return;
    let enhanced_problem = state.problem_statement ?? state.idea ?? "";
    let target_user = state.target_audience ?? "";
    let core_features = state.key_features ?? "";
    const cto = parseCTOStrategy(state.enhanced_idea ?? null);
    if (cto?.solution_brief) {
      enhanced_problem = cto.solution_brief.problem_summary || enhanced_problem;
      target_user = Array.isArray(cto.solution_brief.target_users)
        ? cto.solution_brief.target_users.join(", ")
        : target_user;
      const overview = cto.solution_brief.solution_overview;
      if (overview?.length) core_features = overview.join(", ");
      else if (cto.product_requirements?.functional_requirements?.length)
        core_features = cto.product_requirements.functional_requirements.join(", ");
    }
    setMvpGeneratePhase("loading");
    setMvpGenerateError(null);
    const result = await generateMvp({
      enhanced_problem,
      target_user,
      core_features,
    });
    if (result.ok) {
      setMvpGeneratePhase("success");
      setMvpGeneratedFiles(result.files);
    } else {
      setMvpGenerateError(result.error.message);
      setMvpGeneratePhase("error");
    }
  }, [workspaceState]);

  useEffect(() => {
    getHealth()
      .then((r) => setHealthStatus(r.status === "ok" ? "ok" : "error"))
      .catch(() => setHealthStatus("error"));
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(PROJECT_ID_KEY);
      if (stored) {
        persistProjectId(stored);
        loadProjectState(stored);
      } else {
        setWorkspacePhase("no_project");
      }
    } catch {
      setWorkspacePhase("no_project");
    }
  }, [loadProjectState, persistProjectId]);

  useEffect(() => {
    loadProjectHistory();
  }, [loadProjectHistory]);

  useEffect(() => {
    if (workspacePhase === "active" && projectId) {
      loadRunHistory(projectId);
    }
  }, [workspacePhase, projectId, loadRunHistory]);

  useEffect(() => {
    if (workspaceState) latestWorkspaceStateRef.current = workspaceState;
  }, [workspaceState]);

  const isWorkspaceLoading = workspacePhase === "loading";
  const isWorkspaceSaving = workspacePhase === "saving";
  const isPipelineLoading = pipelinePhase === "loading";
  const isViewingHistory = viewingRunId != null;
  const isDisabled = isWorkspaceLoading || isWorkspaceSaving || isPipelineLoading || isViewingHistory;

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }, [router]);

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__title">ProtoPilot AI</h1>
        <div className="dashboard__header-actions">
          {userName != null && userName !== "" && (
            <span className="dashboard__user-name" aria-label="Signed in as">
              Hi, {userName}
            </span>
          )}
          {projectId && (
            <button
              type="button"
              className="workspace__new-btn"
              onClick={() => {
                persistProjectId(null);
                setWorkspaceState(null);
                setWorkspacePhase("no_project");
                setWorkspaceError(null);
              }}
              disabled={isDisabled}
            >
              Close project
            </button>
          )}
          <button
            type="button"
            className="workspace__new-btn workspace__new-btn--primary"
            onClick={handleNewProject}
            disabled={isDisabled}
          >
            New Project
          </button>
          <button
            type="button"
            className="workspace__new-btn"
            onClick={handleSignOut}
            aria-label="Sign out"
          >
            Sign out
          </button>
          <span
            className={`health ${healthStatus === "ok" ? "health--ok" : healthStatus === "error" ? "health--error" : ""}`}
            aria-label="API status"
          >
            API {healthStatus === "ok" ? "OK" : healthStatus === "error" ? "Offline" : "…"}
          </span>
        </div>
      </header>
      <div className="dashboard__body">
      <aside className="dashboard__sidebar" aria-label="Project history">
        <h2 className="panel__title">Project History</h2>
        {historyLoading ? (
          <p className="history-placeholder">Loading…</p>
        ) : projectList.length === 0 ? (
          <p className="history-placeholder">No projects yet</p>
        ) : (
          <ul className="history-list">
            {projectList.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`history-item ${projectId === p.id ? "history-item--active" : ""}`}
                  onClick={() => handleSelectProject(p.id)}
                  disabled={isWorkspaceLoading}
                >
                  <span className="history-item__title">
                    {(p.problem_statement || "Untitled").slice(0, 40)}
                    {(p.problem_statement?.length ?? 0) > 40 ? "…" : ""}
                  </span>
                  <span className="history-item__date">{formatDate(p.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {projectId && runList.length > 0 && (
          <>
            <h3 className="panel__title panel__title--small">Run History</h3>
            <ul className="history-list">
              {runList.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`history-item history-item--run ${viewingRunId === r.id ? "history-item--active" : ""}`}
                    onClick={() => handleViewRun(r.id)}
                    disabled={isWorkspaceLoading}
                  >
                    <span className="history-item__status">{r.status}</span>
                    <span className="history-item__date">{formatDate(r.started_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <div className="dashboard__content">
        <main className="dashboard__main">
        {isViewingHistory && (
          <section className="panel panel--full history-banner">
            <p className="history-banner__text">Viewing past pipeline run</p>
            <button type="button" className="workspace__new-btn" onClick={handleBackToLatest} disabled={isWorkspaceLoading}>
              Back to latest
            </button>
          </section>
        )}
        {workspacePhase === "no_project" && (
          <section className="panel panel--full workspace-empty">
            <p className="workspace-empty__text">Create or load a project to get started.</p>
            <button
              type="button"
              className="workspace__new-btn workspace__new-btn--primary"
              onClick={handleNewProject}
            >
              New Project
            </button>
          </section>
        )}

        {workspacePhase === "loading" && (
          <section className="panel panel--full workspace-status" aria-live="polite">
            <p className="workspace-status__text">Loading…</p>
          </section>
        )}

        {workspacePhase === "error" && (workspaceError || pipelineError) && (
          <section className="panel panel--full pipeline-error" aria-live="assertive">
            <h2 className="panel__title">Error</h2>
            <p className="pipeline-error__message">
              {safeString(workspaceError?.message ?? pipelineError?.message)}
            </p>
            {(workspaceError?.agent_name ?? pipelineError?.agent_name) != null && (
              <p className="pipeline-error__agent">
                Agent: {safeString(workspaceError?.agent_name ?? pipelineError?.agent_name)}
              </p>
            )}
          </section>
        )}

        {(workspacePhase === "active" || workspacePhase === "saving") && workspaceState && (
          <>
            <section className="bg-white rounded-lg border border-gray-200 p-10" aria-labelledby="idea-config-heading">
              <h2 id="idea-config-heading" className="text-3xl font-semibold text-gray-900 m-0 mb-1">Idea Configuration</h2>
              <p className="text-gray-500 m-0 mb-10">Define business requirements and technical preferences</p>

              {/* Business Requirements */}
              <p className="uppercase text-xs tracking-wider text-gray-400 mb-4">Business Requirements</p>
              <div className="mb-8">
                <label className="block mb-2 font-medium text-gray-700 text-sm">
                  Problem statement
                </label>
                <textarea
                  className="idea-input w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed min-h-[140px] mb-8"
                  placeholder="Describe your idea or problem statement…"
                  value={workspaceState.problem_statement ?? workspaceState.idea ?? ""}
                  onChange={(e) =>
                    handleEditState({
                      problem_statement: e.target.value || null,
                      idea: e.target.value || null,
                    })
                  }
                  onBlur={handleBlurSave}
                  rows={5}
                  disabled={isDisabled}
                  aria-label="Problem statement"
                />
                <div className="grid grid-cols-2 gap-8">
                  <label className="block">
                    <span className="block mb-2 font-medium text-gray-700 text-sm">Target audience</span>
                    <input
                      type="text"
                      className="idea-input w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                      placeholder="Who is it for?"
                      value={workspaceState.target_audience ?? ""}
                      onChange={(e) => handleEditState({ target_audience: e.target.value || null })}
                      onBlur={handleBlurSave}
                      disabled={isDisabled}
                    />
                  </label>
                  <label className="block">
                    <span className="block mb-2 font-medium text-gray-700 text-sm">Key features</span>
                    <input
                      type="text"
                      className="idea-input w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                      placeholder="Core features"
                      value={workspaceState.key_features ?? ""}
                      onChange={(e) => handleEditState({ key_features: e.target.value || null })}
                      onBlur={handleBlurSave}
                      disabled={isDisabled}
                    />
                  </label>
                </div>
              </div>

              {/* Technical Preferences */}
              <p className="uppercase text-xs tracking-wider text-gray-400 mt-12 mb-4">Technical Preferences</p>
              <div className="grid grid-cols-2 gap-8">
                <label className="block">
                  <span className="block mb-2 font-medium text-gray-700 text-sm">Preferred frontend</span>
                  <select
                    className="idea-select w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                        value={workspaceState.preferred_frontend ?? ""}
                        onChange={(e) => handleEditState({ preferred_frontend: e.target.value || null })}
                        onBlur={handleBlurSave}
                        disabled={isDisabled}
                        aria-label="Preferred frontend"
                      >
                        <option value="">No Preference</option>
                        <option value="React">React</option>
                        <option value="Next.js">Next.js</option>
                        <option value="Vue">Vue</option>
                        <option value="Flutter">Flutter</option>
                        <option value="React Native">React Native</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block mb-2 font-medium text-gray-700 text-sm">Preferred backend</span>
                      <select
                        className="idea-select w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                        value={workspaceState.preferred_backend ?? ""}
                        onChange={(e) => handleEditState({ preferred_backend: e.target.value || null })}
                        onBlur={handleBlurSave}
                        disabled={isDisabled}
                        aria-label="Preferred backend"
                      >
                        <option value="">No Preference</option>
                        <option value="FastAPI">FastAPI</option>
                        <option value="Node.js (Express)">Node.js (Express)</option>
                        <option value="Django">Django</option>
                        <option value="Spring Boot">Spring Boot</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block mb-2 font-medium text-gray-700 text-sm">Preferred database</span>
                      <select
                        className="idea-select w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                        value={workspaceState.preferred_database ?? ""}
                        onChange={(e) => handleEditState({ preferred_database: e.target.value || null })}
                        onBlur={handleBlurSave}
                        disabled={isDisabled}
                        aria-label="Preferred database"
                      >
                        <option value="">No Preference</option>
                        <option value="PostgreSQL">PostgreSQL</option>
                        <option value="MySQL">MySQL</option>
                        <option value="SQLite">SQLite</option>
                        <option value="MongoDB">MongoDB</option>
                        <option value="Supabase">Supabase</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block mb-2 font-medium text-gray-700 text-sm">Preferred AI model</span>
                      <select
                        className="idea-select w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                        value={workspaceState.preferred_ai_model ?? ""}
                        onChange={(e) => handleEditState({ preferred_ai_model: e.target.value || null })}
                        onBlur={handleBlurSave}
                        disabled={isDisabled}
                        aria-label="Preferred AI model"
                      >
                        <option value="">No Preference</option>
                        <option value="OpenAI">OpenAI</option>
                        <option value="Anthropic (Claude)">Anthropic (Claude)</option>
                        <option value="Gemini">Gemini</option>
                        <option value="Qwen">Qwen</option>
                        <option value="Local Model">Local Model</option>
                        <option value="No AI Required">No AI Required</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block mb-2 font-medium text-gray-700 text-sm">Deployment preference</span>
                      <select
                        className="idea-select w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                        value={workspaceState.deployment_preference ?? ""}
                        onChange={(e) => handleEditState({ deployment_preference: e.target.value || null })}
                        onBlur={handleBlurSave}
                        disabled={isDisabled}
                        aria-label="Deployment preference"
                      >
                        <option value="">No Preference</option>
                        <option value="Vercel">Vercel</option>
                        <option value="AWS">AWS</option>
                        <option value="Docker">Docker</option>
                        <option value="Firebase">Firebase</option>
                        <option value="On-Premise">On-Premise</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="block mb-2 font-medium text-gray-700 text-sm">Scalability level</span>
                      <select
                        className="idea-select w-full px-3 py-2.5 text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed h-11"
                        value={workspaceState.scalability_level ?? "MVP"}
                        onChange={(e) => handleEditState({ scalability_level: e.target.value || null })}
                        onBlur={handleBlurSave}
                        disabled={isDisabled}
                        aria-label="Scalability level"
                      >
                        <option value="MVP">MVP</option>
                        <option value="Moderate Scale">Moderate Scale</option>
                        <option value="High Scale">High Scale</option>
                        <option value="Enterprise Grade">Enterprise Grade</option>
                      </select>
                    </label>
              </div>

              {/* Button area */}
              <div className="flex justify-end mt-10">
                {isWorkspaceSaving && (
                  <span className="text-sm text-gray-500 mr-4 self-center" aria-live="polite">Saving…</span>
                )}
                <button
                  type="button"
                  className="px-8 py-3 rounded-md bg-black text-white hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-black"
                  onClick={handleRunPipeline}
                  disabled={isDisabled}
                  aria-busy={isPipelineLoading}
                >
                  {isPipelineLoading ? "Running…" : "Run Pipeline"}
                </button>
              </div>
            </section>

            <div className="pipeline-result mt-10">
              <section className="pipeline-result__section pipeline-result__section--strategy" aria-labelledby="strategy-heading">
                <h2 id="strategy-heading" className="pipeline-result__heading pipeline-result__heading--executive">
                  Strategy & Feasibility
                </h2>
                <div className="pipeline-result__card pipeline-result__card--strategy">
                  <CTOStrategyView
                    enhancedIdea={workspaceState.enhanced_idea ?? null}
                    emptyMessage="Run the pipeline to generate strategy and feasibility analysis."
                  />
                </div>
              </section>

              <ExecutionSection
                strategyJson={workspaceState?.enhanced_idea ?? null}
                scalabilityLevel={workspaceState?.scalability_level ?? null}
              />

              <section className="pipeline-result__section mvp-section" aria-labelledby="mvp-heading">
                <h2 id="mvp-heading" className="pipeline-result__heading">
                  MVP Generation
                </h2>
                <p className="panel__hint">
                  Build output and folder/file structure 
                </p>
                <div className="mvp-generate__actions">
                  <button
                    type="button"
                    className="pipeline-run__button"
                    onClick={handleGenerateMvp}
                    disabled={isDisabled || mvpGeneratePhase === "loading"}
                    aria-busy={mvpGeneratePhase === "loading"}
                  >
                    {mvpGeneratePhase === "loading" ? "Generating…" : "Generate MVP"}
                  </button>
                  {mvpGeneratePhase === "error" && mvpGenerateError && (
                    <p className="mvp-generate__error" role="alert">{mvpGenerateError}</p>
                  )}
                </div>
                {mvpGeneratePhase === "success" && (
                  <div className="pipeline-result__card mvp-generate__success-card" role="status">
                    <div className="mvp-generate__success">
                      <p><strong>Generated.</strong> Files are in <code>generated-mvp/</code>. The app is starting automatically.</p>
                      <p className="mvp-generate__open-hint">
                        Wait 10–15 seconds, then click the button below to open your app at <code>http://localhost:5173</code>. If the link does not work, run manually in two terminals:
                      </p>
                      <p className="mvp-generate__steps">
                        <code>cd generated-mvp/backend && python3 -m uvicorn main:app --reload --port 8001</code>
                      </p>
                      <p className="mvp-generate__steps">
                        <code>cd generated-mvp/frontend && npm install && npm run dev</code>
                      </p>
                    </div>
                    <a
                      href="http://localhost:5173"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="workspace__new-btn workspace__new-btn--primary mvp-generate__open-btn"
                    >
                      Open Generated Frontend
                    </a>
                  </div>
                )}
                {mvpGeneratePhase === "success" && mvpGeneratedFiles.length > 0 && (
                  <div className="pipeline-result__card mvp-generated-card">
                    <MVPGeneratedView files={mvpGeneratedFiles} showPreview={false} />
                  </div>
                )}
                <div className="pipeline-result__card">
                  <MVPGeneration
                    structure={(workspaceState?.mvp_structure ?? null) as FileNode[] | null}
                    structureText={workspaceState?.mvp_structure_text ?? null}
                  />
                </div>
              </section>
            </div>
          </>
        )}

        </main>
      </div>
      </div>
    </div>
  );
}
