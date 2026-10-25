import { NextResponse } from "next/server";
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
import { saveAudit } from "@/lib/server/audit-repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { projectId } = await context.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = persistedAuditSchema.safeParse(body.value);
  if (
    !parsed.success ||
    parsed.data.project.mode !== "existing" ||
    parsed.data.project.projectId !== projectId
  )
    return NextResponse.json(
      { error: "Audit data is invalid." },
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
