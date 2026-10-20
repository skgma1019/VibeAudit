# VibeAudit — Design Specification

## 1. Design Direction

### Concept

**Developer Tool + AI Audit Dashboard**

VibeAudit은 일반적인 AI 챗봇처럼 보이지 않아야 한다.

GitHub, Vercel, Linear 등의 개발자 도구처럼 정보가 명확하게 구분되는 Dashboard 중심 UI를 사용한다.

### Design Keywords

```text
Technical
Minimal
Professional
Diagnostic
Data-driven
Developer-focused
```

---

# 2. Theme

기본 테마는 **Dark Mode**를 사용한다.

배경:

```text
#09090B
```

Card:

```text
#18181B
```

Border:

```text
#27272A
```

Primary Text:

```text
#FAFAFA
```

Secondary Text:

```text
#A1A1AA
```

Accent:

```text
Indigo / Violet 계열
```

상태 색상:

```text
Critical    Red
High        Orange
Medium      Yellow
Low         Blue
Success     Green
```

색상만으로 상태를 표현하지 않고 아이콘 및 텍스트를 함께 표시한다.

---

# 3. Typography

깔끔한 Sans Serif 기반.

코드 및 파일 경로에는 Monospace Font를 사용한다.

예:

```text
UI
Inter / Geist

Code
Geist Mono
```

---

# 4. Global Layout

Desktop 기준:

```text
┌──────────────────────────────────────────────────────┐
│ VibeAudit                             History   GitHub │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│ Sidebar      │ Main Content                          │
│              │                                       │
│ Overview     │                                       │
│ Issues       │                                       │
│ Files        │                                       │
│ Relations    │                                       │
│ History      │                                       │
│              │                                       │
└──────────────┴───────────────────────────────────────┘
```

---

# 5. Landing Page

목표:

사용자가 서비스의 기능을 바로 이해하고 프로젝트 검사를 시작할 수 있어야 한다.

```text
────────────────────────────────────────

VibeAudit

Know what's broken
before your users do.

AI-powered project quality auditing for
modern web applications.

[ Select Project Folder ]

No source code is permanently stored.

────────────────────────────────────────
```

하단에는 검사 영역을 보여준다.

```text
Data Integrity
Code Consistency
Security
Structure
Dependencies
```

---

# 6. Project Selection

폴더 선택 영역:

```text
┌──────────────────────────────────────────────┐
│                                              │
│                    📁                        │
│                                              │
│          Drop or select your project         │
│                                              │
│          [ Select Project Folder ]           │
│                                              │
│       JS · TS · React · Next.js · Node       │
│                                              │
└──────────────────────────────────────────────┘
```

선택 후:

```text
my-next-project

127 files detected

83   Source files
12   Config files
32   Ignored

Detected Stack

Next.js
TypeScript
Tailwind
Supabase

[ View Files ]              [ Start Audit ]
```

---

# 7. Scanning Screen

검사 과정이 보이도록 한다.

```text
Auditing my-next-project...

████████████████░░░░ 72%

✓ Reading project structure
✓ Detecting framework
✓ Parsing source files
✓ Building code relations
● Checking data integrity
○ Running AI analysis
○ Generating report
```

단순 로딩 Spinner보다 현재 어떤 분석을 수행하고 있는지 보여준다.

---

# 8. Dashboard

가장 중요한 화면이다.

상단:

```text
my-next-project

Last audited 2 minutes ago

[ Re-audit ]
```

Health Score:

```text
┌───────────────────────────┐
│ PROJECT HEALTH            │
│                           │
│          82               │
│         /100              │
│                           │
│        Grade B            │
│                           │
│  Good, but needs work     │
└───────────────────────────┘
```

Category Cards:

```text
Data Integrity
71 / 100

Code Consistency
88 / 100

Security
76 / 100

Structure
94 / 100

Dependencies
85 / 100
```

---

# 9. Issue Summary

```text
Issues

14 total

Critical  2
High      3
Medium    5
Low       4
```

Filter:

```text
[ All ]
[ Critical ]
[ High ]
[ Medium ]
[ Low ]

Category ▼
Status ▼
```

---

# 10. Issue Card

```text
┌──────────────────────────────────────────────────┐
│ HIGH · DATA INTEGRITY                            │
│                                                  │
│ User profile field mismatch                      │
│                                                  │
│ Frontend expects `profileImage`, but the API     │
│ returns `profile_url`.                           │
│                                                  │
│ src/app/profile/page.tsx:82                      │
│ src/app/api/users/route.ts:41                    │
│                                                  │
│ [ View Details ]                  [ Resolve ]     │
└──────────────────────────────────────────────────┘
```

---

# 11. Issue Detail

문제를 클릭하면 상세 정보를 제공한다.

