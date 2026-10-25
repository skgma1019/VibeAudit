# VibeAudit MVP 개발 계획

작성일: 2026-10-21

> Stages 0-8 repository-side work is complete. Anonymous Auth and remote API/RPC integration checks now pass with a safe synthetic fixture. pgTAP remains NOT VERIFIED because Docker/Podman is unavailable, and browser E2E remains NOT VERIFIED because no browser is connected. Summary-null persistence and existing-project saves are fixed by migrations 002 and 003 and verified remotely.
> 제품 범위는 PRD.md, 기술 선택은 TECH_STACK.md, UI/UX는 DESIGN.md를 기준으로 한다.

## 1. 현재 상태

- 루트 파일: PRD.md, TECH_STACK.md, DESIGN.md. 기존 구현 코드, package.json, TODO.md는 없었다.
- Current additions: stages 0–7 application code and stage 8 integration/deployment documentation and local verification are complete. Hosted migration/catalog, authenticated owner-scoped API CRUD, idempotency, live Gemini, and AI rate-limit RPC are verified. Browser E2E and pgTAP remain NOT VERIFIED due unavailable browser and Docker/Podman.
- 아래 파일명과 구성은 제안이며, 패키지 버전과 배포 한도는 구현 시 공식 문서로 확인한다.

## 2. 요구사항 대조와 MVP 범위

| 영역      | PRD 요구                      | 기술/디자인 반영                | MVP 구현 경계                                                  |
| --------- | ----------------------------- | ------------------------------- | -------------------------------------------------------------- |
| 입력      | 로컬 폴더 선택, 필터링        | 디렉터리 input, 요약/트리       | Chrome/Edge 우선, 드롭은 필수 아님                             |
| 탐지/파싱 | JS/TS/React/Next/Node         | TypeScript Compiler API         | 실행 없는 AST 분석, 지원하지 않는 구문은 미분석 표시           |
| 관계      | import/API/DB/환경변수/의존성 | 자체 Relation Engine, 관계 목록 | 정적으로 해석 가능한 경로/호출 중심, 동적 관계는 추정/미해석   |
| 검사      | 5개 카테고리                  | Rule Engine + Gemini            | 모든 카테고리에 기본 규칙 제공, 완전한 타입/취약점 검증은 아님 |
| 결과      | 점수, 위치, 근거, 제안        | 대시보드/상세/필터/파일 트리    | Rule 탐지와 AI Insight를 데이터와 화면에서 구분                |
| 이력      | 저장/조회/해결/삭제, 재검사   | Supabase, 이력 차트             | 같은 프로젝트의 점수 변화/직전 점수 비교; 상세 비교 엔진 제외  |
| 보호      | .env 원문 전송 금지           | 서버 전용 Gemini 키             | 소스 영구 저장 금지, 전송/저장 전 민감정보 제거                |

MVP 이후: GitHub URL, ZIP, Python, Java/Spring, 프로젝트 간 비교, 상세 diff, 사용자 규칙, Actions, 자동 검사, 자동 수정 코드 생성, 리포트 내보내기.

## 3. 권장 아키텍처와 데이터 계약

흐름:

브라우저 폴더 선택 → 경로/확장자/크기 필터 → 로컬 Secret 탐지 및 마스킹 → Web Worker AST 분석 → 관계 생성 → Rule Engine → 정제된 분석 요약/필요 최소 코드 조각을 서버에 전송 → 서버 재검증/재마스킹 → Gemini → Zod 검증 → Score Engine → 결과 표시 → 소유자 범위로 결과 저장.

- Next.js App Router + TypeScript + React + Tailwind + shadcn/ui를 사용한다.
- TypeScript Compiler API는 브라우저 Worker에서 우선 사용한다. UI 정지를 방지하고 전체 소스의 서버 전송을 줄인다. 번들/메모리 측정 결과에 따라 제한된 정제 파일만 서버에서 파싱하는 대안을 재검토한다.
- 원본 File/소스는 브라우저 메모리에만 보관하며 프로젝트 해제 시 참조를 정리한다. IndexedDB/localStorage/서버 파일시스템/DB에 원본을 저장하지 않는다.
- 서버는 Gemini 호출, 인증/권한, 요청 검증, 점수 검증과 결과 저장을 담당한다. Gemini 키는 server-only 모듈에서만 읽는다.
- 서버에 전달된 사용자 분석 결과는 신뢰할 수 없는 입력이다. 점수 계산은 서버에서 재수행하되, 결과 자체가 위변조 불가능한 인증 보고서임을 보장하지 않는다.
- 파싱/룰/관계/점수 모듈은 UI 및 DB와 분리해 고정 fixture로 검증한다.
- 정적 분석 완료 후 AI 실패 시에도 Rule 결과를 표시한다. AI 상태를 complete/failed/skipped 등으로 보존한다.
- 진행률은 실제 단계 이벤트에 연결한다. Gemini 대기 시간에 허구의 정확한 완료율을 표시하지 않는다.

