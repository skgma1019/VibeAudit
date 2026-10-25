import type { AuditCategory, AuditResult, RuleIssue } from "@/types/audit";

const categoryLabels: Record<AuditCategory, string> = {
  DATA_INTEGRITY: "Data Integrity",
  CONSISTENCY: "Consistency",
  SECURITY: "Security",
  STRUCTURE: "Structure",
  DEPENDENCY: "Dependencies",
};
const categoryOrder: AuditCategory[] = [
  "DATA_INTEGRITY",
  "SECURITY",
  "CONSISTENCY",
  "STRUCTURE",
  "DEPENDENCY",
];
const severityOrder: RuleIssue["severity"][] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
];

function severityClass(severity: RuleIssue["severity"]) {
  return severity === "CRITICAL" || severity === "HIGH"
    ? "border-rose-500/30 text-rose-300"
    : severity === "MEDIUM"
      ? "border-amber-500/30 text-amber-300"
      : "border-border text-muted-foreground";
}

export function RuleResultPreview({ result }: { result: AuditResult }) {
  const severityCounts = Object.fromEntries(
    severityOrder.map((severity) => [
      severity,
      result.issues.filter((issue) => issue.severity === severity).length,
    ]),
  ) as Record<RuleIssue["severity"], number>;
  return (
    <section
      aria-labelledby="rule-preview-title"
      className="mt-8 space-y-6 rounded-xl border border-border bg-card p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-wide text-violet-400 uppercase">
            Local deterministic rules
          </p>
          <h2 id="rule-preview-title" className="mt-2 text-xl font-semibold">
            Rule Result Preview
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {result.issues.length} unique rule issue(s) · {result.ruleVersion} ·{" "}
          {result.scores.grade} grade
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.7fr]">
        <div className="rounded-lg border border-border bg-background p-5">
          <p className="text-xs text-muted-foreground">Project Health</p>
          <p className="mt-2 font-mono text-4xl font-semibold">
            {result.scores.overall.toFixed(1)}
            <span className="ml-1 text-base text-muted-foreground">/ 100</span>
          </p>
          <p className="mt-2 text-sm text-violet-300">
            Grade {result.scores.grade}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-2">
            {severityOrder.map((severity) => (
              <p
                key={severity}
                className="rounded-md border border-border px-3 py-2"
              >
                <span className="text-muted-foreground">{severity}</span>
                <span className="float-right font-mono">
                  {severityCounts[severity]}
                </span>
              </p>
            ))}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {categoryOrder.map((category) => (
            <div
              key={category}
              className="rounded-lg border border-border bg-background p-4"
            >
              <p className="text-xs text-muted-foreground">
                {categoryLabels[category]}
              </p>
              <p className="mt-2 font-mono text-2xl">
                {result.scores.categories[category].toFixed(1)}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Coverage: {result.coverage[category]}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium">Issues</h3>
        {result.issues.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            No rule issues were detected in the analyzed scope. Review coverage
            before treating this as a complete project assessment.
          </p>
        ) : (
          result.issues.slice(0, 50).map((issue) => (
            <article
              key={issue.fingerprint}
              className="rounded-lg border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded border px-2 py-1 font-mono text-[10px] ${severityClass(issue.severity)}`}
                >
                  {issue.severity}
                </span>
                <span className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
                  {categoryLabels[issue.category]}
                </span>
                <span className="rounded border border-violet-500/30 px-2 py-1 font-mono text-[10px] text-violet-300">
                  RULE
                </span>
                <span className="rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground">
                  {issue.detectionKind}
                </span>
              </div>
              <h4 className="mt-3 text-sm font-medium">{issue.title}</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {issue.description}
              </p>
              <p className="mt-3 break-all font-mono text-xs text-foreground/80">
                {issue.locations
                  .map((location) => `${location.filePath}:${location.line}`)
                  .join(" · ")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {issue.evidence}
              </p>
              <p className="mt-2 text-xs text-violet-200">
                Suggestion: {issue.suggestion}
              </p>
            </article>
          ))
        )}
        {result.issues.length > 50 && (
          <p className="text-xs text-muted-foreground">
            Showing the first 50 of {result.issues.length} issues.
          </p>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Score policy {result.scoreVersion}. Resolved status does not affect this
        score; run the audit again after code changes.
      </p>
    </section>
  );
}
