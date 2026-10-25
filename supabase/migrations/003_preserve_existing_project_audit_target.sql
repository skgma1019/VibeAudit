-- Keep the caller's project id when the idempotency lookup finds no prior audit.
create or replace function public.save_audit(
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
  v_existing_project_id uuid;
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
  select a.id, a.project_id into v_audit_id, v_existing_project_id from public.audits as a where a.owner_id = v_owner and a.request_id = p_request_id;
  if v_audit_id is not null then
    v_project_id := v_existing_project_id;
    return query select v_audit_id, v_project_id;
    return;
  end if;

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
    nullif(p_audit -> 'summary', 'null'::jsonb),
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
