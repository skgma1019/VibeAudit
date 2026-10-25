import ts from "typescript";
import type {
  ApiCallReference,
  ApiResponseReference,
  CommentMarker,
  DatabaseReference,
  EnvironmentReference,
  ExportReference,
  ImportReference,
  ObjectFieldReference,
  ParseError,
  RouteReference,
  SourceLocation,
} from "../../types/analysis";
import type { ProjectFile, ProjectFileContent } from "../../types/project";

const MAX_RECORDS_PER_FILE = 200;
const supported = new Set([".ts", ".tsx", ".js", ".jsx"]);
const sourceLocation = (
  filePath: string,
  sf: ts.SourceFile,
  node: ts.Node,
): SourceLocation => {
  const start = node.getStart(sf);
  const end = node.getEnd();
  const a = sf.getLineAndCharacterOfPosition(start);
  const b = sf.getLineAndCharacterOfPosition(end);
  return {
    filePath,
    line: a.line + 1,
    column: a.character + 1,
    endLine: b.line + 1,
    endColumn: b.character + 1,
  };
};
const bounded = (value: string) => value.slice(0, 256);
const literal = (node: ts.Expression | undefined): string | undefined =>
  node &&
  (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
const modifiers = (node: ts.Node): readonly ts.Modifier[] =>
  ts.canHaveModifiers(node) ? (ts.getModifiers(node) ?? []) : [];
const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  modifiers(node).some((modifier) => modifier.kind === kind);

function importBindings(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  if (!clause) return [];
  const names: string[] = [];
  if (clause.name) names.push(clause.name.text);
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
    names.push(clause.namedBindings.name.text);
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
    clause.namedBindings.elements.forEach((element) =>
      names.push(element.name.text),
    );
  return names.map(bounded);
}

function routePath(filePath: string): string | undefined {
  const parts = filePath.split("/");
  const routeIndex = parts.findIndex(
    (part) =>
      part.toLowerCase() === "route.ts" ||
      part.toLowerCase() === "route.tsx" ||
      part.toLowerCase() === "route.js" ||
      part.toLowerCase() === "route.jsx",
  );
  if (routeIndex < 0) return undefined;
  const appIndex = parts
    .slice(0, routeIndex)
    .findLastIndex((part) => part === "app");
  if (appIndex < 0 || parts[appIndex + 1]?.toLowerCase() !== "api")
    return undefined;
  const segments = parts.slice(appIndex + 2, routeIndex).map((segment) =>
    segment
      .replace(/^\[\.\.\.(.+)\]$/, ":$1*")
      .replace(/^\[\[\.\.\.(.+)\]\]$/, ":$1*")
      .replace(/^\[([^\]]+)\]$/, ":$1"),
  );
  return `/api${segments.length ? `/${segments.join("/")}` : ""}`;
}

