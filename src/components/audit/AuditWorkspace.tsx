"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, FolderTree, GitBranch, ListChecks } from "lucide-react";
import { AIAnalysisPanel } from "@/components/audit/AIAnalysisPanel";
import { SaveAuditPanel } from "@/components/audit/SaveAuditPanel";
import { FileTree } from "@/components/project/FileTree";
import { Button } from "@/components/ui/button";
import {
  countIssuesByFile,
  countSeverities,
  scoreDeductionForCategory,
  selectIssues,
  selectRelations,
  type IssueFilters,
} from "@/lib/audit/dashboard";
import type { AnalysisResult, RelationType } from "@/types/analysis";
import type { AIAnalysisResult, AIStatus } from "@/types/ai";
import {
  auditCategories,
  severities,
  type AuditCategory,
  type AuditResult,
  type RuleIssue,
} from "@/types/audit";
import type {
  ProjectFile,
  ProjectFileContent,
  ProjectMetadata,
} from "@/types/project";

type View = "overview" | "issues" | "files" | "relations" | "ai";
const viewItems: Array<{ id: View; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "issues", label: "Issues" },
  { id: "files", label: "Files" },
  { id: "relations", label: "Relations" },
  { id: "ai", label: "AI Analysis" },
];
const categories: Record<AuditCategory, string> = {
  DATA_INTEGRITY: "Data Integrity",
  CONSISTENCY: "Consistency",
  SECURITY: "Security",
  STRUCTURE: "Structure",
  DEPENDENCY: "Dependencies",
};
const relationTypes: RelationType[] = [
  "IMPORT",
  "API_CALL",
  "ROUTE_HANDLER",
  "DATABASE",
  "ENV",
  "DEPENDENCY",
  "SCHEMA_DEFINITION",
];

function viewFromHash(): View {
  const value = window.location.hash.replace("#view-", "");
  return viewItems.some((item) => item.id === value)
    ? (value as View)
    : "overview";
}

function SeverityBadge({ severity }: { severity: RuleIssue["severity"] }) {
  const color =
    severity === "CRITICAL" || severity === "HIGH"
      ? "text-rose-300 border-rose-500/40"
      : severity === "MEDIUM"
        ? "text-amber-200 border-amber-500/40"
        : "text-sky-200 border-sky-500/40";
  return (
    <span className={`rounded border px-2 py-1 font-mono text-[10px] ${color}`}>
      {severity}
    </span>
  );
}

function CoverageNotice({
  audit,
  analysis,
}: {
  audit: AuditResult;
  analysis: AnalysisResult;
}) {
  const partialCategories = auditCategories.filter(
    (category) => audit.coverage[category] !== "FULL",
  );
  const gaps =
    analysis.coverage.failedFiles +
    analysis.coverage.failedSchemaFiles +
    analysis.coverage.truncatedRecords;
  if (!partialCategories.length && !gaps)
    return (
      <p className="mt-4 rounded border border-border px-3 py-2 text-xs text-muted-foreground">
        Coverage: all configured Rule categories report full coverage for the
        current analysis.
      </p>
    );
  return (
    <div
      role="status"
      className="mt-4 rounded border border-amber-500/30 bg-amber-950/10 px-3 py-3 text-xs leading-5 text-amber-100"
    >
      Coverage is limited. Categories:{" "}
      {partialCategories.map((item) => categories[item]).join(", ") || "none"};{" "}
      {analysis.coverage.failedFiles} source parse failures,{" "}
      {analysis.coverage.failedSchemaFiles} schema parse failures,{" "}
      {analysis.coverage.truncatedRecords} capped records. No issues were
      assessed outside this coverage.
    </div>
  );
}

