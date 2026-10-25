import type {
  AnalysisCoverage,
  AnalysisNode,
  ApiResponseReference,
  AnalysisResult,
  CodeRelation,
  DatabaseReference,
  ImportReference,
  ParseError,
  RouteReference,
  SchemaDefinition,
  SourceLocation,
} from "../../types/analysis";
import type { ProjectFile, ProjectFileContent } from "../../types/project";
import {
  extractTypescriptFile,
  isSupportedSource,
  type ExtractedFile,
} from "./extractors";
import { extractPrismaSchema, extractSqlSchema } from "./schema-extractors";
import { isBuiltin, packageName, resolveImports } from "./resolver";

const MAX_RELATIONS = 20_000;
const yields = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const locationKey = (loc: SourceLocation) =>
  `${loc.filePath}:${loc.line}:${loc.column}`;
const asNode = (
  id: string,
  kind: AnalysisNode["kind"],
  label: string,
  filePath?: string,
  metadata?: AnalysisNode["metadata"],
): AnalysisNode => ({
  id,
  kind,
  label: label.slice(0, 256),
  ...(filePath ? { filePath } : {}),
  ...(metadata ? { metadata } : {}),
});

export interface ParseProgress {
  completedFiles: number;
  totalFiles: number;
  filePath: string;
}
export interface ParseOptions {
  isCancelled?: () => boolean;
  onFile?: (progress: ParseProgress) => void;
}
function cancelled(options: ParseOptions) {
  if (options.isCancelled?.())
    throw new DOMException("Analysis cancelled", "AbortError");
}

function normalizeApiPath(path: string): string {
  let clean = path
    .split(/[?#]/, 1)[0]
    .replace(/\$\{[^}]*\}/g, ":dynamic")
    .replace(/\/{2,}/g, "/");
  if (!clean.startsWith("/")) return clean.slice(0, 256);
  clean = clean.replace(/\/$/, "") || "/";
  return clean.slice(0, 256);
}
function apiMatches(requested: string, route: string): boolean {
  const wanted = normalizeApiPath(requested).split("/").filter(Boolean);
  const available = normalizeApiPath(route).split("/").filter(Boolean);
  let i = 0;
  for (; i < available.length; i++) {
    const segment = available[i];
    if (segment.endsWith("*") && segment.startsWith(":"))
      return wanted.length >= i;
    if (i >= wanted.length) return false;
    if (segment.startsWith(":") || wanted[i].startsWith(":")) continue;
    if (segment.toLowerCase() !== wanted[i].toLowerCase()) return false;
  }
  return i === wanted.length;
}
function stableRelationId(
  type: CodeRelation["type"],
  source: string,
  target: string,
  location: SourceLocation,
) {
  return `${type}:${source}->${target}@${locationKey(location)}`;
}
function dependencyManifest(content: string): {
  dependencies: string[];
  warnings: string[];
} {
  try {
    const value: unknown = JSON.parse(content);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    const manifest = value as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      const section = manifest[field];
      if (section && typeof section === "object" && !Array.isArray(section))
        for (const name of Object.keys(section)) names.add(name.slice(0, 256));
    }
    return { dependencies: [...names], warnings: [] };
  } catch {
    return {
      dependencies: [],
      warnings: [
        "A package.json could not be parsed; dependency relations may be incomplete.",
      ],
    };
  }
}

