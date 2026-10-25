"use client";

import { useMemo, useState } from "react";
import { ArrowDown, GitBranch, TriangleAlert } from "lucide-react";
import type { AnalysisResult, RelationType } from "@/types/analysis";

const labels: Record<RelationType, string> = {
  IMPORT: "Import",
  API_CALL: "API call",
  ROUTE_HANDLER: "Route handler",
  DATABASE: "Database",
  ENV: "Environment",
  DEPENDENCY: "Dependency",
  SCHEMA_DEFINITION: "Schema",
};
const order: RelationType[] = [
  "API_CALL",
  "ROUTE_HANDLER",
  "DATABASE",
  "SCHEMA_DEFINITION",
  "IMPORT",
  "ENV",
  "DEPENDENCY",
];

export function AnalysisPreview({ result }: { result: AnalysisResult }) {
  const [filter, setFilter] = useState<RelationType | "ALL">("ALL");
  const relations = useMemo(
    () =>
      result.relations
        .filter((relation) => filter === "ALL" || relation.type === filter)
        .sort(
          (a, b) =>
            order.indexOf(a.type) - order.indexOf(b.type) ||
            a.source.label.localeCompare(b.source.label) ||
            a.locations[0].line - b.locations[0].line,
        ),
    [filter, result.relations],
  );
  const counts = order
    .map((type) => ({
      type,
      count: result.relations.filter((relation) => relation.type === type)
        .length,
    }))
    .filter((item) => item.count > 0);
  const unresolved = result.relations.filter(
    (relation) => relation.resolutionStatus === "UNRESOLVED",
  ).length;
  return (
    <section
      aria-labelledby="analysis-title"
      className="mb-8 rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 font-mono text-[11px] text-violet-400 uppercase">
            Static analysis · browser worker
          </p>
          <h2 id="analysis-title" className="text-lg font-semibold">
            Analysis Preview
          </h2>
        </div>
        <span className="rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground">
          {result.coverage.parsedFiles} / {result.coverage.sourceFiles} source
          files parsed
        </span>
      </div>
      {result.configWarnings.length > 0 && (
        <p className="mt-4 text-xs text-yellow-300">
          {result.configWarnings.join(" ")}
        </p>
      )}
      {result.parseErrors.length > 0 && (
        <div className="mt-4 flex items-start gap-2 text-xs text-yellow-300">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p>
              {result.parseErrors.length} file(s) have parse or schema coverage
              gaps.
            </p>
            <ul className="mt-2 space-y-1">
              {result.parseErrors.slice(0, 10).map((item, index) => (
                <li
                  key={`${item.filePath}:${item.line}:${index}`}
                  className="break-all font-mono"
                >
                  {item.filePath}
                  {item.line ? `:${item.line}` : ""} · {item.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {result.coverage.truncatedRecords > 0 && (
        <p className="mt-4 text-xs text-yellow-300">
          Some extraction results were capped.{" "}
          {result.coverage.truncatedRecords.toLocaleString()} record(s) were
          omitted.
        </p>
      )}
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {[
          {
            label: "Source parsed",
            value: `${result.coverage.parsedFiles} / ${result.coverage.sourceFiles}`,
          },
          {
            label: "Schema files",
            value: `${result.coverage.parsedSchemaFiles} / ${result.coverage.schemaFiles}`,
          },
          ...counts.map(({ type, count }) => ({
            label: labels[type],
            value: count,
          })),
        ].map(({ label, value }) => (
          <div key={label} className="rounded-md border border-border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-mono text-base">
              {typeof value === "number" ? value.toLocaleString() : value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <div>
          <h3 className="text-sm font-medium">
            Relations{" "}
            <span className="ml-1 font-mono text-muted-foreground">
              {result.relations.length}
            </span>
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {unresolved.toLocaleString()} unresolved relation(s) · no issues or
            scores were generated.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Type
          <select
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value as RelationType | "ALL")
            }
            className="rounded border border-border bg-background px-2 py-1.5 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="ALL">All</option>
            {order.map((type) => (
              <option key={type} value={type}>
                {labels[type]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {relations.length ? (
        <ol className="mt-4 space-y-2">
          {relations.slice(0, 300).map((relation) => (
            <li
              key={relation.id}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[8rem_1fr_auto] sm:items-center"
            >
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-wide text-violet-300 uppercase">
                <GitBranch className="size-3.5" aria-hidden="true" />
                {labels[relation.type]}
              </span>
              <div className="min-w-0">
                <p className="break-all font-mono text-xs">
                  {relation.source.label}
                </p>
                <div className="my-1 flex items-center gap-1 text-muted-foreground">
                  <ArrowDown className="size-3" aria-hidden="true" />
                  <span className="break-all text-[10px]">
                    {relation.evidence}
                  </span>
                </div>
                <p className="break-all font-mono text-xs">
                  {relation.target.label}
                </p>
                <p className="mt-1 break-all text-[10px] text-muted-foreground">
                  {relation.locations
                    .map(
                      (location) =>
                        `${location.filePath}:${location.line}:${location.column}`,
                    )
                    .join(", ")}
                </p>
              </div>
              <span className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
                {relation.resolutionStatus} · {relation.confidence}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No relationships were found in the analyzed files.
        </p>
      )}
      {relations.length > 300 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first 300 relations. The full structured result remains
          available in this session.
        </p>
      )}
      {result.coverage.unresolvedImports +
        result.coverage.unresolvedApiCalls +
        result.coverage.unresolvedDatabaseCalls >
        0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Unresolved imports: {result.coverage.unresolvedImports} · API calls:{" "}
          {result.coverage.unresolvedApiCalls} · database calls:{" "}
          {result.coverage.unresolvedDatabaseCalls}. Dynamic references and
          unsupported patterns are not guessed.
        </p>
      )}
    </section>
  );
}
