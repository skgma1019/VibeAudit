create table public.projects (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (pg_catalog.char_length(name) between 1 and 120),
  framework text check (framework is null or pg_catalog.char_length(framework) <= 80),
  stack jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(stack) = 'array'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, owner_id)
);

create table public.audits (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  project_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  overall_score numeric(4,1) not null check (overall_score between 0 and 100),
  grade text not null check (grade in ('A', 'B', 'C', 'D', 'F')),
  integrity_score numeric(5,2) not null check (integrity_score between 0 and 100),
  consistency_score numeric(5,2) not null check (consistency_score between 0 and 100),
  security_score numeric(5,2) not null check (security_score between 0 and 100),
  structure_score numeric(5,2) not null check (structure_score between 0 and 100),
  dependency_score numeric(5,2) not null check (dependency_score between 0 and 100),
  coverage jsonb not null check (pg_catalog.jsonb_typeof(coverage) = 'object'),
  file_count integer not null check (file_count >= 0),
  analyzed_file_count integer not null check (analyzed_file_count >= 0 and analyzed_file_count <= file_count),
  issue_count integer not null check (issue_count >= 0),
  summary jsonb check (summary is null or pg_catalog.jsonb_typeof(summary) = 'object'),
  rule_version text not null check (pg_catalog.char_length(rule_version) <= 80),
  score_version text not null check (pg_catalog.char_length(score_version) <= 80),
  ai_model text check (ai_model is null or pg_catalog.char_length(ai_model) <= 120),
  ai_status text not null check (ai_status in ('IDLE', 'COMPLETE', 'PARTIAL', 'FAILED', 'SKIPPED')),
  created_at timestamptz not null default pg_catalog.now(),
  unique (owner_id, request_id),
  unique (id, owner_id),
  foreign key (project_id, owner_id) references public.projects (id, owner_id) on delete cascade
);

create table public.audit_issues (
  id uuid primary key,
  audit_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  fingerprint text not null check (pg_catalog.char_length(fingerprint) between 1 and 512),
  rule_id text not null check (pg_catalog.char_length(rule_id) between 1 and 128),
  origin text not null default 'RULE' check (origin = 'RULE'),
  detection_kind text not null check (detection_kind in ('DETERMINISTIC', 'HEURISTIC')),
  category text not null check (category in ('DATA_INTEGRITY', 'CONSISTENCY', 'SECURITY', 'STRUCTURE', 'DEPENDENCY')),
  severity text not null check (severity in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  title text not null check (pg_catalog.char_length(title) between 1 and 256),
  description text not null check (pg_catalog.char_length(description) between 1 and 1024),
  evidence text not null check (pg_catalog.char_length(evidence) between 1 and 1024),
  suggestion text not null check (pg_catalog.char_length(suggestion) between 1 and 1024),
  resolved boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, owner_id),
  unique (audit_id, fingerprint),
  foreign key (audit_id, owner_id) references public.audits (id, owner_id) on delete cascade
);

create table public.audit_issue_locations (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  issue_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null check (
    pg_catalog.char_length(file_path) between 1 and 1024
    and file_path !~ '^[A-Za-z]:'
    and pg_catalog.left(file_path, 1) <> '/'
    and pg_catalog.strpos(file_path, pg_catalog.chr(92)) = 0
    and file_path !~ '(^|/)\.\.(/|$)'
  ),
  line integer not null check (line > 0),
  "column" integer not null check ("column" > 0),
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (issue_id, owner_id) references public.audit_issues (id, owner_id) on delete cascade
);

create table public.audit_relations (
  id uuid primary key,
  audit_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  relation_type text not null check (relation_type in ('IMPORT', 'API_CALL', 'ROUTE_HANDLER', 'DATABASE', 'ENV', 'DEPENDENCY', 'SCHEMA_DEFINITION')),
  source_kind text not null check (pg_catalog.char_length(source_kind) <= 50),
  source_value text not null check (pg_catalog.char_length(source_value) <= 512),
  target_kind text not null check (pg_catalog.char_length(target_kind) <= 50),
  target_value text not null check (pg_catalog.char_length(target_value) <= 512),
  resolution_status text not null check (resolution_status in ('RESOLVED', 'PARTIAL', 'UNRESOLVED')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  metadata jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (audit_id, owner_id) references public.audits (id, owner_id) on delete cascade
);

create table public.audit_ai_insights (
  id uuid primary key,
  audit_id uuid not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in ('ISSUE_EXPLANATION', 'IMPROVEMENT', 'POTENTIAL_ISSUE')),
  confidence text not null check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  title text not null check (pg_catalog.char_length(title) between 1 and 256),
  explanation text not null check (pg_catalog.char_length(explanation) between 1 and 2048),
  impact text check (impact is null or pg_catalog.char_length(impact) <= 1024),
  suggestion text not null check (pg_catalog.char_length(suggestion) between 1 and 1024),
  evidence_status text not null check (evidence_status in ('SUPPORTED', 'PARTIAL', 'UNVERIFIED')),
  related_issue_ids uuid[] not null default '{}',
  locations jsonb not null default '[]'::jsonb check (pg_catalog.jsonb_typeof(locations) = 'array'),
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (audit_id, owner_id) references public.audits (id, owner_id) on delete cascade
);

