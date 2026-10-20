# VibeAudit MVP 개발 계획

작성일: 2026-10-21

> 계획 문서만 작성한 상태다. 사용자 확인 전 실제 기능 구현을 시작하지 않는다.
> 제품 범위는 PRD.md, 기술 선택은 TECH_STACK.md, UI/UX는 DESIGN.md를 기준으로 한다.

## 1. 현재 상태

- 루트 파일: PRD.md, TECH_STACK.md, DESIGN.md. 기존 구현 코드, package.json, TODO.md는 없었다.
- 현재 디렉터리는 Git 저장소가 아니다. 기존 파일은 변경하지 않았다.
- 아래 파일명과 구성은 제안이며, 패키지 버전과 배포 한도는 구현 시 공식 문서로 확인한다.

## 2. 요구사항 대조와 MVP 범위

| 영역 | PRD 요구 | 기술/디자인 반영 | MVP 구현 경계 |
| --- | --- | --- | --- |
| 입력 | 로컬 폴더 선택, 필터링 | 디렉터리 input, 요약/트리 | Chrome/Edge 우선, 드롭은 필수 아님 |
| 탐지/파싱 | JS/TS/React/Next/Node | TypeScript Compiler API | 실행 없는 AST 분석, 지원하지 않는 구문은 미분석 표시 |
| 관계 | import/API/DB/환경변수/의존성 | 자체 Relation Engine, 관계 목록 | 정적으로 해석 가능한 경로/호출 중심, 동적 관계는 추정/미해석 |
| 검사 | 5개 카테고리 | Rule Engine + Gemini | 모든 카테고리에 기본 규칙 제공, 완전한 타입/취약점 검증은 아님 |
| 결과 | 점수, 위치, 근거, 제안 | 대시보드/상세/필터/파일 트리 | Rule 탐지와 AI Insight를 데이터와 화면에서 구분 |
| 이력 | 저장/조회/해결/삭제, 재검사 | Supabase, 이력 차트 | 같은 프로젝트의 점수 변화/직전 점수 비교; 상세 비교 엔진 제외 |
| 보호 | .env 원문 전송 금지 | 서버 전용 Gemini 키 | 소스 영구 저장 금지, 전송/저장 전 민감정보 제거 |

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
- 점수는 고유 Rule 이슈로 계산하고 AI 단독 추론은 별도 표시한다. 초기 제안: 심각도별 10/5/2/1 감점, 카테고리별 0~100, Overall은 카테고리 평균. 규칙 확정 단계에서 기준을 고정한다.
- 중복 탐지는 fingerprint로 제거한다. 미지원/미분석은 정상 통과로 간주하지 않고 coverage에 표시한다. resolved 변경은 과거 점수를 바꾸지 않으며 재검사로 점수 변화를 확인한다.
- 이력 점수는 버전이 다르면 직접 비교에 제한이 있음을 표시한다. 원본이 없으므로 새로고침/과거 결과에서 재검사는 폴더 재선택이 필요하다.

## 4. 단계별 TODO와 파일 변경 계획

모든 단계는 미착수다. 앞 단계의 완료 기준을 충족한 뒤 다음 단계로 진행한다.

### 0단계 — 구현 전 계약 확정

- [ ] 사용자에게 이 계획을 확인받는다.
- [ ] 사용자 소유권을 위해 Supabase Auth 사용을 확정한다. MVP 제안은 익명 인증이며 세션 소실 시 이력 접근을 복구할 수 없음을 안내한다. 장기 복구가 필요하면 이메일 로그인으로 대체한다.
- [ ] 점수/중복 제거/미분석 표시/Rule과 AI 구분 계약을 확정한다.
- [ ] 파일당 크기, 전체 텍스트 크기, 파일 개수, AST 시간/메모리, AI 토큰/요청 예산과 취소 정책을 정한다. 초기 시험값: 파일당 512 KiB, 총 텍스트 10 MiB, 대상 1,000개; 배포 및 fixture 측정 후 조정한다.
- [ ] 생성: docs/analysis-contract.md, docs/privacy-boundary.md, docs/rule-catalog.md.
- [ ] 수정: TODO.md의 합의 결과. 원래 세 문서는 승인 없이 덮어쓰지 않는다.

