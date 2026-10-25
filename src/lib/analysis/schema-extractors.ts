import type {
  ParseError,
  SchemaColumn,
  SchemaDefinition,
  SourceLocation,
} from "../../types/analysis";

const loc = (
  filePath: string,
  source: string,
  offset: number,
): SourceLocation => {
  const before = source.slice(0, offset);
  const line = before.split("\n").length;
  return { filePath, line, column: offset - before.lastIndexOf("\n") };
};
const unquote = (name: string) =>
  name
    .trim()
    .replace(/^[`"'\[]|[`"'\]]$/g, "")
    .split(".")
    .at(-1) ?? name.trim();

export function extractSqlSchema(
  filePath: string,
  source: string,
): { schemas: SchemaDefinition[]; errors: ParseError[] } {
  const schemas: SchemaDefinition[] = [];
  const errors: ParseError[] = [];
  const tablePattern =
    /\bCREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`\[\]-]+)\s*\(/gi;
  for (const match of source.matchAll(tablePattern)) {
    const open = match.index + match[0].lastIndexOf("(");
    let depth = 1;
    let quote = "";
    let close = open + 1;
    for (; close < source.length && depth > 0; close++) {
      const ch = source[close];
      if (quote) {
        if (ch === quote && source[close - 1] !== "\\") quote = "";
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
        quote = ch === "[" ? "]" : ch;
        continue;
      }
      if (ch === "-") {
        if (source[close + 1] === "-") {
          const end = source.indexOf("\n", close);
          close = end < 0 ? source.length : end;
          continue;
        }
      }
      if (ch === "/" && source[close + 1] === "*") {
        const end = source.indexOf("*/", close + 2);
        close = end < 0 ? source.length : end + 1;
        continue;
      }
      if (ch === "(") depth++;
      if (ch === ")") depth--;
    }
    if (depth !== 0) {
      errors.push({
        filePath,
        kind: "SQL",
        line: loc(filePath, source, match.index).line,
        message: "SQL schema declaration could not be fully parsed.",
      });
      continue;
    }
    const bodyStart = open + 1;
    const body = source.slice(bodyStart, close - 1);
    const columns: SchemaColumn[] = [];
    let start = bodyStart;
    let nested = 0;
    quote = "";
    for (let offset = 0; offset <= body.length; offset++) {
      const ch = body[offset];
      if (quote) {
        if (ch === quote && body[offset - 1] !== "\\") quote = "";
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`" || ch === "[") {
        quote = ch === "[" ? "]" : ch;
        continue;
      }
      if (ch === "(") nested++;
      else if (ch === ")") nested--;
      if ((ch === "," && nested === 0) || offset === body.length) {
        const declaration = source
          .slice(start, bodyStart + offset)
          .replace(/--[^\n]*/g, "")
          .trim();
        const column = declaration.match(
          /^([\w."`\[\]-]+)\s+([A-Za-z][\w]*(?:\s*\([^)]*\))?(?:\s*\[\])?)/,
        );
        if (
          column &&
          !/^(?:constraint|primary|foreign|unique|check|exclude)$/i.test(
            unquote(column[1]),
          )
        ) {
          columns.push({
            name: unquote(column[1]),
            type: column[2].replace(/\s+/g, " ").trim(),
            optional: !/\bNOT\s+NULL\b/i.test(declaration),
            location: loc(
              filePath,
              source,
              start + source.slice(start, bodyStart + offset).search(/\S/),
            ),
          });
        }
        start = bodyStart + offset + 1;
      }
    }
    schemas.push({
      kind: "TABLE",
      name: unquote(match[1]),
      filePath,
      location: loc(filePath, source, match.index),
      columns,
    });
  }
  const alter =
    /\bALTER\s+TABLE\s+([\w."`\[\]-]+)\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([\w"`\[\]-]+)\s+([A-Za-z][\w]*(?:\s*\([^)]*\))?)([^;\n]*)/gi;
  for (const match of source.matchAll(alter)) {
    const table = unquote(match[1]);
    let schema = schemas.find(
      (item) =>
        item.kind === "TABLE" &&
        item.name.toLowerCase() === table.toLowerCase(),
    );
    if (!schema) {
      schema = {
        kind: "TABLE",
        name: table,
        filePath,
        location: loc(filePath, source, match.index),
        columns: [],
      };
      schemas.push(schema);
    }
    schema.columns.push({
      name: unquote(match[2]),
      type: match[3].replace(/\s+/g, " ").trim(),
      optional: !/\bNOT\s+NULL\b/i.test(match[4]),
      location: loc(filePath, source, match.index + match[0].indexOf(match[2])),
    });
  }
  return { schemas, errors };
}

export function extractPrismaSchema(
  filePath: string,
  source: string,
): { schemas: SchemaDefinition[]; errors: ParseError[] } {
  const schemas: SchemaDefinition[] = [];
  const errors: ParseError[] = [];
  const pattern = /^\s*model\s+([A-Za-z_]\w*)\s*\{/gm;
  for (const match of source.matchAll(pattern)) {
    const bodyStart = match.index + match[0].lastIndexOf("{") + 1;
    const close = source.indexOf("}", bodyStart);
    if (close < 0) {
      errors.push({
        filePath,
        kind: "PRISMA",
        line: loc(filePath, source, match.index).line,
        message: "Prisma model block could not be fully parsed.",
      });
      continue;
    }
    const body = source.slice(bodyStart, close);
    const columns: SchemaColumn[] = [];
    for (const lineMatch of body.matchAll(
      /^\s*([A-Za-z_]\w*)\s+([A-Za-z][A-Za-z0-9_]*(?:\[\])?\??)(?:\s|$)/gm,
    )) {
      if (lineMatch[1].startsWith("@@") || lineMatch[1].startsWith("@"))
        continue;
      columns.push({
        name: lineMatch[1],
        type: lineMatch[2].replace(/[?\[\]]/g, ""),
        optional: lineMatch[2].endsWith("?") || lineMatch[2].endsWith("[]"),
        location: loc(
          filePath,
          source,
          bodyStart + lineMatch.index + lineMatch[0].indexOf(lineMatch[1]),
        ),
      });
    }
    schemas.push({
      kind: "MODEL",
      name: match[1],
      filePath,
      location: loc(filePath, source, match.index),
      columns,
    });
  }
  if (
    /^\s*model\s+\w+/m.test(source) &&
    schemas.length === 0 &&
    errors.length === 0
  )
    errors.push({
      filePath,
      kind: "PRISMA",
      message: "Prisma model declarations could not be parsed.",
    });
  return { schemas, errors };
}
