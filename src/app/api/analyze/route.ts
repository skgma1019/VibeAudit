import { NextResponse } from "next/server";
import { AI_LIMITS } from "@/lib/ai/constants";
import { runAIAnalysis } from "@/lib/server/analysis-service";
import { GoogleGeminiAdapter } from "@/lib/server/gemini";
import { getGeminiConfig } from "@/lib/server/env";
import { analyzeRequestSchema } from "@/schemas/ai";
import { authOrResponse, sameOriginOrResponse } from "@/lib/server/http";

export const runtime = "nodejs";

async function readBoundedBody(request: Request): Promise<string | null> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > AI_LIMITS.maxRequestBytes)
    return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > AI_LIMITS.maxRequestBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function POST(request: Request) {
  const auth = await authOrResponse();
  if (!auth.ok)
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_UNAVAILABLE",
        message:
          auth.response.status === 401
            ? "An active session is required for AI analysis."
            : "AI analysis is not configured.",
      },
      { status: auth.response.status },
    );
  const originError = sameOriginOrResponse(request);
  if (originError)
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_INVALID_REQUEST",
        message: "A same-origin request is required.",
      },
      { status: 403 },
    );
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_INVALID_REQUEST",
        message: "Send a JSON analysis request.",
      },
      { status: 415 },
    );
  }
  let body: string | null;
  try {
    body = await readBoundedBody(request);
  } catch {
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_INVALID_REQUEST",
        message: "The analysis request could not be read.",
      },
      { status: 400 },
    );
  }
  if (body === null) {
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_PAYLOAD_TOO_LARGE",
        message: "The analysis request exceeds the supported size.",
      },
      { status: 413 },
    );
  }
  let unknownBody: unknown;
  try {
    unknownBody = JSON.parse(body);
  } catch {
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_INVALID_REQUEST",
        message: "The analysis request is not valid JSON.",
      },
      { status: 400 },
    );
  }
  const parsed = analyzeRequestSchema.safeParse(unknownBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_INVALID_REQUEST",
        message: "The analysis request does not match the supported format.",
      },
      { status: 400 },
    );
  }
  if (body.length > AI_LIMITS.maxPayloadChars) {
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_PAYLOAD_TOO_LARGE",
        message: "The analysis request exceeds the supported size.",
      },
      { status: 413 },
    );
  }
  if (!getGeminiConfig()) {
    return NextResponse.json({
      aiStatus: "SKIPPED",
      errorCode: "AI_NOT_CONFIGURED",
      message: "AI analysis is not configured. Rule results remain available.",
    });
  }
  const requestId = crypto.randomUUID();
  const reservation = await auth.client.rpc("reserve_ai_request", {
    p_request_id: requestId,
  });
  if (reservation.error)
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_UNAVAILABLE",
        message: "AI request limits could not be checked.",
      },
      { status: 503 },
    );
  if (reservation.data === "RATE_LIMITED")
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_RATE_LIMITED",
        message: "AI request limit reached. Try again later.",
      },
      { status: 429 },
    );
  if (reservation.data === "IN_PROGRESS")
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_RATE_LIMITED",
        message: "Another AI request is already running for this account.",
      },
      { status: 429 },
    );
  if (reservation.data !== "RESERVED")
    return NextResponse.json(
      {
        aiStatus: "FAILED",
        errorCode: "AI_UNAVAILABLE",
        message: "AI request could not be started.",
      },
      { status: 503 },
    );
  try {
    const result = await runAIAnalysis(parsed.data, {
      adapter: new GoogleGeminiAdapter(),
      signal: request.signal,
    });
    const status = result.aiStatus === "FAILED" ? 502 : 200;
    return NextResponse.json(result, { status });
  } finally {
    await auth.client.rpc("finish_ai_request", { p_request_id: requestId });
  }
}
