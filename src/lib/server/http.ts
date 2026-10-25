import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";

export async function readJson(request: Request, maxBytes = 4 * 1024 * 1024) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json"))
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Send a JSON request." },
        { status: 415 },
      ),
    };
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Request is too large." },
        { status: 413 },
      ),
    };
  if (!request.body)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Request body is required." },
        { status: 400 },
      ),
    };
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return {
          ok: false as const,
          response: NextResponse.json(
            { error: "Request is too large." },
            { status: 413 },
          ),
        };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return {
      ok: true as const,
      value: JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      ) as unknown,
    };
  } catch {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Request body is invalid." },
        { status: 400 },
      ),
    };
  }
}

export async function authOrResponse() {
  const auth = await requireUser();
  if (!auth.ok)
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: auth.message },
        { status: auth.status },
      ),
    };
  return { ok: true as const, client: auth.client, user: auth.user };
}

export function sameOriginOrResponse(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site")
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  if (!origin || origin !== new URL(request.url).origin)
    return NextResponse.json(
      { error: "A same-origin request is required." },
      { status: 403 },
    );
  return null;
}

export function unavailable() {
  return NextResponse.json(
    { error: "The history request could not be completed." },
    { status: 500 },
  );
}
