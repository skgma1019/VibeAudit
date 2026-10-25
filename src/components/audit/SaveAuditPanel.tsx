"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSupabaseAuth } from "@/components/auth/SupabaseAuthProvider";
import { toPersistedAudit } from "@/lib/audit/persistence";
import type { AnalysisResult } from "@/types/analysis";
import type { AIAnalysisResult, AIStatus } from "@/types/ai";
import type { AuditResult } from "@/types/audit";
import type { ProjectMetadata } from "@/types/project";

type Project = { id: string; name: string; framework: string | null };

export function SaveAuditPanel({
  metadata,
  analysis,
  audit,
  ai,
  aiStatus,
}: {
  metadata: ProjectMetadata;
  analysis: AnalysisResult;
  audit: AuditResult;
  ai: AIAnalysisResult | null;
  aiStatus: AIStatus;
}) {
  const auth = useSupabaseAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [requestId] = useState(() => crypto.randomUUID());
  const [retryKey, setRetryKey] = useState(0);
  const payload = useMemo(
    () =>
      toPersistedAudit({
        metadata,
        analysis,
        audit,
        ai,
        aiStatus,
        projectId: projectId || null,
        requestId,
      }),
    [ai, aiStatus, analysis, audit, metadata, projectId, requestId],
  );

  useEffect(() => {
    if (auth.status !== "ready") return;
    let active = true;
    void fetch("/api/projects")
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        return (await response.json()) as { projects: Project[] };
      })
      .then((result) => {
        if (active) setProjects(result.projects);
      })
      .catch(() => {
        if (active)
          setMessage(
            "History is unavailable until this browser has an active Supabase session.",
          );
      });
    return () => {
      active = false;
    };
  }, [auth.message, auth.status, retryKey]);

  async function save() {
    if (busy || savedId) return;
    setBusy(true);
    setMessage(null);
    try {
      const session = await auth.retry();
      if (!session.available) throw new Error("session unavailable");
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        auditId?: string;
        error?: string;
      };
      if (!response.ok || !result.auditId)
        throw new Error(result.error ?? "Save failed.");
      setSavedId(result.auditId);
      setMessage("Audit saved. The score records the state at audit time.");
    } catch {
      setMessage(
        "Save failed. Your audit is still available in this page; retry when the connection is available.",
      );
    } finally {
      setBusy(false);
    }
  }

  const displayMessage = auth.status === "unavailable" ? auth.message : message;

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-violet-300">
            History storage
          </p>
          <h2 className="mt-2 text-base font-semibold">Save this audit</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
            Stores scores, redacted findings, relative locations and optional AI
            insights. Project source files are not stored.
          </p>
        </div>
        {savedId ? (
          <Button asChild>
            <Link href={`/audits/${savedId}`}>View saved audit</Link>
          </Button>
        ) : (
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save Audit"}
          </Button>
        )}
      </div>
      {!savedId && (
        <label className="mt-4 block max-w-md text-xs text-muted-foreground">
          Project
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-1 block w-full rounded border border-border bg-background px-3 py-2 text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <option value="">Create a new project: {metadata.name}</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {displayMessage && (
        <div
          role={
            displayMessage.includes("failed") ||
            displayMessage.includes("unavailable")
              ? "alert"
              : "status"
          }
          className="mt-3 text-xs text-muted-foreground"
        >
          {displayMessage}
          {!savedId &&
            (displayMessage.includes("failed") ||
              displayMessage.includes("unavailable")) && (
              <button
                className="ml-2 underline underline-offset-2"
                onClick={() => {
                  void auth.retry().then((session) => {
                    if (session.available) setRetryKey((value) => value + 1);
                  });
                }}
              >
                Retry
              </button>
            )}
        </div>
      )}
    </section>
  );
}
