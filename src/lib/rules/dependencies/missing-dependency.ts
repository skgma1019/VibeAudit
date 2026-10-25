import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const missingDependencyRule: AuditRule = {
  id: "dependencies.missing-dependency",
  category: "DEPENDENCY",
  run(context) {
    if (
      context.dependencies.size === 0 &&
      context.analysis.configWarnings.some((warning) =>
        warning.includes("package.json could not be parsed"),
      )
    )
      return [];
    return context.analysis.imports
      .filter(
        (reference) =>
          reference.classification === "PACKAGE" &&
          reference.declaredDependency === false &&
          !context.dependencies.has(reference.moduleSpecifier),
      )
      .map((reference) =>
        makeDraft(
          "dependencies.missing-dependency",
          "DEPENDENCY",
          "DETERMINISTIC",
          "HIGH",
          `Imported package is not declared: ${reference.moduleSpecifier}`,
          "A statically extracted package import is absent from the selected package manifests.",
          [reference.location],
          `Package import: ${reference.moduleSpecifier}${reference.typeOnly ? " (type-only import)" : ""}; no matching declared dependency was found.`,
          "Add the package to dependencies or devDependencies, or select all workspace package manifests.",
          `${reference.sourceFile.toLowerCase()}:${reference.location.line}:${reference.moduleSpecifier.toLowerCase()}`,
        ),
      );
  },
};
