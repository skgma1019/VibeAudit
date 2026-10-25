import type { AnalysisResult } from "../../types/analysis";
import type { AIAnalysisResult, AIStatus } from "../../types/ai";
import type { AuditResult } from "../../types/audit";
import type { ProjectMetadata } from "../../types/project";
import { redactSecrets } from "../security/redact";
import { persistedAuditSchema } from "../../schemas/persistence";
import { calculateScores } from "./score";
import type { PersistedAuditRequest } from "../../schemas/persistence";

function safeText(value: string, maxLength: number): string {
  return redactSecrets(value).redactedText.slice(0, maxLength);
}

function safePath(value: string): string | null {
  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value) ||
    value.split("/").some((part) => part === ".." || part === ".") ||
    value.split("/").some((part) => {
      const lower = part.toLowerCase();
      return (
        (lower.startsWith(".env") && lower !== ".env.example") ||
        /^(?:id_rsa|id_ed25519|credentials)(?:\.|$)/.test(lower) ||
        /\.(?:pem|key|p12|pfx|crt|cer)$/.test(lower)
      );
    })
  )
    return null;
  return safeText(value, 1024);
}

function location(value: { filePath: string; line: number; column: number }) {
  const filePath = safePath(value.filePath);
  return filePath ? { filePath, line: value.line, column: value.column } : null;
}

export function toPersistedAudit(input: {
  metadata: ProjectMetadata;
  analysis: AnalysisResult;
  audit: AuditResult;
  ai: AIAnalysisResult | null;
  aiStatus: AIStatus;
  projectId: string | null;
  requestId: string;
}) {
  const issueIdByFingerprint = new Map(
    input.audit.issues.map((issue) => [issue.fingerprint, crypto.randomUUID()]),
  );
  const aiStatus = (
    ["COMPLETE", "PARTIAL", "FAILED", "SKIPPED"] as string[]
  ).includes(input.aiStatus)
    ? (input.aiStatus as "COMPLETE" | "PARTIAL" | "FAILED" | "SKIPPED")
    : "IDLE";
  const relations = input.analysis.relations.map((relation) => ({
    id: crypto.randomUUID(),
    type: relation.type,
    sourceKind: relation.source.kind,
    sourceValue: safeText(relation.source.label, 512),
    targetKind: relation.target.kind,
    targetValue: safeText(relation.target.label, 512),
    resolutionStatus: relation.resolutionStatus,
    confidence: relation.confidence,
    metadata: {
      evidence: safeText(relation.evidence, 1024),
      locations: relation.locations.flatMap((item) => {
        const safe = location(item);
        return safe ? [safe] : [];
      }),
    },
  }));
  const insights = input.ai
    ? [...input.ai.issueInsights, ...input.ai.potentialIssues].map(
        (insight) => ({
          id: crypto.randomUUID(),
          type: insight.type,
          confidence: insight.confidence,
          title: safeText(insight.title, 256),
          explanation: safeText(insight.explanation, 2048),
          impact: insight.impact ? safeText(insight.impact, 1024) : null,
          suggestion: safeText(insight.suggestion, 1024),
          evidenceStatus: insight.evidenceStatus,
          relatedFingerprints: insight.relatedIssueIds,
          locations: insight.locations.flatMap((item) => {
            const safe = location({ ...item, column: item.column ?? 1 });
            return safe ? [safe] : [];
          }),
        }),
      )
    : [];
  const raw = {
    requestId: input.requestId,
    project: input.projectId
      ? { mode: "existing" as const, projectId: input.projectId }
      : {
          mode: "new" as const,
          name: safeText(input.metadata.name, 120),
          framework: input.metadata.stack.includes("Next.js")
            ? "Next.js"
            : input.metadata.stack.includes("React")
              ? "React"
              : null,
          stack: input.metadata.stack,
        },
    audit: {
      scores: input.audit.scores,
      coverage: input.audit.coverage,
      fileCount: input.metadata.totalFiles,
      analyzedFileCount: input.metadata.includedFiles,
      ruleVersion: input.audit.ruleVersion,
      scoreVersion: input.audit.scoreVersion,
      aiStatus,
      summary: input.ai
        ? {
            overview: safeText(input.ai.summary.overview, 2000),
            strengths: input.ai.summary.strengths.map((item) =>
              safeText(item, 500),
            ),
            topPriorities: input.ai.summary.topPriorities.map((item) =>
              safeText(item, 500),
            ),
          }
        : null,
      issues: input.audit.issues.map((issue) => ({
        id: issueIdByFingerprint.get(issue.fingerprint),
        fingerprint: issue.fingerprint,
        ruleId: issue.ruleId,
        detectionKind: issue.detectionKind,
        category: issue.category,
        severity: issue.severity,
        title: safeText(issue.title, 256),
        description: safeText(issue.description, 1024),
        evidence: safeText(issue.evidence, 1024),
        suggestion: safeText(issue.suggestion, 1024),
        locations: issue.locations.flatMap((item) => {
          const safe = location(item);
          return safe ? [safe] : [];
        }),
      })),
      relations,
      aiInsights: insights,
    },
  };
  return persistedAuditSchema.parse(raw);
}

