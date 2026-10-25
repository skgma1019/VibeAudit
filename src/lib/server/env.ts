import "server-only";

import { GEMINI_MODEL } from "../ai/constants";

export function getGeminiConfig() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: GEMINI_MODEL };
}
