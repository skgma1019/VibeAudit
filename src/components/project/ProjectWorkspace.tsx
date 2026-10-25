"use client";

import { useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditWorkspace } from "@/components/audit/AuditWorkspace";
import { AnalysisPreview } from "@/components/relations/AnalysisPreview";
import { FileTree } from "@/components/project/FileTree";
import { useProjectSelection } from "@/hooks/useProjectSelection";
import { useProjectAnalysis } from "@/hooks/useProjectAnalysis";
import { runAuditRules } from "@/lib/rules";
import { FolderPicker } from "./FolderPicker";
import { ProjectSummary } from "./ProjectSummary";

export function ProjectWorkspace() {
  const {
    project,
    phase,
    error,
    selectFiles,
    beginChoosing,
    cancelChoosing,
    clearProject,
    getContents,
  } = useProjectSelection();
  const analysis = useProjectAnalysis();
  const auditState = useMemo(() => {
    if (!analysis.result || !project) return null;
    try {
      return {
        result: runAuditRules(
          project.metadata,
          project.files,
          getContents(),
          analysis.result,
        ),
        error: null,
      };
    } catch {
      return {
        result: null,
        error:
          "Rule audit could not validate its local analysis. Please select the folder and run the audit again.",
      };
    }
  }, [analysis.result, getContents, project]);
  const audit = auditState?.result ?? null;
  const phases = {
    idle: "",
    choosing: "Choose a project folder…",
    filtering: "Filtering files…",
    reading: "Reading project and checking file safety…",
    preparing: "Preparing project…",
  };

  function resetResults() {
    analysis.clear();
  }
  return (
    <>
      {!audit && (
        <>
          <section
            aria-labelledby="welcome-title"
            className="grid gap-10 pb-10 xl:grid-cols-[1.1fr_1fr] xl:items-center"
          >
            <div>
              <p className="mb-5 font-mono text-xs tracking-[0.16em] text-violet-400 uppercase">
                Project quality, connected.
              </p>
              <h1
                id="welcome-title"
                className="max-w-xl text-4xl leading-[1.12] font-semibold tracking-tight sm:text-5xl"
              >
                Know what&apos;s broken
                <br className="hidden sm:block" /> before your users do.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">
                AI-powered project quality auditing for modern web applications.
              </p>
              <p className="mt-6 max-w-md text-sm leading-6 text-muted-foreground">
                One workspace for code structure, cross-file relationships, and
                actionable findings.
              </p>
            </div>
            {!project && (
              <div className="rounded-xl border border-border bg-card p-7 text-center sm:p-10">
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-xl border border-border bg-background">
                  <FolderOpen
                    className="size-6 text-violet-400"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="text-lg font-medium">Start with your project</h2>
                <p className="mt-2 mb-6 text-sm text-muted-foreground">
                  Select a local folder to run a static audit in your browser.
                </p>
                <FolderPicker
                  busy={phase !== "idle" || analysis.busy}
                  onChoosing={() => {
                    resetResults();
                    beginChoosing();
                  }}
                  onCancel={cancelChoosing}
                  onFiles={(files) => {
                    resetResults();
                    void selectFiles(files);
                  }}
                />
                <div className="mt-7 border-t border-border pt-5">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    JS · TS · React · Next.js · Node.js
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    No source code is permanently stored.
                  </p>
                </div>
              </div>
            )}
          </section>
          {project && (
            <ProjectSummary
              metadata={project.metadata}
              busy={analysis.busy || phase !== "idle"}
              analysisReady={Boolean(analysis.result)}
              auditComplete={false}
              onStart={() => {
                if (!analysis.result) {
                  analysis.start(project.files, getContents());
                }
              }}
              onClear={() => {
                resetResults();
                clearProject();
              }}
              onViewFiles={() =>
                document
                  .getElementById("prepared-files")
                  ?.scrollIntoView({ block: "start" })
              }
            />
          )}
          {(phase !== "idle" || analysis.busy) && (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {analysis.busy
                    ? analysis.progress && analysis.progress.total > 0
                      ? `Analyzing ${analysis.progress.completed} / ${analysis.progress.total} files`
                      : "Preparing static analysis…"
                    : phases[phase]}
                </p>
                {analysis.busy ? (
                  <Button variant="outline" onClick={analysis.cancel}>
                    Cancel analysis
                  </Button>
                ) : (
                  <Button variant="outline" onClick={clearProject}>
                    Cancel
                  </Button>
                )}
              </div>
              {analysis.progress?.filePath && (
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {analysis.progress.filePath}
                </p>
              )}
            </div>
          )}
          {(error || analysis.error || auditState?.error) && (
            <p
              role="alert"
              className="mb-6 rounded-md border border-amber-500/30 p-4 text-sm text-amber-100"
            >
              {error
                ? `Project selection: ${error}`
                : analysis.error
                  ? `Static analysis: ${analysis.error}`
                  : `Rule audit: ${auditState?.error}`}
            </p>
          )}
          {project && !audit && (
            <section
              id="prepared-files"
              aria-label="Selected project files"
              className="mb-6"
            >
              <FileTree files={project.files} />
            </section>
          )}
          {project && analysis.result && !audit && (
            <AnalysisPreview result={analysis.result} />
          )}
          {project && !analysis.result && !analysis.busy && (
            <section
              aria-label="Audit coverage categories"
              className="grid gap-3 pb-6 sm:grid-cols-2 xl:grid-cols-5"
            >
              {[
                "Data Integrity",
                "Code Consistency",
                "Security",
                "Structure",
                "Dependencies",
              ].map((name) => (
                <div
                  key={name}
                  className="rounded-lg border border-border bg-card p-4 text-xs text-muted-foreground"
                >
                  {name}
                </div>
              ))}
            </section>
          )}
          {!project && (
            <section
              aria-label="Audit coverage categories"
              className="grid gap-3 pb-6 sm:grid-cols-2 xl:grid-cols-5"
            >
              {[
                [
                  "Data Integrity",
                  "Follow data across frontend, APIs, and schemas.",
                ],
                [
                  "Code Consistency",
                  "Review cross-file patterns and response shapes.",
                ],
                [
                  "Security",
                  "Surface common risks and exposed secret patterns.",
                ],
                ["Structure", "Check project foundations and organization."],
                ["Dependencies", "Inspect imports and declared packages."],
              ].map(([name, description]) => (
                <article
                  key={name}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <h2 className="text-xs font-medium">{name}</h2>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    {description}
                  </p>
                </article>
              ))}
            </section>
          )}
        </>
      )}
      {project && analysis.result && audit && (
        <AuditWorkspace
          key={project.metadata.name + audit.scoreVersion}
          metadata={project.metadata}
          files={project.files}
          contents={getContents()}
          analysis={analysis.result}
          audit={audit}
          onSelectAnother={() => {
            resetResults();
            clearProject();
            window.location.hash = "view-overview";
            window.scrollTo({ top: 0 });
          }}
        />
      )}
    </>
  );
}