function IssueCard({
  issue,
  ai,
  relations,
}: {
  issue: RuleIssue;
  ai: AIAnalysisResult | null;
  relations: AnalysisResult["relations"];
}) {
  const related =
    ai?.issueInsights.filter((item) =>
      item.relatedIssueIds.includes(issue.fingerprint),
    ) ?? [];
  const contextualRelations = relations
    .filter((relation) =>
      issue.locations.some((location) =>
        relation.locations.some(
          (relatedLocation) => relatedLocation.filePath === location.filePath,
        ),
      ),
    )
    .slice(0, 5);
  return (
    <article className="rounded-lg border border-border bg-background p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeverityBadge severity={issue.severity} />
        <span className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
          {categories[issue.category]}
        </span>
        <span className="rounded border border-violet-500/40 px-2 py-1 font-mono text-[10px] text-violet-200">
          RULE · {issue.detectionKind}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-semibold">{issue.title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {issue.description}
      </p>
      <p className="mt-3 break-all font-mono text-[11px]">
        {issue.locations
          .map(
            (location) =>
              `${location.filePath}:${location.line}:${location.column}`,
          )
          .join(" · ")}
      </p>
      <details className="mt-3 rounded border border-border px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Evidence and suggested direction
        </summary>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {issue.evidence}
        </p>
        <p className="mt-2 text-xs leading-5 text-violet-100">
          {issue.suggestion}
        </p>
      </details>
      {contextualRelations.length > 0 && (
        <div className="mt-3 rounded border border-border p-3">
          <p className="font-mono text-[10px] text-muted-foreground">
            RELATIONS IN FINDING FILES
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            {contextualRelations.map((relation) => (
              <li key={relation.id} className="break-all">
                <span className="text-violet-200">{relation.type}</span>{" "}
                {relation.source.label} → {relation.target.label}
              </li>
            ))}
          </ul>
          <a
            href="#view-relations"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-violet-200 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            Explore relations{" "}
            <ArrowDown aria-hidden="true" className="size-3" />
          </a>
        </div>
      )}
      {related.map((insight) => (
        <div
          key={insight.id}
          className="mt-3 rounded border border-cyan-500/20 p-3"
        >
          <p className="font-mono text-[10px] text-cyan-200">
            AI EXPLANATION · {insight.evidenceStatus}
          </p>
          <p className="mt-1 text-xs leading-5">{insight.explanation}</p>
        </div>
      ))}
    </article>
  );
}