완료 기준: 데이터 전송/저장 범위, 인증, 탐지 수준과 점수 정책이 문서화되어 있다.

### 1단계 — 앱 기반과 디자인 시스템

- [ ] Next.js/TypeScript/npm/ESLint/Prettier 설정 및 Git 초기화 여부를 정한다.
- [ ] 다크 테마, 색상/폰트 토큰, 공통 레이아웃, 반응형 Sidebar/Drawer 구성.
- [ ] 생성: package.json, package-lock.json, tsconfig.json, next.config.ts, next-env.d.ts, eslint.config.mjs, .prettierrc.json, .gitignore, .env.example, components.json, README.md.
- [ ] 생성: src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, src/components/layout/{Header,Sidebar,DashboardLayout}.tsx, src/components/ui/*, src/lib/utils.ts.
- [ ] .env.example에는 변수 이름과 빈 값만 작성한다. GEMINI_API_KEY에 NEXT_PUBLIC_ 접두어를 붙이지 않는다.

완료 기준: 반응형 기본 화면과 접근성 키보드 이동, typecheck/lint/build 통과.

### 2단계 — 폴더 선택, 필터, 개인정보 경계

- [ ] webkitdirectory로 명시적으로 선택한 파일만 읽고 경로를 정규화한다.
- [ ] node_modules/.git/.next/dist/build/coverage/.cache, 바이너리/미지원 파일을 제외한다.
- [ ] .env 및 .env.* 실제 파일은 읽기/전송 대상에서 제외한다. .env.example만 예외 허용하되 값은 제거한다.
- [ ] 키 파일/인증서/자격증명 파일을 제외하고 허용 텍스트 내부의 Secret 후보를 로컬 탐지한다. 출력 근거에는 실제 값을 남기지 않는다.
- [ ] 파일 수/바이트 제한을 내용 읽기 전에 검사하고 제외 이유/분석 대상을 표시한다.
- [ ] 생성: src/lib/project/{scan,filter,paths,detect,limits}.ts, src/lib/security/{redact,secrets}.ts, src/types/project.ts.
- [ ] 생성: src/components/project/{FolderPicker,ProjectSummary,FileTree,StackBadge}.tsx.
- [ ] 수정: src/app/page.tsx.

완료 기준: 중첩 디렉터리, Windows 경로, 대소문자/중복 경로, 초과 파일, .env 계열/Secret fixture의 차단과 마스킹 검증.

### 3단계 — 정적 분석과 관계 엔진

- [ ] Worker에서 JS/TS import/export, fetch, Next API route, 환경변수 참조, 객체 필드, DB 호출, TODO/FIXME를 추출한다.
- [ ] package.json/tsconfig의 제한된 alias 및 상대 경로를 해석한다. 설정 파일을 실행하지 않는다.
- [ ] SQL/Prisma는 제한된 선언/필드 추출만 지원하고 지원 범위를 명시한다.
- [ ] IMPORT/API_CALL/DATABASE/ENV/DEPENDENCY 관계와 근거 위치를 생성한다.
- [ ] 동적 import/URL/SQL, 외부 API, 복잡한 재수출/alias 등 미해석 항목을 기록한다.
- [ ] 생성: src/workers/analysis.worker.ts, src/lib/analysis/{protocol,parser,extractors,resolver,relations,schema-extractors}.ts, src/types/analysis.ts.

완료 기준: 프런트 fetch → Next route → DB의 정적 fixture 관계 및 미해석 처리 검증, Worker 취소/실패/메모리 해제 확인.

### 4단계 — 5개 카테고리 Rule/점수 엔진

- [ ] 구조: README/.env.example/package.json/설정 누락, TODO/FIXME를 검사한다.
- [ ] 보안: 하드코딩 Secret 후보, 클라이언트 비밀 환경변수 사용, 제한된 위험 패턴을 검사한다.
- [ ] 정합성: 관계와 스키마 근거가 확보된 필드 불일치를 검사한다. 근거가 부족하면 후보로 표시한다.
- [ ] 일관성: 식별 가능한 API 응답/에러 패턴의 차이를 후보로 표시한다.
- [ ] 의존성: 미선언 import/미사용 패키지 후보를 검사한다. scripts/config/plugin/타입 패키지 참조와 Node 내장 모듈을 고려한다.
- [ ] 중복 제거, 심각도/감점/등급, coverage 및 score version을 구현한다.
- [ ] 생성: src/lib/rules/{types,index}.ts, src/lib/rules/security/{hardcoded-secret,client-env,dangerous-pattern}.ts, src/lib/rules/structure/{required-files,todo-fixme}.ts, src/lib/rules/consistency/api-response.ts, src/lib/rules/integrity/field-mismatch.ts, src/lib/rules/dependencies/{unused-dependency,missing-dependency}.ts.
- [ ] 생성: src/lib/audit/{score,deduplicate}.ts, src/schemas/audit.ts, src/types/audit.ts.

완료 기준: 각 카테고리 양성/음성 fixture, 다중 위치, 오탐 예외, 중복/감점/경계값의 결정적 검증.

### 5단계 — 서버 Gemini 연동

- [ ] 입력 계약/전송 고지 UI와 서버 Zod 검증, 재마스킹을 구현한다.
- [ ] 요약/관계/최소 근거를 우선 전송하고 토큰 예산에 맞춰 분할한다. 누락 범위를 보고한다.
- [ ] Structured Output을 검증하고 존재하지 않는 파일/행/관련 이슈 참조는 거절하거나 근거 미확인으로 표시한다.
- [ ] 인증/호출 제한/타임아웃/제한된 재시도/취소 및 AI 실패 시 부분 결과 유지.
- [ ] 코드 주석/README 등의 명령은 분석 데이터로 취급한다. AI에 도구 실행/임의 URL 요청 권한을 주지 않는다.
- [ ] 생성: src/app/api/analyze/route.ts, src/lib/server/{env,gemini,analysis-service,rate-limit}.ts, src/lib/ai/{prompt,payload}.ts, src/schemas/{analyze,ai}.ts, src/components/project/AnalysisDisclosure.tsx.

완료 기준: Secret 비전송, 키 클라이언트 번들 미포함, 비정상 JSON/429/timeout/프롬프트 주입/AI 실패 fallback 검증. 자동 테스트는 모의 AI 응답 사용.

### 6단계 — 감사 대시보드와 탐색 UX

- [ ] 실제 단계 진행, 취소/실패/부분 완료 상태를 구현한다.
- [ ] Overall/카테고리/등급/감점 근거, 심각도 요약, 카테고리/상태 필터.
- [ ] 상세 근거/다중 파일 위치/수정 제안, RULE/AI 및 확정/후보 배지를 구분한다.
- [ ] 파일별 Issue 수, 단순 관계 목록과 관련 파일/Issue 이동을 구현한다.
- [ ] 빈 상태, 로딩/오류, 키보드/스크린리더, 색 외 상태 표시, 반응형 레이아웃.
- [ ] 생성: src/app/audits/[auditId]/page.tsx, src/components/audit/{AuditWorkspace,AuditProgress,HealthScore,CategoryScore,IssueSummary,IssueCard,IssueDetail,IssueFilter,OriginBadge,CoverageNotice}.tsx, src/components/relations/{RelationView,RelationNode}.tsx.
- [ ] 수정: src/app/page.tsx, src/components/project/FileTree.tsx, src/app/globals.css.

완료 기준: 선택 → 분석 → 근거/제안 탐색 흐름과 AI 부분 실패/미분석 표시를 데스크톱/모바일에서 확인.

### 7단계 — Supabase 이력/해결/삭제

- [ ] 소유권 인증과 projects/audits/audit_issues/audit_issue_locations/audit_relations 테이블, 인덱스, 외래 키, RLS를 구현한다.
- [ ] 모든 테이블/조인에 소유권 검증을 적용한다. 클라이언트의 owner_id를 신뢰하지 않는다.
- [ ] 감사 및 이슈/위치/관계 저장은 트랜잭션으로 처리한다. 재시도 중복 저장을 막는다.
- [ ] 결과 저장/이력/직전 점수 비교/해결 및 되돌리기/감사 삭제와 자식 데이터 정리.
- [ ] 저장 실패 시 메모리 결과를 유지하고 재시도 가능하게 한다. 과거 결과는 원본 없이 조회한다.
- [ ] 생성: supabase/migrations/001_initial_schema.sql, src/lib/supabase/{browser,server}.ts, src/lib/server/{auth,audit-repository}.ts, src/types/database.ts.
- [ ] 생성: src/app/api/projects/route.ts, src/app/api/projects/[projectId]/audits/route.ts, src/app/api/audits/route.ts, src/app/api/audits/[auditId]/route.ts, src/app/api/issues/[issueId]/route.ts, src/app/history/page.tsx, src/components/history/{AuditHistory,ScoreChart}.tsx.
- [ ] 수정: 감사 상세 페이지/해결 UI/폴더 재선택 흐름。

완료 기준: 서로 다른 사용자 간 조회/변경/삭제 차단, 원자적 저장, 삭제 전파, 저장 payload의 소스/Secret 부재 검증.

### 8단계 — 통합 검증과 배포 준비

- [ ] 생성: vitest.config.ts, playwright.config.ts, tests/fixtures/*, tests/unit/{filter,redact,parser,relations,rules,score,schemas}.test.ts, tests/integration/{analyze,audit-storage,ownership}.test.ts, tests/e2e/audit-flow.spec.ts.
- [ ] 정상/취약/동적 관계/대용량/손상 설정/민감정보 fixture로 회귀 검증한다.
- [ ] 익명 사용자 인증/세션 만료, AI 실패, 저장 실패, 취소, 재검사, 해결/삭제를 검증한다.
- [ ] DB 실제 행/API body/로그/브라우저 번들에서 Secret 및 전체 소스가 없는지 확인한다.
- [ ] 설치/실행/typecheck/lint/test/build와 Chrome/Edge 폴더 선택을 확인한다.
- [ ] Vercel의 실제 요청 크기/실행 시간/메모리와 Gemini 모델/SDK/토큰 한도를 공식 문서로 확인하고 제한값을 조정한다.
- [ ] 생성: docs/deployment.md. 수정: README.md, .env.example, TODO.md. 필요할 때만 vercel.json 추가.
- [ ] 배포는 별도 사용자 요청/권한 범위에서 수행한다.

완료 기준: PRD MVP 항목 전부 동작, DESIGN 주요 화면/상태 확인, 개인정보 경계와 소유권 테스트 통과.

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
- [ ] 상대 경로만 사용하고 절대 경로, ../, 중복 경로, 비정상 인코딩, 과도한 길이를 거부한다. 파일명 자체의 개인정보도 최소화한다.
- [ ] 업로드 코드를 실행/eval/import하지 않고 package scripts/Next 설정/플러그인을 실행하지 않는다. 분석 대상 URL로 서버가 요청하지 않게 한다.
- [ ] 파일 수/바이트/AST 복잡도/요청 크기/AI 예산/동시 실행을 제한한다. 파싱 실패를 정상 판정으로 처리하지 않는다.
- [ ] API/AI/DB 경계에서 Zod 검증, 허용 필드만 직렬화, 마스킹 재검증을 적용한다.
- [ ] 프로젝트 데이터/AI 출력을 HTML로 실행하지 않고 escape한다. Markdown을 쓰면 raw HTML 및 위험 링크를 차단한다.
- [ ] 인증, 소유권/RLS, IDOR 방어, 변경 요청 Origin/CSRF 검증, 호출 제한을 적용한다.
- [ ] 서버/플랫폼 로깅과 에러 추적에서 요청 본문, 코드/프롬프트/응답 덤프를 비활성화한다.
- [ ] Gemini로 전송하는 정보/외부 처리 사실/제한을 검사 시작 전에 설명한다. 제공자 보관 정책을 확인한 범위에서만 안내한다.
- [ ] 저장 허용 목록은 메타데이터/점수/마스킹된 Issue/상대 위치/정제 관계/해결 상태다. 원본 소스/전체 프롬프트/전체 AI 원문은 저장하지 않는다.
- [ ] 감사 삭제 시 관련 이슈/위치/관계를 함께 지우고 플랫폼 백업 보존과 앱 삭제의 차이를 문서화한다.

## 7. 착수 게이트

- [ ] 사용자 계획 확인 전까지 기능 코드, 의존성 설치, DB 생성, 배포를 시작하지 않는다.
