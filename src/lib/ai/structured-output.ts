const insightJsonSchema = {
  type: "OBJECT",
  properties: {
    type: {
      type: "STRING",
      enum: ["ISSUE_EXPLANATION", "IMPROVEMENT", "POTENTIAL_ISSUE"],
    },
    confidence: { type: "STRING", enum: ["HIGH", "MEDIUM", "LOW"] },
    title: { type: "STRING" },
    explanation: { type: "STRING" },
    impact: { type: "STRING" },
    suggestion: { type: "STRING" },
    relatedIssueIds: {
      type: "ARRAY",
      items: { type: "STRING" },
      maxItems: 5,
    },
    locations: {
      type: "ARRAY",
      maxItems: 5,
      items: {
        type: "OBJECT",
        properties: {
          filePath: { type: "STRING" },
          line: { type: "INTEGER" },
          column: { type: "INTEGER" },
        },
        required: ["filePath", "line"],
      },
    },
    evidenceStatus: {
      type: "STRING",
      enum: ["SUPPORTED", "PARTIAL", "UNVERIFIED"],
    },
  },
  required: [
    "type",
    "confidence",
    "title",
    "explanation",
    "suggestion",
    "relatedIssueIds",
    "locations",
    "evidenceStatus",
  ],
} as const;

export const GEMINI_RESPONSE_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: {
      type: "OBJECT",
      properties: {
        overview: { type: "STRING" },
        strengths: {
          type: "ARRAY",
          items: { type: "STRING" },
          maxItems: 5,
        },
        topPriorities: {
          type: "ARRAY",
          items: { type: "STRING" },
          maxItems: 3,
        },
      },
      required: ["overview", "strengths", "topPriorities"],
    },
    issueInsights: {
      type: "ARRAY",
      items: insightJsonSchema,
      maxItems: 5,
    },
    potentialIssues: {
      type: "ARRAY",
      items: insightJsonSchema,
      maxItems: 3,
    },
  },
  required: ["summary", "issueInsights", "potentialIssues"],
} as const;
