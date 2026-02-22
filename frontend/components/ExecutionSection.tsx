"use client";

import { useCallback, useEffect, useState } from "react";
import { generateArchitectureDiagram } from "@/lib/apiClient";
import ArchitectureView from "./ArchitectureView";

type Props = {
  strategyJson: string | null;
  scalabilityLevel?: string | null;
  preferredFrontend?: string | null;
  preferredBackend?: string | null;
  preferredDatabase?: string | null;
  preferredAiModel?: string | null;
  deploymentPreference?: string | null;
};

export default function ExecutionSection({
  strategyJson,
  scalabilityLevel,
  preferredFrontend,
  preferredBackend,
  preferredDatabase,
  preferredAiModel,
  deploymentPreference,
}: Props) {
  const [diagram, setDiagram] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDiagram = useCallback(async () => {
    if (!(strategyJson ?? "").trim()) return;
    setLoading(true);
    setError(null);
    const result = await generateArchitectureDiagram({
      strategy_json: strategyJson!,
      scalability_level: scalabilityLevel ?? undefined,
      preferred_frontend: preferredFrontend ?? undefined,
      preferred_backend: preferredBackend ?? undefined,
      preferred_database: preferredDatabase ?? undefined,
      preferred_ai_model: preferredAiModel ?? undefined,
      deployment_preference: deploymentPreference ?? undefined,
    });
    setLoading(false);
    if (result.ok) {
      setDiagram(result.diagram);
    } else {
      setError(result.error?.message ?? "Failed to generate diagram");
    }
  }, [
    strategyJson,
    scalabilityLevel,
    preferredFrontend,
    preferredBackend,
    preferredDatabase,
    preferredAiModel,
    deploymentPreference,
  ]);

  useEffect(() => {
    setDiagram(null);
    setError(null);
  }, [
    strategyJson,
    scalabilityLevel,
    preferredFrontend,
    preferredBackend,
    preferredDatabase,
    preferredAiModel,
    deploymentPreference,
  ]);

  useEffect(() => {
    if ((strategyJson ?? "").trim() && diagram === null && !loading) {
      fetchDiagram();
    }
  }, [strategyJson, diagram, loading, fetchDiagram]);

  return (
    <section className="execution-section" aria-labelledby="execution-heading">
      <h2 id="execution-heading" className="execution-section__title">
        Execution Plan
      </h2>
      <div className="execution-section__single">
        <ArchitectureView
          diagram={diagram}
          loading={loading}
          error={error}
          hasStrategy={!!(strategyJson ?? "").trim()}
        />
      </div>
    </section>
  );
}
