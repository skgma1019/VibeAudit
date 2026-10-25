import type { ProjectFile, ProjectFileContent } from "./project";

export type AnalysisNodeKind =
  | "FILE"
  | "API_ROUTE"
  | "DATABASE_TABLE"
  | "DATABASE_MODEL"
  | "ENVIRONMENT_VARIABLE"
  | "PACKAGE"
  | "UNKNOWN";
export type RelationType =
  | "IMPORT"
  | "API_CALL"
  | "ROUTE_HANDLER"
  | "DATABASE"
  | "ENV"
  | "DEPENDENCY"
  | "SCHEMA_DEFINITION";
export type ResolutionStatus = "RESOLVED" | "PARTIAL" | "UNRESOLVED";
export type Confidence = "HIGH" | "MEDIUM" | "LOW";
export interface AnalysisNode {
  id: string;
  kind: AnalysisNodeKind;
  label: string;
  filePath?: string;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}
export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}
export interface CodeRelation {
  id: string;
  type: RelationType;
  source: AnalysisNode;
  target: AnalysisNode;
  locations: SourceLocation[];
  resolutionStatus: ResolutionStatus;
  confidence: Confidence;
  evidence: string;
  metadata?: Record<string, string | number | boolean | string[] | undefined>;
}
export interface ImportReference {
  sourceFile: string;
  moduleSpecifier: string;
  importKind: "IMPORT" | "REEXPORT" | "DYNAMIC_IMPORT" | "REQUIRE";
  classification: "LOCAL" | "PACKAGE" | "BUILTIN" | "UNKNOWN";
  symbols: string[];
  typeOnly?: boolean;
  location: SourceLocation;
  resolutionStatus: ResolutionStatus;
  targetId: string;
  declaredDependency?: boolean;
}
export interface ExportReference {
  sourceFile: string;
  name: string;
  exportKind: "DEFAULT" | "NAMED" | "REEXPORT";
  location: SourceLocation;
  moduleSpecifier?: string;
  routeMethod?: boolean;
}
export interface ApiCallReference {
  sourceFile: string;
  method: string;
  path?: string;
  dynamic: boolean;
  location: SourceLocation;
  resolutionStatus: ResolutionStatus;
  routeFile?: string;
}
export interface RouteReference {
  path: string;
  filePath: string;
  methods: string[];
  location: SourceLocation;
}
export interface DatabaseReference {
  sourceFile: string;
  provider: "SUPABASE" | "PRISMA" | "SQL";
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "UPSERT" | "UNKNOWN";
  target?: string;
  selectedFields?: string[];
  location: SourceLocation;
  resolutionStatus: ResolutionStatus;
}
export interface ApiResponseFieldReference {
  sourceFile: string;
  property: string;
  sourceProperty?: string;
  location: SourceLocation;
}
export interface ApiResponseReference {
  sourceFile: string;
  fields: ApiResponseFieldReference[];
  location: SourceLocation;
}
export interface EnvironmentReference {
  sourceFile: string;
  name: string;
  context: "CLIENT" | "SERVER" | "UNKNOWN";
  location: SourceLocation;
}
export interface ObjectFieldReference {
  sourceFile: string;
  object: string;
  property: string;
  location: SourceLocation;
  role: "API_RESPONSE" | "DATA_OBJECT";
}
export interface CommentMarker {
  sourceFile: string;
  marker: "TODO" | "FIXME";
  text: string;
  location: SourceLocation;
}
export interface SchemaColumn {
  name: string;
  type: string;
  optional: boolean;
  location: SourceLocation;
}
export interface SchemaDefinition {
  kind: "TABLE" | "MODEL";
  name: string;
  filePath: string;
  location: SourceLocation;
  columns: SchemaColumn[];
}
export interface ParseError {
  filePath: string;
  kind: "JS_TS" | "SQL" | "PRISMA" | "CONFIG";
  line?: number;
  code?: number;
  message: string;
}
export interface AnalysisCoverage {
  sourceFiles: number;
  parsedFiles: number;
  failedFiles: number;
  imports: number;
  resolvedImports: number;
  unresolvedImports: number;
  apiCalls: number;
  resolvedApiCalls: number;
  unresolvedApiCalls: number;
  databaseCalls: number;
  resolvedDatabaseCalls: number;
  unresolvedDatabaseCalls: number;
  schemaFiles: number;
  parsedSchemaFiles: number;
  failedSchemaFiles: number;
  environmentReferences: number;
  fieldReferences: number;
  todoMarkers: number;
  truncatedRecords: number;
}
export interface AnalysisResult {
  nodes: AnalysisNode[];
  relations: CodeRelation[];
  imports: ImportReference[];
  exports: ExportReference[];
  apiCalls: ApiCallReference[];
  routes: RouteReference[];
  databaseCalls: DatabaseReference[];
  apiResponses: ApiResponseReference[];
  environmentReferences: EnvironmentReference[];
  objectFields: ObjectFieldReference[];
  commentMarkers: CommentMarker[];
  schemas: SchemaDefinition[];
  parseErrors: ParseError[];
  configWarnings: string[];
  coverage: AnalysisCoverage;
}

export interface StartAnalysisMessage {
  type: "START_ANALYSIS";
  jobId: string;
  files: ProjectFile[];
  contents: ProjectFileContent[];
}
export interface CancelAnalysisMessage {
  type: "CANCEL_ANALYSIS";
  jobId: string;
}
export type AnalysisWorkerRequest =
  StartAnalysisMessage | CancelAnalysisMessage;
export type AnalysisWorkerResponse =
  | { type: "ANALYSIS_STARTED"; jobId: string; totalFiles: number }
  | {
      type: "FILE_ANALYZED";
      jobId: string;
      completedFiles: number;
      totalFiles: number;
      filePath: string;
    }
  | { type: "ANALYSIS_COMPLETED"; jobId: string; result: AnalysisResult }
  | { type: "ANALYSIS_FAILED"; jobId: string; message: string }
  | { type: "ANALYSIS_CANCELLED"; jobId: string };
