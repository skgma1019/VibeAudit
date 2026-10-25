import type { CoverageStatus, Severity } from "./audit";
import type { AnalysisCoverage } from "./analysis";
import type { AuditCategory } from "./audit";

export type AIStatus =
  "IDLE" | "RUNNING" | "COMPLETE" | "FAILED" | "SKIPPED" | "PARTIAL";

export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_INVALID_REQUEST"
  | "AI_PAYLOAD_TOO_LARGE"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_INVALID_RESPONSE";

export interface AIInsight {
  id: string;
  origin: "AI";
  type: "ISSUE_EXPLANATION" | "IMPROVEMENT" | "POTENTIAL_ISSUE";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  explanation: string;
  impact?: string;
  suggestion: string;
  relatedIssueIds: string[];
  locations: Array<{ filePath: string; line: number; column?: number }>;
  evidenceStatus: "SUPPORTED" | "PARTIAL" | "UNVERIFIED";
}

export interface AIAnalysisSummary {
  overview: string;
  strengths: string[];
  topPriorities: string[];
}

export interface AIAnalysisResult {
  aiStatus: "COMPLETE" | "PARTIAL";
  summary: AIAnalysisSummary;
  issueInsights: AIInsight[];
  potentialIssues: AIInsight[];
  coverage: {
    sentIssues: number;
    omittedIssues: number;
    sentRelations: number;
    omittedRelations: number;
    sentSchemas: number;
    omittedSchemas: number;
    omittedSchemaFields: number;
    categories: Record<string, CoverageStatus>;
  };
}

export interface AIAnalysisResponse {
  aiStatus: Exclude<AIStatus, "IDLE" | "RUNNING">;
  result?: AIAnalysisResult;
  errorCode?: AIErrorCode;
  message?: string;
}

export interface AIProjectSummary {
  stack: string[];
  fileCount: number;
  analyzedFileCount: number;
  scores: {
    overall: number;
    grade: "A" | "B" | "C" | "D" | "F";
    categories: Record<string, number>;
  };
  coverage: AnalysisCoverage;
  ruleCoverage: Record<string, CoverageStatus>;
  relationCounts: Record<string, number>;
}

export interface AIPayloadIssue {
  id: string;
  ruleId: string;
  category: AuditCategory;
  severity: Severity;
  detectionKind: "DETERMINISTIC" | "HEURISTIC";
  title: string;
  description: string;
  locations: Array<{
    filePath: string;
    line: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
  }>;
  evidence: string;
  suggestion: string;
}

export interface AIPayloadRelation {
  source: string;
  sourceFile?: string;
  type: string;
  target: string;
  targetFile?: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  resolutionStatus: "RESOLVED" | "PARTIAL" | "UNRESOLVED";
}

export interface AIPayloadSchema {
  kind: "TABLE" | "MODEL";
  name: string;
  fields: Array<{ name: string; type: string; optional: boolean }>;
}

export interface AIPayloadSnippet {
  filePath: string;
  startLine: number;
  text: string;
  relatedIssueId: string;
}

export interface AIAnalyzePayload {
  projectSummary: AIProjectSummary;
  ruleIssues: AIPayloadIssue[];
  relations: AIPayloadRelation[];
  schemaSummary: AIPayloadSchema[];
  snippets: AIPayloadSnippet[];
  availableIssueCount: number;
  availableRelationCount: number;
  omittedIssueCount: number;
  omittedRelationCount: number;
  availableSchemaCount: number;
  omittedSchemaCount: number;
  availableSchemaFieldCount: number;
  omittedSchemaFieldCount: number;
}
