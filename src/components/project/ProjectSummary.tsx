import type { ProjectMetadata } from "@/types/project";
import { Button } from "@/components/ui/button";
import { StackBadge } from "./StackBadge";

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    : bytes >= 1024
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${bytes} B`;
}

export function ProjectSummary({
  metadata,
  onViewFiles,
  onClear,
  onStart,
  busy,
  analysisReady,
  auditComplete,
}: {
  metadata: ProjectMetadata;
  onViewFiles: () => void;
  onClear: () => void;
  onStart: () => void;
  busy: boolean;
  analysisReady: boolean;
  auditComplete: boolean;
}) {
  const stats = [
    ["Total files", metadata.totalFiles],
    ["Included", metadata.includedFiles],
    ["Excluded", metadata.excludedFiles],
    ["Unsupported", metadata.unsupportedFiles],
    ["Included text", formatBytes(metadata.totalTextBytes)],
  ];
  return (
    <section
      aria-labelledby="project-title"
      className="mb-8 rounded-xl border border-border bg-card p-6 sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[11px] text-violet-400 uppercase">
            Local project · prepared
          </p>
          <h2
            id="project-title"
            className="break-all text-2xl font-semibold tracking-tight"
          >
            {metadata.name}
          </h2>
        </div>
        <Button variant="ghost" onClick={onClear}>
          Clear project
        </Button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 xl:grid-cols-5">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-lg">{value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Counts are separate: total = included + excluded + unsupported. Text
        size is the original size of successfully read included files.
      </p>
      <div className="mt-6">
        <h3 className="mb-3 text-xs text-muted-foreground">Detected Stack</h3>
        <div className="flex flex-wrap gap-2">
          {metadata.stack.length ? (
            metadata.stack.map((stack) => (
              <StackBadge key={stack} stack={stack} />
            ))
          ) : (
            <span className="text-sm text-muted-foreground">Unknown</span>
          )}
        </div>
      </div>
      {metadata.warnings.map((warning) => (
        <p key={warning} className="mt-3 text-xs text-yellow-300">
          {warning}
        </p>
      ))}
      {metadata.protectedFiles > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {metadata.protectedFiles} file(s) had values masked in memory. This is
          a safety step, not a security finding.
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="outline" onClick={onViewFiles}>
          View Files
        </Button>
        <Button
          disabled={busy}
          aria-describedby="audit-unavailable"
          onClick={onStart}
        >
          {busy
            ? "Analyzing Project..."
            : auditComplete
              ? "Select folder to re-audit"
              : analysisReady
                ? "Run Audit"
                : "Run Audit"}
        </Button>
      </div>
      <p id="audit-unavailable" className="mt-3 text-xs text-muted-foreground">
        {analysisReady
          ? "Runs static analysis and Rule scoring locally in this browser. AI is optional."
          : "Runs static analysis and Rule scoring in sequence. Re-audit requires selecting the folder again."}
      </p>
    </section>
  );
}
