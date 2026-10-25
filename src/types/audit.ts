import { z } from "zod";
import type { AnalysisResult, SourceLocation } from "./analysis";
import type {
  ProjectFile,
  ProjectFileContent,
  ProjectMetadata,
} from "./project";

export const auditCategories = [
  "DATA_INTEGRITY",
  "CONSISTENCY",
  "SECURITY",
  "STRUCTURE",
  "DEPENDENCY",
] as const;
export const detectionKinds = ["DETERMINISTIC", "HEURISTIC"] as const;
export const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const coverageStatuses = ["FULL", "PARTIAL", "LIMITED"] as const;

const sourceLocationSchema = z.object({
  filePath: z.string().min(1).max(1024),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  endColumn: z.number().int().positive().optional(),
});

export const ruleIssueSchema = z.object({
  origin: z.literal("RULE"),
  detectionKind: z.enum(detectionKinds),
  category: z.enum(auditCategories),
  severity: z.enum(severities),
  ruleId: z.string().min(1).max(128),
  title: z.string().min(1).max(256),
  description: z.string().min(1).max(1024),
  locations: z.array(sourceLocationSchema).min(1).max(100),
  evidence: z.string().min(1).max(1024),
  suggestion: z.string().min(1).max(1024),
  fingerprint: z.string().min(1).max(512),
});

const categoryScoresSchema = z.object({
  DATA_INTEGRITY: z.number().min(0).max(100),
  CONSISTENCY: z.number().min(0).max(100),
  SECURITY: z.number().min(0).max(100),
  STRUCTURE: z.number().min(0).max(100),
  DEPENDENCY: z.number().min(0).max(100),
});
const categoryCoverageSchema = z.object({
  DATA_INTEGRITY: z.enum(coverageStatuses),
  CONSISTENCY: z.enum(coverageStatuses),
  SECURITY: z.enum(coverageStatuses),
  STRUCTURE: z.enum(coverageStatuses),
  DEPENDENCY: z.enum(coverageStatuses),
});

export const auditResultSchema = z.object({
  issues: z.array(ruleIssueSchema),
  scores: z.object({
    categories: categoryScoresSchema,
    overall: z.number().min(0).max(100),
    grade: z.enum(["A", "B", "C", "D", "F"]),
  }),
  coverage: categoryCoverageSchema,
  ruleVersion: z.string().min(1),
  scoreVersion: z.string().min(1),
});

export type AuditCategory = (typeof auditCategories)[number];
export type DetectionKind = (typeof detectionKinds)[number];
export type Severity = (typeof severities)[number];
export type CoverageStatus = (typeof coverageStatuses)[number];
export type RuleIssue = z.infer<typeof ruleIssueSchema>;
export type AuditResult = z.infer<typeof auditResultSchema>;

export interface RuleContext {
  project: ProjectMetadata;
  files: ProjectFile[];
  contents: ProjectFileContent[];
  analysis: AnalysisResult;
  relations: AnalysisResult["relations"];
  schemas: AnalysisResult["schemas"];
  coverage: AnalysisResult["coverage"];
  dependencies: Set<string>;
  importedPackages: Set<string>;
}

export interface RuleDraft extends Omit<RuleIssue, "fingerprint"> {
  fingerprintTarget?: string;
}

export interface AuditRule {
  id: string;
  category: AuditCategory;
  run(context: RuleContext): RuleDraft[];
}

export type RuleLocation = SourceLocation;
