import { makeDraft } from "../types";
import type { AuditRule } from "../types";

export const hardcodedSecretRule: AuditRule = {
  id: "security.hardcoded-secret",
  category: "SECURITY",
  run(context) {
    const redactedByPath = new Map(
      context.contents.map((content) => [
        content.relativePath.toLowerCase(),
        content.redactedText,
      ]),
    );
    return context.files
      .filter(
        (file) =>
          file.status === "INCLUDED" &&
          (file.hasSecretCandidate || file.redactionCount > 0),
      )
      .map((file) => {
        const redacted =
          redactedByPath.get(file.relativePath.toLowerCase()) ?? "";
        const lines = redacted
          .split(/\r?\n/)
          .flatMap((line, index) =>
            line.includes("[REDACTED]") ? [index + 1] : [],
          )
          .slice(0, 100);
        return makeDraft(
          "security.hardcoded-secret",
          "SECURITY",
          "HEURISTIC",
          file.redactionCount >= 2 ? "HIGH" : "MEDIUM",
          "Potential hardcoded secret was masked",
          "The local file safety pass masked one or more secret-like values. This candidate requires review and may be a false positive.",
          (lines.length ? lines : [1]).map((line) => ({
            filePath: file.relativePath,
            line,
            column: 1,
          })),
          "Potential API key or credential assignment detected; the value was removed before analysis.",
          "Replace real credentials with environment variables, rotate any credential that was committed, and keep its value out of source control.",
          file.relativePath.toLowerCase(),
        );
      });
  },
};
