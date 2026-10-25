import { includedPaths, makeDraft, projectPath } from "../types";
import type { AuditRule } from "../types";

export const requiredFilesRule: AuditRule = {
  id: "structure.required-files",
  category: "STRUCTURE",
  run(context) {
    const paths = includedPaths(context);
    const root = context.project.name.replace(/\\/g, "/").replace(/\/$/, "");
    const has = (name: string) =>
      paths.has(`${root}/${name}`.toLowerCase()) ||
      [...paths].some((path) => path.endsWith(`/${name.toLowerCase()}`));
    const drafts = [];
    const manifestPath = projectPath(context, "package.json");
    if (!has("package.json"))
      drafts.push(
        makeDraft(
          "structure.required-files",
          "STRUCTURE",
          "HEURISTIC",
          "HIGH",
          "package.json is missing",
          "The selected project has no readable package manifest, so its scripts and declared dependencies cannot be verified.",
          [{ filePath: manifestPath, line: 1, column: 1 }],
          "No included package.json was found.",
          "Add a package.json when this project uses npm-managed packages, or select the project root.",
          "package.json",
        ),
      );
    if (!has("README.md"))
      drafts.push(
        makeDraft(
          "structure.required-files",
          "STRUCTURE",
          "HEURISTIC",
          "LOW",
          "README.md is missing",
          "No project README was found in the selected files.",
          [{ filePath: projectPath(context, "README.md"), line: 1, column: 1 }],
          "No included README.md was found.",
          "Add a short README describing how to install, run, and configure the project.",
          "README.md",
        ),
      );
    if (
      context.analysis.environmentReferences.length > 0 &&
      !has(".env.example")
    )
      drafts.push(
        makeDraft(
          "structure.required-files",
          "STRUCTURE",
          "HEURISTIC",
          "MEDIUM",
          ".env.example is missing",
          "The project references environment variables but has no readable example file describing required names.",
          [
            {
              filePath: projectPath(context, ".env.example"),
              line: 1,
              column: 1,
            },
          ],
          `${context.analysis.environmentReferences.length} environment reference(s) were extracted; no included .env.example was found.`,
          "Add variable names with empty values. Do not put real credentials in the example file.",
          ".env.example",
        ),
      );
    return drafts;
  },
};
