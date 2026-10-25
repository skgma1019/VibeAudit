import assert from "node:assert/strict";
import test from "node:test";
import type { RuleIssue } from "../src/types/audit";
import { auditResultSchema } from "../src/schemas/audit";
import { deduplicateIssues } from "../src/lib/audit/deduplicate";
import { calculateScores } from "../src/lib/audit/score";
import { runAuditRules } from "../src/lib/rules";
import { analyzeProject } from "../src/lib/analysis/parser";
import { scanProject, type LocalProjectFile } from "../src/lib/project/scan";

function file(path: string, text: string): LocalProjectFile {
  return {
    webkitRelativePath: `demo/${path}`,
    name: path.split("/").at(-1)!,
    size: Buffer.byteLength(text),
    type: "",
    text: async () => text,
  };
}

async function audit(entries: Array<[string, string]>) {
  const selected = await scanProject(
    entries.map(([path, text]) => file(path, text)),
  );
  const analysis = await analyzeProject(selected.files, selected.contents);
  return {
    selected,
    analysis,
    result: runAuditRules(
      selected.metadata,
      selected.files,
      selected.contents,
      analysis,
    ),
  };
}

const hasRule = (issues: RuleIssue[], id: string) =>
  issues.some((issue) => issue.ruleId === id);

test("required files reports README absence and stays quiet when present", async () => {
  const absent = await audit([["package.json", '{"dependencies":{}}']]);
  const present = await audit([
    ["package.json", '{"dependencies":{}}'],
    ["README.md", "# Demo"],
  ]);
  assert.ok(hasRule(absent.result.issues, "structure.required-files"));
  assert.equal(
    present.result.issues.filter(
      (issue) => issue.ruleId === "structure.required-files",
    ).length,
    0,
  );
});

test("missing env example warns only when environment references exist", async () => {
  const used = await audit([
    ["package.json", "{}"],
    ["src/page.ts", "const value = process.env.API_URL;"],
  ]);
  const unused = await audit([["package.json", "{}"]]);
  assert.ok(
    used.result.issues.some(
      (issue) => issue.title === ".env.example is missing",
    ),
  );
  assert.equal(
    unused.result.issues.some(
      (issue) => issue.title === ".env.example is missing",
    ),
    false,
  );
});

test("TODO and FIXME markers are grouped by file as heuristic candidates", async () => {
  const { result } = await audit([
    ["package.json", "{}"],
    ["src/a.ts", "// TODO first\n// TODO second\n// FIXME review"],
  ]);
  const issues = result.issues.filter(
    (issue) => issue.ruleId === "structure.todo-fixme",
  );
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.detectionKind === "HEURISTIC"));
  assert.equal(
    issues.find((issue) => issue.title.includes("FIXME"))?.severity,
    "MEDIUM",
  );
});

test("masked secret candidates make value-free heuristic issues", async () => {
  const { selected, result } = await audit([
    ["package.json", "{}"],
    ["src/secret.ts", 'const apiKey = "FAKE_API_VALUE";'],
  ]);
  const issue = result.issues.find(
    (item) => item.ruleId === "security.hardcoded-secret",
  );
  assert.ok(issue);
  assert.equal(issue.detectionKind, "HEURISTIC");
  assert.equal(JSON.stringify(issue).includes("FAKE_API_VALUE"), false);
  assert.equal(JSON.stringify(selected).includes("FAKE_API_VALUE"), false);
});

test("client private env is reported while public and server env are not", async () => {
  const { result } = await audit([
    ["package.json", "{}"],
    [
      "src/client.ts",
      '"use client"; const a = process.env.GEMINI_API_KEY; const b = process.env.NEXT_PUBLIC_SITE_URL;',
    ],
    ["src/server.ts", "const key = process.env.GEMINI_API_KEY;"],
  ]);
  const privateClient = result.issues.filter(
    (issue) => issue.ruleId === "security.client-env",
  );
  assert.equal(privateClient.length, 1);
  assert.match(privateClient[0].title, /GEMINI_API_KEY/);
  assert.equal(privateClient[0].detectionKind, "DETERMINISTIC");
});

