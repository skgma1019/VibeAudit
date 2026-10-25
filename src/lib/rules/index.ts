import type { AuditResult, RuleContext, AuditRule } from "../../types/audit";
import type { AnalysisResult } from "../../types/analysis";
import type {
  ProjectFile,
  ProjectFileContent,
  ProjectMetadata,
} from "../../types/project";
import {
  calculateCoverage,
  calculateScores,
  RULE_VERSION,
  SCORE_VERSION,
} from "../audit/score";
import { materializeIssues } from "../audit/deduplicate";
import { apiResponseConsistencyRule } from "./consistency/api-response";
import { missingDependencyRule } from "./dependencies/missing-dependency";
import { unusedDependencyRule } from "./dependencies/unused-dependency";
import { fieldMismatchRule } from "./integrity/field-mismatch";
import { localApiRouteRule } from "./integrity/local-api-route";
import { schemaFieldRule } from "./integrity/schema-field";
import { dangerousPatternRule } from "./security/dangerous-pattern";
import { clientEnvRule } from "./security/client-env";
import { hardcodedSecretRule } from "./security/hardcoded-secret";
import { requiredFilesRule } from "./structure/required-files";
import { todoFixmeRule } from "./structure/todo-fixme";
import { auditResultSchema } from "../../schemas/audit";

export const auditRules: AuditRule[] = [
  requiredFilesRule,
  todoFixmeRule,
  hardcodedSecretRule,
  clientEnvRule,
  dangerousPatternRule,
  fieldMismatchRule,
  schemaFieldRule,
  localApiRouteRule,
  apiResponseConsistencyRule,
  missingDependencyRule,
  unusedDependencyRule,
];

function declaredDependencySet(contents: ProjectFileContent[]): Set<string> {
  const dependencies = new Set<string>();
  for (const content of contents) {
    if (!/(?:^|\/)package\.json$/i.test(content.relativePath)) continue;
    try {
      const value: unknown = JSON.parse(content.redactedText);
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const section of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const entries = (value as Record<string, unknown>)[section];
        if (entries && typeof entries === "object" && !Array.isArray(entries))
          Object.keys(entries).forEach((name) => dependencies.add(name));
      }
    } catch {
      // Invalid manifests are already represented in analysis coverage/warnings.
    }
  }
  return dependencies;
}

export function createRuleContext(
  project: ProjectMetadata,
  files: ProjectFile[],
  contents: ProjectFileContent[],
  analysis: AnalysisResult,
): RuleContext {
  return {
    project,
    files,
    contents,
    analysis,
    relations: analysis.relations,
    schemas: analysis.schemas,
    coverage: analysis.coverage,
    dependencies: declaredDependencySet(contents),
    importedPackages: new Set(
      analysis.imports
        .filter((item) => item.classification === "PACKAGE")
        .map((item) => item.moduleSpecifier),
    ),
  };
}

export function runAuditRules(
  project: ProjectMetadata,
  files: ProjectFile[],
  contents: ProjectFileContent[],
  analysis: AnalysisResult,
): AuditResult {
  const context = createRuleContext(project, files, contents, analysis);
  const drafts = auditRules.flatMap((rule) => rule.run(context));
  const issues = materializeIssues(drafts);
  const result: AuditResult = {
    issues,
    scores: calculateScores(issues),
    coverage: calculateCoverage(context),
    ruleVersion: RULE_VERSION,
    scoreVersion: SCORE_VERSION,
  };
  return auditResultSchema.parse(result);
}
