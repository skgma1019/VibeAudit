export class GeminiCallError extends Error {
  constructor(
    public readonly kind:
      "TIMEOUT" | "RATE_LIMIT" | "UNAVAILABLE" | "INVALID_RESPONSE",
    public readonly status?: number,
  ) {
    super(kind);
    this.name = "GeminiCallError";
  }
}

export interface GeminiAdapter {
  analyze(prompt: string, signal?: AbortSignal): Promise<unknown>;
}