create table public.ai_usage (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  finished_at timestamptz,
  unique (owner_id, request_id)
);

create index projects_owner_id_idx on public.projects (owner_id);
create index audits_owner_created_idx on public.audits (owner_id, created_at desc);
create index audits_project_created_idx on public.audits (project_id, created_at desc);
create index audit_issues_audit_idx on public.audit_issues (audit_id);
create index audit_issues_owner_idx on public.audit_issues (owner_id);
create index audit_issues_audit_resolved_idx on public.audit_issues (audit_id, resolved);
create index audit_issue_locations_issue_idx on public.audit_issue_locations (issue_id);
create index audit_relations_audit_idx on public.audit_relations (audit_id);
create index audit_ai_insights_audit_idx on public.audit_ai_insights (audit_id);
create index ai_usage_owner_created_idx on public.ai_usage (owner_id, created_at desc);

alter table public.projects enable row level security;
alter table public.audits enable row level security;
alter table public.audit_issues enable row level security;
alter table public.audit_issue_locations enable row level security;
alter table public.audit_relations enable row level security;
alter table public.audit_ai_insights enable row level security;
alter table public.ai_usage enable row level security;

revoke all on public.projects, public.audits, public.audit_issues, public.audit_issue_locations, public.audit_relations, public.audit_ai_insights, public.ai_usage from anon, authenticated;
grant select, insert on public.projects to authenticated;
grant select, delete on public.audits to authenticated;
grant select on public.audit_issues to authenticated;
grant update (resolved, updated_at) on public.audit_issues to authenticated;
grant select on public.audit_issue_locations, public.audit_relations, public.audit_ai_insights to authenticated;

create policy projects_select_own on public.projects for select to authenticated using ((select auth.uid()) = owner_id);
create policy projects_insert_own on public.projects for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy projects_update_own on public.projects for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy projects_delete_own on public.projects for delete to authenticated using ((select auth.uid()) = owner_id);

create policy audits_select_own on public.audits for select to authenticated using ((select auth.uid()) = owner_id);
create policy audits_insert_own on public.audits for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy audits_delete_own on public.audits for delete to authenticated using ((select auth.uid()) = owner_id);

create policy audit_issues_select_own on public.audit_issues for select to authenticated using ((select auth.uid()) = owner_id);
create policy audit_issues_insert_own on public.audit_issues for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy audit_issues_update_own on public.audit_issues for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy audit_issues_delete_own on public.audit_issues for delete to authenticated using ((select auth.uid()) = owner_id);

create policy audit_issue_locations_select_own on public.audit_issue_locations for select to authenticated using ((select auth.uid()) = owner_id);
create policy audit_issue_locations_insert_own on public.audit_issue_locations for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy audit_issue_locations_update_own on public.audit_issue_locations for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy audit_issue_locations_delete_own on public.audit_issue_locations for delete to authenticated using ((select auth.uid()) = owner_id);

create policy audit_relations_select_own on public.audit_relations for select to authenticated using ((select auth.uid()) = owner_id);
create policy audit_relations_insert_own on public.audit_relations for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy audit_relations_update_own on public.audit_relations for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy audit_relations_delete_own on public.audit_relations for delete to authenticated using ((select auth.uid()) = owner_id);

create policy audit_ai_insights_select_own on public.audit_ai_insights for select to authenticated using ((select auth.uid()) = owner_id);
create policy audit_ai_insights_insert_own on public.audit_ai_insights for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy audit_ai_insights_update_own on public.audit_ai_insights for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy audit_ai_insights_delete_own on public.audit_ai_insights for delete to authenticated using ((select auth.uid()) = owner_id);

create policy ai_usage_select_own on public.ai_usage for select to authenticated using ((select auth.uid()) = owner_id);
create policy ai_usage_insert_own on public.ai_usage for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy ai_usage_update_own on public.ai_usage for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy ai_usage_delete_own on public.ai_usage for delete to authenticated using ((select auth.uid()) = owner_id);

