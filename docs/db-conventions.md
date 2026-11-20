# DB 명명 규칙 · 공통 칸

- 상태: 1a(이름 바꾸기) **적용 완료** — 마이그레이션 `20261115075033_naming_convention` / 1b(BIGINT 키) **적용 완료** — `20261115083253_bigint_keys` / 1c(Y/N) **적용 완료** — `_yn_char`. 2단계(공통 칸)는 아래 규칙대로 진행 예정
- 결정: 사용자 결정 2026-11-15 — 정의서 규칙을 모든 표에 적용, `_yn`은 CHAR(1) 'Y'/'N', 내부 키 BIGINT, 코드 쪽 이름은 camelCase 유지
- 관련: `docs/specs/operator.md`(운영사 컬럼 정의서), 0037(명명 규칙)·0038(공통 칸)·0039(멀티테넌트)
- **테이블 정의서**: `docs/db/DB_테이블정의서.xlsx`(엑셀) · `docs/db/table-definitions.md` — `npm run db:doc`가 실제 DB 구조와 `prisma/schema.prisma` 주석으로 만든다. 손으로 고치지 않고, **마이그레이션을 적용하면 다시 돌려 함께 커밋**한다. 칼럼 설명은 스키마 주석, 한글명은 `scripts/db-doc-words.ts` 사전에서 온다

## 규칙

| 대상 | 규칙 | 예 |
| --- | --- | --- |
| 표 | `tb_` + snake_case | `tb_center`, `tb_operator_contact` |
| 칸 | snake_case | `zip_cd`, `addr1` |
| `_id` | 내부 키 (BIGINT, 자동 증가) | `center_id` |
| `_cd` | 코드 (공통코드·값 목록·우리 코드) | `center_cd`, `status_cd`, `temp_zone_cd` |
| `_cust_cd` | 사용자 정의 코드 (화주·ERP 시스템의 코드, 0084) | `item_cust_cd` |
| `_nm` | 명칭 | `center_nm`, `ceo_nm` |
| `_no` | 번호 — **숫자만** 저장 | `biz_reg_no`, `tel_no` |
| `_yn` | 예/아니오 — CHAR(1) `'Y'`/`'N'` (CHECK 제약) | `primary_yn`, `del_yn` |
| `_dt` / `_at` | 날짜 / 일시 | `establish_dt`, `created_at` |
| `_qty` / `_cnt` / `_amt` | 수량(소수 가능) / 개수(정수) / 금액 | `conv_qty`, `pallet_box_cnt`, `max_user_cnt` |
| `_days` | 일수 | `shelf_life_days`, `expiry_alert_days` |
| 정렬 순서 | `sort_seq` | |

- **코드 쪽 이름은 그대로**(camelCase): Prisma `@@map`/`@map`으로 DB 이름만 바꾼다. 예) 코드 `center.businessNumber` ↔ DB `tb_center.biz_reg_no`.
- **`_yn` 값** (`src/lib/yn.ts`): DB는 CHAR(1) `'Y'`/`'N'` + 검사 조건(`표_칸_check`). 화면·입력 규칙(Zod)은 true/false 그대로 두고, **DB에 쓸 때 `toYn`, 읽을 때 `isYes`**로 바꾼다. 목록 검색 조건은 `ynFilter`(`'Y'`/`'N'`).
  - 주의: Prisma 타입은 `string`이라 `if (row.isSystem)`처럼 쓰면 `'N'`도 참이 된다 — 반드시 `isYes(...)`.
  - 대상(1c): `lot_mgmt_yn`·`expiry_mgmt_yn`(화주사), `primary_yn`(화주사·운영사 담당자), `system_yn`(공통코드 그룹·단위). `is_active`는 2단계에서 `status_cd`로 바뀌므로 그대로 두었다.
  - 예외: Better Auth가 직접 쓰는 `email_verified`는 라이브러리가 true/false로 쓰므로 boolean 유지.
- **BIGINT 키** (자동 증가, `src/lib/id.ts`): 서버·DB는 JS `bigint`, 화면·주소·서버 액션 입출력은 글자(`'12'`). 경계에서만 바꾼다.
  | 경계 | 방법 |
  | --- | --- |
  | 서버 액션 결과 → 화면 | `createAction`이 결과 안의 bigint를 모두 글자로 (자동, `textIds`) |
  | 조회 함수(`queries.ts`) → 화면 | 결과를 `textIds(...)`로 감싼다 |
  | 화면 → 서버 액션 입력 | 입력 규칙 `idSchema` / `idField('센터를 골라 주세요.')` / `optionalIdSchema` (글자 → bigint) |
  | 주소 `[id]` | `parseId(params.id)` → 숫자 모양이 아니면 `notFound()` |
  | 목록 검색 조건 | `idFilter(filters, 'center')` |
  | 폼 `afterSave` | 검사를 거친 값의 키는 bigint라 `String(...)`으로 되돌린다 |
  - Better Auth 표(user·session·account·verification)는 `advanced.database.generateId: 'serial'`로 DB가 키를 만든다. Better Auth가 주는 사용자 키는 글자라 `getCurrentUser`에서 `BigInt`로 바꾼다.
  - 서버 안에서만 부르는 함수(`createUserAccount` 등)는 bigint를 그대로 받는다.
