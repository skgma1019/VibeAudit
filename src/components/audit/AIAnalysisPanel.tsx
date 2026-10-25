"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { buildAIAnalyzePayload } from "@/lib/ai/payload";
import { AnalysisDisclosure } from "@/components/project/AnalysisDisclosure";
import { Button } from "@/components/ui/button";
import type { AnalysisResult } from "@/types/analysis";
import type { AuditResult } from "@/types/audit";
import type {
  AIAnalysisResponse,
  AIAnalysisResult,
  AIStatus,
} from "@/types/ai";
import type { ProjectFileContent, ProjectMetadata } from "@/types/project";

const statusLabel: Record<AIStatus, string> = {
  IDLE: "Not analyzed",
  RUNNING: "Analyzing with Gemini…",
  COMPLETE: "Complete",
  FAILED: "Unavailable",
  SKIPPED: "Not configured",
  PARTIAL: "Partial coverage",
};

function InsightCard({
  title,
  explanation,
  suggestion,
  impact,
  evidenceStatus,
  type,
  locations,
  relatedIssueIds,
  issueTitles,
}: AIAnalysisResult["issueInsights"][number] & {
  issueTitles: Map<string, string>;
}) {
  return (
    <article className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-cyan-500/30 px-2 py-1 font-mono text-[10px] text-cyan-300">
          AI INSIGHT
        </span>
        <span className="rounded border border-border px-2 py-1 text-[10px] text-muted-foreground">
          {evidenceStatus}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {type.replaceAll("_", " ")}
        </span>
      </div>
      <h4 className="mt-3 text-sm font-medium">{title}</h4>
      {relatedIssueIds.length > 0 && (
        <p className="mt-2 text-[11px] text-violet-200">
          Related Rule Issue:{" "}
          {relatedIssueIds
            .map((id) => `${issueTitles.get(id) ?? "Rule finding"} (${id})`)
            .join(" · ")}
        </p>
      )}
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {explanation}
      </p>
      {impact && (
        <p className="mt-2 text-xs text-amber-200">Impact: {impact}</p>
      )}
      <p className="mt-2 text-xs text-cyan-100">
        Suggested direction: {suggestion}
      </p>
      {locations.length > 0 && (
        <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
          {locations
            .map((location) => `${location.filePath}:${location.line}`)
            .join(" · ")}
        </p>
      )}
    </article>
  );
}

