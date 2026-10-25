import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authOrResponse,
  readJson,
  sameOriginOrResponse,
  unavailable,
} from "@/lib/server/http";
import { updateIssueResolved } from "@/lib/server/audit-repository";

const inputSchema = z.object({ resolved: z.boolean() }).strict();
export async function PATCH(
  request: Request,
  context: { params: Promise<{ issueId: string }> },
) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const { issueId } = await context.params;
  if (!z.string().uuid().safeParse(issueId).success)
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  const body = await readJson(request, 8 * 1024);
  if (!body.ok) return body.response;
  const parsed = inputSchema.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Issue update is invalid." },
      { status: 400 },
    );
  const result = await updateIssueResolved(
    auth.client,
    auth.user.id,
    issueId,
    parsed.data.resolved,
  );
  if (result.error) return unavailable();
  if (!result.data)
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  return NextResponse.json({ issue: result.data });
}
