"use client";

type Props = {
  diagram?: string | null;
  loading?: boolean;
  error?: string | null;
  hasStrategy?: boolean;
};

export default function ArchitectureView({
  diagram,
  loading = false,
  error = null,
  hasStrategy = false,
}: Props) {
  if (!hasStrategy) {
    return (
      <div className="architecture-view architecture-view--empty">
        <p className="architecture-view__empty-text">
          Run the pipeline to generate strategy. The architecture diagram will appear here.
        </p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="architecture-view architecture-view--loading">
        <p className="architecture-view__loading-text">Generating architecture diagram…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="architecture-view architecture-view--error">
        <p className="architecture-view__error-text">{error}</p>
      </div>
    );
  }
  if (!diagram || !diagram.trim()) {
    return (
      <div className="architecture-view architecture-view--empty">
        <p className="architecture-view__empty-text">No diagram generated.</p>
      </div>
    );
  }
  return (
    <div className="architecture-view">
      <pre className="architecture-view__pre">{diagram}</pre>
    </div>
  );
}
