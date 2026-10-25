"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { useSupabaseAuth } from "@/components/auth/SupabaseAuthProvider";
import { Button } from "@/components/ui/button";

type Location = { file_path: string; line: number; column: number };
type Issue = {
  id: string;
  fingerprint: string;
  rule_id: string;
  detection_kind: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  evidence: string;
  suggestion: string;
  resolved: boolean;
  locations: Location[];
};
type Relation = {
  id: string;
  relation_type: string;
  source_kind: string;
  source_value: string;
  target_kind: string;
  target_value: string;
  resolution_status: string;
  confidence: string;
  metadata: { evidence?: string; locations?: Location[] };
};
type Insight = {
  id: string;
  type: string;
  confidence: string;
  title: string;
  explanation: string;
  impact: string | null;
  suggestion: string;
  evidence_status: string;
  locations: Location[];
};
type Audit = {
  id: string;
  created_at: string;
  overall_score: number;
  grade: string;
  integrity_score: number;
  consistency_score: number;
  security_score: number;
  structure_score: number;
  dependency_score: number;
  coverage: Record<string, string>;
  file_count: number;
  analyzed_file_count: number;
  issue_count: number;
  summary: {
    overview: string;
    strengths: string[];
    topPriorities: string[];
  } | null;
  rule_version: string;
  score_version: string;
  ai_status: string;
  project: { name: string; framework: string | null; stack: string[] } | null;
  issues: Issue[];
  relations: Relation[];
  aiInsights: Insight[];
};