- 길이: 정의서의 VARCHAR(n)·CHAR(n)를 DB에도 `@db.VarChar(n)`로 둔다 (입력 규칙 최대 길이와 같게).
- **TEXT 금지** (0084 ④-2): 길이를 정한 VARCHAR로. 예외는 로그 본문(`req_body`·`resp_body`·`response_body`)과 인증 라이브러리 표(`tb_user`·`tb_account`·`tb_session`·`tb_verification`)의 인증 칸뿐이다.
- **값 목록 칸은 VARCHAR(20) + CHECK** (0084 ④-2, ENUM 쓰지 않음): 값 목록은 상수(`src/config/*-codes.ts`·각 업무의 `*-codes.ts`) + DB `CHECK (칸 IN (…))` 두 곳에 두고, `src/config/db-value-sets.db.test.ts`가 둘이 같은지 확인한다(새 칸은 그 표에 등록). Prisma는 `string`으로 주므로 값에 따라 동작을 바꾸는 곳은 `toValue(상수, 값)`(`src/lib/db-value.ts`)로 좁히고, 표시 글자는 `labelOf`로. 글자 칸은 알파벳 순으로 정렬되므로 정해진 순서가 필요하면 프로그램에서 정렬한다.
- 바깥에서 길이가 정해진 코드는 그 길이로: GLN 13, HS 12, 언어 5, 정제한 우편번호 `zip_cd` CHAR(5) + 숫자 5자리 검사(원본은 `raw_zip_cd` VARCHAR(10)).
- 약어: `location`은 줄이지 않는다(`loc` 쓰지 않음 — PK가 `location_id`). 법정동코드는 `bjd_cd`, 시군구명은 `sigungu_nm`.
- **FK**: 업무 문서·기준정보 표의 `_id` 참조 칸에는 FK를 건다. 이력·로그 표(`tb_stock_txn`, `*_hist`, API 요청 로그)에서 나가는 참조는 원본이 지워지거나 바뀌어도 기록이 남아야 하므로 **일부러 FK를 두지 않는다**.

## 공통 칸 (기준정보)

| 칸 | 형식 | 설명 |
| --- | --- | --- |
| `status_cd` | VARCHAR(20) | 기준정보 공통 `ACTIVE`(사용) / `INACTIVE`(중지) — `isActive` 대체. 운영사는 `OPERATOR_STATUS` |
| `del_yn` | CHAR(1) | 논리 삭제. 모든 조회는 `del_yn = 'N'`만, 코드 중복 검사도 삭제 안 된 것끼리 (부분 고유 인덱스) |
| `created_at` / `created_by` | TIMESTAMP / VARCHAR(50) | 등록 일시·등록자 아이디 |
| `updated_at` / `updated_by` | TIMESTAMP / VARCHAR(50) | 수정 일시·수정자 아이디 |
| `row_version` | INT | 낙관적 락: 저장 때 같으면 +1, 다르면 "다른 사람이 먼저 고쳤습니다" |

- 대상 표 목록은 `src/lib/prisma.ts`가 기준이다: 등록·수정자·버전 `AUDITED_MODELS`, 등록·수정자만(버전은 부모에서 검사) `STAMPED_MODELS`(담당자 표 4개, 0084), 논리 삭제 `SOFT_DELETE_MODELS`, 운영사 `TENANT_MODELS`. 새 표를 만들면 여기에 더한다. 사용자는 계정을 지우지 않으므로 `del_yn` 없음.
- **등록·수정자 자동 기록 (2a 적용)**: 화면·기능 코드에서 넣지 않는다. `createAction`이 로그인 사용자 아이디로 `runAsActor`를 감싸고(`src/lib/actor.ts`), `prisma.ts`의 확장이 등록·수정 때 `created_by`/`updated_by`를 채우고 수정 때마다 `row_version +1` 한다. 시드는 `seed`, 감싸지 않은 곳은 `system`.
  - 주의: 안쪽 관계로 함께 만드는 줄(nested create)은 확장이 채우지 못한다 → 공통 칸이 있는 표는 바깥에서 직접 만든다.
  - 화면 표시: `actorLabel(아이디)` → '이름 (아이디)' / '시스템'.