test("AST security patterns are heuristic and ordinary text is ignored", async () => {
  const { result } = await audit([
    ["package.json", "{}"],
    [
      "src/danger.ts",
      'const note = "eval(value)"; eval(input); element.innerHTML = html;',
    ],
    ["src/safe.ts", 'const text = "safe";'],
  ]);
  const issues = result.issues.filter(
    (issue) => issue.ruleId === "security.dangerous-pattern",
  );
  assert.equal(issues.length, 2);
  assert.ok(issues.every((issue) => issue.detectionKind === "HEURISTIC"));
});

test("schema select mismatch is deterministic and matching or wildcard selects pass", async () => {
  const { result } = await audit([
    ["package.json", '{"dependencies":{"@supabase/supabase-js":"2"}}'],
    [
      "src/db.ts",
      'const supabase = createSupabaseClient(); supabase.from("users").select("id,avatar_url"); supabase.from("users").select("*");',
    ],
    ["schema.sql", "CREATE TABLE users (id uuid, profile_url text);"],
  ]);
  const issues = result.issues.filter(
    (issue) => issue.ruleId === "integrity.schema-field",
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0].detectionKind, "DETERMINISTIC");
  assert.match(issues[0].evidence, /avatar_url/);
  const valid = await audit([
    ["package.json", "{}"],
    [
      "src/db.ts",
      'const supabase = createSupabaseClient(); supabase.from("users").select("id,profile_url");',
    ],
    ["schema.sql", "CREATE TABLE users (id uuid, profile_url text);"],
  ]);
  assert.equal(hasRule(valid.result.issues, "integrity.schema-field"), false);
  const prisma = await audit([
    ["package.json", '{"dependencies":{"@prisma/client":"6"}}'],
    [
      "src/db.ts",
      "prisma.user.findMany({ select: { id: true, avatarUrl: true } });",
    ],
    ["schema.prisma", "model User {\n id String @id\n profileUrl String?\n}"],
  ]);
  assert.ok(hasRule(prisma.result.issues, "integrity.schema-field"));
});

test("static missing local API route is a candidate but existing route resolves", async () => {
  const { result } = await audit([
    ["package.json", "{}"],
    [
      "src/missing.ts",
      'fetch("/api/user"); fetch("https://service.invalid/api/user");',
    ],
    [
      "src/app/api/users/route.ts",
      "export async function GET() { return Response.json({ id: 1 }); }",
    ],
    ["src/existing.ts", 'fetch("/api/users");'],
  ]);
  const issues = result.issues.filter(
    (issue) => issue.ruleId === "integrity.local-api-route",
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].evidence, /\/api\/user\./);
  assert.equal(issues[0].detectionKind, "HEURISTIC");
});

test("dynamic and external requests do not create local route findings", async () => {
  const { result } = await audit([
    ["package.json", "{}"],
    [
      "src/page.ts",
      'fetch(url); fetch(`/api/users/${id}`); fetch("https://service.invalid");',
    ],
  ]);
  assert.equal(hasRule(result.issues, "integrity.local-api-route"), false);
});

test("mapped API field passes while unmapped frontend field becomes a candidate", async () => {
  const mapped = await audit([
    ["package.json", "{}"],
    [
      "src/app/users/page.tsx",
      'const response = await fetch("/api/users"); return response.profileImage;',
    ],
    [
      "src/app/api/users/route.ts",
      'const supabase = createSupabaseClient(); export async function GET() { const row = { profile_url: "x" }; await supabase.from("users").select("profile_url"); return Response.json({ profileImage: row.profile_url }); }',
    ],
    ["schema.sql", "CREATE TABLE users (profile_url text);"],
  ]);
  const unmapped = await audit([
    ["package.json", "{}"],
    [
      "src/app/users/page.tsx",
      'const response = await fetch("/api/users"); return response.profileImage;',
    ],
    [
      "src/app/api/users/route.ts",
      'const supabase = createSupabaseClient(); export async function GET() { const row = { profile_url: "x" }; await supabase.from("users").select("profile_url"); return Response.json({ profile_url: row.profile_url }); }',
    ],
    ["schema.sql", "CREATE TABLE users (profile_url text);"],
  ]);
  assert.equal(
    hasRule(mapped.result.issues, "integrity.field-mismatch"),
    false,
  );
  assert.ok(hasRule(unmapped.result.issues, "integrity.field-mismatch"));
  assert.equal(
    unmapped.result.issues.find(
      (issue) => issue.ruleId === "integrity.field-mismatch",
    )?.detectionKind,
    "HEURISTIC",
  );
});

