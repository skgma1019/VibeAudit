import { makeDraft } from "../types";
import type { AuditRule } from "../types";

const wrapperFields = new Set([
  "data",
  "result",
  "response",
  "payload",
  "user",
  "item",
  "record",
]);

export const fieldMismatchRule: AuditRule = {
  id: "integrity.field-mismatch",
  category: "DATA_INTEGRITY",
  run(context) {
    const drafts = [];
    for (const call of context.analysis.apiCalls) {
      if (!call.routeFile || call.resolutionStatus !== "RESOLVED") continue;
      const apiRelation = context.relations.some(
        (relation) =>
          relation.type === "API_CALL" &&
          relation.source.filePath === call.sourceFile &&
          relation.resolutionStatus === "RESOLVED" &&
          relation.target.label === call.path,
      );
      const handlerRelation = context.relations.some(
        (relation) =>
          relation.type === "ROUTE_HANDLER" &&
          relation.source.label === call.path &&
          relation.target.filePath === call.routeFile &&
          relation.resolutionStatus === "RESOLVED",
      );
      const databaseRelation = context.relations.some(
        (relation) =>
          relation.type === "DATABASE" &&
          relation.source.filePath === call.routeFile &&
          relation.resolutionStatus === "RESOLVED",
      );
      if (!apiRelation || !handlerRelation || !databaseRelation) continue;
      const responseFields = context.analysis.apiResponses
        .filter((response) => response.sourceFile === call.routeFile)
        .flatMap((response) => response.fields);
      if (!responseFields.length) continue;
      const apiNames = new Set(
        responseFields.map((field) => field.property.toLowerCase()),
      );
      const expected = context.analysis.objectFields.filter(
        (field) =>
          field.sourceFile === call.sourceFile &&
          !wrapperFields.has(field.property.toLowerCase()) &&
          field.property.length > 1,
      );
      for (const field of expected) {
        if (apiNames.has(field.property.toLowerCase())) continue;
        const actualFields = [...apiNames].slice(0, 20).join(", ");
        drafts.push(
          makeDraft(
            "integrity.field-mismatch",
            "DATA_INTEGRITY",
            "HEURISTIC",
            "MEDIUM",
            `Frontend field is not present in the connected API response: ${field.property}`,
            "A frontend field access is connected to a local Next.js route whose explicit JSON response object does not expose that name. Mapping may occur in unsupported code.",
            [
              field.location,
              ...responseFields.slice(0, 4).map((item) => item.location),
            ],
            `Frontend expects '${field.property}'; the extracted response fields are ${actualFields || "not available"}.`,
            "Check the API response mapping and frontend field name. This candidate only covers explicit JSON object literals.",
            `${field.sourceFile.toLowerCase()}:${field.location.line}:${call.routeFile.toLowerCase()}:${field.property.toLowerCase()}`,
          ),
        );
      }
    }
    return drafts;
  },
};
