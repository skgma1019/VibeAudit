import { findSecretSpans, type SecretSpan } from "./secrets";

/** Remove every .env.example value, including multiline quoted values/comments. */
function envValueSpans(text: string): SecretSpan[] {
  const spans: SecretSpan[] = [];
  const pattern =
    /^(?:[ \t]*export[ \t]+)?[ \t]*[A-Za-z_][A-Za-z0-9_]*[ \t]*=[ \t]*/gm;
  let consumedUntil = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index < consumedUntil) continue;
    const start = match.index + match[0].length;
    const quote = text[start];
    let end = start;
    if (quote === '"' || quote === "'" || quote === "`") {
      end = start + 1;
      while (end < text.length) {
        if (text[end] === quote && text[end - 1] !== "\\") {
          end++;
          break;
        }
        end++;
      }
      while (end < text.length && text[end] !== "\n") end++;
    } else {
      while (end < text.length && text[end] !== "\n") end++;
    }
    if (end > start) spans.push({ start, end });
    consumedUntil = end;
  }
  return spans;
}

export function redactSecrets(
  text: string,
  envExample = false,
): {
  hasSecretCandidate: boolean;
  redactedText: string;
  redactionCount: number;
} {
  const spans = [
    ...findSecretSpans(text),
    ...(envExample ? envValueSpans(text) : []),
  ].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: SecretSpan[] = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && span.start <= previous.end)
      previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  let cursor = 0;
  let redactedText = "";
  for (const span of merged) {
    redactedText += text.slice(cursor, span.start) + "[REDACTED]";
    cursor = span.end;
  }
  redactedText += text.slice(cursor);
  return {
    hasSecretCandidate: merged.length > 0,
    redactedText,
    redactionCount: merged.length,
  };
}
