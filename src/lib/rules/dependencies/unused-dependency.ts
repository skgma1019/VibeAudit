import { makeDraft } from "../types";
import type { AuditRule } from "../types";

const knownFrameworkOrTooling = new Set([
  "next",
  "react",
  "react-dom",
  "typescript",
  "eslint",
  "eslint-config-next",
  "tailwindcss",
  "@tailwindcss/postcss",
  "postcss",
  "autoprefixer",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "@types/react-dom",
]);

function packageRoot(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}

export const unusedDependencyRule: AuditRule = {
  id: "dependencies.unused-dependency",
  category: "DEPENDENCY",
  run(context) {
    const imported = new Set(
      [...context.importedPackages].map((specifier) => packageRoot(specifier)),
    );
    const packageContents = context.contents.filter((item) =>
      /(?:^|\/)package\.json$/i.test(item.relativePath),
    );
    return packageContents.flatMap((content) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(content.redactedText);
      } catch {
        return [];
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return [];
      const manifest = parsed as Record<string, unknown>;
      const candidates = new Set<string>();
      for (const key of ["dependencies", "devDependencies"]) {
        const values = manifest[key];
        if (values && typeof values === "object" && !Array.isArray(values))
          Object.keys(values).forEach((name) => candidates.add(name));
      }
      return [...candidates]
        .filter(
          (name) =>
            !knownFrameworkOrTooling.has(name) &&
            !name.startsWith("@types/") &&
            !imported.has(name),
        )
        .map((name) =>
          makeDraft(
            "dependencies.unused-dependency",
            "DEPENDENCY",
            "HEURISTIC",
            "LOW",
            `Dependency may be unused: ${name}`,
            "No static import for this dependency was found in the included source or configuration files. Scripts and runtime auto-loading may still use it.",
            [{ filePath: content.relativePath, line: 1, column: 1 }],
            `Declared in ${content.relativePath}; no matching static package import was extracted.`,
            "Check scripts, framework plugins, CSS configuration, and runtime loading before removing it.",
            `${content.relativePath.toLowerCase()}:${name.toLowerCase()}`,
          ),
        );
    });
  },
};
