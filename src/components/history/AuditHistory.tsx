"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ScoreTrend } from "@/components/history/ScoreTrend";
import { Button } from "@/components/ui/button";
import { useSupabaseAuth } from "@/components/auth/SupabaseAuthProvider";

type Project = { id: string; name: string };
type Audit = {
  id: string;
  project_id: string;
  overall_score: number;
  grade: string;
  issue_count: number;
  created_at: string;
  score_version: string;
};

export function AuditHistory() {
  const auth = useSupabaseAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [projectId, setProjectId] = useState("ALL");
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (auth.status !== "ready") return;
    let active = true;
    void Promise.all([fetch("/api/projects"), fetch("/api/audits")])
      .then(async ([projectResponse, auditResponse]) => {
        if (!projectResponse.ok || !auditResponse.ok)
          throw new Error("History could not be loaded.");
        const [projectData, auditData] = (await Promise.all([
          projectResponse.json(),
          auditResponse.json(),
        ])) as [{ projects: Project[] }, { audits: Audit[] }];
        if (!active) return;
        setProjects(projectData.projects);
        setAudits(auditData.audits);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("unavailable");
        setError(
          "Saved history is unavailable. Check the Supabase connection and retry.",
        );
      });
    return () => {
      active = false;
    };
  }, [auth.message, auth.status]);
  const visible = useMemo(
    () =>
      audits.filter(
        (audit) => projectId === "ALL" || audit.project_id === projectId,
      ),
    [audits, projectId],
  );
  const trend = [...visible].reverse().map((audit) => audit.overall_score);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wide text-violet-300">
            Saved audits
          </p>
          <h1 className="mt-2 text-2xl font-semibold">History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Scores and redacted findings saved to your anonymous browser
            account.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Run another audit</Link>
        </Button>
      </header>
      <p className="rounded-lg border border-amber-500/25 bg-amber-950/10 p-3 text-xs leading-5 text-amber-100">
        Anonymous sessions are tied to this browser. Account recovery is not
        available yet. Clearing browser data or signing out can permanently
        disconnect saved history.
      </p>
      {projects.length > 0 && (
        <label className="block max-w-sm text-xs text-muted-foreground">
          Project filter
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-1 block w-full rounded border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value="ALL">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {projectId !== "ALL" && visible.length > 1 && (
        <ScoreTrend values={trend} />
      )}
      {projectId !== "ALL" &&
        new Set(visible.map((audit) => audit.score_version)).size > 1 && (
          <p className="text-xs text-amber-100">
            This project has audits from different scoring versions. Their trend
            is approximate.
          </p>
        )}
      {(auth.status === "loading" || status === "loading") && (
        <p
          role="status"
          className="rounded border border-border p-6 text-sm text-muted-foreground"
        >
          Loading saved audits…
        </p>
      )}
      {(auth.status === "unavailable" || status === "unavailable") && (
        <div role="alert" className="rounded border border-amber-500/30 p-5">
          <p className="text-sm">
            {auth.status === "unavailable" ? auth.message : error}
          </p>
          <Button
            className="mt-3"
            variant="outline"
            onClick={() => {
              void auth.retry();
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {status === "ready" && visible.length === 0 && (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No saved audits yet. Complete an audit and choose Save Audit to add it
          here.
        </p>
      )}
      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-card text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Audit date</th>
                <th className="p-3">Project</th>
                <th className="p-3">Overall</th>
                <th className="p-3">Grade</th>
                <th className="p-3">Issues</th>
                <th className="p-3">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((audit) => (
                <tr key={audit.id} className="border-t border-border">
                  <td className="p-3 text-xs">
                    {new Date(audit.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {projects.find((project) => project.id === audit.project_id)
                      ?.name ?? "Project"}
                  </td>
                  <td className="p-3 font-mono">
                    {Number(audit.overall_score).toFixed(1)}
                  </td>
                  <td className="p-3">{audit.grade}</td>
                  <td className="p-3">{audit.issue_count}</td>
                  <td className="p-3">
                    <Link
                      className="text-violet-200 underline underline-offset-2"
                      href={`/audits/${audit.id}`}
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
