import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyFile, isSensitiveFile } from "../src/lib/project/filter";
import { normalizeRelativePath } from "../src/lib/project/paths";
import {
  ANALYSIS_LIMITS,
  FILE_READ_CONCURRENCY,
} from "../src/lib/project/limits";
import { scanProject, type LocalProjectFile } from "../src/lib/project/scan";
import { redactSecrets } from "../src/lib/security/redact";
import { detectProject } from "../src/lib/project/detect";
import { analyzeProject } from "../src/lib/analysis/parser";

function local(
  path: string,
  text = "export const count = 1;",
  options: {
    size?: number;
    type?: string;
    fail?: boolean;
    read?: () => void;
  } = {},
): LocalProjectFile {
  return {
    webkitRelativePath: path,
    name: path.split("/").at(-1)!,
    size: options.size ?? Buffer.byteLength(text),
    type: options.type ?? "",
    text: async () => {
      options.read?.();
      if (options.fail) throw new Error("private error body must not appear");
      return text;
    },
  };
}

test("normalizes Windows, leading/duplicate slash and dot paths", () => {
  assert.equal(
    normalizeRelativePath("project\\src\\app.ts"),
    "project/src/app.ts",
  );
  assert.equal(
    normalizeRelativePath("/./project//src/./app.ts"),
    "project/src/app.ts",
  );
});

test("rejects traversal, drive/UNC, controls, empty and overly long paths", () => {
  for (const path of [
    "../secret.ts",
    "p/../a.ts",
    "",
    ".",
    "/",
    "C:\\Users\\name\\a.ts",
    "//server/share/a.ts",
    "p/\0a.ts",
    "a".repeat(1025),
    `p/${"a".repeat(256)}`,
  ])
    assert.equal(normalizeRelativePath(path), null);
});

test("classifies ignored, sensitive, supported, unsupported and binary MIME before reading", () => {
  for (const path of [
    "p/node_modules/a.ts",
    "p/.GIT/config",
    "p/.next/x.js",
    "p/.cache/a.json",
    "p/dist/a.ts",
    "p/build/a.ts",
    "p/coverage/a.json",
  ])
    assert.equal(classifyFile(path).status, "EXCLUDED");
  for (const path of [
    "p/.env",
    "p/.env.local",
    "p/.env.production",
    "p/.env.development",
    "p/.ENV.test",
    "p/.env.staging",
    "p/a.pem",
    "p/a.key",
    "p/id_ed25519",
    "p/credentials.json",
    "p/service-account.json",
    "p/.aws/config",
    "p/.ssh/config",
  ])
    assert.equal(isSensitiveFile(path), true);
  for (const path of [
    "p/.ENV.EXAMPLE",
    "p/README.MD",
    "p/package.json",
    "p/next.config.mjs",
    "p/src/Keyboard.tsx",
    "p/src/apiKey.ts",
    "p/schema.prisma",
    "p/schema.sql",
  ])
    assert.equal(classifyFile(path).status, "INCLUDED");
  for (const path of [
    "p/photo.png",
    "p/font.woff2",
    "p/video.mp4",
    "p/a.zip",
    "p/a.exe",
    "p/code.py",
  ])
    assert.equal(classifyFile(path).status, "UNSUPPORTED");
  assert.equal(classifyFile("p/fake.ts", "image/png").status, "UNSUPPORTED");
});

