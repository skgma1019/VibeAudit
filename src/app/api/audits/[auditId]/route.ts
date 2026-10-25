import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authOrResponse,
  sameOriginOrResponse,
  unavailable,
} from "@/lib/server/http";
import { deleteAudit, getAudit } from "@/lib/server/audit-repository";

type Context = { params: Promise<{ auditId: string }> };
export async function GET(_request: Request, context: Context) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const { auditId } = await context.params;
  if (!z.string().uuid().safeParse(auditId).success)
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  const result = await getAudit(auth.client, auth.user.id, auditId);
  if (result.error)
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  return NextResponse.json({ audit: result.data });
}

export async function DELETE(_request: Request, context: Context) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const originError = sameOriginOrResponse(_request);
  if (originError) return originError;
  const { auditId } = await context.params;
  if (!z.string().uuid().safeParse(auditId).success)
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  const result = await deleteAudit(auth.client, auth.user.id, auditId);
  if (result.error) return unavailable();
  if (!result.data)
    return NextResponse.json({ error: "Audit not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