export function AuditWorkspace({
  metadata,
  files,
  contents,
  analysis,
  audit,
  onSelectAnother,
}: {
  metadata: ProjectMetadata;
  files: ProjectFile[];
  contents: ProjectFileContent[];
  analysis: AnalysisResult;
  audit: AuditResult;
  onSelectAnother: () => void;
}) {
  const [view, setView] = useState<View>("overview");
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [aiStatus, setAiStatus] = useState<AIStatus>("IDLE");
  const onAIResultChange = useCallback(
    (value: AIAnalysisResult | null) => setAiResult(value),
    [],
  );
  const onAIStatusChange = useCallback(
    (value: AIStatus) => setAiStatus(value),
    [],
  );
  const [filters, setFilters] = useState<IssueFilters>({
    severity: "ALL",
    category: "ALL",
    detectionKind: "ALL",
    origin: "ALL",
  });
  const [relationType, setRelationType] = useState<RelationType | "ALL">("ALL");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const counts = useMemo(() => countSeverities(audit.issues), [audit.issues]);
  const fileIssueCounts = useMemo(
    () => countIssuesByFile(audit.issues),
    [audit.issues],
  );
  const selectedIssues = useMemo(
    () => selectIssues(audit, aiResult, filters),
    [audit, aiResult, filters],
  );
  const visibleRelations = useMemo(
    () => selectRelations(analysis.relations, relationType),
    [analysis.relations, relationType],
  );
  const selectedFileInfo = files.find(
    (file) => file.relativePath === selectedFile,
  );
  const selectedFileRelations = analysis.relations.filter(
    (relation) =>
      relation.source.filePath === selectedFile ||
      relation.target.filePath === selectedFile,
  );
  useEffect(() => {
    const sync = () => setView(viewFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:p-7">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wide text-violet-300">
            Audit workspace · local session
          </p>
          <h1 className="mt-2 break-all text-2xl font-semibold">
            {metadata.name}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Rule audit complete · {analysis.coverage.parsedFiles} /{" "}
            {analysis.coverage.sourceFiles} source files parsed · AI is advisory
            and optional
          </p>
        </div>
        <Button variant="outline" onClick={onSelectAnother}>
          Select folder to re-audit
        </Button>
      </header>
      <nav
        aria-label="Audit views"
        className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1"
      >
        {viewItems.map((item) => (
          <a
            key={item.id}
            href={`#view-${item.id}`}
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-2 text-xs focus-visible:outline-2 focus-visible:outline-ring ${view === item.id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section
        hidden={view !== "overview"}
        aria-labelledby="dashboard-overview-title"
        className="space-y-5"
      >
        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.8fr]">
          <article className="rounded-xl border border-border bg-card p-5 sm:p-7">
            <p className="text-xs text-muted-foreground">
              Project Health · Rule Engine
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-mono text-5xl font-semibold">
                {audit.scores.overall.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
              <span className="ml-auto rounded border border-violet-500/30 px-3 py-1 text-sm text-violet-200">
                Grade {audit.scores.grade}
              </span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Only unique Rule findings reduce this score. AI-only insights have
              no score impact.
            </p>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Score policy {audit.scoreVersion} · {audit.ruleVersion}
            </p>
          </article>
          <div>
            <h2 id="dashboard-overview-title" className="sr-only">
              Category scores
            </h2>
            <div className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {auditCategories.map((category) => (
                <article
                  key={category}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="min-h-8 text-xs text-muted-foreground">
                    {categories[category]}
                  </p>
                  <p className="mt-2 font-mono text-2xl">
                    {audit.scores.categories[category].toFixed(1)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Coverage {audit.coverage[category]}
                  </p>
                  <p className="mt-2 text-[10px] text-rose-200">
                    −{scoreDeductionForCategory(audit, category)} points
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
        <CoverageNotice audit={audit} analysis={analysis} />
        <SaveAuditPanel
          metadata={metadata}
          analysis={analysis}
          audit={audit}
          ai={aiResult}
          aiStatus={aiStatus}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {severities.map((severity) => (
            <button
              key={severity}
              onClick={() => {
                setFilters((value) => ({ ...value, severity }));
                setView("issues");
                window.location.hash = "view-issues";
              }}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex items-center gap-2">
                <SeverityBadge severity={severity} />
                <span className="text-xs text-muted-foreground">
                  Rule findings
                </span>
              </span>
              <span className="font-mono text-xl">{counts[severity]}</span>
            </button>
          ))}
        </div>
        {audit.issues.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No issues were detected within the current analysis coverage.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <button
            onClick={() => {
              setView("issues");
              window.location.hash = "view-issues";
            }}
            className="rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
          >
            <ListChecks className="mb-3 size-4 text-violet-300" />
            <p className="text-sm">Explore findings</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Filter {audit.issues.length} Rule findings and optional AI
              candidates
            </p>
          </button>
          <button
            onClick={() => {
              setView("files");
              window.location.hash = "view-files";
            }}
            className="rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
          >
            <FolderTree className="mb-3 size-4 text-violet-300" />
            <p className="text-sm">Explore files</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Issue counts and relation context by path
            </p>
          </button>
          <button
            onClick={() => {
              setView("relations");
              window.location.hash = "view-relations";
            }}
            className="rounded-lg border border-border bg-card p-4 text-left hover:bg-accent"
          >
            <GitBranch className="mb-3 size-4 text-violet-300" />
            <p className="text-sm">Explore relations</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {analysis.relations.length} static code relationships
            </p>
          </button>
        </div>
      </section>

      <section
        hidden={view !== "issues"}
        aria-labelledby="issues-title"
        className="space-y-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="issues-title" className="text-lg font-semibold">
              Issue Explorer
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Rule findings are score-bearing. AI potential findings are
              unverified and do not affect scores.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {selectedIssues.length} result(s)
          </span>
        </div>
        <div className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ["severity", "Severity", severities],
              ["category", "Category", auditCategories],
              ["detectionKind", "Detection", ["DETERMINISTIC", "HEURISTIC"]],
              ["origin", "Origin", ["ALL", "RULE", "AI"]],
            ] as const
          ).map(([key, label, options]) => (
            <label key={key} className="text-[11px] text-muted-foreground">
              {label}
              <select
                value={filters[key]}
                onChange={(event) => {
                  const value = event.target.value;
                  setFilters((current) =>
                    key === "origin" && value === "AI"
                      ? {
                          severity: "ALL",
                          category: "ALL",
                          detectionKind: "ALL",
                          origin: "AI",
                        }
                      : { ...current, [key]: value },
                  );
                }}
                className="mt-1 block w-full rounded border border-border bg-background px-2 py-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                {(key === "severity" ||
                key === "category" ||
                key === "detectionKind"
                  ? ["ALL", ...options]
                  : options
                ).map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL" ? "All" : option.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="space-y-3">
          {selectedIssues.map((item) =>
            item.origin === "RULE" ? (
              <IssueCard
                key={item.issue.fingerprint}
                issue={item.issue}
                ai={aiResult}
                relations={analysis.relations}
              />
            ) : (
              <article
                key={item.insight.id}
                className="rounded-lg border border-cyan-500/30 bg-card p-4"
              >
                <div className="flex flex-wrap gap-2">
                  <span className="rounded border border-cyan-500/40 px-2 py-1 font-mono text-[10px] text-cyan-200">
                    AI · POTENTIAL · NO SCORE IMPACT
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {item.insight.confidence} confidence ·{" "}
                    {item.insight.evidenceStatus}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold">
                  {item.insight.title}
                </h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {item.insight.explanation}
                </p>
                <p className="mt-2 text-xs text-cyan-100">
                  Suggested direction: {item.insight.suggestion}
                </p>
                <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                  {item.insight.locations
                    .map((location) => `${location.filePath}:${location.line}`)
                    .join(" · ")}
                </p>
              </article>
            ),
          )}
        </div>
        {selectedIssues.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {audit.issues.length === 0 && !aiResult?.potentialIssues.length
              ? "No issues were detected within the current analysis coverage."
              : "No findings match these filters."}
          </p>
        )}
        <CoverageNotice audit={audit} analysis={analysis} />
      </section>

      <section
        hidden={view !== "files"}
        aria-labelledby="files-view-title"
        className="space-y-4"
      >
        <div>
          <h2 id="files-view-title" className="text-lg font-semibold">
            Files
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Source code is not displayed. Select a path for issue and
            relationship context.
          </p>
        </div>
        <FileTree
          files={files}
          issueCounts={fileIssueCounts}
          selectedPath={selectedFile}
          onSelect={setSelectedFile}
        />
        {selectedFileInfo && (
          <article className="rounded-lg border border-border bg-card p-5">
            <h3 className="break-all font-mono text-sm">
              {selectedFileInfo.relativePath}
            </h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {fileIssueCounts.get(selectedFileInfo.relativePath) ?? 0} Rule
              issue(s) · {selectedFileRelations.length} relation(s) ·{" "}
              {selectedFileInfo.status}
            </p>
            {selectedFileRelations.length > 0 && (
              <ul className="mt-3 space-y-2">
                {selectedFileRelations.slice(0, 20).map((relation) => (
                  <li key={relation.id} className="text-xs">
                    <span className="text-violet-200">{relation.type}</span>{" "}
                    {relation.source.label} → {relation.target.label}
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </section>

      <section
        hidden={view !== "relations"}
        aria-labelledby="relations-title"
        className="space-y-4"
      >
        <div>
          <h2 id="relations-title" className="text-lg font-semibold">
            Code Relations
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Static relationship candidates from the selected project. Unresolved
            references are shown explicitly.
          </p>
        </div>
        <label className="block max-w-xs text-xs text-muted-foreground">
          Relation type
          <select
            value={relationType}
            onChange={(event) =>
              setRelationType(event.target.value as RelationType | "ALL")
            }
            className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="ALL">All types</option>
            {relationTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <div className="space-y-2">
          {visibleRelations.slice(0, 300).map((relation) => (
            <article
              key={relation.id}
              className="grid gap-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-[9rem_1fr_auto] sm:items-center"
            >
              <span className="font-mono text-[10px] text-violet-200">
                {relation.type.replaceAll("_", " ")}
              </span>
              <div className="min-w-0">
                <p className="break-all text-xs">{relation.source.label}</p>
                <div className="flex items-center gap-1 py-1 text-muted-foreground">
                  <ArrowDown aria-hidden="true" className="size-3" />
                  <span className="break-all text-[10px]">
                    {relation.evidence}
                  </span>
                </div>
                <p className="break-all text-xs">{relation.target.label}</p>
                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                  {relation.locations
                    .map((location) => `${location.filePath}:${location.line}`)
                    .join(" · ")}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {relation.resolutionStatus} · {relation.confidence}
              </span>
            </article>
          ))}
        </div>
        {visibleRelations.length === 0 && (
          <p className="rounded border border-dashed border-border p-7 text-center text-sm text-muted-foreground">
            {analysis.relations.length === 0
              ? "No relationships were found within the current analysis coverage."
              : "No relationships match this type filter."}
          </p>
        )}
      </section>

      <section hidden={view !== "ai"} aria-label="AI analysis panel">
        <AIAnalysisPanel
          metadata={metadata}
          contents={contents}
          analysis={analysis}
          audit={audit}
          onResultChange={onAIResultChange}
          onStatusChange={onAIStatusChange}
        />
      </section>
    </div>
  );
}
