# 분석 계약 v1

승인일: 2026-10-21. 제품/기술/UI 기준은 각각 PRD.md, TECH_STACK.md, DESIGN.md다.

## 범위와 단계

MVP는 JavaScript, TypeScript, React, Next.js, Node.js를 지원한다. Python, Java/Spring, GitHub Repository URL, ZIP 업로드, 자동 코드 수정, GitHub Actions는 제외한다.

현재 구현 범위는 0단계 계약과 1단계 앱/UI 기반이다. 폴더 읽기, AST, Rule, Gemini, DB, 로그인, 실제/가짜 Audit 결과 및 History는 구현하지 않는다.

Supabase Auth를 사용하되 연결/인증 기능은 7단계에서 구현한다. 로그인 방식은 그 단계에서 확정한다. 미래 projects는 owner_id로 소유권을 표현하고, audits와 하위 데이터 접근은 서버 및 RLS에서 소유자를 검증한다. 폴더 이름으로 프로젝트를 자동 병합하지 않는다. 5단계 AI는 로컬 개발 기준으로 검증하고 공개 제공 시 인증/비용 제한은 7단계와 함께 완성한다.

## 분석 흐름

선택 → 필터/로컬 Secret 탐지 → 메모리/Worker 정적 분석 → 관계 → Rule → 정제된 최소 서버 요청 → Gemini → 검증 → 점수 → 결과 → 허용된 결과만 저장.

사용자 프로젝트의 scripts, 설정, 모듈은 실행하지 않는다. 동적 URL/SQL/import 및 미지원 구문은 미해석으로 표시하며 정상 통과로 간주하지 않는다. coverage는 대상/분석/제외/실패 범위와 이유를 포함한다. 취소 시 Worker/요청을 중지하고 완료된 단계와 미완료 범위를 구분한다.

## 출처와 근거

- Rule: origin=RULE, ruleId, detectionKind=DETERMINISTIC 또는 HEURISTIC, fingerprint, category, severity, locations[], 마스킹된 evidence.
- DETERMINISTIC은 규칙 조건/관찰 사실의 확정이며, 모든 경우 실제 취약점 확정을 의미하지 않는다.
- HEURISTIC은 정적 근거가 있는 후보 탐지다. UI에서 후보로 표시하되 Rule 점수 정책에 포함한다.
- Gemini: origin=AI, 설명/관계 해석/수정 방향/리팩토링 제안 및 AI 단독 후보. relatedIssueIds와 confidence로 연결하고 Rule 근거/출처를 바꾸지 않는다.
- AI 응답은 구조 검증 및 파일/위치 참조 검증을 통과해야 한다. 실패하면 Rule 결과는 유지하고 AI 실패 상태를 표시한다.

## 점수 계약

5개 카테고리: DATA_INTEGRITY, CONSISTENCY, SECURITY, STRUCTURE, DEPENDENCY.

각 카테고리는 100점에서 해당 카테고리의 고유 Rule Issue를 감점하고 0~100으로 제한한다. CRITICAL=10, HIGH=5, MEDIUM=2, LOW=1. AI Insight만으로는 감점하지 않는다.

동일 fingerprint는 Audit 전체에서 한 번만 감점한다. fingerprint는 규칙 ID, 카테고리, 정규화한 상대 위치/대상 등 안정된 비민감 식별자로 생성한다. 동일 fingerprint의 심각도가 다르면 가장 높은 심각도를 적용하고, 카테고리가 다르면 잘못된 입력으로 처리한다. Secret 원문은 fingerprint에 사용하지 않는다.

Overall은 5개 카테고리 점수의 산술평균이다. 반올림 전 점수로 A >=90, B >=80, C >=70, D >=60, F <60을 적용한다. 표시는 소수점 한 자리까지 하며 표시 반올림으로 등급을 바꾸지 않는다. 미분석 범위는 점수와 함께 명시한다.

resolved만 변경해도 기존 Audit 점수는 유지한다. 재검사하면 새 Audit/점수를 생성한다. ruleVersion/scoreVersion을 저장하고 버전이 다른 이력 비교에는 제한을 표시한다.

## 초기 제한

src/lib/project/limits.ts의 ANALYSIS_LIMITS를 단일 기준으로 사용한다.

| 항목      | 제한                      |
| --------- | ------------------------- |
| 파일당    | 512 KiB = 524,288 bytes   |
| 총 텍스트 | 10 MiB = 10,485,760 bytes |
| 분석 대상 | 1,000 files               |

경계값은 포함한다. bytes는 파일의 원본 크기 기준이며 총량/개수는 필터를 통과한 분석 대상에 적용한다. 실제 읽기/제한 집행은 2단계다. AST 시간/메모리 예산은 3단계 성능 측정, AI 토큰/요청/재시도 예산은 5단계 모델·플랫폼 한도 확인 후 상수화한다. 무제한 공개 호출은 허용하지 않는다.
