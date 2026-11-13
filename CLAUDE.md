# 3PL 관리 플랫폼

3PL 운영사가 여러 센터·창고에서 여러 화주사의 입고·재고를 관리하고, 화주사는 포털에서 품목·ASN을 등록하고 자기 재고를 조회하는 B2B 웹 솔루션.

## 먼저 읽을 문서

- 무엇을 만드는지: `docs/PRD.md`
- 지금 무엇을 할 차례인지: `docs/ROADMAP.md` ("현재 위치" 확인)
- 데이터 구조: `docs/decisions/0003-domain-model.md`
- 왜 그렇게 정했는지: `docs/decisions/`

## 작업 방식 (매 작업마다 이 순서)

1. `docs/ROADMAP.md`에서 다음 체크박스 작업 하나만 고른다
2. 코드 작성 전에 변경 계획(바꿀 파일, 이유)을 먼저 설명하고 확인받는다
3. 구현한다 — 한 번에 그 작업 범위만
4. 직접 확인한다 (테스트 실행, 필요하면 브라우저 확인)
5. ROADMAP 체크박스를 `[x]`로 바꾸고 "현재 위치"를 갱신한다
6. 작은 단위로 한글 커밋 메시지로 커밋한다
7. 중요한 결정(라이브러리 선택, DB 구조 등)은 `docs/decisions/`에 새 번호로 기록한다

## 기술 스택

Next.js (App Router) · TypeScript · PostgreSQL · Prisma · Tailwind + shadcn/ui · Zod · Vitest · Playwright
자세한 이유: `docs/decisions/0001-tech-stack.md`

## 절대 규칙 (도메인)

- **데이터 범위**: 모든 조회·수정에 사용자 데이터 범위를 적용한다. 화주사 사용자 → 자기 화주사만, 센터 운영자·작업자 → 소속 센터만, 운영사 관리자 → 전체. 목록은 `scopeFilter(scope, …)`, 한 건 수정·삭제는 `assertInScope(scope, …)`로 (`src/lib/scope/`, `docs/decisions/0016`).
- **권한 검사는 화면 + 서버 둘 다**: 메뉴·버튼을 숨기는 것만으로 끝내지 않고, 서버 액션/API에서 같은 권한 코드로 다시 검사한다. 데이터를 바꾸는 서버 액션은 반드시 `createAction`(`src/lib/actions/create-action.ts`)으로 만든다 (`docs/decisions/0015`).
- **재고는 직접 수정 금지**: 재고 수량은 반드시 재고 변경 공통 함수(이력 기록 포함)로만 바꾼다. 수량 변경과 이력 기록은 하나의 DB 트랜잭션으로 묶는다.
- **재고는 기본단위로 저장**: 환산단위(BOX, CARTON, PLT)는 화면 표시·입력용이며, 환산은 공통 함수에서만 한다. 수량은 Decimal.
- **로트번호·유통기한은 품목 설정에 따름**: 사용하는 품목은 필수 입력, 사용하지 않는 품목은 null.
- **재고 조정은 사유 필수**.
- 용어는 `docs/PRD.md`의 용어 정리를 따른다.

## UI 규칙

- 최신 트렌드의 깔끔한 UI: shadcn/ui + Tailwind 디자인 토큰만 사용 (임의 색상값 하드코딩 금지)
- **목록 화면은 반드시 공통 `DataGrid`(`src/components/data-grid/`)를 사용**한다. `<table>`이나 TanStack Table을 화면에서 직접 쓰지 않는다.
- 그리드에 필요한 기능이 없으면 화면에서 우회하지 말고 `DataGrid`에 기능을 추가하고, `/dev/grid` 쇼케이스에도 반영한다.
- 자세한 설계: `docs/decisions/0002-ui-and-datagrid.md`
- **화면 권한**: 각 화면(page.tsx) 맨 위에서 `hasPermission('메뉴.read')`로 확인하고 없으면 `<AccessDenied />`. 버튼은 `<Can permission="…">`으로 감싼다. 권한 코드는 `src/config/permissions.ts`에만 정의한다 (`docs/decisions/0011`, `0014`)

## 코드 스타일

- 들여쓰기 2칸, 세미콜론 없음, 작은따옴표
- 코드 주석·문서는 한국어, 변수명·함수명은 영어

## 화면 구조

- `/admin` — 운영사 화면 (운영사 관리자, 창고 작업자)
- `/portal` — 화주 포털 (화주 사용자)