```text
User profile field mismatch

HIGH
DATA INTEGRITY

──────────────────────────

Problem

Frontend expects:

user.profileImage

API returns:

profile_url

──────────────────────────

Related Files

src/app/profile/page.tsx
src/app/api/users/route.ts
database/schema.sql

──────────────────────────

Why this matters

프로필 이미지가 undefined로 처리될 가능성이 있습니다.

──────────────────────────

Suggested Fix

API 응답 또는 Frontend 모델에서 하나의
필드명으로 통일하는 것을 권장합니다.

[ Mark as Resolved ]
```

AI 분석 내용과 VibeAudit이 직접 검출한 Evidence를 시각적으로 구분한다.

---

# 12. Relation View

VibeAudit의 차별화 기능이다.

```text
┌──────────────┐
│ Profile.tsx  │
└──────┬───────┘
       │
       │ GET /api/users
       ▼
┌──────────────┐
│ route.ts     │
└──────┬───────┘
       │
       │ SELECT
       ▼
┌──────────────┐
│ users table  │
└──────────────┘
```

Node를 클릭하면 관련 파일과 Issue를 표시한다.

MVP에서는 복잡한 그래프 라이브러리를 사용하지 않고 단순 관계 목록 또는 기본 Flow UI로 구현해도 된다.

---

# 13. File Explorer

IDE와 유사한 Tree UI를 제공한다.

```text
▼ app
   ▼ api
      ▼ users
          route.ts
   ▼ dashboard
          page.tsx

▼ components
      Header.tsx
      Sidebar.tsx

▼ lib
      supabase.ts

package.json
README.md
```

문제가 있는 파일:

```text
🔴 route.ts        2
🟠 page.tsx         1
```

Issue 개수를 표시한다.

---

# 14. History

```text
Audit History

Oct 14      92      A
Oct 12      87      B
Oct 10      74      C
Oct 08      63      D
```

상단에는 점수 변화 그래프를 제공한다.

```text
100 │                         ●
 90 │                    ●
 80 │
 70 │             ●
 60 │       ●
    └─────────────────────────
      #1     #2     #3     #4
```

---

# 15. Empty States

Issue가 없을 경우:

```text
✓ No critical issues found

Your project passed all critical checks.
```

검사 기록이 없을 경우:

```text
No audits yet.

Select a project and run your first audit.
```

---

# 16. Responsive Design

Desktop First로 개발한다.

### Desktop

전체 Dashboard + Sidebar.

### Tablet

Sidebar 축소.

### Mobile

Sidebar를 Drawer 형태로 변경하고 Score Card를 세로 배치한다.

프로젝트 폴더 분석이라는 서비스 특성상 Desktop 환경을 Primary Target으로 한다.

---

# 17. Animation

애니메이션은 최소화한다.

사용 대상:

- Audit Progress
- Score 등장
- Accordion
- Dialog
- Issue 상태 변경

화려한 애니메이션보다 **분석 도구다운 빠른 피드백**을 우선한다.

---

# 18. Component Structure

```text
components/
│
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── DashboardLayout.tsx
│
├── project/
│   ├── FolderPicker.tsx
│   ├── ProjectSummary.tsx
│   ├── FileTree.tsx
│   └── StackBadge.tsx
│
├── audit/
│   ├── AuditProgress.tsx
│   ├── HealthScore.tsx
│   ├── CategoryScore.tsx
│   ├── IssueCard.tsx
│   ├── IssueDetail.tsx
│   └── IssueFilter.tsx
│
├── relations/
│   ├── RelationView.tsx
│   └── RelationNode.tsx
│
└── history/
    ├── AuditHistory.tsx
    └── ScoreChart.tsx
```

---

# 19. UX 원칙

### 1. 근거를 보여준다

단순히

```text
보안 문제가 있습니다.
```

라고 하지 않는다.

가능하면:

```text
src/lib/api.ts:14

API Key 형태의 문자열이 코드에 직접 작성되어 있습니다.
```

처럼 판단 근거를 제공한다.

### 2. AI와 확정 검사를 구분한다

```text
Detected by VibeAudit
```

와

```text
AI Insight
```

를 UI에서 구분한다.

### 3. 문제보다 해결 방법까지 제공한다

각 Issue에는 가능한 경우 수정 방향을 제공한다.

### 4. 점수만 강조하지 않는다

82점이라는 숫자보다

```text
왜 18점이 감점되었는가?
```

를 사용자가 이해할 수 있어야 한다.

### 5. 과도한 경고를 피한다

확실하지 않은 AI 판단은 확정적인 오류처럼 표현하지 않는다.

예:

```text
Potential Issue
AI-detected
```

등으로 구분한다.

---

# 20. 최종 디자인 목표

VibeAudit의 UI는 사용자가 프로젝트 폴더를 넣은 뒤 몇 분 안에 다음 세 가지를 이해할 수 있도록 설계한다.

**1. 현재 프로젝트의 완성도는 어느 정도인가?**

**2. 어디에 문제가 있는가?**

**3. 무엇을 수정해야 하는가?**

따라서 디자인의 중심은 AI 채팅창이 아니라 **Project Health Dashboard + Issue Explorer + Code Relation View**이다.
