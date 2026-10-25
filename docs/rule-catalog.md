# MVP Rule 카탈로그 v1

4단계 구현 기준과 현재 구현 범위를 기록한다. Rule은 AI 없이 정제된 로컬 분석 결과를 입력으로 받는다. 원본 코드와 실제 Secret은 RuleIssue에 보존하지 않는다.

공통 출력은 `origin=RULE`, `ruleId`, `detectionKind`, `fingerprint`, `category`, `severity`, `title`, `description`, `locations[]`, 비밀값이 없는 `evidence`, `suggestion`이다. Audit 결과는 Zod schema로 검증한다. `analysis-contract.md`의 severity 감점을 그대로 적용한다. DETERMINISTIC과 HEURISTIC RuleIssue 모두 해당 severity만큼 감점한다.

| Rule ID                           | Category       | Detection     | Severity                                          | 검사 조건과 제한                                                                                                                                                                                                                                                                             |
| --------------------------------- | -------------- | ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `structure.required-files`        | STRUCTURE      | HEURISTIC     | package.json HIGH, README LOW, env example MEDIUM | 선택된 파일에 package.json/README.md가 없으면 보고한다. `.env.example`은 환경변수 참조가 있을 때만 보고한다. 선택 루트 불완전 시 오탐 가능성이 있다.                                                                                                                                         |
| `structure.todo-fixme`            | STRUCTURE      | HEURISTIC     | TODO LOW, FIXME MEDIUM                            | 3단계 주석 marker를 파일 및 marker 종류별로 묶는다. Marker만으로 결함을 확정하지 않는다.                                                                                                                                                                                                     |
| `security.hardcoded-secret`       | SECURITY       | HEURISTIC     | MEDIUM/HIGH                                       | 로컬 스캐너가 마스킹한 포함 파일을 표시한다. 값과 원문 코드는 증거에 넣지 않는다. 일반 값 오탐 가능성이 있다.                                                                                                                                                                                |
| `security.client-env`             | SECURITY       | DETERMINISTIC | HIGH                                              | `use client` 파일에서 `NEXT_PUBLIC_`이 아닌 정적 `process.env` 참조를 찾는다. 동적 환경변수 이름은 분석하지 않는다.                                                                                                                                                                          |
| `security.dangerous-pattern`      | SECURITY       | HEURISTIC     | HIGH                                              | AST에서 `eval(...)`, `new Function(...)`, `.innerHTML = ...`를 찾는다. 실제 입력의 신뢰 경계/정화 여부까지 추적하지 않는다.                                                                                                                                                                  |
| `integrity.field-mismatch`        | DATA_INTEGRITY | HEURISTIC     | MEDIUM                                            | 로컬 API route로 해석된 fetch 호출이 있고 route의 `Response.json`/`NextResponse.json` 객체 필드를 정적으로 읽을 수 있을 때, 호출 파일의 비 wrapper 데이터 필드가 응답 객체에 없으면 후보로 표시한다. 복잡한 매핑/분기/함수 간 흐름은 미지원이다. 명시적인 응답 key 매핑은 정상으로 취급한다. |
| `integrity.schema-field`          | DATA_INTEGRITY | DETERMINISTIC | MEDIUM                                            | 정적 Supabase `.select("a,b")` 필드를 동일 테이블의 파싱된 SQL/Prisma schema와 비교한다. `*`, 동적 selection, 파싱 불가 schema, 확인되지 않는 테이블은 건너뛴다.                                                                                                                             |
| `integrity.local-api-route`       | DATA_INTEGRITY | HEURISTIC     | MEDIUM                                            | 정적 로컬 `/api/...` 요청이 추출된 Next App Router endpoint와 연결되지 않으면 후보를 표시한다. 외부/동적 URL과 경로는 건너뛴다. 서버 외부 route, proxy, 생성 route가 오탐 원인이 될 수 있다.                                                                                                 |
| `consistency.api-response`        | CONSISTENCY    | HEURISTIC     | LOW                                               | 3개 이상 서로 다른 route에서 정적 JSON 응답 object를 추출하고, 두 route 이상이 동일한 다수 field shape를 가질 때 그 shape에서 벗어난 route를 후보로 표시한다. 의도된 route별 응답 차이도 가능하다.                                                                                           |
| `dependencies.missing-dependency` | DEPENDENCY     | DETERMINISTIC | HIGH                                              | package manifest에 선언되지 않은 bare package import를 보고한다. 상대 import와 Node builtin은 제외한다. type-only import도 설치/타입 해석에 필요할 수 있어 검사한다. 선택하지 않은 workspace manifest는 오탐 원인이 될 수 있다.                                                              |
| `dependencies.unused-dependency`  | DEPENDENCY     | HEURISTIC     | LOW                                               | 포함된 package manifest의 dependencies/devDependencies에 있으나 분석한 소스/설정 import에서 찾지 못한 패키지를 표시한다. Next/React/TypeScript/CSS 및 lint 핵심 패키지, `@types/*`는 제외한다. scripts, plugin, CSS, 자동 로딩은 정적 import 없이 사용할 수 있다.                            |

## 점수와 중복 처리

각 카테고리는 100점에서 시작하고 CRITICAL 10, HIGH 5, MEDIUM 2, LOW 1점을 감점한다. HEURISTIC에 별도 감점 계수는 적용하지 않는다. 이는 승인된 `docs/analysis-contract.md`를 따른다. 카테고리 최저점은 0이며 Overall은 다섯 점수의 평균, 등급 경계는 계약 문서 기준이다. resolved 상태와 AI는 점수에 관여하지 않는다.

Fingerprint는 규칙 ID, 카테고리, 소문자/슬래시 정규화 위치, 정규화된 비민감 대상값으로 결정적으로 생성한다. 값은 이중 32-bit FNV 식별자로 출력되며 원문 Secret이나 코드 본문을 포함하지 않는다. 같은 fingerprint가 겹치면 한 번만 감점하고 더 높은 severity를 유지한다. 카테고리가 다른 fingerprint 충돌은 잘못된 입력으로 처리한다.

## Coverage

Audit 점수와 별도로 다섯 카테고리의 `FULL`, `PARTIAL`, `LIMITED`를 표시한다. 데이터 정합성은 schema/DB/API 근거, 일관성은 route/응답 샘플 수, 보안은 AST 파싱 성공 범위, 구조는 선택/coverage 누락, 의존성은 manifest와 소스 파싱 범위로 산정한다. Limited/Partial은 문제가 없다는 보증이 아니다.

Rule fixture는 정상/탐지/예외와 위치·중복·점수 경계를 포함해 검증한다. 동적 관계, SQL dialect, 복잡한 재수출/별칭, runtime 변환, API 분기와 함수 간 data flow는 미분석 범위다.
