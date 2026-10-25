import type {
  DetectedStack,
  ProjectFile,
  ProjectFileContent,
} from "../../types/project";

export function detectProject(
  files: ProjectFile[],
  contents: ProjectFileContent[],
): { stack: DetectedStack[]; warnings: string[] } {
  const stack = new Set<DetectedStack>();
  const warnings: string[] = [];
  for (const file of files.filter((file) => file.status === "INCLUDED")) {
    if ([".js", ".jsx"].includes(file.extension)) stack.add("JavaScript");
    if (
      [".ts", ".tsx"].includes(file.extension) ||
      /^tsconfig.*\.json$/i.test(file.name)
    )
      stack.add("TypeScript");
    if (/^next\.config\.(?:js|mjs|ts)$/i.test(file.name)) stack.add("Next.js");
    if (/^tailwind\.config\./i.test(file.name)) stack.add("Tailwind CSS");
  }
  for (const content of contents.filter((file) =>
    /(?:^|\/)package\.json$/i.test(file.relativePath),
  )) {
    try {
      const parsed: unknown = JSON.parse(content.redactedText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
      const manifest = parsed as Record<string, unknown>;
      stack.add("Node.js");
      const dependencies = new Set<string>();
      for (const field of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const section = manifest[field];
        if (section && typeof section === "object" && !Array.isArray(section))
          Object.keys(section).forEach((key) => dependencies.add(key));
      }
      if (dependencies.has("typescript")) stack.add("TypeScript");
      if (dependencies.has("react") || dependencies.has("react-dom"))
        stack.add("React");
      if (dependencies.has("next")) stack.add("Next.js");
      if (dependencies.has("tailwindcss")) stack.add("Tailwind CSS");
      if (
        dependencies.has("@supabase/supabase-js") ||
        dependencies.has("@supabase/ssr")
      )
        stack.add("Supabase");
    } catch {
      // No JSON exception text: it can include user code/credentials.
      warnings.push(
        "A package.json could not be parsed. Stack detection may be incomplete.",
      );
    }
  }
  if (!stack.size)
    warnings.push("Stack unknown: no supported stack indicators were found.");
  const order: DetectedStack[] = [
    "JavaScript",
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Tailwind CSS",
    "Supabase",
  ];
  return {
    stack: order.filter((entry) => stack.has(entry)),
    warnings: [...new Set(warnings)],
  };
}
