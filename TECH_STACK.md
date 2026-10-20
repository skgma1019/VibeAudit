# VibeAudit — Technology Stack

## 1. 전체 기술 스택

| 영역            | 기술                                    |
| --------------- | --------------------------------------- |
| Framework       | Next.js                                 |
| Language        | TypeScript                              |
| UI              | React                                   |
| Styling         | Tailwind CSS                            |
| Component       | shadcn/ui                               |
| AI              | Google Gemini API                       |
| Database        | Supabase PostgreSQL                     |
| DB Client       | Supabase JS                             |
| Validation      | Zod                                     |
| Code Parsing    | TypeScript Compiler API / AST 기반 분석 |
| Deployment      | Vercel                                  |
| Version Control | GitHub                                  |

---

# 2. Frontend

## Next.js

웹 애플리케이션의 메인 프레임워크로 사용한다.

담당:

- 페이지 구성
- 프로젝트 업로드 UI
- 프로젝트 Tree UI
- Audit Dashboard
- 검사 기록
- API 호출

## TypeScript

분석 결과 및 API 데이터 구조를 명확하게 관리하기 위해 사용한다.

주요 타입:

```typescript
ProjectFile;
ProjectMetadata;
CodeRelation;
Audit;
AuditIssue;
AuditScore;
```

## Tailwind CSS

전체 UI 스타일링에 사용한다.

## shadcn/ui

다음 UI 구성 요소에 활용한다.

- Button
- Card
- Badge
- Progress
- Dialog
- Tabs
- Accordion
- Table
- Tooltip

---

# 3. Local Project Reader

브라우저에서 사용자가 선택한 프로젝트 폴더를 읽는다.

```html
<input type="file" webkitdirectory multiple />
```

브라우저에서 먼저 파일을 필터링한다.

### Ignore

```text
node_modules
.git
.next
dist
build
coverage
binary files
images
videos
```

### Accept

```text
.ts
.tsx
.js
.jsx
.json
.sql
.prisma
.md
```

프로젝트 전체 파일을 무조건 서버에 업로드하지 않고 분석에 필요한 텍스트 파일을 선별한다.

---

# 4. Static Analysis

## TypeScript Compiler API

JavaScript/TypeScript 코드의 AST 분석에 활용한다.

분석 대상:

```text
ImportDeclaration
ExportDeclaration
CallExpression
VariableDeclaration
PropertyAccessExpression
ObjectLiteralExpression
```

이를 통해 단순 문자열 검색보다 정확한 코드 구조 분석을 목표로 한다.

---

# 5. Relation Engine

자체 분석 모듈을 구현한다.

예시 데이터 구조:

```typescript
interface CodeRelation {
  source: string;
  target: string;
  type: "IMPORT" | "API_CALL" | "DATABASE" | "ENV" | "DEPENDENCY";
}
```

예:

```text
page.tsx
   ↓ API_CALL
/api/users
   ↓ DATABASE
users
```

Relation Engine 결과는 Rule Engine과 Gemini 분석에 전달한다.

---

# 6. Rule Engine

AI 없이 판단 가능한 항목을 검사한다.

예:

```typescript
rules/
├── security/
│   ├── hardcoded-secret.ts
│   └── client-env.ts
│
├── structure/
│   ├── missing-readme.ts
│   └── missing-env-example.ts
│
├── consistency/
│   └── api-response.ts
│
├── integrity/
│   └── field-mismatch.ts
│
└── dependencies/
    ├── unused-dependency.ts
    └── missing-dependency.ts
```

각 Rule은 표준화된 Issue를 반환한다.

```typescript
interface RuleIssue {
  ruleId: string;
  category: AuditCategory;
  severity: Severity;
  title: string;
  description: string;
  file?: string;
  line?: number;
  evidence?: string;
}
```

---

# 7. AI

## Google Gemini API

용도:

- 프로젝트 구조 해석
- 파일 간 관계 해석
- 문제 영향 설명
- 코드 일관성 평가
- 리팩토링 제안
- 수정 방향 생성
- 프로젝트 종합 요약

AI는 확정적인 정적 분석 결과와 분리한다.

```text
Rule Issue
= VibeAudit이 코드에서 직접 발견

AI Insight
= Gemini가 분석한 설명/제안
```

AI 응답은 JSON Structured Output 기반으로 처리한다.

---

# 8. Validation

## Zod

Gemini 및 API 응답 검증에 사용한다.

예:

```typescript
const issueSchema = z.object({
  category: z.enum([
    "DATA_INTEGRITY",
    "CONSISTENCY",
    "SECURITY",
    "STRUCTURE",
    "DEPENDENCY",
  ]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  title: z.string(),
  description: z.string(),
  suggestion: z.string(),
});
```

AI가 예상하지 않은 데이터를 반환하더라도 애플리케이션 전체가 깨지지 않도록 한다.

---

# 9. Database

## Supabase PostgreSQL

### projects

```text
id
name
framework
created_at
updated_at
```

### audits

```text
id
project_id
overall_score
integrity_score
consistency_score
security_score
structure_score
dependency_score
file_count
summary
created_at
```

### audit_issues

```text
id
audit_id
rule_id
category
severity
title
description
file_path
line_number
evidence
suggestion
resolved
created_at
```

---

# 10. 개인정보 및 코드 처리 원칙

원칙적으로 Supabase에는 전체 프로젝트 소스코드를 저장하지 않는다.

저장 대상:

```text
프로젝트 메타데이터
검사 점수
Issue
관련 파일 경로
분석 결과
검사 날짜
해결 상태
```

민감한 `.env` 원문은 분석 서버 및 Gemini로 전송하지 않는 것을 기본 정책으로 한다.

---

# 11. Deployment

## Vercel

Next.js 웹 애플리케이션을 배포한다.

환경변수 예:

```text
GEMINI_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

서버 전용 Gemini API Key는 클라이언트 코드에 포함하지 않는다.

---

# 12. 개발 도구

```text
VS Code
Git
GitHub
npm
ESLint
Prettier
```

---

# 13. 지원 환경

우선 지원:

```text
Chrome
Edge
```

폴더 입력 기능은 브라우저 지원 여부를 고려하여 구현한다.

---

# 14. 기술 선택 원칙

VibeAudit은 모든 분석을 LLM에 의존하지 않는다.

```text
확실하게 판단 가능한 것
        ↓
Static Analysis / Rule Engine

맥락 판단이 필요한 것
        ↓
Gemini

검사 기록
        ↓
Supabase

사용자 인터페이스
        ↓
Next.js
```

이 구조를 통해 AI의 불확실성을 줄이고 동일 프로젝트에 대해 최대한 일관된 감사 결과를 제공하는 것을 목표로 한다.
