import "server-only";

import { GoogleGenAI } from "@google/genai";
import { AI_LIMITS } from "../ai/constants";
import { GEMINI_RESPONSE_JSON_SCHEMA } from "../ai/structured-output";
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
    const startedAt = Date.now();
    try {
      const response = await client.models.generateContent({
        model: config.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: GEMINI_RESPONSE_JSON_SCHEMA,
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
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: unknown }).status)
          : undefined;
      const rawName =
        typeof error === "object" && error !== null && "name" in error
          ? (error as { name?: unknown }).name
          : undefined;
      const providerErrorName =
        typeof rawName === "string" &&
        /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(rawName)
          ? rawName
          : "Unknown";
      console.error(
        JSON.stringify({
          event: "gemini_provider_failure",
          model: config.model,
          providerStatus:
            status && Number.isInteger(status) && status >= 100 && status <= 599
              ? status
              : null,
          providerErrorName,
          durationMs: Date.now() - startedAt,
          timedOut: controller.signal.aborted,
          requestAborted: Boolean(requestSignal?.aborted),
        }),
      );
      if (controller.signal.aborted || requestSignal?.aborted)
        throw new GeminiCallError("TIMEOUT");
      if (status === 429) throw new GeminiCallError("RATE_LIMIT", status);
      if (status && status >= 500)
        throw new GeminiCallError("UNAVAILABLE", status);
      throw new GeminiCallError("UNAVAILABLE", status);
    } finally {
      clearTimeout(timeout);
    }
  }
}