### 타입과 저장 모델 보완

- ProjectFile: 정규화 상대 경로, 확장자, 크기, 파일 종류. 소스는 별도 메모리 전용 타입으로 분리.
- CodeRelation: source/target/type, 위치, resolutionStatus, confidence, 근거. 파일 외 API/DB/ENV 노드를 표현한다.
- RuleIssue: origin=RULE, ruleId, detectionKind=DETERMINISTIC 또는 HEURISTIC, severity, category, locations[], 마스킹된 evidence.
- AIInsight: origin=AI, confidence, relatedIssueIds[], locations[], explanation/suggestion. AI가 기존 Rule 근거를 수정하거나 확정 판정으로 승격하지 못하게 한다.
- 공통 Issue 표시 모델: origin, detectionKind, locations[], resolved, fingerprint. 패턴 탐지는 패턴 존재를 확인한 것이며 실제 취약점 확정과 구별한다.
- 프로젝트: 기존 제안 필드 + owner_id. 폴더명만으로 동일 프로젝트를 자동 판정하지 않고 사용자가 이력의 프로젝트를 선택한다.
- 감사: 기존 점수/요약 + analysis_status, coverage, rule_version, score_version, ai_model, ai_status. 원본 파일/프롬프트/전체 응답을 저장하지 않는다.
- 이슈: 기존 필드 + origin, detection_kind, confidence, fingerprint, related_issue_ids. 여러 위치는 audit_issue_locations 자식 테이블로 저장한다.
- 관계: 정제한 노드/관계를 audit_relations에 저장해 이력에서도 관계 화면을 제공한다. 원본 코드 본문은 저장하지 않는다.
- 점수는 고유 Rule 이슈로 계산하고 AI 단독 추론은 별도 표시한다. 확정 정책: 심각도별 10/5/2/1 감점, 카테고리별 0~100, Overall은 카테고리 평균. 세부 계약은 docs/analysis-contract.md를 따른다.
- 중복 탐지는 fingerprint로 제거한다. 미지원/미분석은 정상 통과로 간주하지 않고 coverage에 표시한다. resolved 변경은 과거 점수를 바꾸지 않으며 재검사로 점수 변화를 확인한다.
- 이력 점수는 버전이 다르면 직접 비교에 제한이 있음을 표시한다. 원본이 없으므로 새로고침/과거 결과에서 재검사는 폴더 재선택이 필요하다.

## 4. 단계별 TODO와 파일 변경 계획

Stages 0-8 implementation and remote integration verification are complete except browser E2E and pgTAP. Remote migrations 001-003 match local.

### 0단계 — 구현 전 계약 확정

- [x] 사용자에게 이 계획을 확인받는다.
- [x] Supabase Auth 사용을 확정한다. 실제 연결/인증은 7단계에 구현하고 로그인 방식도 그 단계에서 결정한다. 현재는 소유권 계약만 설계한다.
- [x] 점수/중복 제거/미분석 표시/Rule과 AI 구분 계약을 확정한다.
- [x] 초기 제한은 파일당 512 KiB, 총 텍스트 10 MiB, 대상 1,000개로 확정하고 src/lib/project/limits.ts로 분리한다. AST 시간/메모리는 3단계, AI 예산은 5단계에서 성능/모델 한도 확인 후 확정한다. 취소/미완료 표시는 분석 계약에 정의한다.
- [x] 생성: docs/analysis-contract.md, docs/privacy-boundary.md, docs/rule-catalog.md.
- [x] 수정: TODO.md의 합의 결과. 원래 세 문서는 승인 없이 덮어쓰지 않는다.

완료 기준: 데이터 전송/저장 범위, 인증, 탐지 수준과 점수 정책이 문서화되어 있다.

### 1단계 — 앱 기반과 디자인 시스템