- **상태 `status_cd`**: 기준정보 공통 `'ACTIVE'`/`'INACTIVE'` + 검사 조건(표마다 값이 더 있으면 그 표의 상수 — 값 목록 칸 규칙). 코드는 `src/lib/status.ts`.
  - 화면·입력 규칙은 지금처럼 사용 여부 `isActive`(true/false). DB에 쓸 때 `toStatus`/`withStatus`, 읽을 때 `isActiveStatus`/`withIsActive`, 조건은 `ACTIVE_ONLY`, 목록 검색은 `statusWhere(filters)`.
  - 주의: 타입 검사가 못 보는 곳 — 목록 정렬 매핑(`sortable: { isActive: 'status' }`), 조건 목록 안의 객체, 입력값을 통째로 저장하는 `data`(반드시 `withStatus`).
  - Better Auth 사용자 추가 칸도 `status` (`ACTIVE`만 로그인).
- **논리 삭제 `del_yn`**: `SOFT_DELETE_MODELS`의 표. 지우기는 `del_yn = 'Y'`로만 (`DELETED_ONLY`), 실제로 지우지 않는다.
  - 자동 제외: `prisma.ts`가 읽기·개수·수정·upsert 조건에 `delYn: 'N'`을 붙인다. 지운 것을 다루려면 조건에 `delYn`을 직접 적는다(`DELETED_ONLY`). **include·select 안의 관계 목록, `_count`, 관계 조건(`zone: {…}`)은 자동으로 안 걸리므로 `NOT_DELETED`를 직접 붙인다.**
  - 코드(이름) 고유는 삭제 안 된 것끼리만: Prisma `partialIndexes`(미리보기) `@@unique([...], where: raw("del_yn = 'N'"))`. 지운 코드는 새로 쓸 수 있다.
  - 되살리기: 목록 상태 거르기 "삭제됨"(`DELETED_STATUS_OPTION`, 서버 `deletedWhere`) → [되살리기](`RestoreButton`). 공통코드는 [지운 항목] 팝업. 권한은 삭제 권한과 같다. 같은 코드가 다시 쓰이고 있거나 부모(코드 그룹)가 지워졌으면 거부 (`src/lib/soft-delete.ts`). 외부 코드는 되살아나지 않는다.
- **동시 수정 막기 (2a 적용)**: 수정 화면·팝업은 불러올 때의 `rowVersion`을 들고 있다가 저장 때 보낸다(`useMasterForm`의 `version`, 결과의 새 버전으로 자동 갱신). 서버는 `assertRowVersion` + 수정 조건에 버전(`where: { id, rowVersion }`) + `withVersionGuard`(`src/lib/row-version.ts`). 사용 중지·일괄 처리는 검사 없이 버전만 올린다.

## 운영사 칸 `operator_id` (3단계 멀티테넌트, 0039)

- 대상은 `TENANT_MODELS`(`src/lib/prisma.ts`)의 표. 하위 표는 부모를 따른다.
- 고유 규칙은 같은 운영사 안에서만 (`@@unique([operatorId, code], …)`). 로그인 아이디·이메일은 전체에서 하나.
- **서버 액션 안**: `createAction`이 운영사 출입증(`runInContext`, `src/lib/actor.ts`)을 만들고, `prisma.ts`가 그 표들의 읽기·수정·삭제에 지금 운영사 조건을 붙이고 등록에 운영사를 채운다. 새로 만드는 함수는 `requireOperatorId()`로 운영사를 받는다. 전체 고유 값(아이디·이메일) 중복 검사만 `acrossOperators()`.
- **서버 액션 밖(화면 조회 함수)**: 자동 거르기가 없다 → `scopeFilter`(운영사 조건 자동)·`isInScope`(줄의 `operatorId` 검사 — `select`에 `operatorId`를 꼭 넣는다)·`operatorFilter(scope)`(센터·화주사로 나누지 않는 데이터)를 쓴다.
- 플랫폼 관리자(`user_type_cd = PLATFORM`)만 `operator_id`가 비어 있다 (검사 조건). 운영사 상태 `tb_operator.status_cd`가 ACTIVE가 아니면 그 운영사 사용자는 로그인할 수 없다.
- 주의: 안쪽 관계로 함께 만드는 줄(nested create)은 안전망이 채우지 못한다 → `operatorId`를 직접 넣는다. 범위 검사는 넘겨받은 값(`{ centerId }`)이 아니라 DB에서 읽은 줄로 한다.

## 표·칸 정의서 (자동 생성)

표·칸 목록·타입·검사 조건·인덱스는 DB에서 자동으로 만든 정의서를 본다. 손으로 쓴 대응표는 두지 않는다(어긋나기 쉽다).

- `docs/db/table-definitions.md` · `docs/db/DB_테이블정의서.xlsx` — `npm run db:doc`로 다시 만든다 (DB 구조를 바꾼 작업에서 함께 커밋)
- 한글 칼럼명은 `scripts/db-doc-words.ts`: 칼럼별 예외(`COLUMN_NAMES`) → 여러 낱말 묶음(`PHRASES`) → 낱말 사전(`WORDS`) 순서. 새 낱말·칸은 여기에 더한다
- 표·칸 설명은 `prisma/schema.prisma`에서 모델·칸 바로 위의 `//` 주석 (모델과 주석 사이에 빈 줄을 두지 않는다)
