import { AI_LIMITS } from "./constants";
import type { AnalysisResult } from "@/types/analysis";
import type { AuditResult, RuleIssue } from "@/types/audit";
import type { ProjectFileContent, ProjectMetadata } from "@/types/project";
import type {
  AIAnalyzePayload,
  AIPayloadIssue,
  AIPayloadRelation,
} from "@/types/ai";

const severityWeight: Record<RuleIssue["severity"], number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

function rankIssue(issue: RuleIssue) {
  return (
    severityWeight[issue.severity] * 100 +
    (issue.detectionKind === "DETERMINISTIC" ? 20 : 0) +
    (issue.category === "SECURITY" ? 8 : 0)
  );
}

function lineSnippet(
  content: ProjectFileContent,
  line: number,
  issueId: string,
): AIAnalyzePayload["snippets"][number] | null {
  const lines = content.redactedText.split(/\r?\n/);
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return null;
  const start = Math.max(0, line - 3);
  const end = Math.min(lines.length, line + 2);
  // A short file must not be sent in full under the label of a snippet.
  if (end - start >= lines.length) return null;
  const text = lines
    .slice(start, end)
    .join("\n")
    .slice(0, AI_LIMITS.maxSnippetChars);
  if (!text.trim()) return null;
  return {
    filePath: content.relativePath,
    startLine: start + 1,
    text,
    relatedIssueId: issueId,
  };
}

function relationScore(
  relation: AnalysisResult["relations"][number],
  issuePaths: Set<string>,
) {
  return (
    (relation.confidence === "HIGH"
      ? 30
      : relation.confidence === "MEDIUM"
        ? 20
        : 10) +
    (relation.resolutionStatus === "UNRESOLVED" ? 10 : 0) +
    (issuePaths.has(relation.source.filePath ?? "") ? 15 : 0) +
    (issuePaths.has(relation.target.filePath ?? "") ? 15 : 0)
  );
}

export function buildAIAnalyzePayload(input: {
  metadata: ProjectMetadata;
  contents: ProjectFileContent[];
  analysis: AnalysisResult;
  audit: AuditResult;
}): AIAnalyzePayload {
  const { metadata, contents, analysis, audit } = input;
  const contentByPath = new Map(
    contents.map((item) => [item.relativePath, item]),
  );
  const sortedIssues = [...audit.issues].sort(
    (a, b) =>
      rankIssue(b) - rankIssue(a) || a.fingerprint.localeCompare(b.fingerprint),
  );
  const issues: AIPayloadIssue[] = sortedIssues
    .slice(0, AI_LIMITS.maxIssues)
    .map((issue) => ({
      id: issue.fingerprint,
      ruleId: issue.ruleId,
      category: issue.category,
      severity: issue.severity,
      detectionKind: issue.detectionKind,
      title: issue.title,
      description: issue.description,
      locations: issue.locations.slice(0, 10),
      evidence: issue.evidence,
      suggestion: issue.suggestion,
    }));
  const issuePaths = new Set(
    issues.flatMap((issue) => issue.locations.map((item) => item.filePath)),
  );
  const relations: AIPayloadRelation[] = [...analysis.relations]
    .sort(
      (a, b) =>
        relationScore(b, issuePaths) - relationScore(a, issuePaths) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, AI_LIMITS.maxRelations)
    .map((relation) => ({
      source: relation.source.label,
      ...(relation.source.filePath
        ? { sourceFile: relation.source.filePath }
        : {}),
      type: relation.type,
      target: relation.target.label,
      ...(relation.target.filePath
        ? { targetFile: relation.target.filePath }
        : {}),
      confidence: relation.confidence,
      resolutionStatus: relation.resolutionStatus,
    }));
  const schemas = analysis.schemas
    .slice(0, AI_LIMITS.maxSchemas)
    .map((schema) => ({
      kind: schema.kind,
      name: schema.name,
      fields: schema.columns.slice(0, 100).map(({ name, type, optional }) => ({
        name,
        type,
        optional,
      })),
    }));
  const availableSchemaFieldCount = analysis.schemas.reduce(
    (total, schema) => total + schema.columns.length,
    0,
  );
  let omittedSchemaFieldCount = Math.max(
    0,
    availableSchemaFieldCount -
      schemas.reduce((total, schema) => total + schema.fields.length, 0),
  );

  const snippets: AIAnalyzePayload["snippets"] = [];
  for (const issue of issues) {
    if (snippets.length >= AI_LIMITS.maxSnippets) break;
    for (const location of issue.locations) {
      const content = contentByPath.get(location.filePath);
      const snippet = content && lineSnippet(content, location.line, issue.id);
      if (!snippet) continue;
      snippets.push(snippet);
      break;
    }
  }

  const payload: AIAnalyzePayload = {
    projectSummary: {
      stack: metadata.stack,
      fileCount: metadata.totalFiles,
      analyzedFileCount: analysis.coverage.parsedFiles,
      scores: audit.scores,
      coverage: analysis.coverage,
      ruleCoverage: audit.coverage,
      relationCounts: analysis.relations.reduce<Record<string, number>>(
        (counts, relation) => {
          counts[relation.type] = (counts[relation.type] ?? 0) + 1;
          return counts;
        },
        {},
      ),
    },
    ruleIssues: issues,
    relations,
    schemaSummary: schemas,
    snippets,
    availableIssueCount: audit.issues.length,
    availableRelationCount: analysis.relations.length,
    omittedIssueCount: Math.max(0, audit.issues.length - issues.length),
    omittedRelationCount: Math.max(
      0,
      analysis.relations.length - relations.length,
    ),
    availableSchemaCount: analysis.schemas.length,
    omittedSchemaCount: Math.max(0, analysis.schemas.length - schemas.length),
    availableSchemaFieldCount,
    omittedSchemaFieldCount,
  };

  while (JSON.stringify(payload).length > AI_LIMITS.maxPayloadChars) {
    if (payload.snippets.length) payload.snippets.pop();
    else if (payload.relations.length) {
      payload.relations.pop();
      payload.omittedRelationCount++;
    } else if (payload.ruleIssues.length) {
      payload.ruleIssues.pop();
      payload.omittedIssueCount++;
    } else if (payload.schemaSummary.length) {
      const lastSchema = payload.schemaSummary.at(-1)!;
      if (lastSchema.fields.length) {
        lastSchema.fields.pop();
        omittedSchemaFieldCount++;
        payload.omittedSchemaFieldCount = omittedSchemaFieldCount;
      } else {
        payload.schemaSummary.pop();
        payload.omittedSchemaCount++;
      }
    } else break;
  }
  return payload;
}