- [x] Next.js/TypeScript/npm/ESLint/Prettier를 설정한다. 기존 Git 저장소를 사용하며 init/remote 변경은 하지 않는다.
- [x] 다크 테마, 색상/폰트 토큰, 공통 레이아웃, 반응형 Sidebar/Drawer 구성.
- [x] 생성: package.json, package-lock.json, tsconfig.json, next.config.ts, next-env.d.ts, eslint.config.mjs, .prettierrc.json, .gitignore, .env.example, components.json, README.md.
- [x] 생성: src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/components/layout/{Header,Sidebar,DashboardLayout}.tsx, src/components/ui/*, src/lib/utils.ts.
- [x] .env.example에는 변수 이름과 빈 값만 작성한다. GEMINI_API_KEY에 NEXT_PUBLIC_ 접두어를 붙이지 않는다.

완료 기준: 반응형 기본 화면과 접근성 키보드 이동, typecheck/lint/build 통과.

검증 기록: typecheck/lint/build/format:check 모두 최종 통과(2026-10-21). 프로덕션 audit 0건, 개발용 braces 경로 high 5건은 패치 미제공으로 README에 기록했다. 연결된 브라우저가 없어 실제 반응형 화면 및 키보드/모바일 Drawer 동작 검증은 미수행이며 코드에 focus 스타일, skip link, Radix 접근성 구조를 적용했다.

- [ ] 실제 브라우저에서 데스크톱/모바일 레이아웃과 키보드/Drawer 동작을 확인한다. 브라우저 미연결에 따른 검증 잔여 항목이며 2단계 기능 구현과는 별개다.

### 2단계 — 폴더 선택, 필터, 개인정보 경계

- [x] webkitdirectory로 명시적으로 선택한 파일만 읽고 경로를 정규화한다.
- [x] node_modules/.git/.next/dist/build/coverage/.cache, 바이너리/미지원 파일을 제외한다.
- [x] .env 및 .env.* 실제 파일은 읽기/전송 대상에서 제외한다. .env.example만 예외 허용하되 값은 제거한다.
- [x] 키 파일/인증서/자격증명 파일을 제외하고 허용 텍스트 내부의 Secret 후보를 로컬 탐지한다. 출력 근거에는 실제 값을 남기지 않는다.
- [x] 파일 수/바이트 제한을 내용 읽기 전에 검사하고 제외 이유/분석 대상을 표시한다.
- [x] 생성: src/lib/project/{scan,filter,paths,detect,limits}.ts, src/lib/security/{redact,secrets}.ts, src/types/project.ts.
- [x] 생성: src/components/project/{FolderPicker,ProjectSummary,FileTree,StackBadge}.tsx.
- [x] 수정: src/app/page.tsx.
- [x] ProjectWorkspace/useProjectSelection으로 처리 상태, 취소, 재선택과 메모리 정리를 연결한다. 원본 대신 마스킹된 텍스트만 현재 페이지 메모리에 유지한다.
- [x] 기존 TypeScript + Node 내장 test runner로 핵심 함수/스캔 테스트 11개를 추가한다. 새 패키지/E2E 도구는 설치하지 않는다.

완료 기준: 중첩 디렉터리, Windows 경로, 대소문자/중복 경로, 초과 파일, .env 계열/Secret fixture의 차단과 마스킹 검증.

검증 기록(2026-10-21): 테스트 11개와 typecheck/lint/build/format:check 통과. 분석 API/네트워크 전송/브라우저 저장소/사용자 코드 실행은 추가하지 않았다. 민감/제외/미지원/제한 초과 파일의 비읽기, 동시 읽기 최대 4개, 실패 격리, 취소를 검증했다.

- [ ] 실제 브라우저에서 폴더 선택 → 요약 → 파일 트리 → 제외/민감 상태 → 다른 폴더 재선택 흐름을 확인한다. 현재 연결된 브라우저가 없어 미수행이다.

### 3단계 — 정적 분석과 관계 엔진

- [x] Extract JS/TS import/export, fetch, Next API routes, environment references, object fields, database calls, and TODO/FIXME comments in a Worker.
- [x] Resolve constrained package.json/tsconfig aliases and relative paths without executing configuration.
- [x] Extract the supported SQL and Prisma declarations/fields and document their limits.
- [x] Create IMPORT/API_CALL/ROUTE_HANDLER/DATABASE/ENV/DEPENDENCY/SCHEMA_DEFINITION relations with source locations.
- [x] Record unresolved dynamic imports/URLs/SQL, external APIs, and complex re-exports/aliases.
- [x] Add src/workers/analysis.worker.ts and src/lib/analysis/{parser,extractors,resolver,schema-extractors}.ts plus src/types/analysis.ts. Worker protocol types live in the shared types file; relation building lives in parser.
- [x] Add cancellable analysis hook and preview UI for progress, coverage, and unresolved relations.
- [x] Test frontend fetch to Next route to DB fixture, import/API aliases/dynamic imports/env, Supabase/Prisma calls, and malformed source/schema.

Completion: Static relation fixtures, unresolved handling, Worker cancel/failure/cleanup, typecheck/lint/test/build/format verified. Browser interaction remains a manual check.
Verification: npm test passed 15 tests; typecheck, lint, format:check, and build passed (2026-10-21). Browser was unavailable for manual folder selection and Worker cancel verification.

### 4단계 — 5개 카테고리 Rule/점수 엔진

- [x] Implement structure rules for package.json, README.md, conditional .env.example, and grouped TODO/FIXME markers.
- [x] Implement masked-secret, client private-env, and limited AST dangerous-pattern rules.
- [x] Implement connected frontend/API response field candidates, parsed schema SELECT checks, and unresolved static local API route candidates.
- [x] Implement conservative API response-shape consistency checks with at least three route samples and a majority pattern.
- [x] Implement undeclared package import and heuristic unused dependency rules; account for Node builtins, type-only imports, and framework/tooling exceptions.
- [x] Implement deterministic issue fingerprints, deduplication, contract severity penalties, category/overall scores, grades, and separate coverage status.
- [x] Add Zod validation for RuleIssue/AuditResult and a local Rule Result Preview after static analysis.
- [x] Add positive/negative tests for rule behavior, acceptance field mappings, severity, duplicate scoring, grade boundaries, and coverage.
- [x] Add src/lib/rules/**, src/lib/audit/{score,deduplicate}.ts, src/schemas/audit.ts, src/types/audit.ts, src/components/audit/RuleResultPreview.tsx, and tests/rules.test.ts.
- [x] Update docs/rule-catalog.md and README.md with implemented rules and limits.

Completion: All category fixtures, deduplication, scoring, coverage, Zod boundary validation, typecheck/lint/test/build/format checks pass. Browser interaction remains a manual check.
Verification: npm test passed 35 tests; typecheck, lint, format:check, and build passed (2026-10-21). Browser was not connected, so selecting a folder and clicking Analyze Project/Run Audit were not manually verified.

- [ ] Browser manual flow: select project, analyze, review relations, run audit, inspect scores/issues, and reselect another project to confirm state reset.

### 5단계 — 서버 Gemini 연동

- [x] 입력 계약/전송 고지 UI와 서버 Zod 검증, Gemini 직전 재마스킹을 구현한다.
- [x] 요약/관계/최소 근거를 우선 전송하고 이슈/관계/스니펫/payload 예산을 적용한다. 제외 범위를 AI coverage로 보고한다.
- [x] Structured Output을 검증하고 존재하지 않는 파일/행/관련 이슈 참조를 제거하거나 근거 미확인으로 표시한다.
- [x] 25초 타임아웃, 429/5xx 최대 1회 재시도, 브라우저 요청 취소, 중복 클릭 차단 및 AI 실패 fallback을 구현한다. 5단계에서는 인증 전 Production AI를 비활성화했다. 7단계에서 인증 사용자 전용 호출과 DB 공유 rate limit으로 전환했다.
- [x] 코드 주석/README 등의 명령을 비신뢰 데이터로 취급하고 AI 도구/URL 접근을 설정하지 않는다.
- [x] 생성: src/app/api/analyze/route.ts, src/lib/server/{env,gemini,analysis-service}.ts, src/lib/ai/{constants,prompt,payload}.ts, src/schemas/{analyze,ai}.ts, src/types/ai.ts, src/components/project/AnalysisDisclosure.tsx, src/components/audit/AIAnalysisPanel.tsx.
- [x] 검증: mock 응답, 마스킹, reference validation, retry/fallback와 bundle 키 식별자 검사를 자동화한다. 실 Gemini 호출과 실제 브라우저 검증은 수행하지 않는다.

제한: 서버 내 메모리/IP map은 전역 rate limit으로 간주하지 않는다. 7단계에서 authenticated session 및 공유 DB rate limit을 추가해 AI 요청을 인증된 사용자로 제한한다. Gemini 제공자 과금/보관 정책과 프로덕션 배포 보안 확인은 stage 8에서 검토한다.

완료 기준: Secret 비전송, 키 클라이언트 번들 미포함, 비정상 JSON/429/timeout/프롬프트 주입/AI 실패 fallback 검증. 자동 테스트는 모의 AI 응답 사용.

### 6단계 — 감사 대시보드와 탐색 UX

- [x] 한 번의 Run Audit으로 Worker 분석 후 로컬 Rule Engine을 실행하고 실제 파일 수 진행/취소/오류 상태를 표시한다.
- [x] Overview에서 Overall/카테고리/등급/카테고리별 감점/coverage/심각도 요약을 제공한다.
- [x] Issue Explorer에서 severity/category/detection kind/origin을 필터링하고 근거/위치/제안을 표시한다. AI 잠재 발견은 별도 no-score 후보로 표시한다.
- [x] Files에서 기존 FileTree를 재사용해 파일별 Rule issue 수와 선택 파일 요약을 표시한다. 소스 본문은 표시하지 않는다.
- [x] Relations에서 기존 분석 결과를 종류별로 탐색하고 해석 상태/근거/파일 위치를 표시한다. 그래프 라이브러리 없이 단순 목록을 사용한다.
- [x] AI Analysis 패널을 통합하고 AI 실패가 Rule 결과에 영향을 주지 않도록 별도 표시한다. 선택 폴더/감사 결과가 바뀌면 이전 AI UI 상태를 해제한다.
- [x] 빈 상태/coverage 제한/키보드 포커스/반응형 레이아웃과 History 비활성 상태를 구현한다.
- [x] 생성: src/components/audit/AuditWorkspace.tsx, src/lib/audit/dashboard.ts, tests/dashboard.test.ts.
- [x] 수정: src/app/page.tsx, src/components/project/ProjectWorkspace.tsx, src/components/project/FileTree.tsx, src/components/audit/AIAnalysisPanel.tsx, src/components/layout/Sidebar.tsx, src/hooks/useProjectSelection.ts, README.md, package.json, tsconfig.test.json.
- [x] 가짜 auditId URL/영속 저장은 만들지 않고 현재 세션 메모리에 결과를 유지한다. 재검사는 폴더 재선택을 요구한다.

완료 기준: 선택 → 분석 → 근거/제안 탐색 흐름을 구현하고 자동 검증했다. 이 환경에서 연결된 브라우저가 없어 데스크톱/모바일 수동 확인은 미완료다.

검증 기록(2026-10-21): typecheck, lint, format:check, build 통과. npm test 52개 통과. 브라우저 연결이 없어 UI 수동 검증은 수행하지 않았다.

- [ ] Browser manual flow: folder selection, one-click audit, Overview/Issues/Files/Relations/AI tabs, AI unavailable fallback, new-folder selection, keyboard and mobile responsive layout.

### 7단계 — Supabase 이력/해결/삭제

- [x] 공식 @supabase/ssr browser/server client, cookie session refresh proxy, anonymous sign-in single-flight 및 서버 `getUser()` 검증을 적용한다. Auth UI/OAuth는 추가하지 않는다.
- [x] 생성: projects, audits, audit_issues, audit_issue_locations, audit_relations, audit_ai_insights, ai_usage 스키마와 조회 인덱스, 복합 owner FK, cascade 삭제, grants와 operation별 RLS 정책.
- [x] DB 접근을 auth-checked API와 server repository에 격리하고 owner_id는 검증된 서버 user에서만 사용한다. owner_id 요청 필드는 엄격 스키마가 거부한다.
- [x] 저장 DTO는 메모리 ProjectMetadata/AnalysisResult/AuditResult/선택적 AI 요약만 허용한다. 서버에서 Secret 후보를 재마스킹하고 절대 경로·상위 경로·실제 .env 및 credential 경로를 거부한다. 원본 파일/전체 Gemini prompt/raw response 필드는 허용하지 않는다.
- [x] `save_audit` SECURITY DEFINER RPC 한 번으로 프로젝트/감사/이슈/위치/관계/AI insight를 트랜잭션 저장하고 request ID unique + advisory lock으로 재시도 중복을 막는다. Rule issue만으로 점수를 서버 재계산하며 AI 단독 Insight는 감점하지 않는다.
- [x] 구현: 프로젝트 목록/생성, 감사 저장/History/상세 조회, resolved 토글/되돌리기, 확인 Dialog를 거친 Audit 삭제와 cascade 자식 정리.
- [x] History에서 프로젝트 필터와 동일 프로젝트 점수 추세를 보여준다. score version이 다르면 비교 한계를 안내한다.
- [x] 저장 오류에도 현재 탭의 메모리 Audit을 유지하고 같은 request ID로 재시도할 수 있게 한다. 과거 Audit은 소스 없이 조회한다.
- [x] 인증 사용자만 AI endpoint를 호출하고 DB 원자적 RPC로 계정별 시간당 10회 및 동시 1건을 제한한다. 미설정/인증/제한 오류는 Rule 결과에 영향을 주지 않는다.
- [x] 생성: `src/lib/supabase/{browser,server,auth-client}.ts`, `src/lib/server/{auth,audit-repository,http}.ts`, `src/lib/audit/persistence.ts`, `src/schemas/persistence.ts`, `src/types/database.ts`, `src/components/auth/SupabaseAuthProvider.tsx`.
- [x] 생성: projects/audits/issues API, `src/app/history/page.tsx`, `src/app/audits/[auditId]/page.tsx`, History/ScoreTrend/Detail/SaveAudit UI, `supabase/migrations/001_initial_schema.sql`, `supabase/tests/rls_policies.test.sql`.
- [x] `tests/persistence.test.ts`로 허용 필드, 원본/소유자/prompt 필드 거부, 상대경로 검증, Secret 재마스킹, Rule 점수 기본값을 검증한다.
- [x] 기존 Supabase 프로젝트에 migration `001`을 적용했다. 실제 2-user RLS 시나리오 실행은 Docker 미설치로 미완료다.
- [x] 실제 anonymous session으로 API History/save/idempotency/resolved/delete 및 AI rate limit을 확인했다. [ ] 브라우저 앱이 연결되지 않아 화면 기반 사용자 흐름은 NOT VERIFIED.

완료 기준(코드): 서버 인증과 owner-scoped API, 원자적 저장/멱등성, RLS/grants migration, audit 삭제 전파, 허용 목록 저장 payload 및 자동 경계 테스트를 준비했다. 실제 DB/RLS와 browser 검증은 위 환경 의존 항목이 남았다.

### 8단계 — 통합 검증과 배포 준비

- [x] 현재 환경/저장소/Node/npm/환경변수 이름/CLI/config/Docker를 값 노출 없이 확인한다. 현재 `.env.local`에는 Gemini key, Supabase URL, publishable key가 설정되어 있고 legacy anon key는 없다. Supabase CLI 2.121.0과 `supabase/config.toml`을 생성했다. Git remote는 읽기만 했고 변경하지 않았다.
- [x] 공식 CLI 방식으로 기존 migrations/tests를 보존하며 `supabase init`을 수행한다. CLI와 Node 24.11은 현재 실행 가능하다.
- [x] 로컬 Supabase Auth config에서 Anonymous Sign-Ins를 활성화하고, pgTAP을 양방향 두 사용자 격리, 제한된 grants, `save_audit` owner 주입/멱등성, AI 10회/동시 실행 제한, resolved 점수 불변성, 삭제 cascade까지 확장했다. 테스트 plan과 assertion 수는 51로 일치한다. SQL은 아직 실행되지 않았다.
- [x] CLI login과 기존 VibeAudit project link를 확인했다. `migration list`에서 local/remote `001` 일치, dry-run에서 `001_initial_schema.sql`만 대상으로 확인한 뒤 migration을 적용했다. 첫 적용에서 예약어 `column` 오류가 나 인용 처리해 수정 후 적용했다.
- [x] 원격 `signInAnonymously()` 및 authenticated SSR session 생성 PASS.
- [x] 원격 카탈로그에서 7개 public table 모두 RLS 활성, 27개 정책 모두 `auth.uid()` owner binding을 확인했다.
- [x] 두 번째 익명 사용자로 첫 사용자의 고유 fixture project를 조회했을 때 RLS가 행을 숨겼다. 두 사용자 격리 pgTAP 전체 실행은 Docker/Podman 부재로 NOT VERIFIED.
- [x] 원격 grants 조회: anon의 project/audit/issue SELECT 차단, authenticated 직접 audit insert 및 issue delete 차단, resolved 컬럼 UPDATE만 허용하고 issue evidence UPDATE는 거부됨을 확인했다.
- [x] 원격 스키마 컬럼 검사에서 source body, file content, prompt, raw response, secret/credential 저장 컬럼이 없음을 확인했다.
- [x] 합성 Audit row의 실제 저장 필드를 조회해 source body, Secret 패턴, prompt/raw response 필드가 없음을 확인했다. 원격 스키마 컬럼 검사도 PASS.
- [x] Gemini 실제 호출 1회 PASS (`COMPLETE`); 응답의 summary/issueInsights/potentialIssues가 반환됐고 Structured Output 및 서버 Zod 검증을 통과했다. 안전한 합성 설명만 전송했다.
- [ ] `npx supabase test db --linked`를 시도했으나 Docker/Podman이 없어 실행할 수 없었다. pgTAP 51 assertions 및 RLS 행 격리는 NOT VERIFIED.
- [x] Audit save, History 단일 항목 확인, Detail, resolved true/false와 score 불변, Audit delete 및 issue/location/relation/AI insight cascade, 같은 request ID 재호출 idempotency PASS. AI limit은 동시 1건 차단, 10회 예약, 다음 요청 `RATE_LIMITED` PASS.
- [x] publishable key만 사용한 unauthenticated REST 읽기 요청은 7개 테이블 모두 PostgreSQL `42501`로 거부됐다.
- [ ] Browser E2E, Chrome/Edge folder picker, Desktop/Tablet/Mobile, accessibility 사용자 검증은 browser inventory에 apps/browsers가 없어 NOT VERIFIED.
- [x] `npm test` 58/58, `typecheck`, `lint`, `format:check`, `build` 통과. `npm audit --omit=dev` 0건; 전체 audit의 high 5건은 개발 도구 ESLint 경로다.
- [x] 클라이언트 bundle에서 secret/env key 패턴 및 실제 GEMINI key 값 포함 여부를 비노출 검사한다. (결과는 아래 검증 기록을 유지한다.)
- [x] 생성/수정: `supabase/config.toml`, `supabase/migrations/001_initial_schema.sql`, `supabase/tests/rls_policies.test.sql`, `docs/deployment.md`, README.md, TODO.md, `.prettierignore`, package.json, package-lock.json. Supabase CLI를 dev dependency로 정확한 버전 고정; CLI 임시 `.temp` 파일은 formatter에서 제외.
- [x] Vercel 공식 Function 한도와 Gemini 공식 model catalog를 확인하고 배포 안내에 출처와 현재 값을 기록했다. AI request budget은 64 KiB (payload char cap 48,000)로 공식 4.5 MB body cap보다 작다.
- [ ] 실제 Vercel 환경변수, hosted Auth/rate limit, deploy, post-deploy smoke test는 NOT VERIFIED이며 배포하지 않았다.

완료 기준(저장소/DB 준비): CLI 설정, hosted migration, grants/RLS catalog, anonymous-authenticated API/RPC 및 안전한 Gemini 통합 검증을 완료했다. pgTAP은 Docker/Podman 부재, Browser E2E는 브라우저 연결 부재로 NOT VERIFIED다. `summary: null` 저장 경계 오류도 해결되지 않아 기록한다. 외부 검증을 전부 완료로 간주하지 않는다.

검증 기록(2026-10-21): Hosted migration `001` is applied and `migration list` matches local/remote. Remote catalog confirms 7/7 RLS enabled, 27/27 owner-bound policies, restricted grants, no source-body/prompt/secret columns, and anonymous REST reads denied on all 7 tables. Anonymous sign-in and authenticated SSR session PASS. Safe synthetic Audit save, idempotent retry, History, Detail, resolved true/false with unchanged score, deletion/cascade and database privacy checks PASS; a second anonymous user could not see the first user's fixture project. One safe Gemini request returned COMPLETE with a validated structured result and one issue insight; stored Rule score remained unchanged. The DB RPC allowed one in-progress request, 10 hourly reservations, then returned RATE_LIMITED. The fixture Audit, children, owning anonymous test user, project, and usage rows were deleted after checks. A separate valid API request with `summary: null` returned 500 (`audits_summary_check`); the successful smoke test used a non-null synthetic summary, and this edge case remains a FAIL requiring a later fix. Docker/Podman is absent, so `supabase test db --linked` and pgTAP remain NOT VERIFIED. Browser inventory has no apps/browsers; Browser E2E remains NOT VERIFIED. No deployment was made. Final local checks: 58 tests, typecheck, lint, format:check, build, and `git diff --check` PASS.

## 5. 충돌/난점과 대안

1. 필드명이 다르다는 사실만으로 데이터 불일치를 확정할 수 없다. 변환 매핑/별칭/런타임 데이터를 고려할 수 없는 경우 후보로 표시하고 연결 근거를 함께 제공한다.
2. 모든 JS/TS 프레임워크/DB 관계를 완전히 복원하는 것은 MVP 범위를 넘는다. Next route/리터럴 fetch/식별 가능한 DB 호출을 우선 지원하고 미해석을 보고한다.
3. TECH_STACK의 DB 예시는 소유권, AI 출처, 다중 파일 위치, 관계/버전 정보가 부족하다. 위 스키마 보완 없이는 DESIGN의 상세/이력 UX를 충족하기 어렵다.
4. PRD 핵심 목표의 이전 검사 비교와 확장의 프로젝트 비교를 구별한다. MVP는 같은 프로젝트의 점수 이력, 상세 구조/이슈 diff는 후속으로 둔다.
5. DESIGN의 폴더 드롭과 실제 디렉터리 선택 지원은 다르다. MVP는 명시된 input 선택을 기본으로 하고 미지원 환경 안내를 제공한다.
6. 브라우저 AST는 번들/메모리 비용이 크다. Worker/파일 제한/단계별 처리부터 적용하고 성능 측정 후 서버 파싱 대안을 판단한다.
7. 소스 영구 미저장과 코드 근거 표시를 동시에 만족하려면 DB 근거는 마스킹된 짧은 구조적 설명/필드명/위치 중심이어야 한다. 전체 파일 열람은 현재 선택 세션에서만 제공한다.
8. AI의 비결정성과 장애를 점수에 직접 반영하면 재검사 비교가 흔들린다. 기본 점수는 버전이 고정된 Rule 결과로 계산하고 AI는 별도 제안으로 제공한다.
9. .env.example/.md/.json/코드에도 실제 키가 있을 수 있다. 확장자 제외만으로 보호하지 못하므로 내용 정제와 최소 전송을 중첩 적용한다. Secret 탐지의 완전성을 보장할 수 없음을 전송 고지에서 설명한다.
10. 서버리스 메모리 기반 rate limit은 전역 제한을 보장하지 않는다. 인증별 DB 원자적 카운터 등 공유 저장 방식으로 비용 상한을 구현한다.

## 6. 보안 체크리스트

- [ ] Gemini 키/서버용 Supabase 비밀키를 서버 전용으로 격리하고 공개 번들/응답/로그에서 제외한다. 가능한 한 사용자 세션+RLS를 사용한다.
- [ ] .env 실제 값, 하드코딩 Secret, 인증 토큰, 개인키를 클라이언트 UI/전송/DB/오류/로그/분석 도구에 노출하지 않는다. 근거는 마스킹하고 해시로 비밀값을 대체 저장하지 않는다.
- [x] 상대 경로만 사용하고 절대 경로, ../, credential/실제 .env 경로, 비정상 경로를 거부한다. 저장 위치는 상대 경로뿐이다. 파일명 개인정보 전체 제거는 보장하지 않는다.
- [x] 업로드 코드를 실행/eval/import하지 않고 package scripts/Next 설정/플러그인을 실행하지 않는다. 분석 대상 URL로 서버가 요청하지 않게 한다.
- [x] 파일 수/바이트/AST 기록/요청 크기/AI 예산/사용자별 AI 동시 실행을 제한한다. 파싱 실패는 coverage gap으로 표시한다.
- [x] API/AI/DB 경계에서 Zod 검증, 허용 필드만 직렬화, Secret 후보 마스킹 재검증을 적용한다.
- [x] 프로젝트 데이터/AI 출력을 HTML로 실행하지 않고 React 텍스트로 표시한다. raw HTML/Markdown 렌더러는 추가하지 않았다.
- [x] 코드에서 인증, owner-scoped query, RLS policy/grants, IDOR 404, same-origin mutation, DB 기반 호출 제한을 적용했다. 실제 DB에 migration을 적용한 뒤 2-user 검증은 미실행이다.
- [ ] 서버/플랫폼 로깅과 에러 추적에서 요청 본문, 코드/프롬프트/응답 덤프를 비활성화한다.
- [x] Gemini로 전송하는 최소 정보/외부 처리/제한을 동의 UI에서 안내한다. 제공자의 보관 기간/과금 약정은 이 단계에서 검증하지 않았다.
- [x] 저장 허용 목록은 메타데이터/점수/마스킹된 Issue/상대 위치/정제 관계/해결 상태/AI 요약과 Insight다. 원본 소스/전체 프롬프트/전체 AI 원문 필드는 저장하지 않는다.
- [x] 감사 삭제는 관계/위치/이슈/AI insight에 cascade 한다. Supabase 백업 보존 기간과 앱 행 삭제의 차이는 실제 프로젝트 설정 검증이 필요하다.

## 7. 착수 게이트

- [x] User approved stages 0-6, then authorized stage 7 only. Stage 7 application code is implemented; stage 8 integration/deployment work remains unstarted.
