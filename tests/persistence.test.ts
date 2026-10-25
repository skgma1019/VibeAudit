import assert from "node:assert/strict";
import test from "node:test";
import {
  persistedScoreMatches,
  redactPersistedAudit,
  toPersistedAudit,
} from "../src/lib/audit/persistence";
import { calculateScores } from "../src/lib/audit/score";
import { persistedAuditSchema } from "../src/schemas/persistence";
import type { AnalysisResult } from "../src/types/analysis";
import type { AuditResult } from "../src/types/audit";
import type { ProjectMetadata } from "../src/types/project";

const metadata: ProjectMetadata = {
  name: "demo-project",
  stack: ["TypeScript", "React"],
  warnings: [],
  totalFiles: 2,
  includedFiles: 2,
  excludedFiles: 0,
  unsupportedFiles: 0,
  totalTextBytes: 100,
  protectedFiles: 0,
};
const analysis: AnalysisResult = {
  nodes: [],
  relations: [],
  imports: [],
  exports: [],
  apiCalls: [],
  routes: [],
  databaseCalls: [],
  apiResponses: [],
  environmentReferences: [],
  objectFields: [],
  commentMarkers: [],
  schemas: [],
  parseErrors: [],
  configWarnings: [],
  coverage: {
    sourceFiles: 2,
    parsedFiles: 2,
    failedFiles: 0,
    imports: 0,
    resolvedImports: 0,
    unresolvedImports: 0,
    apiCalls: 0,
    resolvedApiCalls: 0,
    unresolvedApiCalls: 0,
    databaseCalls: 0,
    resolvedDatabaseCalls: 0,
    unresolvedDatabaseCalls: 0,
    schemaFiles: 0,
    parsedSchemaFiles: 0,
    failedSchemaFiles: 0,
    environmentReferences: 0,
    fieldReferences: 0,
    todoMarkers: 0,
    truncatedRecords: 0,
  },
};
const audit: AuditResult = {
  issues: [],
  scores: {
    categories: {
      DATA_INTEGRITY: 100,
      CONSISTENCY: 100,
      SECURITY: 100,
      STRUCTURE: 100,
      DEPENDENCY: 100,
    },
    overall: 100,
    grade: "A",
  },
  coverage: {
    DATA_INTEGRITY: "LIMITED",
    CONSISTENCY: "LIMITED",
    SECURITY: "FULL",
    STRUCTURE: "FULL",
    DEPENDENCY: "FULL",
  },
  ruleVersion: "rules-v1",
  scoreVersion: "score-v1",
};

test("persistence DTO keeps only approved fields and no source body", () => {
  const request = toPersistedAudit({
    metadata,
    analysis,
    audit,
    ai: null,
    aiStatus: "IDLE",
    projectId: null,
    requestId: crypto.randomUUID(),
  });
  const serialized = JSON.stringify(request);
  assert.equal(serialized.includes("sourceBody"), false);
  assert.equal(serialized.includes("/Users/alice"), false);
  assert.equal(request.audit.aiInsights.length, 0);
  assert.equal(request.audit.fileCount, 2);
});

test("AI-less DTOs allow a null summary for idle, skipped, and failed audits", () => {
  for (const aiStatus of ["IDLE", "SKIPPED", "FAILED"] as const) {
    const request = toPersistedAudit({
      metadata,
      analysis,
      audit,
      ai: null,
      aiStatus,
      projectId: null,
      requestId: crypto.randomUUID(),
    });

    assert.equal(request.audit.summary, null, aiStatus);
    assert.equal(
      persistedAuditSchema.safeParse(request).success,
      true,
      aiStatus,
    );
    assert.equal(persistedScoreMatches(redactPersistedAudit(request)), true);
  }
});

test("Audit API persistence validation accepts null and normal summaries but rejects oversized text", () => {
  const request = toPersistedAudit({
    metadata,
    analysis,
    audit,
    ai: null,
    aiStatus: "IDLE",
    projectId: null,
    requestId: crypto.randomUUID(),
  });
  const nullSummary = persistedAuditSchema.safeParse(request);
  assert.equal(nullSummary.success, true);
  if (nullSummary.success)
    assert.equal(
      persistedScoreMatches(redactPersistedAudit(nullSummary.data)),
      true,
    );

  const normalSummary = structuredClone(request);
  normalSummary.audit.summary = {
    overview: "A valid summary string.",
    strengths: [],
    topPriorities: [],
  };
  assert.equal(persistedAuditSchema.safeParse(normalSummary).success, true);

  const oversizedSummary = structuredClone(normalSummary);
  oversizedSummary.audit.summary!.overview = "x".repeat(2_001);
  assert.equal(persistedAuditSchema.safeParse(oversizedSummary).success, false);
});

