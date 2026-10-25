import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const apiResponseConsistencyRule: AuditRule = {
  id: "consistency.api-response",
  category: "CONSISTENCY",
  run(context) {
    const samples = context.analysis.routes.flatMap((route) => {
      const responses = context.analysis.apiResponses.filter(
        (item) => item.sourceFile === route.filePath,
      );
      if (responses.length !== 1) return [];
      const fields = [
        ...new Set(responses[0].fields.map((field) => field.property)),
      ].sort();
      if (fields.length < 2) return [];
      return [
        { route, response: responses[0], fields, signature: fields.join("|") },
      ];
    });
    const uniqueRoutes = new Map(
      samples.map((sample) => [sample.route.path, sample]),
    );
    const routes = [...uniqueRoutes.values()];
    if (routes.length < 3) return [];
    const counts = new Map<string, number>();
    for (const sample of routes)
      counts.set(sample.signature, (counts.get(sample.signature) ?? 0) + 1);
    const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!majority || majority[1] < 2 || majority[1] * 2 <= routes.length)
      return [];
    return routes
      .filter((sample) => sample.signature !== majority[0])
      .map((sample) =>
        makeDraft(
          "consistency.api-response",
          "CONSISTENCY",
          "HEURISTIC",
          "LOW",
          `API response shape differs at ${sample.route.path}`,
          "Explicit response objects differ from the most common top-level field set in the sampled Next.js routes. Route-specific contracts may be intentional.",
          [sample.response.location],
          `This route returns { ${sample.fields.join(", ")} }; the most common shape is { ${majority[0].replaceAll("|", ", ")} } (${majority[1]} of ${routes.length} sampled routes).`,
          "Review whether the route should follow the shared response convention or document its distinct contract.",
          `${sample.route.path.toLowerCase()}:${sample.signature.toLowerCase()}`,
        ),
      );
  },
};