function staticApiPath(node: ts.Expression | undefined): {
  path?: string;
  dynamic: boolean;
} {
  const value = literal(node);
  if (value !== undefined)
    return value.startsWith("/")
      ? { path: value.split(/[?#]/, 1)[0], dynamic: false }
      : { dynamic: true };
  if (node && ts.isTemplateExpression(node)) {
    const prefix = node.head.text;
    if (prefix.startsWith("/"))
      return { path: `${prefix.replace(/\/$/, "")}/:dynamic`, dynamic: true };
  }
  return { dynamic: true };
}

function getCallChain(node: ts.CallExpression): string[] {
  const methods: string[] = [];
  let current: ts.Expression = node;
  while (ts.isCallExpression(current)) {
    if (ts.isPropertyAccessExpression(current.expression))
      methods.push(current.expression.name.text.toLowerCase());
    current = current.expression;
  }
  return methods;
}

function staticSqlTarget(text: string): {
  operation: DatabaseReference["operation"];
  target?: string;
} {
  const patterns: Array<[RegExp, DatabaseReference["operation"]]> = [
    [/\bSELECT\b[\s\S]*?\bFROM\s+([\w."`\[\]-]+)/i, "SELECT"],
    [/\bINSERT\s+INTO\s+([\w."`\[\]-]+)/i, "INSERT"],
    [/\bUPDATE\s+([\w."`\[\]-]+)/i, "UPDATE"],
    [/\bDELETE\s+FROM\s+([\w."`\[\]-]+)/i, "DELETE"],
  ];
  for (const [pattern, operation] of patterns) {
    const match = text.match(pattern);
    if (match)
      return {
        operation,
        target: bounded(
          match[1]
            .replace(/^[`"'\[]|[`"'\]]$/g, "")
            .split(".")
            .at(-1)!,
        ),
      };
  }
  return { operation: "UNKNOWN" };
}

export interface ExtractedFile {
  file: ProjectFile;
  imports: ImportReference[];
  exports: ExportReference[];
  apiCalls: ApiCallReference[];
  route?: RouteReference;
  databaseCalls: DatabaseReference[];
  apiResponses: ApiResponseReference[];
  environmentReferences: EnvironmentReference[];
  objectFields: ObjectFieldReference[];
  commentMarkers: CommentMarker[];
  parseErrors: ParseError[];
  truncated: number;
}

export function extractTypescriptFile(
  file: ProjectFile,
  content: ProjectFileContent,
  declaredPackages: Set<string>,
): ExtractedFile {
  const path = file.relativePath;
  const text = content.redactedText;
  const scriptKind =
    file.extension === ".tsx"
      ? ts.ScriptKind.TSX
      : file.extension === ".jsx"
        ? ts.ScriptKind.JSX
        : file.extension === ".js"
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const imports: ImportReference[] = [];
  const exports: ExportReference[] = [];
  const apiCalls: ApiCallReference[] = [];
  const databaseCalls: DatabaseReference[] = [];
  const apiResponses: ApiResponseReference[] = [];
  const environmentReferences: EnvironmentReference[] = [];
  const objectFields: ObjectFieldReference[] = [];
  const commentMarkers: CommentMarker[] = [];
  const parseErrors: ParseError[] = [];
  let truncated = 0;
  const push = <T>(array: T[], item: T) => {
    if (array.length < MAX_RECORDS_PER_FILE) array.push(item);
    else truncated++;
  };
  const addImport = (
    specifier: string,
    node: ts.Node,
    importKind: ImportReference["importKind"],
    symbols: string[] = [],
    typeOnly = false,
  ) => {
    const clean = bounded(specifier);
    const local =
      clean.startsWith(".") || clean.startsWith("/") || clean.startsWith("@/");
    const packageName = clean.startsWith("@")
      ? clean.split("/").slice(0, 2).join("/")
      : clean.split("/")[0];
    const builtin = clean.startsWith("node:") || BUILTIN_MODULES.has(clean);
    const classification: ImportReference["classification"] = local
      ? "LOCAL"
      : builtin
        ? "BUILTIN"
        : clean
          ? "PACKAGE"
          : "UNKNOWN";
    const declaredDependency =
      classification === "PACKAGE"
        ? declaredPackages.has(packageName)
        : undefined;
    push(imports, {
      sourceFile: path,
      moduleSpecifier: clean,
      importKind,
      classification,
      symbols: symbols.slice(0, 50),
      typeOnly,
      location: sourceLocation(path, sf, node),
      resolutionStatus: classification === "LOCAL" ? "UNRESOLVED" : "RESOLVED",
      targetId: "",
      declaredDependency,
    });
  };
  const importedSupabase = new Set<string>();
  const importedAxios = new Set<string>();
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      addImport(
        node.moduleSpecifier.text,
        node,
        "IMPORT",
        importBindings(node),
        Boolean(
          node.importClause?.isTypeOnly ||
          (node.importClause?.namedBindings &&
            ts.isNamedImports(node.importClause.namedBindings) &&
            node.importClause.namedBindings.elements.length > 0 &&
            node.importClause.namedBindings.elements.every(
              (element) => element.isTypeOnly,
            )),
        ),
      );
      if (node.moduleSpecifier.text.includes("supabase"))
        importBindings(node).forEach((name) => importedSupabase.add(name));
      if (
        node.moduleSpecifier.text === "axios" ||
        node.moduleSpecifier.text.startsWith("axios/")
      )
        importBindings(node).forEach((name) => importedAxios.add(name));
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const names =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements.map((element) =>
              bounded(element.name.text),
            )
          : [];
      addImport(node.moduleSpecifier.text, node, "REEXPORT", names);
      push(exports, {
        sourceFile: path,
        name: names.join(",") || "*",
        exportKind: "REEXPORT",
        location: sourceLocation(path, sf, node),
        moduleSpecifier: bounded(node.moduleSpecifier.text),
      });
    } else if (
      ts.isExportDeclaration(node) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements)
        push(exports, {
          sourceFile: path,
          name: bounded(element.name.text),
          exportKind: "NAMED",
          location: sourceLocation(path, sf, element),
        });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      addImport(node.moduleReference.expression.text, node, "REQUIRE", [
        node.name.text,
      ]);
    }
    if (ts.isExportAssignment(node))
      push(exports, {
        sourceFile: path,
        name: "default",
        exportKind: "DEFAULT",
        location: sourceLocation(path, sf, node),
      });
    if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node)) &&
      hasModifier(node, ts.SyntaxKind.ExportKeyword)
    ) {
      const isDefault = hasModifier(node, ts.SyntaxKind.DefaultKeyword);
      const name = node.name?.text ?? "default";
      const routeMethod = ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(
        name,
      );
      push(exports, {
        sourceFile: path,
        name: bounded(name),
        exportKind: isDefault ? "DEFAULT" : "NAMED",
        location: sourceLocation(path, sf, node),
        routeMethod,
      });
    }
    if (
      ts.isVariableStatement(node) &&
      hasModifier(node, ts.SyntaxKind.ExportKeyword)
    )
      for (const declaration of node.declarationList.declarations)
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text;
          push(exports, {
            sourceFile: path,
            name: bounded(name),
            exportKind: hasModifier(node, ts.SyntaxKind.DefaultKeyword)
              ? "DEFAULT"
              : "NAMED",
            location: sourceLocation(path, sf, declaration),
            routeMethod: ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(
              name,
            ),
          });
        }
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (expr.kind === ts.SyntaxKind.ImportKeyword) {
        const spec = literal(node.arguments[0]);
        if (spec !== undefined) addImport(spec, node, "DYNAMIC_IMPORT");
      }
      if (
        ts.isIdentifier(expr) &&
        expr.text === "require" &&
        literal(node.arguments[0]) !== undefined
      )
        addImport(literal(node.arguments[0])!, node, "REQUIRE");
      const method = ts.isPropertyAccessExpression(expr)
        ? expr.name.text.toLowerCase()
        : "";
      const receiver = ts.isPropertyAccessExpression(expr)
        ? expr.expression.getText(sf)
        : "";
      if (
        (ts.isIdentifier(expr) && expr.text === "fetch") ||
        (ts.isPropertyAccessExpression(expr) &&
          importedAxios.has(receiver) &&
          ["get", "post", "put", "patch", "delete"].includes(method))
      ) {
        const arg = ts.isIdentifier(expr)
          ? node.arguments[0]
          : node.arguments[0];
        const pathInfo = staticApiPath(arg);
        const requestMethod = ts.isIdentifier(expr)
          ? "GET"
          : method.toUpperCase();
        push(apiCalls, {
          sourceFile: path,
          method: requestMethod,
          ...pathInfo,
          location: sourceLocation(path, sf, node),
          resolutionStatus: "UNRESOLVED",
        });
      }
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === "json" &&
        ts.isIdentifier(expr.expression) &&
        ["Response", "NextResponse"].includes(expr.expression.text) &&
        node.arguments[0] &&
        ts.isObjectLiteralExpression(node.arguments[0])
      ) {
        const fields = node.arguments[0].properties.flatMap((property) => {
          if (ts.isPropertyAssignment(property)) {
            const name = property.name;
            const key =
              ts.isIdentifier(name) || ts.isStringLiteralLike(name)
                ? name.text
                : undefined;
            if (!key) return [];
            let sourceProperty: string | undefined;
            if (ts.isPropertyAccessExpression(property.initializer))
              sourceProperty = property.initializer.name.text;
            else if (ts.isIdentifier(property.initializer))
              sourceProperty = property.initializer.text;
            return [
              {
                sourceFile: path,
                property: bounded(key),
                ...(sourceProperty
                  ? { sourceProperty: bounded(sourceProperty) }
                  : {}),
                location: sourceLocation(path, sf, property),
              },
            ];
          }
          if (ts.isShorthandPropertyAssignment(property))
            return [
              {
                sourceFile: path,
                property: bounded(property.name.text),
                sourceProperty: bounded(property.name.text),
                location: sourceLocation(path, sf, property),
              },
            ];
          return [];
        });
        push(apiResponses, {
          sourceFile: path,
          fields,
          location: sourceLocation(path, sf, node.arguments[0]),
        });
      }
      if (
        method === "from" &&
        node.arguments[0] &&
        ts.isPropertyAccessExpression(expr)
      ) {
        const root = receiver.match(/[A-Za-z_$][\w$]*/g) ?? [];
        const isSupabase = root.some(
          (name) => /supabase/i.test(name) || importedSupabase.has(name),
        );
        const table = literal(node.arguments[0]);
        if (isSupabase) {
          let outer: ts.CallExpression = node;
          while (
            outer.parent &&
            ts.isPropertyAccessExpression(outer.parent) &&
            outer.parent.expression === outer &&
            outer.parent.parent &&
            ts.isCallExpression(outer.parent.parent) &&
            outer.parent.parent.expression === outer.parent
          )
            outer = outer.parent.parent;
          const chain = getCallChain(outer);
          const operationMap: Record<string, DatabaseReference["operation"]> = {
            select: "SELECT",
            insert: "INSERT",
            update: "UPDATE",
            delete: "DELETE",
            upsert: "UPSERT",
          };
          const operation =
            chain.map((part) => operationMap[part]).find(Boolean) ?? "UNKNOWN";
          let selectedFields: string[] | undefined;
          let chainNode: ts.Expression = outer;
          while (ts.isCallExpression(chainNode)) {
            if (
              ts.isPropertyAccessExpression(chainNode.expression) &&
              chainNode.expression.name.text.toLowerCase() === "select"
            ) {
              const selected = literal(chainNode.arguments[0]);
              if (selected && selected.trim() !== "*")
                selectedFields = selected
                  .split(",")
                  .map((field) => field.trim().replace(/^\w+\./, ""))
                  .filter((field) => /^[\w-]+$/.test(field))
                  .slice(0, 100);
            }
            chainNode = chainNode.expression;
          }
          push(databaseCalls, {
            sourceFile: path,
            provider: "SUPABASE",
            operation,
            target: table && bounded(table),
            ...(selectedFields ? { selectedFields } : {}),
            location: sourceLocation(path, sf, node),
            resolutionStatus: table ? "RESOLVED" : "UNRESOLVED",
          });
        }
      }
      if (
        ts.isPropertyAccessExpression(expr) &&
        /^(?:findmany|findunique|findfirst|create|createmany|update|updatemany|delete|deletemany|upsert|count|aggregate)$/.test(
          method,
        )
      ) {
        const modelAccess = expr.expression;
        if (
          ts.isPropertyAccessExpression(modelAccess) &&
          /prisma/i.test(modelAccess.expression.getText(sf))
        ) {
          const model = modelAccess.name.text;
          const operation: DatabaseReference["operation"] =
            /^(?:findmany|findunique|findfirst|count|aggregate)$/.test(method)
              ? "SELECT"
              : method.startsWith("create")
                ? "INSERT"
                : method.startsWith("update")
                  ? "UPDATE"
                  : method.startsWith("delete")
                    ? "DELETE"
                    : method === "upsert"
                      ? "UPSERT"
                      : "UNKNOWN";
          let selectedFields: string[] | undefined;
          const args = node.arguments[0];
          if (args && ts.isObjectLiteralExpression(args)) {
            const selection = args.properties.find(
              (property) =>
                ts.isPropertyAssignment(property) &&
                ((ts.isIdentifier(property.name) &&
                  property.name.text === "select") ||
                  (ts.isStringLiteralLike(property.name) &&
                    property.name.text === "select")),
            );
            if (
              selection &&
              ts.isPropertyAssignment(selection) &&
              ts.isObjectLiteralExpression(selection.initializer)
            )
              selectedFields = selection.initializer.properties
                .flatMap((property) => {
                  if (ts.isPropertyAssignment(property)) {
                    const name = property.name;
                    return ts.isIdentifier(name) || ts.isStringLiteralLike(name)
                      ? [name.text]
                      : [];
                  }
                  return ts.isShorthandPropertyAssignment(property)
                    ? [property.name.text]
                    : [];
                })
                .map(bounded)
                .slice(0, 100);
          }
          push(databaseCalls, {
            sourceFile: path,
            provider: "PRISMA",
            operation,
            target: bounded(model),
            ...(selectedFields?.length ? { selectedFields } : {}),
            location: sourceLocation(path, sf, node),
            resolutionStatus: "RESOLVED",
          });
        }
      }
      if (
        ts.isPropertyAccessExpression(expr) &&
        ["query", "execute", "raw"].includes(method) &&
        node.arguments[0] &&
        literal(node.arguments[0]) !== undefined
      ) {
        const rawSql = staticSqlTarget(literal(node.arguments[0])!);
        if (rawSql.target)
          push(databaseCalls, {
            sourceFile: path,
            provider: "SQL",
            ...rawSql,
            location: sourceLocation(path, sf, node),
            resolutionStatus: "RESOLVED",
          });
      }
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "process" &&
      node.expression.name.text === "env"
    ) {
      const name = bounded(node.name.text);
      const client = /^\s*["']use client["']/.test(text);
      push(environmentReferences, {
        sourceFile: path,
        name,
        context: client
          ? "CLIENT"
          : path.includes("/app/")
            ? "SERVER"
            : "UNKNOWN",
        location: sourceLocation(path, sf, node),
      });
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "process" &&
      node.expression.name.text === "env" &&
      node.argumentExpression &&
      literal(node.argumentExpression)
    ) {
      const client = /^\s*["']use client["']/.test(text);
      push(environmentReferences, {
        sourceFile: path,
        name: bounded(literal(node.argumentExpression)!),
        context: client
          ? "CLIENT"
          : path.includes("/app/")
            ? "SERVER"
            : "UNKNOWN",
        location: sourceLocation(path, sf, node),
      });
    }
    if (ts.isPropertyAccessExpression(node)) {
      let root: ts.Expression = node.expression;
      while (
        ts.isPropertyAccessExpression(root) ||
        ts.isElementAccessExpression(root)
      )
        root = root.expression;
      const rootName = ts.isIdentifier(root) ? root.text : "";
      if (
        /^(?:user|response|result|record|row|book|profile|payload|data)$/.test(
          rootName,
        ) &&
        objectFields.length < 200
      ) {
        push(objectFields, {
          sourceFile: path,
          object: bounded(node.expression.getText(sf)),
          property: bounded(node.name.text),
          location: sourceLocation(path, sf, node),
          role: /^(?:response|result|payload|data)$/.test(rootName)
            ? "API_RESPONSE"
            : "DATA_OBJECT",
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const diagnostics =
    (sf as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics ?? [];
  for (const diagnostic of diagnostics) {
    const position =
      diagnostic.start === undefined
        ? undefined
        : sf.getLineAndCharacterOfPosition(diagnostic.start);
    parseErrors.push({
      filePath: path,
      kind: "JS_TS",
      ...(position ? { line: position.line + 1 } : {}),
      code: diagnostic.code,
      message: `JavaScript/TypeScript syntax could not be fully parsed (TS${diagnostic.code}).`,
    });
  }
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );
  while (true) {
    const token = scanner.scan();
    if (token === ts.SyntaxKind.EndOfFileToken) break;
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    )
      continue;
    const comment = scanner.getTokenText();
    const pattern = /\b(TODO|FIXME)\b(?:\s*[:(])?/gi;
    for (const match of comment.matchAll(pattern)) {
      const tokenOffset = scanner.getTokenPos() + match.index;
      const before = text.slice(0, tokenOffset);
      const line = before.split("\n").length - 1;
      const character = tokenOffset - before.lastIndexOf("\n") - 1;
      push(commentMarkers, {
        sourceFile: path,
        marker: match[1].toUpperCase() as "TODO" | "FIXME",
        text: bounded(comment.replace(/^\/\/?|^\/\*|\*\/$/g, "").trim()),
        location: { filePath: path, line: line + 1, column: character + 1 },
      });
    }
  }
  const methods = [
    ...new Set(
      exports.filter((item) => item.routeMethod).map((item) => item.name),
    ),
  ];
  const route = routePath(path);
  const routeRef = route
    ? {
        path: route,
        filePath: path,
        methods,
        location: { filePath: path, line: 1, column: 1 },
      }
    : undefined;
  return {
    file,
    imports,
    exports,
    apiCalls,
    ...(routeRef ? { route: routeRef } : {}),
    databaseCalls,
    apiResponses,
    environmentReferences,
    objectFields,
    commentMarkers,
    parseErrors,
    truncated,
  };
}

const BUILTIN_MODULES = new Set([
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "http",
  "https",
  "module",
  "os",
  "path",
  "process",
  "stream",
  "timers",
  "url",
  "util",
  "worker_threads",
  "zlib",
  "tty",
  "net",
  "dns",
  "readline",
  "querystring",
  "string_decoder",
  "perf_hooks",
  "punycode",
  "constants",
  "console",
  "v8",
  "vm",
]);
export const isSupportedSource = (file: ProjectFile) =>
  supported.has(file.extension);