test("masks assignments, bearer, JWT, provider key and private key without leaking values", () => {
  const values = [
    "FAKE_API_VALUE",
    "FAKE_PASSWORD_VALUE",
    "FAKE_TOKEN_VALUE",
    "FAKE_SECRET_VALUE",
    "FAKE_KEY_VALUE",
    "abcDEF12345",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature",
    `AIza${"A".repeat(30)}`,
    "FAKE_PRIVATE_BODY",
  ];
  const text = `const apiKey = "${values[0]}"; const password = '${values[1]}'; {"token":"${values[2]}", "secret": "${values[3]}", "key": "${values[4]}"}; Authorization: Bearer ${values[5]}\n${values[6]}\n${values[7]}\n-----BEGIN RSA PRIVATE KEY-----\n${values[8]}\n-----END RSA PRIVATE KEY-----`;
  const result = redactSecrets(text);
  assert.ok(result.hasSecretCandidate);
  for (const value of values)
    assert.equal(result.redactedText.includes(value), false);
  assert.ok(result.redactionCount >= 8);
  assert.equal(
    redactSecrets(
      "-----BEGIN PRIVATE KEY-----\nunfinished-body",
    ).redactedText.includes("unfinished-body"),
    false,
  );
  assert.equal(
    JSON.parse(
      redactSecrets('{"secret":"FAKE_VALUE","dependencies":{"react":"19"}}')
        .redactedText,
    ).secret,
    "[REDACTED]",
  );
});

test("preserves ordinary source and masks env example values including multiline ones", () => {
  const normal =
    'export const keyboard = "standard"; const monkey = "banana"; const label = "hello";';
  assert.equal(redactSecrets(normal).redactedText, normal);
  assert.equal(redactSecrets(normal).hasSecretCandidate, false);
  const result = redactSecrets(
    'APP_URL=https://example.invalid\nEMPTY=\nexport CUSTOM="FAKE_CUSTOM_VALUE"\nMULTI="FAKE_FIRST_LINE\nFAKE_SECOND_LINE"\n',
    true,
  );
  for (const value of [
    "https://example.invalid",
    "FAKE_CUSTOM_VALUE",
    "FAKE_FIRST_LINE",
    "FAKE_SECOND_LINE",
  ])
    assert.equal(result.redactedText.includes(value), false);
  assert.match(result.redactedText, /APP_URL=\[REDACTED\]/);
  assert.match(result.redactedText, /EMPTY=\n/);
});

test("masks escaped and TypeScript-annotated string assignments", () => {
  const text = String.raw`const password: string = "FAKE_PREFIX\"FAKE_SUFFIX"; const secret = 'FAKE_SINGLE\'FAKE_END';`;
  const result = redactSecrets(text);
  assert.equal(result.redactedText.includes("FAKE_"), false);
  assert.equal(result.redactionCount, 2);
});

test("scanner never reads blocked/unsupported/invalid/oversized files and preserves metadata", async () => {
  let deniedReads = 0;
  const noRead = {
    read: () => {
      deniedReads++;
    },
  };
  const result = await scanProject([
    local("p/.env", "hidden", noRead),
    local("p/node_modules/a.ts", "hidden", noRead),
    local("p/img.png", "hidden", noRead),
    local("C:/private/a.ts", "hidden", noRead),
    local("p/large.ts", "hidden", {
      ...noRead,
      size: ANALYSIS_LIMITS.maxFileBytes + 1,
    }),
    local("p/src/a.ts"),
    local("p/.env.example", "CUSTOM=FAKE_CUSTOM_VALUE"),
  ]);
  assert.equal(deniedReads, 0);
  assert.equal(result.metadata.totalFiles, 7);
  assert.equal(result.metadata.includedFiles, 2);
  assert.equal(result.metadata.excludedFiles, 4);
  assert.equal(result.metadata.unsupportedFiles, 1);
  assert.equal(
    result.files.some((file) => file.relativePath.includes("C:")),
    false,
  );
  assert.equal(JSON.stringify(result).includes("FAKE_CUSTOM_VALUE"), false);
  assert.equal(result.contents.length, 2);
});

test("file and total byte limits use inclusive boundaries and reserve before reads", async () => {
  let reads = 0;
  const files = Array.from({ length: 22 }, (_, i) =>
    local(`p/${String(i).padStart(3, "0")}.ts`, "x", {
      size: ANALYSIS_LIMITS.maxFileBytes,
      read: () => {
        reads++;
      },
    }),
  );
  const result = await scanProject(files);
  assert.equal(reads, 20);
  assert.equal(
    result.metadata.totalTextBytes,
    ANALYSIS_LIMITS.maxTotalTextBytes,
  );
  assert.equal(
    result.files.filter((file) => file.exclusionReason === "TOTAL_SIZE").length,
    2,
  );
});

