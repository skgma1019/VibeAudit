import ts from "typescript";
import type { RuleDraft } from "../../../types/audit";
import { makeDraft } from "../types";
import type { AuditRule } from "../types";

const scriptKinds: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

export const dangerousPatternRule: AuditRule = {
  id: "security.dangerous-pattern",
  category: "SECURITY",
  run(context) {
    const findings: RuleDraft[] = [];
    for (const content of context.contents) {
      const scriptKind =
        scriptKinds[
          context.files.find((file) => file.id === content.fileId)?.extension ??
            ""
        ];
      if (!scriptKind) continue;
      const source = ts.createSourceFile(
        content.relativePath,
        content.redactedText,
        ts.ScriptTarget.Latest,
        true,
        scriptKind,
      );
      const visit = (node: ts.Node) => {
        let pattern: string | undefined;
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "eval"
        )
          pattern = "eval call";
        else if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "Function"
        )
          pattern = "Function constructor";
        else if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(node.left) &&
          node.left.name.text === "innerHTML"
        )
          pattern = "innerHTML assignment";
        if (pattern) {
          const start = source.getLineAndCharacterOfPosition(
            node.getStart(source),
          );
          findings.push(
            makeDraft(
              "security.dangerous-pattern",
              "SECURITY",
              "HEURISTIC",
              "HIGH",
              `Potentially dangerous ${pattern}`,
              "This syntax can evaluate or inject content dynamically. Its actual risk depends on how the value is produced and sanitized.",
              [
                {
                  filePath: content.relativePath,
                  line: start.line + 1,
                  column: start.character + 1,
                },
              ],
              `Static syntax pattern: ${pattern}.`,
              "Avoid dynamic code evaluation and prefer safe text or framework escaping APIs. Validate and sanitize untrusted HTML when HTML rendering is required.",
              `${content.relativePath.toLowerCase()}:${start.line + 1}:${pattern}`,
            ),
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return findings;
  },
};
