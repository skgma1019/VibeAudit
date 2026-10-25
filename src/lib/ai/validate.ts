import { randomUUID } from "node:crypto";
import { redactSecrets } from "../security/redact";
import {
  analyzeRequestSchema,
  rawAIResponseSchema,
  type AnalyzeRequest,
} from "../../schemas/ai";
import type { AIAnalysisResult, AIInsight } from "../../types/ai";

export function isSafeRelativePath(path: string) {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:/.test(normalized) ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    segments.some(
      (segment) => segment === ".." || segment === "." || segment === "",
    )
  )
    return false;
  const name = segments.at(-1)?.toLowerCase() ?? "";
  if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example"))
    return false;
  if (/\.(pem|key|p12|pfx|crt|cer)$/i.test(name)) return false;
  return true;
}

function maskStrings(value: unknown, key = "", envExample = false): unknown {
  if (typeof value === "string") {
    return redactSecrets(value, key === "text" && envExample).redactedText;
  }
  if (Array.isArray(value))
    return value.map((entry) => maskStrings(entry, "", envExample));
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const filePath = entries.find(([entryKey]) => entryKey === "filePath")?.[1];
    const isEnvExample =
      envExample ||
      (typeof filePath === "string" &&
        filePath.replaceAll("\\", "/").toLowerCase().split("/").at(-1) ===
          ".env.example");
    return Object.fromEntries(
      entries.map(([entryKey, entry]) => [
        entryKey,
        maskStrings(entry, entryKey, isEnvExample),
      ]),
    );
  }
  return value;
}

export function sanitizeAnalyzePayload(input: AnalyzeRequest): AnalyzeRequest {
  const paths = [
    ...input.ruleIssues.flatMap((issue) =>
      issue.locations.map((location) => location.filePath),
    ),
    ...input.relations.flatMap((relation) => [
      relation.sourceFile,
      relation.targetFile,
    ]),
    ...input.snippets.map((snippet) => snippet.filePath),
  ];
  if (!paths.every((path) => !path || isSafeRelativePath(path))) {
    throw new Error("UNSAFE_ANALYSIS_PATH");
  }
  return analyzeRequestSchema.parse(maskStrings(input));
}

type RawInsight =
  (typeof rawAIResponseSchema)["_output"]["issueInsights"][number];

function verifiedInsight(
  insight: RawInsight,
  input: AnalyzeRequest,
  kind: "ISSUE_EXPLANATION" | "POTENTIAL_ISSUE",
): AIInsight | null {
  const knownIssueIds = new Set(input.ruleIssues.map((issue) => issue.id));
  const relatedIssueIds = insight.relatedIssueIds.filter((id) =>
    knownIssueIds.has(id),
  );
  if (kind === "ISSUE_EXPLANATION" && relatedIssueIds.length === 0) return null;

  const allowedLocations = new Set<string>();
  for (const issue of input.ruleIssues) {
    for (const location of issue.locations)
      allowedLocations.add(`${location.filePath}:${location.line}`);
  }
  for (const snippet of input.snippets) {
    const lineCount = snippet.text.split(/\r?\n/).length;
    for (
      let line = snippet.startLine;
      line < snippet.startLine + lineCount;
      line++
    ) {
      allowedLocations.add(`${snippet.filePath}:${line}`);
    }
  }
  const locations = insight.locations.filter(
    (location) =>
      isSafeRelativePath(location.filePath) &&
      allowedLocations.has(`${location.filePath}:${location.line}`),
  );
  const hasUnsupportedClaim =
    relatedIssueIds.length !== insight.relatedIssueIds.length ||
    locations.length !== insight.locations.length;
  const potential = kind === "POTENTIAL_ISSUE";

  return {
    id: randomUUID(),
    origin: "AI",
    type: potential
      ? "POTENTIAL_ISSUE"
      : insight.type === "POTENTIAL_ISSUE"
        ? "ISSUE_EXPLANATION"
        : insight.type,
    confidence:
      potential && insight.confidence === "HIGH"
        ? "MEDIUM"
        : insight.confidence,
    title: insight.title,
    explanation: insight.explanation,
    ...(insight.impact ? { impact: insight.impact } : {}),
    suggestion: insight.suggestion,
    relatedIssueIds,
    locations,
    evidenceStatus: potential
      ? "UNVERIFIED"
      : hasUnsupportedClaim
        ? "PARTIAL"
        : insight.evidenceStatus,
  };
}

export function validateAIResponse(
  raw: unknown,
  input: AnalyzeRequest,
): AIAnalysisResult {
  const parsed = rawAIResponseSchema.parse(maskStrings(raw));
  const issueInsights = parsed.issueInsights
    .map((insight) => verifiedInsight(insight, input, "ISSUE_EXPLANATION"))
    .filter((insight): insight is AIInsight => insight !== null);
  const potentialIssues = parsed.potentialIssues
    .map((insight) => verifiedInsight(insight, input, "POTENTIAL_ISSUE"))
    .filter((insight): insight is AIInsight => insight !== null);
  const partial =
    input.omittedIssueCount > 0 ||
    input.omittedRelationCount > 0 ||
    input.omittedSchemaCount > 0 ||
    input.omittedSchemaFieldCount > 0 ||
    issueInsights.length !== parsed.issueInsights.length ||
    potentialIssues.length !== parsed.potentialIssues.length ||
    issueInsights.some((insight) => insight.evidenceStatus === "PARTIAL");
  return {
    aiStatus: partial ? "PARTIAL" : "COMPLETE",
    summary: parsed.summary,
    issueInsights,
    potentialIssues,
    coverage: {
      sentIssues: input.ruleIssues.length,
      omittedIssues: input.omittedIssueCount,
      sentRelations: input.relations.length,
      omittedRelations: input.omittedRelationCount,
      sentSchemas: input.schemaSummary.length,
      omittedSchemas: input.omittedSchemaCount,
      omittedSchemaFields: input.omittedSchemaFieldCount,
      categories: input.projectSummary.ruleCoverage,
    },
  };
}