test("1,000 file boundary, failed reads, binary text, duplicate paths", async () => {
  let reads = 0;
  const result = await scanProject(
    Array.from({ length: 1001 }, (_, i) =>
      local(`p/${i.toString().padStart(4, "0")}.ts`, "x", {
        read: () => {
          reads++;
        },
      }),
    ),
  );
  assert.equal(reads, 1000);
  assert.equal(result.metadata.includedFiles, 1000);
  assert.equal(result.files.at(-1)?.exclusionReason, "FILE_COUNT");
  const exceptional = await scanProject([
    local("p/A.ts"),
    local("p/a.ts"),
    local("p/broken.ts", "", { fail: true }),
    local("p/binary.ts", "\0binary"),
  ]);
  assert.equal(
    exceptional.files.find((file) => file.relativePath === "p/a.ts")?.status,
    "DUPLICATE",
  );
  assert.equal(
    exceptional.files.find((file) => file.name === "broken.ts")?.status,
    "READ_ERROR",
  );
  assert.equal(
    exceptional.files.find((file) => file.name === "binary.ts")
      ?.exclusionReason,
    "BINARY_CONTENT",
  );
  assert.equal(
    JSON.stringify(exceptional).includes("private error body"),
    false,
  );
});

test("reads at most configured concurrency and aborts without publishing old results", async () => {
  let active = 0;
  let maximum = 0;
  const files = Array.from({ length: 12 }, (_, i) => ({
    ...local(`p/${i}.ts`),
    text: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--;
      return "x";
    },
  }));
  await scanProject(files);
  assert.ok(maximum <= FILE_READ_CONCURRENCY);
  const controller = new AbortController();
  const abortedFiles = [
    local("p/a.ts", "x", { read: () => controller.abort() }),
  ];
  await assert.rejects(
    scanProject(abortedFiles, { signal: controller.signal }),
    { name: "AbortError" },
  );
});

test("detects dependencies without executing scripts/config and handles malformed manifests", async () => {
  const packageText = JSON.stringify({
    scripts: { start: "DO_NOT_EXECUTE" },
    dependencies: { next: "16", react: "19", "@supabase/supabase-js": "2" },
    devDependencies: { typescript: "6", tailwindcss: "4" },
  });
  const result = await scanProject([
    local("demo/package.json", packageText),
    local("demo/src/page.tsx"),
    local("demo/next.config.mjs", 'throw new Error("DO_NOT_EXECUTE")'),
  ]);
  assert.equal(result.metadata.name, "demo");
  for (const expected of [
    "Next.js",
    "React",
    "TypeScript",
    "Node.js",
    "Supabase",
    "Tailwind CSS",
  ])
    assert.ok(
      result.metadata.stack.includes(
        expected as (typeof result.metadata.stack)[number],
      ),
    );
  const invalid = await scanProject([
    local("broken/package.json", "{invalid FAKE_PRIVATE_ERROR_CONTENT"),
  ]);
  assert.ok(invalid.metadata.warnings.length);
  assert.equal(invalid.metadata.stack.length, 0);
  assert.equal(
    invalid.metadata.warnings.join().includes("FAKE_PRIVATE_ERROR_CONTENT"),
    false,
  );
  assert.equal(detectProject([], []).stack.length, 0);
});