test("missing, declared, and builtin package imports are distinguished", async () => {
  const { result } = await audit([
    ["package.json", '{"dependencies":{"react":"19"}}'],
    [
      "src/page.ts",
      'import React from "react"; import axios from "axios"; import fs from "node:fs";',
    ],
  ]);
  const missing = result.issues.filter(
    (issue) => issue.ruleId === "dependencies.missing-dependency",
  );
  assert.equal(missing.length, 1);
  assert.match(missing[0].title, /axios/);
  assert.equal(missing[0].detectionKind, "DETERMINISTIC");
  const invalidManifest = await audit([
    ["package.json", "{invalid"],
    ["src/page.ts", 'import axios from "axios";'],
  ]);
  assert.equal(
    hasRule(invalidManifest.result.issues, "dependencies.missing-dependency"),
    false,
  );
});

test("type-only missing package is handled as an undeclared dependency", async () => {
  const { result, analysis } = await audit([
    ["package.json", "{}"],
    ["src/types.ts", 'import type { AxiosRequestConfig } from "axios";'],
  ]);
  assert.equal(
    analysis.imports.find((item) => item.moduleSpecifier === "axios")?.typeOnly,
    true,
  );
  assert.match(
    result.issues.find(
      (issue) => issue.ruleId === "dependencies.missing-dependency",
    )?.evidence ?? "",
    /type-only/,
  );
});

test("unused dependency is heuristic and known framework packages are exempt", async () => {
  const { result } = await audit([
    [
      "package.json",
      '{"dependencies":{"next":"16","react":"19","lodash":"4"}}',
    ],
    ["src/page.ts", 'import React from "react";'],
  ]);
  const issues = result.issues.filter(
    (issue) => issue.ruleId === "dependencies.unused-dependency",
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].title, /lodash/);
  assert.equal(issues[0].detectionKind, "HEURISTIC");
});

test("API consistency requires three samples and a majority pattern", async () => {
  const small = await audit([
    ["package.json", "{}"],
    [
      "src/app/api/a/route.ts",
      "export function GET(){ return Response.json({ success: true, data: 1 }); }",
    ],
    [
      "src/app/api/b/route.ts",
      "export function GET(){ return Response.json({ ok: true, result: 1 }); }",
    ],
  ]);
  const enough = await audit([
    ["package.json", "{}"],
    [
      "src/app/api/a/route.ts",
      "export function GET(){ return Response.json({ success: true, data: 1 }); }",
    ],
    [
      "src/app/api/b/route.ts",
      "export function GET(){ return Response.json({ success: true, data: 2 }); }",
    ],
    [
      "src/app/api/c/route.ts",
      "export function GET(){ return Response.json({ ok: true, result: 3 }); }",
    ],
  ]);
  const consistent = await audit([
    ["package.json", "{}"],
    [
      "src/app/api/a/route.ts",
      "export function GET(){ return Response.json({ success: true, data: 1 }); }",
    ],
    [
      "src/app/api/b/route.ts",
      "export function GET(){ return Response.json({ success: true, data: 2 }); }",
    ],
    [
      "src/app/api/c/route.ts",
      "export function GET(){ return Response.json({ success: true, data: 3 }); }",
    ],
  ]);
  assert.equal(hasRule(small.result.issues, "consistency.api-response"), false);
  assert.ok(hasRule(enough.result.issues, "consistency.api-response"));
  assert.equal(
    hasRule(consistent.result.issues, "consistency.api-response"),
    false,
  );
});

function issue(
  fingerprint: string,
  category: RuleIssue["category"],
  severity: RuleIssue["severity"],
): RuleIssue {
  return {
    origin: "RULE",
    detectionKind: "HEURISTIC",
    category,
    severity,
    ruleId: "test.rule",
    title: "test issue",
    description: "test description",
    locations: [{ filePath: "demo/file.ts", line: 1, column: 1 }],
    evidence: "static evidence",
    suggestion: "review",
    fingerprint,
  };
}

