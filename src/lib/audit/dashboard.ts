import type {
  AuditCategory,
  AuditResult,
  RuleIssue,
  Severity,
} from "../../types/audit";
import type { AnalysisResult, RelationType } from "../../types/analysis";
import type { AIAnalysisResult } from "../../types/ai";

export type IssueOrigin = "ALL" | "RULE" | "AI";
export interface IssueFilters {
  severity: Severity | "ALL";
  category: AuditCategory | "ALL";
  detectionKind: RuleIssue["detectionKind"] | "ALL";
  origin: IssueOrigin;
}

export function countSeverities(issues: RuleIssue[]) {
  return (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).reduce(
    (counts, severity) => {
      counts[severity] = issues.filter(
        (issue) => issue.severity === severity,
      ).length;
      return counts;
    },
    {} as Record<Severity, number>,
  );
}

export function selectIssues(
  audit: AuditResult,
  ai: AIAnalysisResult | null,
  filters: IssueFilters,
) {
  const ruleItems = audit.issues
    .filter(
      (issue) =>
        filters.severity === "ALL" || issue.severity === filters.severity,
    )
    .filter(
      (issue) =>
        filters.category === "ALL" || issue.category === filters.category,
    )
    .filter(
      (issue) =>
        filters.detectionKind === "ALL" ||
        issue.detectionKind === filters.detectionKind,
    )
    .filter(() => filters.origin === "ALL" || filters.origin === "RULE")
    .map((issue) => ({ origin: "RULE" as const, issue }));
  const aiItems = (ai?.potentialIssues ?? [])
    .filter(
      () =>
        filters.severity === "ALL" &&
        filters.category === "ALL" &&
        filters.detectionKind === "ALL",
    )
    .filter(() => filters.origin === "ALL" || filters.origin === "AI")
    .map((insight) => ({ origin: "AI" as const, insight }));
  return [...ruleItems, ...aiItems];
}

export function countIssuesByFile(issues: RuleIssue[]) {
  const counts = new Map<string, number>();
  for (const issue of issues) {
    for (const filePath of new Set(
      issue.locations.map((location) => location.filePath),
    )) {
      counts.set(filePath, (counts.get(filePath) ?? 0) + 1);
    }
  }
  return counts;
}

export function selectRelations(
  relations: AnalysisResult["relations"],
  type: RelationType | "ALL",
) {
  return relations.filter(
    (relation) => type === "ALL" || relation.type === type,
  );
}

export function scoreDeductionForCategory(
  audit: AuditResult,
  category: AuditCategory,
) {
  return 100 - audit.scores.categories[category];
}