export function AuditDetail({ auditId }: { auditId: string }) {
  const auth = useSupabaseAuth();
  const router = useRouter();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (auth.status !== "ready") return;
    let active = true;
    void fetch(`/api/audits/${auditId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Audit not found or unavailable.");
        return (await response.json()) as { audit: Audit };
      })
      .then((result) => {
        if (active) setAudit(result.audit);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Audit could not be loaded.",
          );
      });
    return () => {
      active = false;
    };
  }, [auditId, auth.message, auth.status]);

  async function toggleResolved(issue: Issue) {
    setBusyId(issue.id);
    try {
      const response = await fetch(`/api/issues/${issue.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resolved: !issue.resolved }),
      });
      if (!response.ok) throw new Error("Update failed.");
      setAudit((current) =>
        current
          ? {
              ...current,
              issues: current.issues.map((item) =>
                item.id === issue.id
                  ? { ...item, resolved: !item.resolved }
                  : item,
              ),
            }
          : current,
      );
    } catch {
      setError(
        "Issue state could not be updated. The saved score remains unchanged.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeAudit() {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`/api/audits/${auditId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Audit deletion failed. Please retry.");
      router.push("/history");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Audit could not be deleted.",
      );
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if ((error || auth.status === "unavailable") && !audit)
    return (
      <div role="alert" className="rounded-lg border border-amber-500/30 p-5">
        <p>{auth.status === "unavailable" ? auth.message : error}</p>
        <Link
          className="mt-3 inline-block text-violet-200 underline"
          href="/history"
        >
          Back to History
        </Link>
      </div>
    );
  if (!audit)
    return (
      <p
        role="status"
        className="rounded-lg border border-border p-6 text-sm text-muted-foreground"
      >
        Loading saved audit…
      </p>
    );
  const scores = [
    ["Data Integrity", audit.integrity_score],
    ["Consistency", audit.consistency_score],
    ["Security", audit.security_score],
    ["Structure", audit.structure_score],
    ["Dependencies", audit.dependency_score],
  ] as const;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:p-7">
        <div>
          <Link href="/history" className="text-xs text-violet-200 underline">
            ← History
          </Link>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-violet-300">
            Saved audit · {audit.rule_version} · {audit.score_version}
          </p>
          <h1 className="mt-2 break-all text-2xl font-semibold">
            {audit.project?.name ?? "Project"}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(audit.created_at).toLocaleString()} ·{" "}
            {audit.analyzed_file_count}/{audit.file_count} analyzed files
          </p>
        </div>
        <Button variant="outline" onClick={() => setConfirmDelete(true)}>
          Delete Audit
        </Button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded border border-amber-500/30 p-3 text-xs text-amber-100"
        >
          {error}
        </p>
      )}
      <section className="grid gap-4 xl:grid-cols-[0.8fr_2fr]">
        <article className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">
            Project Health · Rule Engine
          </p>
          <p className="mt-3 font-mono text-5xl">
            {Number(audit.overall_score).toFixed(1)}
            <span className="ml-2 text-sm text-muted-foreground">
              /100 · {audit.grade}
            </span>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Resolved status changes do not recalculate this audit-time score.
          </p>
        </article>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {scores.map(([label, value]) => (
            <article
              key={label}
              className="rounded-xl border border-border bg-card p-4"
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 font-mono text-2xl">
                {Number(value).toFixed(1)}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Coverage{" "}
                {audit.coverage[label.toUpperCase().replaceAll(" ", "_")] ??
                  "—"}
              </p>
            </article>
          ))}
        </div>
      </section>
      {audit.summary && (
        <section className="rounded-xl border border-cyan-500/20 bg-card p-5">
          <p className="font-mono text-[10px] text-cyan-200">
            AI SUMMARY · {audit.ai_status}
          </p>
          <p className="mt-2 text-sm leading-6">{audit.summary.overview}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-medium">Strengths</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {audit.summary.strengths.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xs font-medium">Priorities</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {audit.summary.topPriorities.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            Rule Issues{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {audit.issues.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Locations are relative paths. This audit does not contain source
            file contents.
          </p>
        </div>
        {audit.issues.length === 0 && (
          <p className="rounded border border-dashed border-border p-6 text-sm text-muted-foreground">
            No Rule findings were saved.
          </p>
        )}
        {audit.issues.map((issue) => (
          <article
            key={issue.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-rose-500/30 px-2 py-1 font-mono text-[10px]">
                {issue.severity}
              </span>
              <span className="rounded border border-violet-500/30 px-2 py-1 font-mono text-[10px]">
                RULE · {issue.detection_kind}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {issue.category} · {issue.rule_id}
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
                    `${location.file_path}:${location.line}:${location.column}`,
                )
                .join(" · ")}
            </p>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs">
                Evidence and suggestion
              </summary>
              <p className="mt-2 text-xs text-muted-foreground">
                {issue.evidence}
              </p>
              <p className="mt-2 text-xs text-violet-100">{issue.suggestion}</p>
            </details>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                disabled={busyId === issue.id}
                onClick={() => void toggleResolved(issue)}
              >
                {busyId === issue.id
                  ? "Updating…"
                  : issue.resolved
                    ? "Mark as Open"
                    : "Mark as Resolved"}
              </Button>
              {issue.resolved && (
                <span className="text-xs text-emerald-200">
                  Resolved · score reflects state at audit time
                </span>
              )}
            </div>
          </article>
        ))}
      </section>
      {audit.relations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            Relations{" "}
            <span className="text-sm font-normal text-muted-foreground">
              {audit.relations.length}
            </span>
          </h2>
          {audit.relations.map((relation) => (
            <article
              key={relation.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <p className="font-mono text-[10px] text-violet-200">
                {relation.relation_type} · {relation.resolution_status} ·{" "}
                {relation.confidence}
              </p>
              <p className="mt-2 break-all text-xs">
                {relation.source_value} → {relation.target_value}
              </p>
              {relation.metadata.evidence && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {relation.metadata.evidence}
                </p>
              )}
              {relation.metadata.locations?.map((location, index) => (
                <p
                  key={`${index}-${location.file_path}`}
                  className="mt-1 break-all font-mono text-[10px] text-muted-foreground"
                >
                  {location.file_path}:{location.line}:{location.column}
                </p>
              ))}
            </article>
          ))}
        </section>
      )}
      {audit.aiInsights.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            AI Insights{" "}
            <span className="text-xs font-normal text-cyan-200">
              No score impact
            </span>
          </h2>
          {audit.aiInsights.map((insight) => (
            <article
              key={insight.id}
              className="rounded-lg border border-cyan-500/20 bg-card p-4"
            >
              <p className="font-mono text-[10px] text-cyan-200">
                AI · {insight.type} · {insight.confidence} ·{" "}
                {insight.evidence_status}
              </p>
              <h3 className="mt-2 text-sm font-semibold">{insight.title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {insight.explanation}
              </p>
              {insight.impact && (
                <p className="mt-2 text-xs text-amber-100">
                  Impact: {insight.impact}
                </p>
              )}
              <p className="mt-2 text-xs text-cyan-100">{insight.suggestion}</p>
            </article>
          ))}
        </section>
      )}
      <Dialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-xl outline-none">
            <Dialog.Title className="text-lg font-semibold">
              Delete this saved audit?
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-sm leading-5 text-muted-foreground">
              The audit and its issues, locations, relations, and AI insights
              will be deleted. This cannot be undone.
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline" disabled={deleting}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button disabled={deleting} onClick={() => void removeAudit()}>
                {deleting ? "Deleting…" : "Delete audit"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