export function redactPersistedAudit(input: unknown) {
  const parsed = persistedAuditSchema.parse(input);
  const safe = (value: string, limit: number) => safeText(value, limit);
  return persistedAuditSchema.parse({
    ...parsed,
    project:
      parsed.project.mode === "new"
        ? {
            ...parsed.project,
            name: safe(parsed.project.name, 120),
            framework: parsed.project.framework
              ? safe(parsed.project.framework, 80)
              : null,
          }
        : parsed.project,
    audit: {
      ...parsed.audit,
      summary: parsed.audit.summary
        ? {
            overview: safe(parsed.audit.summary.overview, 2000),
            strengths: parsed.audit.summary.strengths.map((value) =>
              safe(value, 500),
            ),
            topPriorities: parsed.audit.summary.topPriorities.map((value) =>
              safe(value, 500),
            ),
          }
        : null,
      issues: parsed.audit.issues.map((issue) => ({
        ...issue,
        title: safe(issue.title, 256),
        description: safe(issue.description, 1024),
        evidence: safe(issue.evidence, 1024),
        suggestion: safe(issue.suggestion, 1024),
        locations: issue.locations.flatMap((item) => {
          const path = safePath(item.filePath);
          return path ? [{ ...item, filePath: path }] : [];
        }),
      })),
      relations: parsed.audit.relations.map((relation) => ({
        ...relation,
        sourceValue: safe(relation.sourceValue, 512),
        targetValue: safe(relation.targetValue, 512),
        metadata: {
          evidence: safe(relation.metadata.evidence, 1024),
          locations: relation.metadata.locations.flatMap((item) => {
            const path = safePath(item.filePath);
            return path ? [{ ...item, filePath: path }] : [];
          }),
        },
      })),
      aiInsights: parsed.audit.aiInsights.map((insight) => ({
        ...insight,
        title: safe(insight.title, 256),
        explanation: safe(insight.explanation, 2048),
        impact: insight.impact ? safe(insight.impact, 1024) : null,
        suggestion: safe(insight.suggestion, 1024),
        locations: insight.locations.flatMap((item) => {
          const path = safePath(item.filePath);
          return path ? [{ ...item, filePath: path }] : [];
        }),
      })),
    },
  });
}

export function persistedScoreMatches(request: PersistedAuditRequest): boolean {
  try {
    const expected = calculateScores(
      request.audit.issues.map((issue) => ({
        ...issue,
        origin: "RULE" as const,
      })),
    );
    const received = request.audit.scores;
    return (
      expected.overall === received.overall &&
      expected.grade === received.grade &&
      expected.categories.DATA_INTEGRITY ===
        received.categories.DATA_INTEGRITY &&
      expected.categories.CONSISTENCY === received.categories.CONSISTENCY &&
      expected.categories.SECURITY === received.categories.SECURITY &&
      expected.categories.STRUCTURE === received.categories.STRUCTURE &&
      expected.categories.DEPENDENCY === received.categories.DEPENDENCY
    );
  } catch {
    return false;
  }
}
