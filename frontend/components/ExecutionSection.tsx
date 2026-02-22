"use client";

import { useCallback, useEffect, useState } from "react";
import { generateArchitectureDiagram } from "@/lib/apiClient";
import ArchitectureView from "./ArchitectureView";

type Props = {
  strategyJson: string | null;
  scalabilityLevel?: string | null;
};

export default function ExecutionSection({ strategyJson, scalabilityLevel }: Props) {
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
    });
    setLoading(false);
    if (result.ok) {
      setDiagram(result.diagram);
    } else {
      setError(result.error?.message ?? "Failed to generate diagram");
    }
  }, [strategyJson, scalabilityLevel]);

  useEffect(() => {
    setDiagram(null);
    setError(null);
  }, [strategyJson]);

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
