import { AI_LIMITS } from "./constants";
import { GeminiCallError } from "./provider";

export async function callWithProviderRetry<T>(
  call: () => Promise<T>,
  options: { signal?: AbortSignal; delayMs?: number } = {},
): Promise<T> {
  for (let attempt = 0; attempt <= AI_LIMITS.maxRetries; attempt++) {
    if (options.signal?.aborted) throw new GeminiCallError("TIMEOUT");
    try {
      return await call();
    } catch (error) {
      const retryable =
        error instanceof GeminiCallError &&
        (error.kind === "RATE_LIMIT" ||
          (error.kind === "UNAVAILABLE" && (error.status ?? 0) >= 500));
      if (
        !retryable ||
        attempt >= AI_LIMITS.maxRetries ||
        options.signal?.aborted
      )
        throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, options.delayMs ?? 350),
      );
    }
  }
  throw new GeminiCallError("UNAVAILABLE");
}
