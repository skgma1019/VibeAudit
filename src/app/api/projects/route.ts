import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authOrResponse,
  readJson,
  sameOriginOrResponse,
  unavailable,
} from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/audit-repository";

const projectInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    framework: z.string().max(80).nullable().optional(),
    stack: z.array(z.string().max(40)).max(16).optional(),
  })
  .strict();

export async function GET() {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const result = await listProjects(auth.client, auth.user.id);
  if (result.error) return unavailable();
  return NextResponse.json({ projects: result.data });
}

export async function POST(request: Request) {
  const auth = await authOrResponse();
  if (!auth.ok) return auth.response;
  const originError = sameOriginOrResponse(request);
  if (originError) return originError;
  const body = await readJson(request, 16 * 1024);
  if (!body.ok) return body.response;
  const parsed = projectInput.safeParse(body.value);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Project details are invalid." },
      { status: 400 },
    );
  const result = await createProject(auth.client, auth.user.id, {
    name: parsed.data.name,
    framework: parsed.data.framework ?? null,
    stack: parsed.data.stack ?? [],
  });
  if (result.error) return unavailable();
  return NextResponse.json({ project: result.data }, { status: 201 });
}
