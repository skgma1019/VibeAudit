# VibeAudit — Product Requirements Document

## 1. 프로젝트 개요

### 1.1 프로젝트명

**VibeAudit**

### 1.2 한 줄 소개

웹에서 프로젝트 폴더를 선택하면 코드 구조와 파일 간 관계를 분석하여 **코드 일관성, 데이터 정합성, 보안, 프로젝트 구조, 의존성 문제를 진단하고 AI가 개선 방법을 제안하는 프로젝트 완성도 감사 웹 앱**

### 1.3 프로젝트 목적

AI 코딩 도구와 바이브코딩을 활용하면 빠르게 프로젝트를 개발할 수 있지만, 개발 과정에서 다음과 같은 문제가 발생할 수 있다.

- 파일마다 변수 및 필드 이름이 달라지는 문제
- Frontend와 Backend 사이의 데이터 구조 불일치
- API와 Database Schema 사이의 필드 불일치
- 환경변수 대신 API Key를 코드에 직접 작성하는 문제
- 서로 다른 API 응답 형식
- 일관되지 않은 에러 처리
- 사용되지 않는 파일이나 패키지
- README, 환경변수 예제 등 프로젝트 구성 요소 누락
- AI가 생성한 코드가 기존 프로젝트 구조와 맞지 않는 문제

VibeAudit은 단순히 하나의 코드 파일을 리뷰하는 것이 아니라 **프로젝트 전체 구조와 파일 사이의 관계를 분석**하여 이러한 문제를 발견하는 것을 목표로 한다.

---

# 2. 목표

## 2.1 핵심 목표

1. 사용자가 웹 브라우저에서 프로젝트 폴더를 선택할 수 있어야 한다.
2. 불필요한 파일을 자동으로 제외해야 한다.
3. 프로젝트의 디렉터리 및 파일 구조를 파악해야 한다.
4. 코드 파일 사이의 관계를 분석해야 한다.
5. 규칙 기반 분석과 AI 분석을 함께 사용해야 한다.
6. 발견된 문제에 대해 파일 위치와 원인을 알려줘야 한다.
7. 프로젝트 완성도를 점수로 제공해야 한다.
8. AI가 문제의 설명과 수정 방향을 제안해야 한다.
9. 검사 결과를 DB에 저장하여 이전 검사와 비교할 수 있어야 한다.
10. 발견된 문제를 사용자가 해결 완료 처리할 수 있어야 한다.

---

# 3. 주요 사용자

### Primary User

AI 코딩 도구 또는 바이브코딩을 활용하여 웹 프로젝트를 개발하는 학생 및 초급 개발자.

### Secondary User

자신이 만든 웹 프로젝트의 기본적인 품질과 완성도를 빠르게 확인하고 싶은 개발자.

---

# 4. 핵심 사용자 흐름

```text
VibeAudit 접속
        ↓
프로젝트 폴더 선택
        ↓
브라우저에서 파일 탐색
        ↓
불필요한 파일 제거
        ↓
분석 대상 확인
        ↓
[프로젝트 검사 시작]
        ↓
프로젝트 구조 분석
        ↓
파일 간 관계 분석
        ↓
규칙 기반 정적 검사
        ↓
Gemini AI 분석
        ↓
점수 계산
        ↓
감사 결과 표시
        ↓
Supabase 검사 이력 저장
        ↓
문제 확인 / 해결
        ↓
재검사
        ↓
이전 결과와 비교
```

---

# 5. 프로젝트 입력

## 5.1 폴더 선택

웹 브라우저의 디렉터리 선택 기능을 사용한다.

```html
<input type="file" webkitdirectory multiple />
```

사용자가 명시적으로 선택한 프로젝트 폴더만 읽는다.

## 5.2 1차 지원 프로젝트

MVP에서는 범위를 제한하여 다음 프로젝트를 우선 지원한다.

- JavaScript
- TypeScript
- React
- Next.js
- Node.js

## 5.3 주요 분석 파일

```text
.js
.jsx
.ts
.tsx
.json
.sql
.prisma
.md
```

특수 파일:

```text
package.json
tsconfig.json
next.config.*
.env.example
README.md
```

## 5.4 제외 대상

```text
node_modules/
.git/
.next/
dist/
build/
coverage/
.cache/

이미지
영상
음원
폰트
실행파일
압축파일
```

`.env`는 보안을 위해 서버나 Gemini로 원문을 전송하지 않는 것을 기본 정책으로 한다.

---

# 6. 프로젝트 분석 파이프라인

```text
Project Folder
      ↓
File Scanner
      ↓
Filter
      ↓
Project Detector
      ↓
Static Analyzer
      ↓
Relation Builder
      ↓
Rule Engine
      ↓
Gemini Analyzer
      ↓
Score Engine
      ↓
Audit Report
```

## 6.1 File Scanner

수집 정보:

- 파일명
- 상대 경로
- 확장자
- 파일 크기
- 디렉터리 구조

## 6.2 Project Detector

`package.json` 등을 기반으로 기술 스택을 추정한다.

예:

```text
Next.js
React
TypeScript
Supabase
Tailwind CSS
```

## 6.3 Static Analyzer

코드에서 다음 정보를 추출한다.

- import/export
- API Route
- fetch 호출
- 환경변수 사용
- DB 관련 코드
- 주요 객체/필드
- TODO/FIXME
- 의존성

## 6.4 Relation Builder

파일을 개별적으로 보는 것에서 끝내지 않고 파일 간 관계를 생성한다.