export function AIAnalysisPanel({
  metadata,
  contents,
  analysis,
  audit,
  onResultChange,
  onStatusChange,
}: {
  metadata: ProjectMetadata;
  contents: ProjectFileContent[];
  analysis: AnalysisResult;
  audit: AuditResult;
  onResultChange?: (result: AIAnalysisResult | null) => void;
  onStatusChange?: (status: AIStatus) => void;
}) {
  const [status, setStatus] = useState<AIStatus>("IDLE");
  const [result, setResult] = useState<AIAnalysisResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const issueTitles = new Map(
    audit.issues.map((issue) => [issue.fingerprint, issue.title]),
  );

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => onResultChange?.(result), [onResultChange, result]);
  useEffect(() => onStatusChange?.(status), [onStatusChange, status]);

  async function analyze() {
    if (!consent || controller.current) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setStatus("RUNNING");
    setResult(null);
    setMessage(null);
    setErrorCode(null);
    try {
      const payload = buildAIAnalyzePayload({
        metadata,
        contents,
        analysis,
        audit,
      });
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: requestController.signal,
      });
      const body = (await response.json()) as AIAnalysisResponse;
      if (body.result) setResult(body.result);
      setStatus(body.aiStatus);
      setMessage(body.message ?? null);
      setErrorCode(body.errorCode ?? null);
    } catch {
      if (!requestController.signal.aborted) {
        setStatus("FAILED");
        setMessage(
          "AI analysis is temporarily unavailable. Rule-based audit results remain available; you can retry.",
        );
        setErrorCode("AI_UNAVAILABLE");
      }
    } finally {
      if (controller.current === requestController) controller.current = null;
    }
  }

  function cancel() {
    controller.current?.abort();
    controller.current = null;
    setStatus("IDLE");
  }

  return (
    <section
      aria-labelledby="ai-analysis-title"
      className="mt-5 space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-wide text-cyan-300 uppercase">
            Advisory analysis · Google Gemini
          </p>
          <h2 id="ai-analysis-title" className="mt-2 text-xl font-semibold">
            AI Analysis
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Gemini explains existing Rule Issues and suggests improvements.
            AI-only findings stay separate and never change Rule scores.
          </p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
          {statusLabel[status]}
        </span>
      </div>

      {status === "IDLE" && (
        <>
          <AnalysisDisclosure checked={consent} onCheckedChange={setConsent} />
          <Button onClick={() => void analyze()} disabled={!consent}>
            <Sparkles aria-hidden="true" /> Analyze with AI
          </Button>
        </>
      )}
      {status === "RUNNING" && (
        <div
          className="flex flex-wrap items-center gap-3"
          role="status"
          aria-live="polite"
        >
          <LoaderCircle
            className="size-4 animate-spin text-cyan-300"
            aria-hidden="true"
          />
          <span className="text-sm text-muted-foreground">
            Sending minimized, redacted audit context. This usually takes under
            30 seconds.
          </span>
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        </div>
      )}
      {(status === "FAILED" || status === "SKIPPED") && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-background p-4"
        >
          <p className="text-sm font-medium">
            {status === "SKIPPED"
              ? "AI analysis is not configured."
              : "AI analysis unavailable."}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {message ?? "Rule-based audit results are still available."}
          </p>
          {errorCode && (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              {errorCode}
            </p>
          )}
          <div className="mt-4 space-y-3">
            {status === "SKIPPED" && (
              <AnalysisDisclosure
                checked={consent}
                onCheckedChange={setConsent}
              />
            )}
            <Button
              variant="outline"
              disabled={!consent}
              onClick={() => void analyze()}
            >
              Retry AI Analysis
            </Button>
          </div>
        </div>
      )}
      {result && (
        <div className="space-y-5">
          <div className="rounded-lg border border-cyan-500/20 bg-background p-4">
            <p className="font-mono text-[10px] text-cyan-300 uppercase">
              Project summary · AI advisory
            </p>
            <p className="mt-2 text-sm leading-6">{result.summary.overview}</p>
            {result.summary.strengths.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-medium">Strengths</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.summary.strengths.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.summary.topPriorities.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-medium">Top priorities</h3>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.summary.topPriorities.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              Issue insights{" "}
              <span className="text-xs font-normal text-muted-foreground">
                · explanations for VibeAudit findings
              </span>
            </h3>
            {result.issueInsights.length ? (
              result.issueInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  {...insight}
                  issueTitles={issueTitles}
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No additional explanations were returned for the selected
                findings.
              </p>
            )}
          </div>
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              Potential AI findings{" "}
              <span className="text-xs font-normal text-muted-foreground">
                · unverified, no score impact
              </span>
            </h3>
            {result.potentialIssues.length ? (
              result.potentialIssues.map((insight) => (
                <InsightCard
                  key={insight.id}
                  {...insight}
                  issueTitles={issueTitles}
                />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No potential AI findings were returned.
              </p>
            )}
          </div>
          {(result.coverage.omittedIssues > 0 ||
            result.coverage.omittedRelations > 0 ||
            result.coverage.omittedSchemas > 0 ||
            result.coverage.omittedSchemaFields > 0) && (
            <p className="rounded border border-border p-3 text-xs text-muted-foreground">
              AI coverage is partial: {result.coverage.omittedIssues} Rule
              Issues, {result.coverage.omittedRelations} relationships,{" "}
              {result.coverage.omittedSchemas} schemas, and{" "}
              {result.coverage.omittedSchemaFields} schema fields were omitted
              to stay within the request budget. Rule results and scores still
              cover the original local analysis.
            </p>
          )}
          <Button
            variant="outline"
            disabled={!consent}
            onClick={() => void analyze()}
          >
            Run AI Analysis Again
          </Button>
        </div>
      )}
    </section>
  );
}
