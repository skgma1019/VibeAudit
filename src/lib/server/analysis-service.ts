import "server-only";

import { ZodError } from "zod";
import { AI_LIMITS } from "../ai/constants";
import { makeAuditPrompt } from "../ai/prompt";
import { callWithProviderRetry } from "../ai/retry";
import { GeminiCallError, type GeminiAdapter } from "../ai/provider";
import { sanitizeAnalyzePayload, validateAIResponse } from "../ai/validate";
import type { AnalyzeRequest } from "../../schemas/ai";

export type AnalysisServiceResponse =
  | { aiStatus: "SKIPPED"; errorCode: "AI_NOT_CONFIGURED"; message: string }
  | {
      aiStatus: "COMPLETE" | "PARTIAL";
      result: ReturnType<typeof validateAIResponse>;
    }
  | {
      aiStatus: "FAILED";
      errorCode:
        | "AI_INVALID_REQUEST"
        | "AI_PAYLOAD_TOO_LARGE"
        | "AI_TIMEOUT"
        | "AI_RATE_LIMITED"
        | "AI_UNAVAILABLE"
        | "AI_INVALID_RESPONSE";
      message: string;
    };

export async function runAIAnalysis(
  input: AnalyzeRequest,
  options: { adapter?: GeminiAdapter; signal?: AbortSignal } = {},
): Promise<AnalysisServiceResponse> {
  if (process.env.NODE_ENV === "production") {
    return {
      aiStatus: "SKIPPED",
      errorCode: "AI_NOT_CONFIGURED",
      message:
        "AI analysis will be enabled after account authentication is configured.",
    };
  }
  if (!options.adapter) {
    return {
      aiStatus: "SKIPPED",
      errorCode: "AI_NOT_CONFIGURED",
      message:
        "AI analysis is not configured. Add GEMINI_API_KEY to the local server environment.",
    };
  }

  let safeInput: AnalyzeRequest;
  try {
    safeInput = sanitizeAnalyzePayload(input);
  } catch {
    return {
      aiStatus: "FAILED",
      errorCode: "AI_INVALID_REQUEST",
      message: "The analysis request contains an unsafe file reference.",
    };
  }
  if (JSON.stringify(safeInput).length > AI_LIMITS.maxPayloadChars) {
    return {
      aiStatus: "FAILED",
      errorCode: "AI_PAYLOAD_TOO_LARGE",
      message:
        "The analysis request exceeds the supported size. Reduce the selected project scope and retry.",
    };
  }

  const adapter = options.adapter;
  const prompt = makeAuditPrompt(safeInput);
  try {
    // Retry applies to the provider request only; a malformed response is never retried.
    const raw = await callWithProviderRetry(
      () => adapter.analyze(prompt, options.signal),
      { signal: options.signal },
    );
    const result = validateAIResponse(raw, safeInput);
    return { aiStatus: result.aiStatus, result };
  } catch (error) {
    if (
      error instanceof ZodError ||
      (error instanceof GeminiCallError && error.kind === "INVALID_RESPONSE")
    ) {
      return {
        aiStatus: "FAILED",
        errorCode: "AI_INVALID_RESPONSE",
        message:
          "AI returned a response that could not be validated. Rule-based results are still available.",
      };
    }
    if (error instanceof GeminiCallError && error.kind === "TIMEOUT") {
      return {
        aiStatus: "FAILED",
        errorCode: "AI_TIMEOUT",
        message:
          "AI analysis timed out or was cancelled. Rule-based results are still available; you can retry.",
      };
    }
    if (error instanceof GeminiCallError && error.kind === "RATE_LIMIT") {
      return {
        aiStatus: "FAILED",
        errorCode: "AI_RATE_LIMITED",
        message:
          "The AI provider is temporarily rate limited. Rule-based results are still available; try again shortly.",
      };
    }
    return {
      aiStatus: "FAILED",
      errorCode: "AI_UNAVAILABLE",
      message:
        "AI analysis is temporarily unavailable. Rule-based results are still available; you can retry.",
    };
  }
}
