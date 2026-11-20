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

- **데이터 범위**: 모든 조회·수정에 사용자 데이터 범위를 적용한다. 화주사 사용자 → 자기 화주사만, 센터 운영자·작업자 → 소속 센터만, 운영사 관리자 → 자기 운영사 전체. 목록은 `scopeFilter(scope, …)`, 한 건 수정·삭제는 `assertInScope(scope, …)`로 (`src/lib/scope/`, `docs/decisions/0016`).
- **권한 검사는 화면 + 서버 둘 다**: 메뉴·버튼을 숨기는 것만으로 끝내지 않고, 서버 액션/API에서 같은 권한 코드로 다시 검사한다. 데이터를 바꾸는 서버 액션은 반드시 `createAction`(`src/lib/actions/create-action.ts`)으로 만든다 (`docs/decisions/0015`).
- **기준정보 코드 3층**: 우리 코드(`*_cd`, 비우면 체번 `issueCode`, 자동 체번 모양 직접 입력 금지 `isAutoPattern`, 등록 후 불변) + 사용자 정의 코드(`*_cust_cd`, 화주 시스템 코드, 수정 가능) + 외부 코드(`ExternalCode` 매핑, `saveExternalCodes`). 연동(API·엑셀)은 화주 연동 조회 키(`if-key.ts`)로 찾는다. 외부 코드는 각 등록 화면이 아니라 **외부코드 매핑 메뉴**에서만 넣는다(새 기준정보는 `external-code-targets.ts`에 대상 추가). 새 기준정보도 이 구조를 따른다 (`docs/decisions/0025`, `0068`, `0084`).
- **공통코드**: 분류·표시용 고르기 값은 하드코딩하지 말고 공통코드(그룹 → 코드)로 관리한다. 업무 표에는 코드 글자를 저장하고 저장 전 `assertCodeValues`로 검사, 새로 쓰는 칸은 `code-usage.ts`에 등록한다. 프로그램이 값에 따라 동작을 바꾸는 값은 상수 + DB `VARCHAR(20)` + CHECK로 둔다(ENUM 쓰지 않음 — 상수와 CHECK가 같은지 `src/config/db-value-sets.db.test.ts`가 확인, 새 칸은 거기 등록. 읽을 때 `toValue`, 표시 `labelOf` — `src/lib/db-value.ts`, 0084). 공통코드는 운영사마다 따로라, 플랫폼이 정하는 운영사 코드(유형·상태·요금제 등)는 상수 `src/config/operator-codes.ts` + DB 검사 조건으로 둔다 (`docs/decisions/0030`, `0040`).
- **내부 키는 BIGINT**: 서버·DB는 `bigint`, 화면·주소·서버 액션 입출력은 글자. 경계에서만 `src/lib/id.ts`로 바꾼다 — 입력 규칙 `idSchema`/`idField`, 주소 `parseId`, 조회 결과 `textIds`, 검색 조건 `idFilter` (서버 액션 결과는 `createAction`이 자동 변환). DB 이름 규칙은 `docs/db-conventions.md` (`docs/decisions/0037`).
- **예/아니오 칸(`_yn`)은 DB에 `'Y'`/`'N'`**: 화면·입력 규칙은 true/false, DB에 쓸 때 `toYn`, 읽을 때 `isYes` (`src/lib/yn.ts`). `if (row.xxx)`로 직접 검사 금지 (`'N'`도 참).
- **기준정보 공통 칸**: 등록·수정자(`created_by`/`updated_by`)와 버전(`row_version`)은 `prisma.ts`가 자동으로 채운다(서버 액션은 `createAction` 안에서만 DB를 바꾼다). 수정 화면·팝업은 불러온 버전을 저장 때 보내고, 서버는 `assertRowVersion`·`where: { id, rowVersion }`·`withVersionGuard`로 검사한다 (`src/lib/row-version.ts`, `docs/decisions/0038`).
- **기준정보는 지우지 않고 숨긴다(`del_yn`)**: 지우기는 `data: DELETED_ONLY`로만. 바깥 조회는 `prisma.ts`가 지운 줄을 자동으로 빼지만, include·select 안의 관계 목록·`_count`·관계 조건에는 `NOT_DELETED`를 직접 붙인다. 지운 것을 다룰 때만 조건에 `delYn`을 적는다. 지울 수 있는 목록은 상태 거르기 "삭제됨" + [되살리기]를 둔다 (`docs/decisions/0038`).
- **운영사(멀티테넌트)별로 나눈다**: 운영사 데이터 표는 `operator_id`를 갖고, 다른 운영사의 데이터는 보이지도 고쳐지지도 않아야 한다. 서버 액션 안은 `prisma.ts`가 자동으로 거르고 채운다(새로 만드는 함수는 `requireOperatorId()`). 화면 조회 함수는 `scopeFilter`·`isInScope`(select에 `operatorId`)·`operatorFilter`로 거른다. 아이디·이메일만 전체 고유(`acrossOperators`). 새 운영사에 넣을 기본값(공통코드·단위·권한그룹)은 `src/config/defaults/`에 두고 `provisionOperator`가 복사한다 (`docs/decisions/0039`).
- **번호는 숫자만 저장**: 사업자·법인등록번호, 전화·팩스는 하이픈 없이 저장하고, 화면 표시·입력에서만 `src/lib/format/`의 함수로 하이픈을 붙인다 (`docs/decisions/0029`).
- **재고는 직접 수정 금지**: 재고 수량은 반드시 재고 변경 공통 함수(`src/lib/stock/stock-change.ts`: `receiveStock`·`moveStock`·`adjustStock`, 이력 기록 포함)로만 바꾼다. 업무 저장과 같은 트랜잭션 `tx`를 넘기고, 그 트랜잭션은 `stockTransaction`(교착 시 자동 다시 시도, 0046)으로 연다. 함수 밖에서 재고 표를 바꾸면 `prisma.ts`가 오류를 낸다(직접 SQL·안쪽 관계 쓰기도 금지) (`docs/decisions/0045`).
- **재고는 기본단위로 저장**: 환산단위(BOX, CARTON, PLT)는 화면 표시·입력용이며, 환산은 공통 함수(`src/lib/units/convert.ts`: `toBaseQty`·`splitBaseQty`·`labelQuantities`·`formatQty` 등)에서만 한다. 수량은 DB Decimal, 코드에서는 글자로 주고받고 `Number`로 바꿔 계산하지 않는다 (`docs/decisions/0042`).
- **로케이션 스캔은 `창고코드.로케이션코드`**: 로케이션 코드는 창고 안에서만 유일하다. 바코드·표시는 `buildLocationBarcode`, 스캔한 값은 `parseLocationScan`으로만 해석한다 (`src/lib/locations/`, `docs/decisions/0084`).
- **로트번호·유통기한은 품목 설정에 따름**: 사용하는 품목은 필수 입력, 사용하지 않는 품목은 null.
- **재고 조정은 사유 필수**.
- 용어는 `docs/PRD.md`의 용어 정리를 따른다.