test("strict persistence schema rejects source, owner, prompt, and raw response fields", () => {
  const request = toPersistedAudit({
    metadata,
    analysis,
    audit,
    ai: null,
    aiStatus: "IDLE",
    projectId: null,
    requestId: crypto.randomUUID(),
  });
  for (const forbidden of [
    "source",
    "sourceCode",
    "owner_id",
    "prompt",
    "rawResponse",
  ]) {
    const copy = structuredClone(request) as Record<string, unknown>;
    (copy.audit as Record<string, unknown>)[forbidden] = "private project code";
    assert.equal(
      persistedAuditSchema.safeParse(copy).success,
      false,
      forbidden,
    );
  }
});

test("unsafe absolute and traversal paths are rejected", () => {
  const request = toPersistedAudit({
    metadata,
    analysis,
    audit,
    ai: null,
    aiStatus: "IDLE",
    projectId: null,
    requestId: crypto.randomUUID(),
  });
  for (const filePath of [
    "C:/work/app.ts",
    "/home/user/app.ts",
    "src/../../secret.ts",
    "src\\app.ts",
  ]) {
    const copy = structuredClone(request) as Record<string, unknown>;
    const auditObject = copy.audit as {
      issues: Array<Record<string, unknown>>;
    };
    auditObject.issues = [
      {
        id: crypto.randomUUID(),
        fingerprint: "v1-0000000000000000",
        ruleId: "R1",
        detectionKind: "DETERMINISTIC",
        category: "SECURITY",
        severity: "LOW",
        title: "Title",
        description: "Description",
        evidence: "Evidence",
        suggestion: "Suggestion",
        locations: [{ filePath, line: 1, column: 1 }],
      },
    ];
    assert.equal(persistedAuditSchema.safeParse(copy).success, false, filePath);
  }
});

test("API-side redaction masks credential candidates before persistence", () => {
  const request = toPersistedAudit({
    metadata,
    analysis,
    audit,
    ai: null,
    aiStatus: "IDLE",
    projectId: null,
    requestId: crypto.randomUUID(),
  });
  const mutable = structuredClone(request) as {
    audit: {
      summary: unknown;
      issues: Array<{
        id: string;
        fingerprint: string;
        ruleId: string;
        detectionKind: string;
        category: string;
        severity: string;
        title: string;
        description: string;
        evidence: string;
        suggestion: string;
        locations: Array<{ filePath: string; line: number; column: number }>;
      }>;
    };
  };
  mutable.audit.summary = null;
  mutable.audit.issues = [
    {
      id: crypto.randomUUID(),
      fingerprint: "v1-0000000000000000",
      ruleId: "R1",
      detectionKind: "DETERMINISTIC",
      category: "SECURITY",
      severity: "LOW",
      title: "Title",
      description: "Description",
      evidence: 'apiKey="sk_live_12345678901234567890"',
      suggestion: "Suggestion",
      locations: [
        {
          filePath: "src/ghp_abcdefghijklmnopqrstuvwxyz123456.ts",
          line: 1,
          column: 1,
        },
      ],
    },
  ];
  const safe = redactPersistedAudit(mutable);
  assert.equal(
    JSON.stringify(safe).includes("sk_live_12345678901234567890"),
    false,
  );
  assert.equal(
    JSON.stringify(safe).includes("ghp_abcdefghijklmnopqrstuvwxyz123456"),
    false,
  );
});

test("Rule score starts at 100 with no Rule findings", () => {
  assert.deepEqual(calculateScores([]), {
    categories: {
      DATA_INTEGRITY: 100,
      CONSISTENCY: 100,
      SECURITY: 100,
      STRUCTURE: 100,
      DEPENDENCY: 100,
    },
    overall: 100,
    grade: "A",
  });
});

test("persisted scores must match Rule findings regardless of JSON key order", () => {
  const request = toPersistedAudit({
    metadata,
    analysis,
    audit,
    ai: null,
    aiStatus: "IDLE",
    projectId: null,
    requestId: crypto.randomUUID(),
  });
  assert.equal(persistedScoreMatches(request), true);
  request.audit.scores.overall = 99;
  assert.equal(persistedScoreMatches(request), false);
});