test("resolves the frontend → API route → Supabase table → SQL schema acceptance fixture", async () => {
  const project = await scanProject([
    local(
      "demo/package.json",
      JSON.stringify({
        scripts: { test: "throw new Error('MUST_NOT_EXECUTE')" },
        dependencies: { next: "16", react: "19", "@supabase/supabase-js": "2" },
      }),
    ),
    local(
      "demo/tsconfig.json",
      '{"compilerOptions":{"baseUrl":".","paths":{"@/*":["./src/*"]}}}',
    ),
    local(
      "demo/src/app/users/page.tsx",
      'import { getUsers } from "@/lib/api";\nexport default async function Page(){\n  // TODO: add pagination\n  const response = await fetch("/api/users");\n  return response.data.user.profileImage;\n}',
    ),
    local(
      "demo/src/lib/api.ts",
      'import React from "react";\nexport async function getUsers(){return fetch("/api/users")}',
    ),
    local(
      "demo/src/app/api/users/route.ts",
      'import { createClient } from "@supabase/supabase-js";\nconst supabase = createClient();\nexport async function GET(){return supabase.from("users").select("id,name,profile_url")}\nexport const POST = async () => supabase.from("users").insert({});',
    ),
    local(
      "demo/schema.sql",
      "CREATE TABLE users (\n  id uuid NOT NULL,\n  name text,\n  profile_url varchar(255),\n  PRIMARY KEY(id)\n);",
    ),
  ]);
  const result = await analyzeProject(project.files, project.contents);
  const has = (type: string, source: string, target: string) =>
    result.relations.some(
      (relation) =>
        relation.type === type &&
        relation.source.label === source &&
        relation.target.label === target,
    );
  assert.ok(has("API_CALL", "demo/src/app/users/page.tsx", "/api/users"));
  assert.ok(
    has("ROUTE_HANDLER", "/api/users", "demo/src/app/api/users/route.ts"),
  );
  assert.ok(has("DATABASE", "demo/src/app/api/users/route.ts", "users"));
  assert.ok(has("SCHEMA_DEFINITION", "users", "demo/schema.sql"));
  assert.equal(
    result.routes
      .find((route) => route.path === "/api/users")
      ?.methods.includes("GET"),
    true,
  );
  assert.equal(
    result.schemas
      .find((schema) => schema.name === "users")
      ?.columns.map((column) => column.name)
      .join(","),
    "id,name,profile_url",
  );
  assert.ok(
    result.imports.some(
      (item) =>
        item.moduleSpecifier === "@/lib/api" &&
        item.resolutionStatus === "RESOLVED",
    ),
  );
  assert.ok(result.commentMarkers.some((item) => item.marker === "TODO"));
  assert.ok(
    result.objectFields.some((item) => item.property === "profileImage"),
  );
  assert.equal(result.parseErrors.length, 0);
});

test("extracts import classes, re-exports, dynamic API URLs and environment references", async () => {
  const project = await scanProject([
    local(
      "p/package.json",
      JSON.stringify({ dependencies: { react: "19", axios: "1" } }),
    ),
    local("p/tsconfig.json", '{"compilerOptions":{"paths":{"@/*":["src/*"]}}}'),
    local(
      "p/src/index.ts",
      'import Button from "./components/Button";\nimport axios from "axios";\nimport fs from "node:fs";\nimport Missing from "./missing";\nexport { Button } from "./components/Button";\nexport default Button;\nexport const load = () => fetch(`/api/users/${id}`);\nexport const unknown = (apiUrl: string) => fetch(apiUrl);\naxios.get("/api/users");\nconst endpoint = process.env.NEXT_PUBLIC_SITE_URL;',
    ),
    local(
      "p/src/components/Button.tsx",
      "export default function Button(){return null;}",
    ),
    local(
      "p/src/app/api/users/[id]/route.ts",
      "export async function GET() { return null; }",
    ),
  ]);
  const result = await analyzeProject(project.files, project.contents);
  assert.ok(
    result.imports.some(
      (item) =>
        item.classification === "PACKAGE" &&
        item.moduleSpecifier === "axios" &&
        item.declaredDependency,
    ),
  );
  assert.ok(
    result.imports.some(
      (item) =>
        item.classification === "BUILTIN" && item.moduleSpecifier === "node:fs",
    ),
  );
  assert.ok(
    result.imports.some(
      (item) =>
        item.moduleSpecifier === "./missing" &&
        item.resolutionStatus === "UNRESOLVED",
    ),
  );
  assert.ok(result.exports.some((item) => item.exportKind === "REEXPORT"));
  assert.ok(result.exports.some((item) => item.exportKind === "DEFAULT"));
  assert.ok(
    result.apiCalls.some(
      (item) =>
        item.path === "/api/users/:dynamic" &&
        item.dynamic &&
        item.resolutionStatus === "PARTIAL",
    ),
  );
  assert.ok(
    result.apiCalls.some(
      (item) => !item.path && item.resolutionStatus === "UNRESOLVED",
    ),
  );
  assert.ok(
    result.apiCalls.some(
      (item) => item.method === "GET" && item.path === "/api/users",
    ),
  );
  assert.ok(
    result.environmentReferences.some(
      (item) => item.name === "NEXT_PUBLIC_SITE_URL",
    ),
  );
  assert.equal(result.coverage.unresolvedImports, 1);
});