create function public.save_audit(
  p_request_id uuid,
  p_project_id uuid,
  p_project_name text,
  p_framework text,
  p_stack jsonb,
  p_audit jsonb
) returns table (audit_id uuid, project_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_project_id uuid := p_project_id;
  v_audit_id uuid;
  v_issue jsonb;
  v_location jsonb;
  v_relation jsonb;
  v_insight jsonb;
  v_related_ids uuid[];
  v_allowed text[] := array['scores', 'coverage', 'fileCount', 'analyzedFileCount', 'ruleVersion', 'scoreVersion', 'aiStatus', 'summary', 'issues', 'relations', 'aiInsights'];
begin
  if v_owner is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_request_id is null then raise exception 'invalid request id' using errcode = '22023'; end if;
  if p_request_id is null or pg_catalog.jsonb_typeof(p_audit) <> 'object' then raise exception 'invalid audit request' using errcode = '22023'; end if;
  if exists (select 1 from pg_catalog.jsonb_object_keys(p_audit) as keys(key) where key <> all(v_allowed)) then raise exception 'unexpected audit field' using errcode = '22023'; end if;
  if p_audit ?| array['source', 'sourceCode', 'prompt', 'rawResponse', 'owner_id'] then raise exception 'forbidden audit field' using errcode = '22023'; end if;
  if pg_catalog.jsonb_typeof(p_audit -> 'issues') <> 'array' or pg_catalog.jsonb_typeof(p_audit -> 'relations') <> 'array' or pg_catalog.jsonb_typeof(p_audit -> 'aiInsights') <> 'array' then raise exception 'invalid audit arrays' using errcode = '22023'; end if;
  if pg_catalog.jsonb_array_length(p_audit -> 'issues') > 20000 or pg_catalog.jsonb_array_length(p_audit -> 'relations') > 20000 or pg_catalog.jsonb_array_length(p_audit -> 'aiInsights') > 500 then raise exception 'audit item limit exceeded' using errcode = '22023'; end if;
  if p_stack is not null and pg_catalog.jsonb_typeof(p_stack) <> 'array' then raise exception 'invalid project stack' using errcode = '22023'; end if;
  if p_framework is not null and pg_catalog.char_length(p_framework) > 80 then raise exception 'invalid framework' using errcode = '22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text || ':' || p_request_id::text, 0));
  select a.id, a.project_id into v_audit_id, v_project_id from public.audits as a where a.owner_id = v_owner and a.request_id = p_request_id;
  if v_audit_id is not null then return query select v_audit_id, v_project_id; return; end if;

  if v_project_id is null then
    if p_project_name is null or pg_catalog.char_length(p_project_name) not between 1 and 120 then raise exception 'invalid project name' using errcode = '22023'; end if;
    insert into public.projects (owner_id, name, framework, stack) values (v_owner, p_project_name, p_framework, coalesce(p_stack, '[]'::jsonb)) returning id into v_project_id;
  elsif not exists (select 1 from public.projects as p where p.id = v_project_id and p.owner_id = v_owner) then
    raise exception 'project not found' using errcode = 'P0002';
  end if;

  insert into public.audits (
    project_id, owner_id, request_id, overall_score, grade,
    integrity_score, consistency_score, security_score, structure_score, dependency_score,
    coverage, file_count, analyzed_file_count, issue_count, summary,
    rule_version, score_version, ai_model, ai_status
  ) values (
    v_project_id, v_owner, p_request_id,
    (p_audit #>> '{scores,overall}')::numeric,
    p_audit #>> '{scores,grade}',
    (p_audit #>> '{scores,categories,DATA_INTEGRITY}')::numeric,
    (p_audit #>> '{scores,categories,CONSISTENCY}')::numeric,
    (p_audit #>> '{scores,categories,SECURITY}')::numeric,
    (p_audit #>> '{scores,categories,STRUCTURE}')::numeric,
    (p_audit #>> '{scores,categories,DEPENDENCY}')::numeric,
    p_audit -> 'coverage',
    (p_audit ->> 'fileCount')::integer,
    (p_audit ->> 'analyzedFileCount')::integer,
    pg_catalog.jsonb_array_length(p_audit -> 'issues'),
    p_audit -> 'summary',
    p_audit ->> 'ruleVersion', p_audit ->> 'scoreVersion', null, p_audit ->> 'aiStatus'
  ) returning id into v_audit_id;

  for v_issue in select value from pg_catalog.jsonb_array_elements(p_audit -> 'issues') loop
    if exists (select 1 from pg_catalog.jsonb_object_keys(v_issue) as keys(key) where key <> all(array['id','fingerprint','ruleId','detectionKind','category','severity','title','description','evidence','suggestion','locations'])) then raise exception 'unexpected issue field' using errcode = '22023'; end if;
    insert into public.audit_issues (id, audit_id, owner_id, fingerprint, rule_id, detection_kind, category, severity, title, description, evidence, suggestion)
    values ((v_issue ->> 'id')::uuid, v_audit_id, v_owner, v_issue ->> 'fingerprint', v_issue ->> 'ruleId', v_issue ->> 'detectionKind', v_issue ->> 'category', v_issue ->> 'severity', v_issue ->> 'title', v_issue ->> 'description', v_issue ->> 'evidence', v_issue ->> 'suggestion');
    for v_location in select value from pg_catalog.jsonb_array_elements(v_issue -> 'locations') loop
      insert into public.audit_issue_locations (issue_id, owner_id, file_path, line, "column")
      values ((v_issue ->> 'id')::uuid, v_owner, v_location ->> 'filePath', (v_location ->> 'line')::integer, (v_location ->> 'column')::integer);
    end loop;
  end loop;

  for v_relation in select value from pg_catalog.jsonb_array_elements(p_audit -> 'relations') loop
    if exists (select 1 from pg_catalog.jsonb_object_keys(v_relation) as keys(key) where key <> all(array['id','type','sourceKind','sourceValue','targetKind','targetValue','resolutionStatus','confidence','metadata'])) then raise exception 'unexpected relation field' using errcode = '22023'; end if;
    insert into public.audit_relations (id, audit_id, owner_id, relation_type, source_kind, source_value, target_kind, target_value, resolution_status, confidence, metadata)
    values ((v_relation ->> 'id')::uuid, v_audit_id, v_owner, v_relation ->> 'type', v_relation ->> 'sourceKind', v_relation ->> 'sourceValue', v_relation ->> 'targetKind', v_relation ->> 'targetValue', v_relation ->> 'resolutionStatus', v_relation ->> 'confidence', coalesce(v_relation -> 'metadata', '{}'::jsonb));
  end loop;

  for v_insight in select value from pg_catalog.jsonb_array_elements(p_audit -> 'aiInsights') loop
    if exists (select 1 from pg_catalog.jsonb_object_keys(v_insight) as keys(key) where key <> all(array['id','type','confidence','title','explanation','impact','suggestion','evidenceStatus','relatedFingerprints','locations'])) then raise exception 'unexpected insight field' using errcode = '22023'; end if;
    select coalesce(pg_catalog.array_agg(i.id), '{}'::uuid[]) into v_related_ids
      from public.audit_issues as i
      where i.audit_id = v_audit_id and i.owner_id = v_owner and i.fingerprint in (select value from pg_catalog.jsonb_array_elements_text(v_insight -> 'relatedFingerprints') as x(value));
    insert into public.audit_ai_insights (id, audit_id, owner_id, type, confidence, title, explanation, impact, suggestion, evidence_status, related_issue_ids, locations)
    values ((v_insight ->> 'id')::uuid, v_audit_id, v_owner, v_insight ->> 'type', v_insight ->> 'confidence', v_insight ->> 'title', v_insight ->> 'explanation', v_insight ->> 'impact', v_insight ->> 'suggestion', v_insight ->> 'evidenceStatus', v_related_ids, coalesce(v_insight -> 'locations', '[]'::jsonb));
  end loop;

  return query select v_audit_id, v_project_id;
end;
$$;
revoke all on function public.save_audit(uuid, uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_audit(uuid, uuid, text, text, jsonb, jsonb) to authenticated;

create function public.reserve_ai_request(p_request_id uuid) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_active boolean; v_count integer;
begin
  if v_owner is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_owner::text || ':ai-usage', 0));
  delete from public.ai_usage u where u.owner_id = v_owner and u.created_at <= pg_catalog.now() - interval '1 hour';
  select exists (select 1 from public.ai_usage u where u.owner_id = v_owner and u.finished_at is null and u.created_at > pg_catalog.now() - interval '1 hour') into v_active;
  if v_active then return 'IN_PROGRESS'; end if;
  select pg_catalog.count(*)::integer into v_count from public.ai_usage u where u.owner_id = v_owner and u.created_at > pg_catalog.now() - interval '1 hour';
  if v_count >= 10 then return 'RATE_LIMITED'; end if;
  insert into public.ai_usage (owner_id, request_id) values (v_owner, p_request_id);
  return 'RESERVED';
end;
$$;
revoke all on function public.reserve_ai_request(uuid) from public, anon;
grant execute on function public.reserve_ai_request(uuid) to authenticated;

create function public.finish_ai_request(p_request_id uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_usage set finished_at = pg_catalog.now()
  where owner_id = auth.uid() and request_id = p_request_id and finished_at is null;
$$;
revoke all on function public.finish_ai_request(uuid) from public, anon;
grant execute on function public.finish_ai_request(uuid) to authenticated;