test("severity penalties, category isolation, overall mean, and grade boundaries follow contract", () => {
  const scores = calculateScores([
    issue("h", "SECURITY", "HIGH"),
    issue("m", "DATA_INTEGRITY", "MEDIUM"),
    issue("l", "DEPENDENCY", "LOW"),
  ]);
  assert.equal(scores.categories.SECURITY, 95);
  assert.equal(scores.categories.DATA_INTEGRITY, 98);
  assert.equal(scores.categories.DEPENDENCY, 99);
  assert.equal(scores.categories.STRUCTURE, 100);
  assert.equal(scores.overall, 98.4);
  const boundary = (points: number) =>
    calculateScores(
      (
        [
          "DATA_INTEGRITY",
          "CONSISTENCY",
          "SECURITY",
          "STRUCTURE",
          "DEPENDENCY",
        ] as const
      ).flatMap((category) =>
        Array.from({ length: Math.ceil((100 - points) / 10) }, (_, index) =>
          issue(`${category}-${index}`, category, "CRITICAL"),
        ),
      ),
    );
  assert.equal(boundary(90).grade, "A");
  assert.equal(boundary(80).grade, "B");
  assert.equal(boundary(70).grade, "C");
  assert.equal(boundary(60).grade, "D");
  assert.equal(boundary(50).grade, "F");
});

test("duplicate fingerprints deduct once, retain the highest severity, and floor at zero", () => {
  const unique = deduplicateIssues([
    issue("same", "SECURITY", "LOW"),
    issue("same", "SECURITY", "HIGH"),
    ...Array.from({ length: 30 }, (_, index) =>
      issue(`critical-${index}`, "SECURITY", "CRITICAL"),
    ),
  ]);
  assert.equal(unique.length, 31);
  assert.equal(
    unique.find((item) => item.fingerprint === "same")?.severity,
    "HIGH",
  );
  const scores = calculateScores(unique);
  assert.equal(scores.categories.SECURITY, 0);
  const duplicatePenalty = calculateScores([
    issue("repeated", "SECURITY", "LOW"),
    issue("repeated", "SECURITY", "HIGH"),
  ]);
  assert.equal(duplicatePenalty.categories.SECURITY, 95);
});

test("heuristic rule issues receive full contract severity penalty", () => {
  const score = calculateScores([issue("heuristic", "SECURITY", "HIGH")]);
  assert.equal(score.categories.SECURITY, 95);
});

test("AI-origin issue is rejected at the Rule schema boundary", () => {
  const parsed = auditResultSchema.safeParse({
    issues: [{ ...issue("ai", "SECURITY", "HIGH"), origin: "AI" }],
    scores: {
      categories: {
        DATA_INTEGRITY: 100,
        CONSISTENCY: 100,
        SECURITY: 95,
        STRUCTURE: 100,
        DEPENDENCY: 100,
      },
      overall: 99,
      grade: "A",
    },
    coverage: {
      DATA_INTEGRITY: "LIMITED",
      CONSISTENCY: "LIMITED",
      SECURITY: "FULL",
      STRUCTURE: "FULL",
      DEPENDENCY: "LIMITED",
    },
    ruleVersion: "rules-v1",
    scoreVersion: "score-v1",
  });
  assert.equal(parsed.success, false);
});

test("coverage remains separate and limited when data schemas are unavailable", async () => {
  const { result } = await audit([
    ["package.json", "{}"],
    ["src/page.ts", "export const x = 1;"],
  ]);
  assert.equal(result.coverage.DATA_INTEGRITY, "LIMITED");
  assert.equal(result.coverage.CONSISTENCY, "LIMITED");
  assert.equal(result.scores.categories.DATA_INTEGRITY, 100);
});

test("identical analysis input produces byte-for-byte stable rule output", async () => {
  const entries: Array<[string, string]> = [
    ["package.json", '{"dependencies":{"react":"19"}}'],
    ["README.md", "# Demo"],
    [
      "src/page.ts",
      '// TODO review\nimport React from "react"; fetch("/api/missing");',
    ],
  ];
  const first = await audit(entries);
  const second = await audit(entries);
  assert.deepEqual(first.result, second.result);
});