test("extracts Supabase CRUD and Prisma model operations", async () => {
  const project = await scanProject([
    local(
      "p/package.json",
      JSON.stringify({
        dependencies: { prisma: "6", "@supabase/supabase-js": "2" },
      }),
    ),
    local(
      "p/src/db.ts",
      'const supabase = createSupabaseClient();\nsupabase.from("users").select("id");\nsupabase.from("books").insert({});\nsupabase.from("reviews").update({});\nsupabase.from("users").delete();\nsupabase.from("users").upsert({});\nsupabase.from(tableName).select();\nprisma.user.findMany();\nprisma.user.create({data:{}});\nprisma.user.update({where:{id:"x"},data:{}});\nprisma.user.delete({where:{id:"x"}});',
    ),
    local(
      "p/schema.sql",
      "CREATE TABLE users (id uuid); CREATE TABLE books (id int); CREATE TABLE reviews (id int);",
    ),
    local(
      "p/schema.prisma",
      "model User {\n id String @id\n name String\n profileUrl String?\n}\nmodel Book {\n id Int @id\n}",
    ),
  ]);
  const result = await analyzeProject(project.files, project.contents);
  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE", "UPSERT"])
    assert.ok(
      result.databaseCalls.some(
        (item) => item.provider === "SUPABASE" && item.operation === operation,
      ),
    );
  assert.ok(
    result.databaseCalls.some(
      (item) =>
        item.provider === "SUPABASE" && item.resolutionStatus === "UNRESOLVED",
    ),
  );
  for (const operation of ["SELECT", "INSERT", "UPDATE", "DELETE"])
    assert.ok(
      result.databaseCalls.some(
        (item) => item.provider === "PRISMA" && item.operation === operation,
      ),
    );
  const user = result.schemas.find(
    (item) => item.kind === "MODEL" && item.name === "User",
  );
  assert.deepEqual(
    user?.columns.map((column) => [column.name, column.type, column.optional]),
    [
      ["id", "String", false],
      ["name", "String", false],
      ["profileUrl", "String", true],
    ],
  );
});

test("reports malformed source, SQL and Prisma as coverage gaps", async () => {
  const project = await scanProject([
    local("p/src/broken.ts", "export const = ;"),
    local("p/broken.sql", "CREATE TABLE users (id uuid;"),
    local("p/broken.prisma", "model User {\n id String"),
  ]);
  const result = await analyzeProject(project.files, project.contents);
  assert.ok(result.parseErrors.some((item) => item.kind === "JS_TS"));
  assert.ok(result.parseErrors.some((item) => item.kind === "SQL"));
  assert.ok(result.parseErrors.some((item) => item.kind === "PRISMA"));
  assert.equal(result.coverage.failedFiles, 1);
  assert.equal(result.coverage.failedSchemaFiles, 2);
});
