import assert from "node:assert/strict";
import test from "node:test";
import type { AIAnalysisResult } from "../src/types/ai";
import type { CodeRelation } from "../src/types/analysis";
import type { AuditResult, RuleIssue } from "../src/types/audit";
import {
  countIssuesByFile,
  countSeverities,
  scoreDeductionForCategory,
  selectIssues,
  selectRelations,
} from "../src/lib/audit/dashboard";

function issue(
  severity: RuleIssue["severity"],
  category: RuleIssue["category"],
  detectionKind: RuleIssue["detectionKind"],
  fingerprint: string,
): RuleIssue {
  return {
    origin: "RULE",
    severity,
    category,
    detectionKind,
    ruleId: "test.rule",
    title: fingerprint,
    description: "Evidence based finding",
    locations: [
      { filePath: "src/page.ts", line: 2, column: 1 },
      { filePath: "src/page.ts", line: 5, column: 1 },
    ],
    evidence: "Found statically",
    suggestion: "Review the implementation",
    fingerprint,
  };
}
const audit: AuditResult = {
  issues: [
    issue("HIGH", "SECURITY", "DETERMINISTIC", "one"),
    issue("LOW", "STRUCTURE", "HEURISTIC", "two"),
  ],
  scores: {
    categories: {
      DATA_INTEGRITY: 100,
      CONSISTENCY: 100,
      SECURITY: 95,
      STRUCTURE: 99,
      DEPENDENCY: 100,
    },
    overall: 98.8,
    grade: "A",
  },
  coverage: {
    DATA_INTEGRITY: "LIMITED",
    CONSISTENCY: "FULL",
    SECURITY: "FULL",
    STRUCTURE: "FULL",
    DEPENDENCY: "FULL",
  },
  ruleVersion: "rules-v1",
  scoreVersion: "score-v1",
};
const ai: AIAnalysisResult = {
  aiStatus: "PARTIAL",
  summary: { overview: "Advisory summary", strengths: [], topPriorities: [] },
  issueInsights: [],
  potentialIssues: [
    {
      id: "ai-one",
      origin: "AI",
      type: "POTENTIAL_ISSUE",
      confidence: "LOW",
      title: "Possible concern",
      explanation: "Needs review",
      suggestion: "Inspect usage",
      relatedIssueIds: [],
      locations: [{ filePath: "src/page.ts", line: 8 }],
      evidenceStatus: "UNVERIFIED",
    },
  ],
  coverage: {
    sentIssues: 0,
    omittedIssues: 0,
    sentRelations: 0,
    omittedRelations: 0,
    sentSchemas: 0,
    omittedSchemas: 0,
    omittedSchemaFields: 0,
    categories: {},
  },
};

test("issue explorer filters Rule findings by severity, category, detection level, and origin", () => {
  assert.deepEqual(
    selectIssues(audit, null, {
      severity: "HIGH",
      category: "SECURITY",
      detectionKind: "DETERMINISTIC",
      origin: "RULE",
    }).map((item) => item.origin),
    ["RULE"],
  );
  assert.equal(
    selectIssues(audit, null, {
      severity: "ALL",
      category: "ALL",
      detectionKind: "HEURISTIC",
      origin: "ALL",
    }).length,
    1,
  );
  assert.equal(
    selectIssues(audit, null, {
      severity: "ALL",
      category: "STRUCTURE",
      detectionKind: "ALL",
      origin: "RULE",
    }).length,
    1,
  );
});

test("AI potential findings are separate, optionally filterable, and never included in Rule score deductions", () => {
  assert.equal(
    selectIssues(audit, ai, {
      severity: "ALL",
      category: "ALL",
      detectionKind: "ALL",
      origin: "AI",
    })[0]?.origin,
    "AI",
  );
  assert.equal(
    selectIssues(audit, ai, {
      severity: "HIGH",
      category: "ALL",
      detectionKind: "ALL",
      origin: "AI",
    }).length,
    0,
  );
  assert.equal(scoreDeductionForCategory(audit, "SECURITY"), 5);
  assert.equal(scoreDeductionForCategory(audit, "DATA_INTEGRITY"), 0);
});

test("summary counts severities and each file issue once even if multiple locations share a file", () => {
  assert.deepEqual(countSeverities(audit.issues), {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 0,
    LOW: 1,
  });
  assert.equal(countIssuesByFile(audit.issues).get("src/page.ts"), 2);
});

test("relation explorer narrows results by relation kind and preserves the full view", () => {
  const relations: CodeRelation[] = [
    {
      id: "import",
      type: "IMPORT",
      source: { id: "a", kind: "FILE", label: "a.ts", filePath: "a.ts" },
      target: { id: "b", kind: "FILE", label: "b.ts", filePath: "b.ts" },
      locations: [{ filePath: "a.ts", line: 1, column: 1 }],
      resolutionStatus: "RESOLVED",
      confidence: "HIGH",
      evidence: "import",
    },
    {
      id: "api",
      type: "API_CALL",
      source: { id: "c", kind: "FILE", label: "c.ts", filePath: "c.ts" },
      target: { id: "route", kind: "API_ROUTE", label: "/api/items" },
      locations: [{ filePath: "c.ts", line: 2, column: 1 }],
      resolutionStatus: "UNRESOLVED",
      confidence: "MEDIUM",
      evidence: "fetch",
    },
  ];
  assert.equal(selectRelations(relations, "IMPORT").length, 1);
  assert.equal(selectRelations(relations, "API_CALL")[0]?.id, "api");
  assert.equal(selectRelations(relations, "ALL").length, 2);
});
