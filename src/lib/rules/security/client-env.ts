import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const clientEnvRule: AuditRule = {
  id: "security.client-env",
  category: "SECURITY",
  run(context) {
    return context.analysis.environmentReferences
      .filter(
        (reference) =>
          reference.context === "CLIENT" &&
          !reference.name.startsWith("NEXT_PUBLIC_"),
      )
      .map((reference) =>
        makeDraft(
          "security.client-env",
          "SECURITY",
          "DETERMINISTIC",
          "HIGH",
          `Private environment variable referenced by client code: ${reference.name}`,
          "A client component directly references a non-public environment variable, which Next.js does not make available as a server-only secret boundary.",
          [reference.location],
          `Client source references process.env.${reference.name}.`,
          "Move the secret access to a server-only module or route handler. Expose only intentionally public values with the NEXT_PUBLIC_ prefix.",
          `${reference.sourceFile.toLowerCase()}:${reference.location.line}:${reference.name.toLowerCase()}`,
        ),
      );
  },
};
