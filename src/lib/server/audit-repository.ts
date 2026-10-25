import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import type { PersistedAuditRequest } from "@/schemas/persistence";

type Client = SupabaseClient<Database>;
const safeError = { message: "The history request could not be completed." };

export async function listProjects(client: Client, ownerId: string) {
  return client
    .from("projects")
    .select("id,name,framework,stack,created_at,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
}

export async function createProject(
  client: Client,
  ownerId: string,
  input: { name: string; framework: string | null; stack: string[] },
) {
  return client
    .from("projects")
    .insert({
      owner_id: ownerId,
      name: input.name,
      framework: input.framework,
      stack: input.stack as Json,
    })
    .select("id,name,framework,stack,created_at,updated_at")
    .single();
}

export async function saveAudit(
  client: Client,
  request: PersistedAuditRequest,
) {
  const result = await client.rpc("save_audit", {
    p_request_id: request.requestId,
    p_project_id:
      request.project.mode === "existing" ? request.project.projectId : null,
    p_project_name:
      request.project.mode === "new" ? request.project.name : null,
    p_framework:
      request.project.mode === "new" ? request.project.framework : null,
    p_stack:
      request.project.mode === "new" ? (request.project.stack as Json) : [],
    p_audit: request.audit as unknown as Json,
  });
  if (result.error) return { data: null, error: safeError };
  return result;
}

export async function listAudits(
  client: Client,
  ownerId: string,
  projectId?: string,
) {
  let query = client
    .from("audits")
    .select(
      "id,project_id,owner_id,overall_score,grade,issue_count,created_at,score_version",
    )
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (projectId) query = query.eq("project_id", projectId);
  return query;
}

export async function getAudit(
  client: Client,
  ownerId: string,
  auditId: string,
) {
  const audit = await client
    .from("audits")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("id", auditId)
    .maybeSingle();
  if (audit.error || !audit.data) return { data: null, error: safeError };
  const [project, issues, relations, insights] = await Promise.all([
    client
      .from("projects")
      .select("name,framework,stack")
      .eq("owner_id", ownerId)
      .eq("id", audit.data.project_id)
      .maybeSingle(),
    client
      .from("audit_issues")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("audit_id", auditId)
      .order("severity"),
    client
      .from("audit_relations")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("audit_id", auditId),
    client
      .from("audit_ai_insights")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("audit_id", auditId),
  ]);
  if (project.error || issues.error || relations.error || insights.error)
    return { data: null, error: safeError };
  const locations =
    issues.data.length === 0
      ? { data: [], error: null }
      : await client
          .from("audit_issue_locations")
          .select("issue_id,file_path,line,column")
          .eq("owner_id", ownerId)
          .in(
            "issue_id",
            issues.data.map((issue) => issue.id),
          );
  if (locations.error) return { data: null, error: safeError };
  return {
    data: {
      ...audit.data,
      project: project.data,
      issues: issues.data.map((issue) => ({
        ...issue,
        locations: locations.data.filter((item) => item.issue_id === issue.id),
      })),
      relations: relations.data,
      aiInsights: insights.data,
    },
    error: null,
  };
}

export async function deleteAudit(
  client: Client,
  ownerId: string,
  auditId: string,
) {
  const result = await client
    .from("audits")
    .delete()
    .eq("owner_id", ownerId)
    .eq("id", auditId)
    .select("id")
    .maybeSingle();
  if (result.error) return { data: null, error: safeError };
  return result;
}

export async function updateIssueResolved(
  client: Client,
  ownerId: string,
  issueId: string,
  resolved: boolean,
) {
  const result = await client
    .from("audit_issues")
    .update({ resolved, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("id", issueId)
    .select("id,resolved,updated_at")
    .maybeSingle();
  if (result.error) return { data: null, error: safeError };
  return result;
}
