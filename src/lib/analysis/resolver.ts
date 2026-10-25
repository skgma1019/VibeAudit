import ts from "typescript";
import type { ProjectFile, ProjectFileContent } from "../../types/project";
import type { ImportReference, ParseError } from "../../types/analysis";
import { normalizeRelativePath } from "../project/paths";

const CANDIDATE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".json"];
function joinPath(...parts: string[]): string | null {
  return normalizeRelativePath(parts.filter(Boolean).join("/"));
}
function packageName(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

export interface PathAlias {
  pattern: string;
  targets: string[];
  base: string;
  specificity: number;
}
export interface ResolverConfig {
  aliases: PathAlias[];
  warnings: string[];
}

export function readResolverConfig(
  files: ProjectFile[],
  contents: ProjectFileContent[],
): ResolverConfig {
  const warnings: string[] = [];
  const configs = contents.filter((item) =>
    /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/i.test(item.relativePath),
  );
  const root = files.map((file) => file.relativePath.split("/")[0]).sort()[0];
  const selected =
    configs.find(
      (item) =>
        item.relativePath.toLowerCase() ===
        `${root ? `${root}/` : ""}tsconfig.json`.toLowerCase(),
    ) ??
    configs.sort((a, b) => a.relativePath.length - b.relativePath.length)[0];
  if (!selected) return { aliases: [], warnings };
  const parsed = ts.parseConfigFileTextToJson(
    selected.relativePath,
    selected.redactedText,
  );
  if (parsed.error)
    return {
      aliases: [],
      warnings: [
        "A tsconfig file could not be parsed; path aliases may be unresolved.",
      ],
    };
  const config = parsed.config as
    | {
        compilerOptions?: {
          baseUrl?: string;
          paths?: Record<string, string[]>;
        };
      }
    | undefined;
  const options = config?.compilerOptions;
  if (!options?.paths || typeof options.paths !== "object")
    return { aliases: [], warnings };
  const configDirectory = selected.relativePath.includes("/")
    ? selected.relativePath.slice(0, selected.relativePath.lastIndexOf("/"))
    : "";
  const base = options.baseUrl
    ? (joinPath(configDirectory, options.baseUrl) ?? configDirectory)
    : configDirectory;
  const aliases: PathAlias[] = [];
  for (const [pattern, values] of Object.entries(options.paths)) {
    if (
      !Array.isArray(values) ||
      !values.every((value) => typeof value === "string")
    ) {
      warnings.push("Some tsconfig path aliases were skipped.");
      continue;
    }
    const star = pattern.indexOf("*");
    if (star !== pattern.lastIndexOf("*")) {
      warnings.push("Complex tsconfig path aliases were skipped.");
      continue;
    }
    aliases.push({
      pattern,
      targets: values.slice(0, 8),
      base,
      specificity: pattern.replace("*", "").length,
    });
  }
  return {
    aliases: aliases.sort((a, b) => b.specificity - a.specificity),
    warnings: [...new Set(warnings)],
  };
}

function aliasTarget(
  specifier: string,
  aliases: PathAlias[],
): string[] | undefined {
  for (const alias of aliases) {
    const star = alias.pattern.indexOf("*");
    if (star < 0) {
      if (specifier === alias.pattern)
        return alias.targets
          .map((target) => joinPath(alias.base, target)!)
          .filter(Boolean);
      continue;
    }
    const prefix = alias.pattern.slice(0, star);
    const suffix = alias.pattern.slice(star + 1);
    if (
      specifier.startsWith(prefix) &&
      specifier.endsWith(suffix) &&
      specifier.length >= prefix.length + suffix.length
    ) {
      const capture = specifier.slice(
        prefix.length,
        specifier.length - suffix.length || undefined,
      );
      return alias.targets
        .map((target) => joinPath(alias.base, target.replace("*", capture))!)
        .filter(Boolean);
    }
  }
  return undefined;
}

function resolveLocal(
  sourcePath: string,
  specifier: string,
  aliases: PathAlias[],
  knownFiles: Set<string>,
): string | undefined {
  const baseDirectory = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/"))
    : "";
  const mapped = aliasTarget(specifier, aliases);
  const bases =
    mapped ??
    (specifier.startsWith(".") || specifier.startsWith("/")
      ? [joinPath(baseDirectory, specifier) ?? ""]
      : []);
  for (const base of bases) {
    const candidates = new Set<string>([base]);
    for (const ext of CANDIDATE_EXTENSIONS) candidates.add(`${base}${ext}`);
    for (const ext of CANDIDATE_EXTENSIONS)
      candidates.add(`${base.replace(/\.[^/.]+$/, "")}${ext}`);
    for (const ext of CANDIDATE_EXTENSIONS)
      candidates.add(`${base}/${`index${ext}`}`);
    for (const candidate of candidates) {
      const normalized = normalizeRelativePath(candidate);
      if (normalized && knownFiles.has(normalized.toLowerCase()))
        return normalized;
    }
  }
  return undefined;
}

export interface ResolveResult {
  imports: ImportReference[];
  parseErrors: ParseError[];
  warnings: string[];
}
export function resolveImports(
  imports: ImportReference[],
  files: ProjectFile[],
  contents: ProjectFileContent[],
): ResolveResult {
  const config = readResolverConfig(files, contents);
  const knownFiles = new Set(
    files
      .filter((file) => file.status === "INCLUDED")
      .map((file) => file.relativePath.toLowerCase()),
  );
  const resolved = imports.map((reference) => {
    const configuredAlias = Boolean(
      aliasTarget(reference.moduleSpecifier, config.aliases),
    );
    if (reference.classification !== "LOCAL" && !configuredAlias)
      return reference;
    const target = resolveLocal(
      reference.sourceFile,
      reference.moduleSpecifier,
      config.aliases,
      knownFiles,
    );
    if (target)
      return {
        ...reference,
        classification: "LOCAL" as const,
        targetId: `file:${target}`,
        resolutionStatus: "RESOLVED" as const,
      };
    return {
      ...reference,
      ...(configuredAlias ? { classification: "LOCAL" as const } : {}),
      targetId: "",
      resolutionStatus: "UNRESOLVED" as const,
    };
  });
  return { imports: resolved, parseErrors: [], warnings: config.warnings };
}

export function isBuiltin(specifier: string): boolean {
  return specifier.startsWith("node:") || BUILTINS.has(specifier);
}
export { packageName };
const BUILTINS = new Set([
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
