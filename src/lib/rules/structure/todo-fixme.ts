import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const todoFixmeRule: AuditRule = {
  id: "structure.todo-fixme",
  category: "STRUCTURE",
  run(context) {
    const groups = new Map<string, typeof context.analysis.commentMarkers>();
    for (const marker of context.analysis.commentMarkers) {
      const current = groups.get(marker.sourceFile) ?? [];
      current.push(marker);
      groups.set(marker.sourceFile, current);
    }
    return [...groups.entries()].flatMap(([filePath, markers]) => {
      const drafts = [];
      for (const kind of ["TODO", "FIXME"] as const) {
        const matches = markers.filter((marker) => marker.marker === kind);
        if (!matches.length) continue;
        const severity = kind === "FIXME" ? "MEDIUM" : "LOW";
        const lineList = matches
          .slice(0, 20)
          .map((marker) => marker.location.line)
          .join(", ");
        drafts.push(
          makeDraft(
            "structure.todo-fixme",
            "STRUCTURE",
            "HEURISTIC",
            severity,
            `${matches.length} ${kind} marker(s) in ${filePath}`,
            `${kind} comments are reminders and do not by themselves prove an incomplete feature or defect.`,
            matches.slice(0, 100).map((marker) => marker.location),
            `${kind} marker count: ${matches.length}; line(s): ${lineList || "not available"}.`,
            "Review these markers in context and remove or convert completed work into tracked documentation.",
            `${filePath.toLowerCase()}:${kind}:${matches.map((item) => item.location.line).join(",")}`,
          ),
        );
      }
      return drafts;
    });
  },
};
