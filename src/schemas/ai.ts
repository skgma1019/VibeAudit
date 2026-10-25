import { z } from "zod";
import { AI_LIMITS } from "../lib/ai/constants";

const text = (max: number = AI_LIMITS.maxStringChars) =>
  z.string().min(1).max(max);

export const aiLocationSchema = z
  .object({
    filePath: text(1_024),
    line: z.number().int().positive(),
    column: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    endColumn: z.number().int().positive().optional(),
  })
  .strict();

const issueSchema = z
  .object({
    id: text(512),
    ruleId: text(128),
    category: z.enum([
      "DATA_INTEGRITY",
      "CONSISTENCY",
      "SECURITY",
      "STRUCTURE",
      "DEPENDENCY",
    ]),
    severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
    detectionKind: z.enum(["DETERMINISTIC", "HEURISTIC"]),
    title: text(256),
    description: text(AI_LIMITS.maxIssueTextChars),
    locations: z.array(aiLocationSchema).min(1).max(10),
    evidence: text(AI_LIMITS.maxIssueTextChars),
    suggestion: text(AI_LIMITS.maxIssueTextChars),
  })
  .strict();

const relationSchema = z
  .object({
    source: text(AI_LIMITS.maxRelationTextChars),
    sourceFile: text(1_024).optional(),
    type: text(64),
    target: text(AI_LIMITS.maxRelationTextChars),
    targetFile: text(1_024).optional(),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    resolutionStatus: z.enum(["RESOLVED", "PARTIAL", "UNRESOLVED"]),
  })
  .strict();

const schemaSummarySchema = z
  .object({
    kind: z.enum(["TABLE", "MODEL"]),
    name: text(256),
    fields: z
      .array(
        z
          .object({
            name: text(128),
            type: text(128),
            optional: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

const snippetSchema = z
  .object({
    filePath: text(1_024),
    startLine: z.number().int().positive(),
    text: text(AI_LIMITS.maxSnippetChars),
    relatedIssueId: text(512),
  })
  .strict();

const coverageSchema = z
  .object({
    sourceFiles: z.number().int().nonnegative(),
    parsedFiles: z.number().int().nonnegative(),
    failedFiles: z.number().int().nonnegative(),
    imports: z.number().int().nonnegative(),
    resolvedImports: z.number().int().nonnegative(),
    unresolvedImports: z.number().int().nonnegative(),
    apiCalls: z.number().int().nonnegative(),
    resolvedApiCalls: z.number().int().nonnegative(),
    unresolvedApiCalls: z.number().int().nonnegative(),
    databaseCalls: z.number().int().nonnegative(),
    resolvedDatabaseCalls: z.number().int().nonnegative(),
    unresolvedDatabaseCalls: z.number().int().nonnegative(),
    schemaFiles: z.number().int().nonnegative(),
    parsedSchemaFiles: z.number().int().nonnegative(),
    failedSchemaFiles: z.number().int().nonnegative(),
    environmentReferences: z.number().int().nonnegative(),
    fieldReferences: z.number().int().nonnegative(),
    todoMarkers: z.number().int().nonnegative(),
    truncatedRecords: z.number().int().nonnegative(),
  })
  .strict();

export const analyzeRequestSchema = z
  .object({
    projectSummary: z
      .object({
        stack: z.array(text(64)).max(20),
        fileCount: z.number().int().nonnegative().max(1_000),
        analyzedFileCount: z.number().int().nonnegative().max(1_000),
        scores: z
          .object({
            overall: z.number().min(0).max(100),
            grade: z.enum(["A", "B", "C", "D", "F"]),
            categories: z.record(text(64), z.number().min(0).max(100)),
          })
          .strict(),
        coverage: coverageSchema,
        ruleCoverage: z.record(
          text(64),
          z.enum(["FULL", "PARTIAL", "LIMITED"]),
        ),
        relationCounts: z.record(text(64), z.number().int().nonnegative()),
      })
      .strict(),
    ruleIssues: z.array(issueSchema).max(AI_LIMITS.maxIssues),
    relations: z.array(relationSchema).max(AI_LIMITS.maxRelations),
    schemaSummary: z.array(schemaSummarySchema).max(AI_LIMITS.maxSchemas),
    snippets: z.array(snippetSchema).max(AI_LIMITS.maxSnippets),
    availableIssueCount: z.number().int().nonnegative().max(10_000),
    availableRelationCount: z.number().int().nonnegative().max(100_000),
    omittedIssueCount: z.number().int().nonnegative().max(10_000),
    omittedRelationCount: z.number().int().nonnegative().max(100_000),
    availableSchemaCount: z.number().int().nonnegative().max(10_000),
    omittedSchemaCount: z.number().int().nonnegative().max(10_000),
    availableSchemaFieldCount: z.number().int().nonnegative().max(100_000),
    omittedSchemaFieldCount: z.number().int().nonnegative().max(100_000),
  })
  .strict();

const insightSchema = z
  .object({
    type: z.enum(["ISSUE_EXPLANATION", "IMPROVEMENT", "POTENTIAL_ISSUE"]),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    title: text(256),
    explanation: text(1_500),
    impact: text(1_000).optional(),
    suggestion: text(1_500),
    relatedIssueIds: z.array(text(512)).max(10),
    locations: z.array(aiLocationSchema).max(10),
    evidenceStatus: z.enum(["SUPPORTED", "PARTIAL", "UNVERIFIED"]),
  })
  .strict();

export const rawAIResponseSchema = z
  .object({
    summary: z
      .object({
        overview: text(1_500),
        strengths: z.array(text(500)).max(5),
        topPriorities: z.array(text(500)).max(3),
      })
      .strict(),
    issueInsights: z.array(insightSchema).max(AI_LIMITS.maxIssues),
    potentialIssues: z.array(insightSchema).max(10),
  })
  .strict();

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
export type RawAIResponse = z.infer<typeof rawAIResponseSchema>;