예:

```text
Profile.tsx
    │
    │ GET /api/users
    ▼
route.ts
    │
    │ SELECT users
    ▼
Database
```

이 관계를 통해 서로 다른 계층에서 사용하는 데이터가 일치하는지 분석한다.

---

# 7. 감사 카테고리

## 7.1 Data Integrity

검사 대상:

- Frontend ↔ API 필드 일치
- API ↔ Database 필드 일치
- 요청/응답 타입 불일치
- 동일 데이터의 서로 다른 이름 사용
- 필수 데이터 누락 가능성

## 7.2 Code Consistency

검사 대상:

- 변수/함수 네이밍
- API 응답 구조
- 에러 처리 방식
- async/await 사용 방식
- 프로젝트 내부 패턴 불일치

## 7.3 Security

검사 대상:

- API Key 하드코딩 가능성
- Secret 노출 가능성
- 민감한 환경변수의 클라이언트 사용
- 위험한 코드 패턴

보안 검사는 완전한 취약점 진단이 아니라 **개발 단계의 기본적인 위험 패턴 탐지**를 목표로 한다.

## 7.4 Project Structure

검사 대상:

- README 존재
- `.env.example` 존재
- package.json 존재
- 폴더 구조
- TODO/FIXME
- 미완성 코드
- 설정 파일 누락

## 7.5 Dependencies

검사 대상:

- package.json 의존성
- 코드에서 사용되는 패키지
- 사용하지 않는 의존성 후보
- 선언되지 않은 import 후보

---

# 8. AI 사용 범위

Google Gemini API를 사용한다.

AI에게 모든 판단을 맡기지 않는다.

### Rule Engine

객관적으로 확인할 수 있는 항목:

```text
README 존재 여부
.env.example 존재 여부
TODO/FIXME
API Key 패턴
package.json
import 관계
필드명 차이
```

### Gemini

맥락이 필요한 항목:

```text
코드 구조의 일관성
문제가 실제로 어떤 영향을 미치는지
관련 코드 관계 해석
문제 중요도 보조 판단
수정 방향
리팩토링 제안
```

Gemini 응답은 가능한 한 Structured Output을 사용한다.

예:

```json
{
  "summary": "...",
  "issues": [
    {
      "category": "DATA_INTEGRITY",
      "severity": "HIGH",
      "title": "...",
      "description": "...",
      "files": [],
      "suggestion": "..."
    }
  ]
}
```

---

# 9. 점수 시스템

AI가 직접 최종 점수를 결정하지 않는다.

VibeAudit 자체 Score Engine이 탐지 결과를 기반으로 계산한다.

기본 점수:

```text
100점
```

예시 감점:

```text
CRITICAL   -10
HIGH        -5
MEDIUM      -2
LOW         -1
```

최종적으로 다음 점수를 제공한다.

- Overall Score
- Data Integrity
- Code Consistency
- Security
- Project Structure
- Dependencies

등급 예시:

```text
90~100   A
80~89    B
70~79    C
60~69    D
0~59     F
```

정확한 감점 기준은 개발 및 테스트 과정에서 조정한다.

---

# 10. 감사 결과

결과 페이지에서 다음 정보를 제공한다.

### Project Health

```text
82 / 100
B
```

### Category Score

```text
Data Integrity      71
Code Consistency    88
Security            76
Project Structure   94
Dependencies        85
```

### Issue Summary

```text
Critical    2
High        3
Medium      5
Low         4
```

### Issue Detail

각 문제는 다음 정보를 가진다.

```text
제목
카테고리
심각도
설명
관련 파일
관련 코드 위치
발견 근거
AI 수정 제안
해결 여부
```

---

# 11. 검사 기록

Supabase에 검사 결과를 저장한다.

사용자는 프로젝트별 과거 검사 기록을 확인할 수 있다.

예:

```text
Audit #1    63
Audit #2    74
Audit #3    87
Audit #4    92
```

이를 이용하여 프로젝트 완성도가 어떻게 개선되고 있는지 보여준다.

---

# 12. CRUD

### Create

새로운 감사 결과 저장.

### Read

프로젝트 및 과거 검사 기록 조회.

### Update

Issue의 `resolved` 상태 변경.

### Delete

사용자가 감사 기록 삭제.

---

# 13. MVP

1차 완성 목표:

- 프로젝트 폴더 선택
- 파일 필터링
- 프로젝트 트리 출력
- JS/TS 프로젝트 탐지
- 기본 정적 분석
- Gemini API 분석
- 5개 카테고리 검사
- 점수 계산
- 결과 대시보드
- Supabase 저장
- 이전 검사 조회
- Issue 해결 처리
- 감사 기록 삭제

---

# 14. MVP 이후 확장

- GitHub Repository URL 분석
- ZIP 업로드
- Python 지원
- Java/Spring 지원
- 프로젝트 비교
- 검사 규칙 사용자 설정
- GitHub Actions 연동
- 자동 재검사
- AI 수정 코드 생성
- 리포트 내보내기

---

# 15. 성공 기준

VibeAudit의 성공 기준은 단순히 Gemini API 응답을 화면에 표시하는 것이 아니다.

**서로 다른 프로젝트 파일의 관계를 분석하여 실제 개발 과정에서 발생할 수 있는 불일치를 찾아내고, 개발자가 수정할 수 있는 근거와 방향을 제공하는 것**을 핵심 성공 기준으로 한다.
