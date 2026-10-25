import "server-only";

import { GoogleGenAI } from "@google/genai";
import { AI_LIMITS } from "../ai/constants";
import { GeminiCallError, type GeminiAdapter } from "../ai/provider";
import { AUDIT_SYSTEM_INSTRUCTION } from "@/lib/ai/prompt";
import { getGeminiConfig } from "./env";

export class GoogleGeminiAdapter implements GeminiAdapter {
  async analyze(prompt: string, requestSignal?: AbortSignal): Promise<unknown> {
    const config = getGeminiConfig();
    if (!config) throw new GeminiCallError("UNAVAILABLE");
    const client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: {
        timeout: AI_LIMITS.timeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_LIMITS.timeoutMs);
    const abortSignal = requestSignal
      ? AbortSignal.any([controller.signal, requestSignal])
      : controller.signal;
    try {
      const response = await client.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "OBJECT",
            properties: {
              summary: {
                type: "OBJECT",
                properties: {
                  overview: { type: "STRING" },
                  strengths: { type: "ARRAY", items: { type: "STRING" } },
                  topPriorities: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["overview", "strengths", "topPriorities"],
              },
              issueInsights: { type: "ARRAY", items: insightJsonSchema },
              potentialIssues: { type: "ARRAY", items: insightJsonSchema },
            },
            required: ["summary", "issueInsights", "potentialIssues"],
          },
          maxOutputTokens: AI_LIMITS.maxOutputTokens,
          abortSignal,
          systemInstruction: AUDIT_SYSTEM_INSTRUCTION,
        },
      });
      if (!response.text) throw new GeminiCallError("INVALID_RESPONSE");
      try {
        return JSON.parse(response.text) as unknown;
      } catch {
        throw new GeminiCallError("INVALID_RESPONSE");
      }
    } catch (error) {
      if (error instanceof GeminiCallError) throw error;
      if (controller.signal.aborted || requestSignal?.aborted)
        throw new GeminiCallError("TIMEOUT");
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: unknown }).status)
          : undefined;
      if (status === 429) throw new GeminiCallError("RATE_LIMIT", status);
      if (status && status >= 500)
        throw new GeminiCallError("UNAVAILABLE", status);
      throw new GeminiCallError("UNAVAILABLE", status);
    } finally {
      clearTimeout(timeout);
    }
  }
}

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
    relatedIssueIds: { type: "ARRAY", items: { type: "STRING" } },
    locations: {
      type: "ARRAY",
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