export async function analyzeProject(
  files: ProjectFile[],
  contents: ProjectFileContent[],
  options: ParseOptions = {},
): Promise<AnalysisResult> {
  cancelled(options);
  const sourceFiles = files.filter(
    (file) => file.status === "INCLUDED" && isSupportedSource(file),
  );
  const schemaFiles = files.filter(
    (file) =>
      file.status === "INCLUDED" &&
      [".sql", ".prisma"].includes(file.extension),
  );
  const textByPath = new Map(
    contents.map((item) => [item.relativePath.toLowerCase(), item]),
  );
  const declared = new Set<string>();
  const configWarnings: string[] = [];
  for (const manifest of contents.filter((item) =>
    /(?:^|\/)package\.json$/i.test(item.relativePath),
  )) {
    const data = dependencyManifest(manifest.redactedText);
    data.dependencies.forEach((name) => declared.add(name));
    configWarnings.push(...data.warnings);
  }
  const extracted: ExtractedFile[] = [];
  const schemas: SchemaDefinition[] = [];
  const parseErrors: ParseError[] = [];
  const totalFiles = sourceFiles.length + schemaFiles.length;
  let completedFiles = 0;
  for (const file of sourceFiles) {
    cancelled(options);
    const content = textByPath.get(file.relativePath.toLowerCase());
    if (content) extracted.push(extractTypescriptFile(file, content, declared));
    completedFiles++;
    options.onFile?.({
      completedFiles,
      totalFiles,
      filePath: file.relativePath,
    });
    await yields();
  }
  for (const file of schemaFiles) {
    cancelled(options);
    const content = textByPath.get(file.relativePath.toLowerCase());
    if (content) {
      const parsed =
        file.extension === ".sql"
          ? extractSqlSchema(file.relativePath, content.redactedText)
          : extractPrismaSchema(file.relativePath, content.redactedText);
      schemas.push(...parsed.schemas);
      parseErrors.push(...parsed.errors);
    }
    completedFiles++;
    options.onFile?.({
      completedFiles,
      totalFiles,
      filePath: file.relativePath,
    });
    await yields();
  }
  cancelled(options);
  const allImports = extracted.flatMap((item) => item.imports);
  const resolution = resolveImports(allImports, files, contents);
  configWarnings.push(...resolution.warnings);
  const byLocation = new Map(
    resolution.imports.map((item) => [locationKey(item.location), item]),
  );
  const imports: ImportReference[] = extracted.flatMap((item) =>
    item.imports.map(
      (reference) =>
        byLocation.get(locationKey(reference.location)) ?? reference,
    ),
  );
  for (const item of extracted) parseErrors.push(...item.parseErrors);
  const exports = extracted.flatMap((item) => item.exports);
  const routes: RouteReference[] = extracted.flatMap((item) =>
    item.route ? [item.route] : [],
  );
  const apiCalls = extracted
    .flatMap((item) => item.apiCalls)
    .map((call) => {
      if (!call.path) return call;
      const matching = routes.find((route) =>
        apiMatches(call.path!, route.path),
      );
      return matching
        ? {
            ...call,
            routeFile: matching.filePath,
            resolutionStatus: call.dynamic
              ? ("PARTIAL" as const)
              : ("RESOLVED" as const),
          }
        : call;
    });
  const databaseCalls: DatabaseReference[] = extracted
    .flatMap((item) => item.databaseCalls)
    .map((call) => {
      if (!call.target) return call;
      const schemaKind = call.provider === "PRISMA" ? "MODEL" : "TABLE";
      return schemas.some(
        (schema) =>
          schema.kind === schemaKind &&
          schema.name.toLowerCase() === call.target!.toLowerCase(),
      )
        ? call
        : { ...call, resolutionStatus: "PARTIAL" as const };
    });
  const apiResponses: ApiResponseReference[] = extracted.flatMap(
    (item) => item.apiResponses,
  );
  const environmentReferences = extracted.flatMap(
    (item) => item.environmentReferences,
  );
  const objectFields = extracted.flatMap((item) => item.objectFields);
  const commentMarkers = extracted.flatMap((item) => item.commentMarkers);
  let truncatedRecords = extracted.reduce(
    (total, item) => total + item.truncated,
    0,
  );
  const nodes = new Map<string, AnalysisNode>();
  const putNode = (node: AnalysisNode) =>
    nodes.set(node.id, nodes.get(node.id) ?? node);
  const fileNode = (path: string) => {
    const node = asNode(`file:${path}`, "FILE", path, path);
    putNode(node);
    return node;
  };
  const addRelation = (
    relations: CodeRelation[],
    type: CodeRelation["type"],
    source: AnalysisNode,
    target: AnalysisNode,
    location: SourceLocation,
    status: CodeRelation["resolutionStatus"],
    confidence: CodeRelation["confidence"],
    evidence: string,
    metadata?: CodeRelation["metadata"],
  ) => {
    if (relations.length >= MAX_RELATIONS) {
      truncatedRecords++;
      return;
    }
    relations.push({
      id: stableRelationId(type, source.id, target.id, location),
      type,
      source,
      target,
      locations: [location],
      resolutionStatus: status,
      confidence,
      evidence: evidence.slice(0, 256),
      ...(metadata ? { metadata } : {}),
    });
  };
  const relations: CodeRelation[] = [];
  for (const item of extracted) {
    const source = fileNode(item.file.relativePath);
    for (const reference of imports.filter(
      (entry) => entry.sourceFile === item.file.relativePath,
    )) {
      let target: AnalysisNode;
      let status = reference.resolutionStatus;
      let confidence: CodeRelation["confidence"] =
        status === "RESOLVED" ? "HIGH" : "LOW";
      if (reference.classification === "LOCAL" && status === "RESOLVED")
        target = fileNode(reference.targetId.slice("file:".length));
      else if (reference.classification === "PACKAGE") {
        const name = packageName(reference.moduleSpecifier);
        target = asNode(`package:${name}`, "PACKAGE", name, undefined, {
          declaredDependency: Boolean(reference.declaredDependency),
        });
        putNode(target);
      } else if (
        reference.classification === "BUILTIN" ||
        isBuiltin(reference.moduleSpecifier)
      ) {
        const name = reference.moduleSpecifier.replace(/^node:/, "");
        target = asNode(`builtin:${name}`, "PACKAGE", name, undefined, {
          builtin: true,
        });
        putNode(target);
      } else {
        const safeSpec = reference.moduleSpecifier.slice(0, 100);
        target = asNode(
          `unknown:import:${item.file.relativePath}:${reference.location.line}:${reference.location.column}`,
          "UNKNOWN",
          safeSpec ? `Unresolved import · ${safeSpec}` : "Unresolved import",
        );
        putNode(target);
        status = "UNRESOLVED";
        confidence = "LOW";
      }
      reference.targetId = target.id;
      addRelation(
        relations,
        "IMPORT",
        source,
        target,
        reference.location,
        status,
        confidence,
        reference.moduleSpecifier,
        {
          importKind: reference.importKind,
          classification: reference.classification,
          symbols: reference.symbols,
          declaredDependency: reference.declaredDependency,
        },
      );
      if (reference.classification === "PACKAGE")
        addRelation(
          relations,
          "DEPENDENCY",
          source,
          target,
          reference.location,
          "RESOLVED",
          reference.declaredDependency ? "HIGH" : "MEDIUM",
          reference.moduleSpecifier,
          { declared: Boolean(reference.declaredDependency) },
        );
    }
  }
  for (const route of routes) {
    const apiNode = asNode(
      `api:${route.path}`,
      "API_ROUTE",
      route.path,
      undefined,
      { methods: route.methods },
    );
    putNode(apiNode);
    addRelation(
      relations,
      "ROUTE_HANDLER",
      apiNode,
      fileNode(route.filePath),
      route.location,
      route.methods.length ? "RESOLVED" : "PARTIAL",
      route.methods.length ? "HIGH" : "LOW",
      route.methods.join(",") || "No statically exported HTTP method found",
      { methods: route.methods },
    );
  }
  for (const call of apiCalls) {
    const source = fileNode(call.sourceFile);
    if (!call.path) {
      const target = asNode(
        `unknown:api:${locationKey(call.location)}`,
        "UNKNOWN",
        "Unresolved API call",
      );
      putNode(target);
      addRelation(
        relations,
        "API_CALL",
        source,
        target,
        call.location,
        "UNRESOLVED",
        "LOW",
        "Request URL is dynamic",
        { method: call.method },
      );
      continue;
    }
    const path = normalizeApiPath(call.path);
    const target = asNode(`api:${path}`, "API_ROUTE", path);
    putNode(target);
    const status = call.resolutionStatus;
    const confidence =
      status === "RESOLVED" ? "HIGH" : status === "PARTIAL" ? "MEDIUM" : "LOW";
    addRelation(
      relations,
      "API_CALL",
      source,
      target,
      call.location,
      status,
      confidence,
      `${call.method} ${path}`,
      { method: call.method, routeFile: call.routeFile },
    );
  }
  for (const call of databaseCalls) {
    const source = fileNode(call.sourceFile);
    const schema =
      call.target &&
      schemas.find(
        (item) =>
          item.kind === (call.provider === "PRISMA" ? "MODEL" : "TABLE") &&
          item.name.toLowerCase() === call.target!.toLowerCase(),
      );
    const target = call.target
      ? asNode(
          `${call.provider === "PRISMA" ? "model" : "table"}:${call.target}`,
          call.provider === "PRISMA" ? "DATABASE_MODEL" : "DATABASE_TABLE",
          call.target,
          undefined,
          {
            provider: call.provider,
            operation: call.operation,
            ...(schema
              ? {
                  schemaFile: schema.filePath,
                  schemaLine: schema.location.line,
                }
              : {}),
          },
        )
      : asNode(
          `unknown:database:${locationKey(call.location)}`,
          "UNKNOWN",
          "Unresolved database target",
        );
    putNode(target);
    addRelation(
      relations,
      "DATABASE",
      source,
      target,
      call.location,
      call.resolutionStatus,
      call.resolutionStatus === "RESOLVED"
        ? "HIGH"
        : call.resolutionStatus === "PARTIAL"
          ? "MEDIUM"
          : "LOW",
      call.target ?? "Database table could not be determined",
      { provider: call.provider, operation: call.operation },
    );
  }
  for (const schema of schemas) {
    const node = asNode(
      `${schema.kind === "MODEL" ? "model" : "table"}:${schema.name}`,
      schema.kind === "MODEL" ? "DATABASE_MODEL" : "DATABASE_TABLE",
      schema.name,
      undefined,
      {
        schemaFile: schema.filePath,
        schemaLine: schema.location.line,
        columns: schema.columns.map((column) => column.name),
      },
    );
    putNode(node);
    addRelation(
      relations,
      "SCHEMA_DEFINITION",
      node,
      fileNode(schema.filePath),
      schema.location,
      "RESOLVED",
      "HIGH",
      `${schema.kind} ${schema.name}`,
      {
        schemaKind: schema.kind,
        columns: schema.columns.map((column) => column.name),
      },
    );
  }
  for (const reference of environmentReferences) {
    const source = fileNode(reference.sourceFile);
    const target = asNode(
      `env:${reference.name}`,
      "ENVIRONMENT_VARIABLE",
      reference.name,
    );
    putNode(target);
    addRelation(
      relations,
      "ENV",
      source,
      target,
      reference.location,
      reference.context === "UNKNOWN" ? "PARTIAL" : "RESOLVED",
      reference.context === "UNKNOWN" ? "LOW" : "MEDIUM",
      reference.name,
      { context: reference.context },
    );
  }
  const packageContents = contents.filter((item) =>
    /(?:^|\/)package\.json$/i.test(item.relativePath),
  );
  for (const content of packageContents) {
    const manifest = dependencyManifest(content.redactedText);
    const source = fileNode(content.relativePath);
    for (const name of manifest.dependencies) {
      const target = asNode(`package:${name}`, "PACKAGE", name, undefined, {
        declaredDependency: true,
      });
      putNode(target);
      const location = { filePath: content.relativePath, line: 1, column: 1 };
      addRelation(
        relations,
        "DEPENDENCY",
        source,
        target,
        location,
        "RESOLVED",
        "HIGH",
        name,
        { declared: true },
      );
    }
  }
  const coverage: AnalysisCoverage = {
    sourceFiles: sourceFiles.length,
    parsedFiles: extracted.filter((item) => !item.parseErrors.length).length,
    failedFiles:
      files.filter(
        (file) => file.kind === "SOURCE" && file.status === "READ_ERROR",
      ).length +
      new Set(
        parseErrors
          .filter((item) => item.kind === "JS_TS")
          .map((item) => item.filePath),
      ).size,
    imports: imports.length,
    resolvedImports: imports.filter(
      (item) => item.resolutionStatus === "RESOLVED",
    ).length,
    unresolvedImports: imports.filter(
      (item) => item.resolutionStatus === "UNRESOLVED",
    ).length,
    apiCalls: apiCalls.length,
    resolvedApiCalls: apiCalls.filter(
      (item) => item.resolutionStatus === "RESOLVED",
    ).length,
    unresolvedApiCalls: apiCalls.filter(
      (item) => item.resolutionStatus === "UNRESOLVED",
    ).length,
    databaseCalls: databaseCalls.length,
    resolvedDatabaseCalls: databaseCalls.filter(
      (item) => item.resolutionStatus === "RESOLVED",
    ).length,
    unresolvedDatabaseCalls: databaseCalls.filter(
      (item) => item.resolutionStatus === "UNRESOLVED",
    ).length,
    schemaFiles: schemaFiles.length,
    parsedSchemaFiles: new Set(schemas.map((item) => item.filePath)).size,
    failedSchemaFiles: new Set(
      parseErrors
        .filter((item) => item.kind === "SQL" || item.kind === "PRISMA")
        .map((item) => item.filePath),
    ).size,
    environmentReferences: environmentReferences.length,
    fieldReferences: objectFields.length,
    todoMarkers: commentMarkers.length,
    truncatedRecords,
  };
  // File-level read failures are reported by the UI through selection metadata; preserve any analyzer failures here.
  return {
    nodes: [...nodes.values()],
    relations,
    imports,
    exports,
    apiCalls,
    routes,
    databaseCalls,
    apiResponses,
    environmentReferences,
    objectFields,
    commentMarkers,
    schemas,
    parseErrors,
    configWarnings: [...new Set(configWarnings)],
    coverage,
  };
}
