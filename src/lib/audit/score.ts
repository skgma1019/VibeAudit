import type {
  AuditCategory,
  AuditResult,
  CoverageStatus,
  RuleIssue,
} from "../../types/audit";
import { deduplicateIssues } from "./deduplicate";

export const SCORE_VERSION = "score-v1";
export const RULE_VERSION = "rules-v1";
const categories: AuditCategory[] = [
  "DATA_INTEGRITY",
  "CONSISTENCY",
  "SECURITY",
  "STRUCTURE",
  "DEPENDENCY",
];
const penalty: Record<RuleIssue["severity"], number> = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 1,
};

function coverageStatus(
  context: RuleContextLike,
  category: AuditCategory,
): CoverageStatus {
  const { analysis, project, files } = context;
  const incompleteInput = files.some((file) => file.status !== "INCLUDED");
  if (category === "DATA_INTEGRITY") {
    const hasConnectedDatabaseChain = analysis.relations.some((api) => {
      if (api.type !== "API_CALL" || api.resolutionStatus !== "RESOLVED")
        return false;
      return analysis.relations.some((handler) => {
        if (
          handler.type !== "ROUTE_HANDLER" ||
          handler.resolutionStatus !== "RESOLVED" ||
          handler.source.label !== api.target.label
        )
          return false;
        const dbRelations = analysis.relations.filter(
          (database) =>
            database.type === "DATABASE" &&
            database.resolutionStatus === "RESOLVED" &&
            database.source.filePath === handler.target.filePath,
        );
        return dbRelations.some((database) =>
          analysis.schemas.some(
            (schema) =>
              schema.name.toLowerCase() === database.target.label.toLowerCase(),
          ),
        );
      });
    });
    if (analysis.coverage.parsedSchemaFiles > 0 && hasConnectedDatabaseChain)
      return "FULL";
    if (
      analysis.coverage.parsedSchemaFiles > 0 ||
      analysis.coverage.databaseCalls > 0
    )
      return "PARTIAL";
    return "LIMITED";
  }
  if (category === "CONSISTENCY") {
    const sampledRoutes = new Set(
      analysis.apiResponses.flatMap((response) => {
        const route = analysis.routes.find(
          (item) => item.filePath === response.sourceFile,
        );
        return route ? [route.path] : [];
      }),
    );
    if (sampledRoutes.size >= 3) return "FULL";
    return analysis.routes.length > 0 ? "PARTIAL" : "LIMITED";
  }
  if (category === "SECURITY") {
    if (
      analysis.coverage.parsedFiles > 0 &&
      analysis.coverage.failedFiles === 0
    )
      return incompleteInput ? "PARTIAL" : "FULL";
    return analysis.coverage.parsedFiles > 0 ? "PARTIAL" : "LIMITED";
  }
  if (category === "STRUCTURE") {
    if (project.totalFiles === 0) return "LIMITED";
    return incompleteInput ||
      analysis.coverage.truncatedRecords > 0 ||
      analysis.coverage.failedFiles > 0
      ? "PARTIAL"
      : "FULL";
  }
  if (files.some((file) => file.name.toLowerCase() === "package.json")) {
    if (
      analysis.coverage.sourceFiles > 0 &&
      analysis.coverage.failedFiles === 0 &&
      !incompleteInput &&
      !analysis.configWarnings.some((warning) =>
        warning.includes("package.json could not be parsed"),
      )
    )
      return "FULL";
    return "PARTIAL";
  }
  return "LIMITED";
}

interface RuleContextLike {
  analysis: import("../../types/analysis").AnalysisResult;
  project: import("../../types/project").ProjectMetadata;
  files: import("../../types/project").ProjectFile[];
}

function grade(value: number): AuditResult["scores"]["grade"] {
  if (value >= 90) return "A";
  if (value >= 80) return "B";
  if (value >= 70) return "C";
  if (value >= 60) return "D";
  return "F";
}

export function calculateScores(
  ruleIssues: RuleIssue[],
): AuditResult["scores"] {
  const byCategory = Object.fromEntries(
    categories.map((category) => [category, 100]),
  ) as Record<AuditCategory, number>;
  for (const issue of deduplicateIssues(ruleIssues)) {
    if (issue.origin !== "RULE") continue;
    byCategory[issue.category] = Math.max(
      0,
      byCategory[issue.category] - penalty[issue.severity],
    );
  }
  const rawOverall =
    categories.reduce((total, category) => total + byCategory[category], 0) /
    categories.length;
  return {
    categories: byCategory,
    overall: Math.round(rawOverall * 10) / 10,
    grade: grade(rawOverall),
  };
}

export function calculateCoverage(
  context: RuleContextLike,
): AuditResult["coverage"] {
  return Object.fromEntries(
    categories.map((category) => [category, coverageStatus(context, category)]),
  ) as AuditResult["coverage"];
}
