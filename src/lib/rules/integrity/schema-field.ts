import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const schemaFieldRule: AuditRule = {
  id: "integrity.schema-field",
  category: "DATA_INTEGRITY",
  run(context) {
    const drafts = [];
    for (const call of context.analysis.databaseCalls) {
      if (
        call.operation !== "SELECT" ||
        !call.target ||
        !call.selectedFields?.length ||
        call.selectedFields.includes("*")
      )
        continue;
      const schema = context.schemas.find(
        (item) =>
          item.kind === (call.provider === "PRISMA" ? "MODEL" : "TABLE") &&
          item.name.toLowerCase() === call.target!.toLowerCase(),
      );
      if (!schema) continue;
      const fields = new Set(
        schema.columns.map((column) => column.name.toLowerCase()),
      );
      for (const selected of call.selectedFields) {
        if (fields.has(selected.toLowerCase())) continue;
        drafts.push(
          makeDraft(
            "integrity.schema-field",
            "DATA_INTEGRITY",
            "DETERMINISTIC",
            "MEDIUM",
            `Selected field is absent from ${schema.name}: ${selected}`,
            "A statically named field in a database SELECT was not found in the parsed table/model schema.",
            [call.location, schema.location],
            `SELECT field '${selected}' is absent from parsed ${schema.kind.toLowerCase()} '${schema.name}' in ${schema.filePath}.`,
            "Check the selected column and schema version. Dynamic selections and select('*') are not checked.",
            `${call.sourceFile.toLowerCase()}:${call.location.line}:${schema.name.toLowerCase()}:${selected.toLowerCase()}`,
          ),
        );
      }
    }
    return drafts;
  },
};
