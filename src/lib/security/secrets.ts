export interface SecretSpan {
  start: number;
  end: number;
}

/** Local heuristics only. Values never leave this function as findings. */
export function findSecretSpans(text: string): SecretSpan[] {
  const spans: SecretSpan[] = [];
  const add = (pattern: RegExp, valueGroup?: number) => {
    for (const match of text.matchAll(pattern)) {
      const value = valueGroup === undefined ? match[0] : match[valueGroup];
      if (!value || value === "[REDACTED]") continue;
      const offset = valueGroup === undefined ? 0 : match[0].lastIndexOf(value);
      spans.push({
        start: match.index + offset,
        end: match.index + offset + value.length,
      });
    }
  };
  // Include an unfinished block through EOF rather than leaving its body intact.
  add(
    /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----[\s\S]*?(?:-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----|$)/g,
  );
  add(/\bBearer[ \t]+([A-Za-z0-9._~+\/-]+=*)/gi, 1);
  add(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g);
  add(
    /\b(?:AIza[0-9A-Za-z_-]{20,}|(?:sk|pk)_(?:live|test)_[0-9A-Za-z]{12,}|sk-[0-9A-Za-z_-]{16,}|gh[pousr]_[0-9A-Za-z]{20,}|github_pat_[0-9A-Za-z_]{20,}|AKIA[0-9A-Z]{16})\b/g,
  );
  const name = String.raw`[\w.-]{0,100}(?:api[_-]?key|password|passwd|secret|token|private[_-]?key|access[_-]?key)[\w.-]{0,100}|key`;
  // Mask only the value of quoted assignments, preserving keys and JSON shape.
  const assignmentPattern = new RegExp(
    String.raw`(?:["'\x60](?:${name})["'\x60]|\b(?:${name})\b)(?:\s*:\s*string)?\s*[:=]\s*(?:"((?:\\[\s\S]|[^"\\\r\n])+)"|'((?:\\[\s\S]|[^'\\\r\n])+)'|\x60((?:\\[\s\S]|[^\x60\\])+)\x60)`,
    "gi",
  );
  for (const match of text.matchAll(assignmentPattern)) {
    const value = match[1] ?? match[2] ?? match[3];
    const start = match.index + match[0].lastIndexOf(value);
    spans.push({ start, end: start + value.length });
  }
  add(
    new RegExp(String.raw`\b(?:${name})\b\s*=\s*([^\s"'\x60;,#}]+)`, "gi"),
    1,
  );
  return spans;
}
