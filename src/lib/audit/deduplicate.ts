import { ruleIssueSchema, type RuleIssue } from "../../types/audit";
import type { RuleDraft } from "../../types/audit";

const severityRank: Record<RuleIssue["severity"], number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function fingerprintFor(draft: RuleDraft): string {
  const locations = [...draft.locations]
    .map(
      (location) =>
        `${location.filePath.replace(/\\/g, "/").toLowerCase()}:${location.line}:${location.column}`,
    )
    .sort();
  const source = [
    draft.ruleId,
    draft.category,
    locations.join(","),
    (draft.fingerprintTarget ?? "").replace(/\s+/g, " ").trim().toLowerCase(),
  ].join("|");
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x01000193) >>> 0;
  }
  return `v1-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function materializeIssues(drafts: RuleDraft[]): RuleIssue[] {
  const validated = drafts.map(({ fingerprintTarget: _target, ...draft }) =>
    ruleIssueSchema.parse({
      ...draft,
      fingerprint: fingerprintFor({ ...draft, fingerprintTarget: _target }),
    }),
  );
  return deduplicateIssues(validated);
}

export function deduplicateIssues(issues: RuleIssue[]): RuleIssue[] {
  const unique = new Map<string, RuleIssue>();
  for (const raw of issues) {
    const issue = ruleIssueSchema.parse(raw);
    const previous = unique.get(issue.fingerprint);
    if (!previous) {
      unique.set(issue.fingerprint, issue);
      continue;
    }
    if (previous.category !== issue.category)
      throw new Error("A duplicate fingerprint cannot span audit categories.");
    const winner =
      severityRank[issue.severity] > severityRank[previous.severity]
        ? issue
        : previous;
    const locations = new Map<string, RuleIssue["locations"][number]>();
    for (const location of [...previous.locations, ...issue.locations])
      locations.set(
        `${location.filePath.toLowerCase()}:${location.line}:${location.column}`,
        location,
      );
    unique.set(issue.fingerprint, {
      ...winner,
      locations: [...locations.values()].sort(
        (a, b) =>
          a.filePath.localeCompare(b.filePath) ||
          a.line - b.line ||
          a.column - b.column,
      ),
    });
  }
  return [...unique.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.severity.localeCompare(b.severity) ||
      a.ruleId.localeCompare(b.ruleId) ||
      a.fingerprint.localeCompare(b.fingerprint),
  );
}
