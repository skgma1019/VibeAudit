/** Initial budgets; revisit only after measuring real project payloads. */
export const AI_LIMITS = {
  maxPayloadChars: 48_000,
  maxRequestBytes: 64 * 1024,
  maxIssues: 30,
  maxRelations: 40,
  maxSchemas: 20,
  maxSnippets: 5,
  maxSnippetChars: 2_000,
  maxIssueTextChars: 1_024,
  maxRelationTextChars: 256,
  maxStringChars: 2_000,
  maxArrayItems: 50,
  timeoutMs: 25_000,
  maxRetries: 1,
  maxOutputTokens: 6_000,
} as const;

export const GEMINI_MODEL = "gemini-3.8-flash";
