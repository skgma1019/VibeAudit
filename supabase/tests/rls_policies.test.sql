begin;
select plan(56);

insert into auth.users (id, instance_id, aud, role, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now()),
  ('20000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now());
insert into public.projects (id, owner_id, name) values
  ('11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'User A project'),
  ('22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'User B project');
insert into public.audits (
  id, project_id, owner_id, request_id, overall_score, grade,
  integrity_score, consistency_score, security_score, structure_score, dependency_score,
  coverage, file_count, analyzed_file_count, issue_count, rule_version, score_version, ai_status
) values
  ('11100000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-000000000001', 100, 'A', 100, 100, 100, 100, 100, '{}'::jsonb, 1, 1, 1, 'rules-v1', 'score-v1', 'IDLE'),
  ('22200000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '22220000-0000-4000-8000-000000000002', 100, 'A', 100, 100, 100, 100, 100, '{}'::jsonb, 1, 1, 1, 'rules-v1', 'score-v1', 'IDLE');
insert into public.audit_issues (id, audit_id, owner_id, fingerprint, rule_id, detection_kind, category, severity, title, description, evidence, suggestion)
values
  ('11110000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'a-fingerprint', 'R1', 'DETERMINISTIC', 'SECURITY', 'LOW', 'A title', 'A description', 'A evidence', 'A suggestion'),
  ('22220000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'b-fingerprint', 'R1', 'DETERMINISTIC', 'SECURITY', 'LOW', 'B title', 'B description', 'B evidence', 'B suggestion');
insert into public.audit_issue_locations (id, issue_id, owner_id, file_path, line, "column") values
  ('11111000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'src/a.ts', 1, 1),
  ('22222000-0000-4000-8000-000000000002', '22220000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'src/b.ts', 1, 1);
insert into public.audit_relations (id, audit_id, owner_id, relation_type, source_kind, source_value, target_kind, target_value, resolution_status, confidence, metadata) values
  ('11112000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'IMPORT', 'FILE', 'src/a.ts', 'FILE', 'src/x.ts', 'RESOLVED', 'HIGH', '{"evidence":"import","locations":[]}'),
  ('22223000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'IMPORT', 'FILE', 'src/b.ts', 'FILE', 'src/y.ts', 'RESOLVED', 'HIGH', '{"evidence":"import","locations":[]}');
insert into public.audit_ai_insights (id, audit_id, owner_id, type, confidence, title, explanation, suggestion, evidence_status) values
  ('11113000-0000-4000-8000-000000000001', '11100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'IMPROVEMENT', 'MEDIUM', 'A insight', 'A explanation', 'A suggestion', 'PARTIAL'),
  ('22224000-0000-4000-8000-000000000002', '22200000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'IMPROVEMENT', 'MEDIUM', 'B insight', 'B explanation', 'B suggestion', 'PARTIAL');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.projects), 1::bigint, 'user A sees only own projects');
select is((select count(*) from public.audits), 1::bigint, 'user A sees only own audits');
select is((select count(*) from public.audits where id = '22200000-0000-4000-8000-000000000002'), 0::bigint, 'user A cannot read user B audit');
select is((select count(*) from public.audit_issues), 1::bigint, 'user A sees only own issues');
select is((select count(*) from public.audit_issues where id = '22220000-0000-4000-8000-000000000002'), 0::bigint, 'user A cannot read user B issue');
select is((select count(*) from public.audit_issue_locations), 1::bigint, 'user A sees only own locations');
select is((select count(*) from public.audit_issue_locations where id = '22222000-0000-4000-8000-000000000002'), 0::bigint, 'user A cannot read user B location');
select is((select count(*) from public.audit_relations), 1::bigint, 'user A sees only own relations');
select is((select count(*) from public.audit_relations where id = '22223000-0000-4000-8000-000000000002'), 0::bigint, 'user A cannot read user B relation');
select is((select count(*) from public.audit_ai_insights), 1::bigint, 'user A sees only own AI insights');
select is((select count(*) from public.audit_ai_insights where id = '22224000-0000-4000-8000-000000000002'), 0::bigint, 'user A cannot read user B AI insight');
with changed as (update public.audit_issues set resolved = true where id = '22220000-0000-4000-8000-000000000002' returning id)
select is((select count(*) from changed), 0::bigint, 'user A cannot update user B issue');
with removed as (delete from public.audits where id = '22200000-0000-4000-8000-000000000002' returning id)
select is((select count(*) from removed), 0::bigint, 'user A cannot delete user B audit');
select throws_ok($$insert into public.projects (owner_id, name) values ('20000000-0000-4000-8000-000000000002', 'forged owner')$$, '42501', null, 'user A cannot insert a project for user B');
reset role;
select is((select count(*) from public.audits where id = '22200000-0000-4000-8000-000000000002'), 1::bigint, 'user B audit remains after user A delete attempt');

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.projects), 1::bigint, 'user B sees only own projects');
select is((select count(*) from public.projects where id = '11000000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A project');
select is((select count(*) from public.audits), 1::bigint, 'user B sees only own audits');
select is((select count(*) from public.audits where id = '11100000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A audit');
select is((select count(*) from public.audit_issues), 1::bigint, 'user B sees only own issues');
select is((select count(*) from public.audit_issues where id = '11110000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A issue');
select is((select count(*) from public.audit_issue_locations), 1::bigint, 'user B sees only own locations');
select is((select count(*) from public.audit_issue_locations where id = '11111000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A location');
select is((select count(*) from public.audit_relations), 1::bigint, 'user B sees only own relations');
select is((select count(*) from public.audit_relations where id = '11112000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A relation');
select is((select count(*) from public.audit_ai_insights), 1::bigint, 'user B sees only own AI insights');
select is((select count(*) from public.audit_ai_insights where id = '11113000-0000-4000-8000-000000000001'), 0::bigint, 'user B cannot read user A AI insight');
with changed as (update public.audit_issues set resolved = true where id = '11110000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from changed), 0::bigint, 'user B cannot update user A issue');
with removed as (delete from public.audits where id = '11100000-0000-4000-8000-000000000001' returning id)
select is((select count(*) from removed), 0::bigint, 'user B cannot delete user A audit');
select throws_ok(
  $$select * from public.save_audit(
    '33330000-0000-4000-8000-000000000003', null, 'injected', null, '[]'::jsonb,
    '{"owner_id":"10000000-0000-4000-8000-000000000001","issues":[],"relations":[],"aiInsights":[]}'::jsonb
  )$$,
  '22023', 'unexpected audit field', 'save_audit rejects client owner injection'
);
select is(
  (select audit_id::text from public.save_audit(
    '33330000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000002', null, null, '[]'::jsonb,
    '{"scores":{"overall":100,"grade":"A","categories":{"DATA_INTEGRITY":100,"CONSISTENCY":100,"SECURITY":100,"STRUCTURE":100,"DEPENDENCY":100}},"coverage":{},"fileCount":1,"analyzedFileCount":1,"ruleVersion":"rules-v1","scoreVersion":"score-v1","aiStatus":"IDLE","issues":[],"relations":[],"aiInsights":[]}'::jsonb
  )),
  (select audit_id::text from public.save_audit(
    '33330000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000002', null, null, '[]'::jsonb,
    '{"scores":{"overall":100,"grade":"A","categories":{"DATA_INTEGRITY":100,"CONSISTENCY":100,"SECURITY":100,"STRUCTURE":100,"DEPENDENCY":100}},"coverage":{},"fileCount":1,"analyzedFileCount":1,"ruleVersion":"rules-v1","scoreVersion":"score-v1","aiStatus":"IDLE","issues":[],"relations":[],"aiInsights":[]}'::jsonb
  )),
  'repeating save_audit request returns the same audit'
);
select is((select count(*) from public.audits where owner_id = auth.uid() and request_id = '33330000-0000-4000-8000-000000000003'), 1::bigint, 'repeating save_audit request creates one row');
select lives_ok(
  $$select * from public.save_audit(
    '77770000-0000-4000-8000-000000000007', '22000000-0000-4000-8000-000000000002', null, null, '[]'::jsonb,
    '{"scores":{"overall":100,"grade":"A","categories":{"DATA_INTEGRITY":100,"CONSISTENCY":100,"SECURITY":100,"STRUCTURE":100,"DEPENDENCY":100}},"coverage":{},"fileCount":0,"analyzedFileCount":0,"ruleVersion":"rules-v1","scoreVersion":"score-v1","aiStatus":"SKIPPED","summary":null,"issues":[],"relations":[],"aiInsights":[]}'::jsonb
  )$$,
  'save_audit accepts a JSON null summary for an AI-skipped audit'
);
select is(
  (select summary is null from public.audits where owner_id = auth.uid() and request_id = '77770000-0000-4000-8000-000000000007'),
  true,
  'JSON null summary is stored as SQL NULL'
);
select throws_ok(
  $$select * from public.save_audit(
    '88880000-0000-4000-8000-000000000008', '22000000-0000-4000-8000-000000000002', null, null, '[]'::jsonb,
    '{"scores":{"overall":100,"grade":"A","categories":{"DATA_INTEGRITY":100,"CONSISTENCY":100,"SECURITY":100,"STRUCTURE":100,"DEPENDENCY":100}},"coverage":{},"fileCount":0,"analyzedFileCount":0,"ruleVersion":"rules-v1","scoreVersion":"score-v1","aiStatus":"IDLE","summary":"not-an-object","issues":[],"relations":[],"aiInsights":[]}'::jsonb
  )$$,
  '23514', null, 'save_audit still rejects a non-object summary'
);
select lives_ok(
  $$select * from public.save_audit(
    '99990000-0000-4000-8000-000000000009', '22000000-0000-4000-8000-000000000002', null, null, '[]'::jsonb,
    '{"scores":{"overall":100,"grade":"A","categories":{"DATA_INTEGRITY":100,"CONSISTENCY":100,"SECURITY":100,"STRUCTURE":100,"DEPENDENCY":100}},"coverage":{},"fileCount":0,"analyzedFileCount":0,"ruleVersion":"rules-v1","scoreVersion":"score-v1","aiStatus":"SKIPPED","summary":null,"issues":[],"relations":[],"aiInsights":[]}'::jsonb
  )$$,
  'save_audit accepts a new audit for an existing project'
);
select is(
  (select project_id::text from public.audits where owner_id = auth.uid() and request_id = '99990000-0000-4000-8000-000000000009'),
  '22000000-0000-4000-8000-000000000002',
  'save_audit preserves the requested existing project id'
);
select is(public.reserve_ai_request('44440000-0000-4000-8000-000000000004'), 'RESERVED', 'first AI request is reserved');
select is(public.reserve_ai_request('55550000-0000-4000-8000-000000000005'), 'IN_PROGRESS', 'concurrent AI request is denied');
select public.finish_ai_request('44440000-0000-4000-8000-000000000004');
do $$
declare i integer; v_status text;
begin
  for i in 2..10 loop
    v_status := public.reserve_ai_request(pg_catalog.md5('rate-limit-' || i::text)::uuid);
    if v_status <> 'RESERVED' then raise exception 'expected RESERVED for request %, received %', i, v_status; end if;
    perform public.finish_ai_request(pg_catalog.md5('rate-limit-' || i::text)::uuid);
  end loop;
end;
$$;
select is((select count(*) from public.ai_usage where owner_id = auth.uid()), 10::bigint, 'AI usage records exactly ten requests');
select is(public.reserve_ai_request('66660000-0000-4000-8000-000000000006'), 'RATE_LIMITED', 'eleventh AI request is rate limited');
with changed as (update public.audit_issues set resolved = true where id = '22220000-0000-4000-8000-000000000002' returning resolved)
select is((select resolved from changed), true, 'user B can resolve own issue');
select is((select overall_score from public.audits where id = '22200000-0000-4000-8000-000000000002'), 100::numeric, 'resolved state change leaves saved audit score unchanged');
with changed as (update public.audit_issues set resolved = false where id = '22220000-0000-4000-8000-000000000002' returning resolved)
select is((select resolved from changed), false, 'user B can reopen own issue');
with removed as (delete from public.audits where id = '22200000-0000-4000-8000-000000000002' returning id)
select is((select count(*) from removed), 1::bigint, 'user B can delete own audit');
select is((select count(*) from public.audit_issues where id = '22220000-0000-4000-8000-000000000002'), 0::bigint, 'audit delete cascades issues');
select is((select count(*) from public.audit_issue_locations where issue_id = '22220000-0000-4000-8000-000000000002'), 0::bigint, 'audit delete cascades locations');
select is((select count(*) from public.audit_relations where id = '22223000-0000-4000-8000-000000000002'), 0::bigint, 'audit delete cascades relations');
select is((select count(*) from public.audit_ai_insights where id = '22224000-0000-4000-8000-000000000002'), 0::bigint, 'audit delete cascades AI insights');
reset role;

select ok(not has_table_privilege('anon', 'public.projects', 'select'), 'anon cannot select projects');
select ok(not has_table_privilege('anon', 'public.audits', 'select'), 'anon cannot select audits');
select ok(not has_table_privilege('anon', 'public.audit_issues', 'select'), 'anon cannot select issues');
select ok(not has_table_privilege('authenticated', 'public.audits', 'insert'), 'authenticated cannot bypass save_audit to insert audits');
select ok(not has_table_privilege('authenticated', 'public.audit_issues', 'delete'), 'authenticated cannot directly delete issues');
select ok(has_column_privilege('authenticated', 'public.audit_issues', 'resolved', 'update'), 'authenticated can update resolved state');
select ok(not has_column_privilege('authenticated', 'public.audit_issues', 'title', 'update'), 'authenticated cannot update issue evidence');

select * from finish();
rollback;