## UI 규칙

- 최신 트렌드의 깔끔한 UI: shadcn/ui + Tailwind 디자인 토큰만 사용 (임의 색상값 하드코딩 금지)
- **목록 화면은 `MasterListPage` + `useListQuery` + 검색 조건 정의(`SearchFieldDef[]`) + 컬럼 정의로 만든다** (`src/components/master-list/`, `docs/ui-guidelines.md` "목록·검색 화면", `docs/decisions/0032`). 서버 액션 입력은 `listQuerySchema`, 조건 해석은 `src/lib/grid/list-filters.ts`. 화면별 페이징·URL 처리·엑셀 구현 금지.
- **목록 화면은 반드시 공통 `DataGrid`(`src/components/data-grid/`)를 사용**한다. `<table>`이나 TanStack Table을 화면에서 직접 쓰지 않는다.
- 그리드에 필요한 기능이 없으면 화면에서 우회하지 말고 `DataGrid`에 기능을 추가하고, `/dev/grid` 쇼케이스에도 반영한다.
- 목록 그리드의 상태는 `useDataGridState('그리드-id')`로 만들고 `<DataGrid id>`에 같은 id를 준다 → 사용자별 설정(숨김·순서·너비·건수·정렬)이 자동 저장된다 (`docs/decisions/0021`)
- 자세한 설계: `docs/decisions/0002-ui-and-datagrid.md`
- **페이지 틀**: 목록·편집·기타 화면 모두 공통 `AppPage`(헤더 전체 폭·고정, 버튼 순서 보조 → 주 → [도움말](맨 오른쪽 끝))를 쓴다. 목록·편집은 `MasterListPage`·`MasterFormPage`가 감싸므로 화면에서 `mx-auto max-w-*`·자체 헤더를 쓰지 않는다. 간격은 토큰(`page`·`section`·`card`) (`docs/ui-guidelines.md` "페이지 틀", `docs/decisions/0036`)
- **입력 화면 배치**: 등록·수정 화면은 `MasterFormPage`(제한 폭 + 섹션 목차 + 아래 저장 막대) + `useMasterForm`(값·검사·변경 감지·취소·저장) + `FormGrid`/`Field span`(12칸) + 입력 부품(`@/components/inputs`: 번호 마스크·주소·공통코드 등) + 1:N은 `EditableSubTable`로 만든다. 화면 파일에는 섹션·필드 정의와 그 화면 전용 로직만. 카드 중첩·화면 폭 전체 입력칸·화면별 자체 마스크/검사 금지 (`docs/ui-guidelines.md`, `docs/decisions/0031`)
- **화면 도움말**: 화면을 완성하면(`ready: true`) `src/content/help/{메뉴 주소}.md` 도움말을 함께 쓴다. 버튼 설명 단락에는 `<!-- 권한: 메뉴.동작 -->`를 붙인다. 빠지면 `help-files.test.ts`가 실패한다 (`docs/decisions/0023`)
  - **모든 도움말에 화면 사진 1장 이상**(권역설정 도움말 모양): `e2e/help-shots.spec.ts`의 `SHOTS`에 화면·번호 대상을 추가 → `npm run e2e:prepare` → `npm run help:shots` → 소개 글 아래에 `![설명](/help/{메뉴 주소}/이름.png)` + `① … · ② … · ③ …` 설명. 손으로 캡처하지 않는다. 화면 모습이 바뀌면 사진도 다시 찍어 같은 작업에서 커밋한다
  - 글 표기: 버튼은 `[저장]`, 팁·참고·주의는 `> [!TIP]`·`> [!NOTE]`·`> [!WARNING]`, 순서는 `1. 2. 3.` (`docs/decisions/0077`)
- **화면 권한**: 각 화면(page.tsx) 맨 위에서 `hasPermission('메뉴.read')`로 확인하고 없으면 `<AccessDenied />`. 버튼은 `<Can permission="…">`으로 감싼다. 권한 코드는 `src/config/permissions.ts`에만 정의한다 (`docs/decisions/0011`, `0014`)

## 코드 스타일

- 들여쓰기 2칸, 세미콜론 없음, 작은따옴표
- 코드 주석·문서는 한국어, 변수명·함수명은 영어

## 화면 구조

- `/admin` — 운영사 화면 (운영사 관리자, 창고 작업자)
- `/portal` — 화주 포털 (화주 사용자)
- `/platform` — 플랫폼 화면 (플랫폼 관리자: 운영사 관리, 운영사를 골라 그 운영사로 작업 — 0039)
