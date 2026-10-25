import { NextResponse } from "next/server";
import { z } from "zod";
import { persistedAuditSchema } from "@/schemas/persistence";
import {
  persistedScoreMatches,
  redactPersistedAudit,
} from "@/lib/audit/persistence";
import {
  authOrResponse,
  readJson,
  sameOriginOrResponse,
  unavailable,
} from "@/lib/server/http";
import { listAudits, saveAudit } from "@/lib/server/audit-repository";

export async function GET(request: Request) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const projectId =
    new URL(request.url).searchParams.get("projectId") ?? undefined;
  if (projectId && !z.string().uuid().safeParse(projectId).success)
    return NextResponse.json(
      { error: "Project filter is invalid." },
      { status: 400 },
    );
  const result = await listAudits(auth.client, auth.user.id, projectId);
  if (result.error) return unavailable();
  return NextResponse.json({ audits: result.data });
}

export async function POST(request: Request) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = persistedAuditSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Audit data is invalid or contains unsupported fields." },
      { status: 400 },
    );
  const sanitized = redactPersistedAudit(parsed.data);
  if (!persistedScoreMatches(sanitized))
    return NextResponse.json(
      { error: "Audit score does not match its Rule findings." },
      { status: 400 },
    );
  const result = await saveAudit(auth.client, sanitized);
  if (result.error || !result.data?.[0]) return unavailable();
  return NextResponse.json(
    { auditId: result.data[0].audit_id, projectId: result.data[0].project_id },
    { status: 201 },
  );
}
