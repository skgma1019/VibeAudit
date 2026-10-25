import type {
  AuditCategory,
  AuditRule,
  RuleContext,
  RuleDraft,
} from "../../types/audit";
import type { SourceLocation } from "../../types/analysis";

export type { AuditCategory, AuditRule, RuleContext, RuleDraft };

export function makeDraft(
  ruleId: string,
  category: AuditCategory,
  detectionKind: RuleDraft["detectionKind"],
  severity: RuleDraft["severity"],
  title: string,
  description: string,
  locations: SourceLocation[],
  evidence: string,
  suggestion: string,
  fingerprintTarget = "",
): RuleDraft {
  return {
    origin: "RULE",
    ruleId,
    category,
    detectionKind,
    severity,
    title,
    description,
    locations,
    evidence,
    suggestion,
    fingerprintTarget,
  };
}

export function includedPaths(context: RuleContext): Set<string> {
  return new Set(
    context.contents.map((content) => content.relativePath.toLowerCase()),
  );
}

export function projectPath(context: RuleContext, path: string): string {
  const root = context.project.name
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return root && !path.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    ? `${root}/${path}`
    : path;
}

export function contentByPath(context: RuleContext): Map<string, string> {
  return new Map(
    context.contents.map((content) => [
      content.relativePath.toLowerCase(),
      content.redactedText,
    ]),
  );
}
