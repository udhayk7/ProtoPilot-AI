"use client";

/**
 * SOW + PRD strategy view. Client-facing document layout.
 * Same backend schema; UI only.
 */
export interface CTOStrategyData {
  solution_brief: {
    problem_summary: string;
    solution_overview: string[];
    target_users: string[];
    key_differentiators: string[];
  };
  statement_of_work: {
    scope_of_work: string[];
    in_scope_deliverables: string[];
    out_of_scope: string[];
    assumptions: string[];
    milestones: Array<{ phase: string; description: string; deliverables: string[] }>;
    acceptance_criteria: string[];
  };
  product_requirements: {
    functional_requirements: string[];
    non_functional_requirements: string[];
    architecture_summary: string;
    tech_stack: {
      frontend: string;
      backend: string;
      database: string;
      ai_components: string;
      deployment: string;
    };
    success_metrics: string[];
  };
  feasibility_score?: number;
}

const CTO_REQUIRED_KEYS: (keyof CTOStrategyData)[] = [
  "solution_brief",
  "statement_of_work",
  "product_requirements",
];

export function parseCTOStrategy(raw: string | null | undefined): CTOStrategyData | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of CTO_REQUIRED_KEYS) {
      if (!(key in parsed)) return null;
    }
    return parsed as unknown as CTOStrategyData;
  } catch {
    return null;
  }
}

function cap<T>(arr: T[] | undefined, n: number): T[] {
  if (!arr?.length) return [];
  return arr.slice(0, n);
}

function lineClamp(s: string, lines = 2): string {
  const parts = s.split(/\n/).slice(0, lines);
  return parts.join(" ").trim() || "—";
}

function BulletList({ items, max = 10 }: { items: string[]; max?: number }) {
  const list = cap(items, max);
  if (!list.length) return <p className="sow-doc__muted">—</p>;
  return (
    <ul className="sow-doc__bullets">
      {list.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function DocCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  return (
    <section className={`sow-doc__card ${className}`.trim()} aria-labelledby={id}>
      <h3 id={id} className="sow-doc__card-title">{title}</h3>
      <div className="sow-doc__card-body">{children}</div>
    </section>
  );
}

type Props = {
  enhancedIdea: string | null | undefined;
  emptyMessage?: string;
};

export default function CTOStrategyView({
  enhancedIdea,
  emptyMessage = "Run the pipeline to generate strategy (SOW + PRD).",
}: Props) {
  const cto = parseCTOStrategy(enhancedIdea);

  if (!enhancedIdea || !enhancedIdea.trim()) {
    return <p className="sow-doc__empty">{emptyMessage}</p>;
  }

  if (!cto) {
    return <pre className="sow-doc__raw">{enhancedIdea}</pre>;
  }

  const sb = cto.solution_brief ?? {};
  const sow = cto.statement_of_work ?? {};
  const pr = cto.product_requirements ?? {};
  const ts = pr.tech_stack ?? ({} as CTOStrategyData["product_requirements"]["tech_stack"]);

  const problemText = lineClamp(sb.problem_summary || "—", 2);
  const solutionBullets = cap(sb.solution_overview ?? [], 5);
  const differentiators = cap(sb.key_differentiators ?? [], 3);
  const objective = (sow.scope_of_work ?? [])[0] || problemText;
  const scope = cap(sow.scope_of_work ?? [], 5);
  const deliverables = cap(sow.in_scope_deliverables ?? [], 5);
  const assumptions = cap(sow.assumptions ?? [], 3);
  const acceptance = cap(sow.acceptance_criteria ?? [], 3);
  const inScope = sow.in_scope_deliverables ?? [];
  const outOfScope = sow.out_of_scope ?? [];
  const coreModules = cap(sb.solution_overview ?? [], 8);
  const functional = cap(pr.functional_requirements ?? [], 5);
  const nonFunctional = cap(pr.non_functional_requirements ?? [], 5);

  return (
    <div className="sow-doc">
      {/* Section 1: Solution Overview — full width */}
      <DocCard title="Solution Overview" className="sow-doc__card--full">
        <p className="sow-doc__problem">{problemText}</p>
        <p className="sow-doc__label">Solution summary</p>
        <BulletList items={solutionBullets} max={5} />
        <p className="sow-doc__label">Target users</p>
        <div className="sow-doc__tags">
          {(sb.target_users ?? []).length
            ? (sb.target_users ?? []).map((u, i) => (
                <span key={i} className="sow-doc__tag">
                  {u}
                </span>
              ))
            : "—"}
        </div>
        <p className="sow-doc__label">Key differentiators</p>
        <BulletList items={differentiators} max={3} />
      </DocCard>

      {/* Section 2: Two columns — SOW | Project Scope Summary */}
      <div className="sow-doc__two-col">
        <DocCard title="Statement of Work">
          <p className="sow-doc__objective">{objective}</p>
          <p className="sow-doc__label">Scope</p>
          <BulletList items={scope} max={5} />
          <p className="sow-doc__label">Deliverables</p>
          <BulletList items={deliverables} max={5} />
          <p className="sow-doc__label">Assumptions</p>
          <BulletList items={assumptions} max={3} />
          <p className="sow-doc__label">Acceptance criteria</p>
          <BulletList items={acceptance} max={3} />
        </DocCard>
        <DocCard title="Project Scope Summary">
          <p className="sow-doc__label">In-scope modules</p>
          <BulletList items={inScope} max={6} />
          <p className="sow-doc__label">Out of scope</p>
          <BulletList items={outOfScope} max={5} />
          <p className="sow-doc__label">Constraints</p>
          <BulletList items={[]} max={3} />
        </DocCard>
      </div>

      {/* Section 3: Product Requirements — full width */}
      <DocCard title="Product Requirements" className="sow-doc__card--full">
        <p className="sow-doc__label">Core modules</p>
        <BulletList items={coreModules} max={8} />
        <p className="sow-doc__label">Functional requirements</p>
        <BulletList items={functional} max={5} />
        <p className="sow-doc__label">Non-functional requirements</p>
        <BulletList items={nonFunctional} max={5} />
        <p className="sow-doc__label">Architecture summary</p>
        <p className="sow-doc__paragraph">{pr.architecture_summary || "—"}</p>
      </DocCard>

      {/* Section 4: Technical Alignment — horizontal block */}
      <div className="sow-doc__tech">
        <h3 className="sow-doc__tech-title">Technical Alignment</h3>
        <div className="sow-doc__tech-row">
          <div className="sow-doc__tech-cell">
            <span className="sow-doc__tech-label">Frontend</span>
            <span className="sow-doc__tech-value">{ts.frontend || "—"}</span>
          </div>
          <div className="sow-doc__tech-cell">
            <span className="sow-doc__tech-label">Backend</span>
            <span className="sow-doc__tech-value">{ts.backend || "—"}</span>
          </div>
          <div className="sow-doc__tech-cell">
            <span className="sow-doc__tech-label">Database</span>
            <span className="sow-doc__tech-value">{ts.database || "—"}</span>
          </div>
          <div className="sow-doc__tech-cell">
            <span className="sow-doc__tech-label">AI</span>
            <span className="sow-doc__tech-value">{ts.ai_components || "—"}</span>
          </div>
          <div className="sow-doc__tech-cell">
            <span className="sow-doc__tech-label">Deployment</span>
            <span className="sow-doc__tech-value">{ts.deployment || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
