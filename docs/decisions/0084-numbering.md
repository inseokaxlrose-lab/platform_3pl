# 0084. 코드 체계(체번) — 체번 규칙·현재값 표, 운영사·날짜별 문서번호

- 날짜: 2026-11-20
- 상태: 채택 (① 체번 기반 · ② 코드 3층 · ③ 용어·타입 · ④ 중간 항목 · ⑤ 마무리 — 정의서 system_code 반영 완료)
- 관련: 0025 (기준정보 코드 3층 — ②에서 갱신), 0047 (문서 번호 — 대체), 0039 (멀티테넌트)
- 정의서: `docs/specs/system_code.md` (테이블 정의서 검토 + 체번 반영안)
- 코드: `src/lib/numbering/` (`numbering-codes.ts` 값·번호 모양, `numbering.ts` 발급), `src/lib/documents/doc-no.ts`
- 마이그레이션: `20261120000000_numbering`

## 사용자 결정 (2026-11-20, 모두 추천안)

| 항목 | 결정 |
| --- | --- |
| 작업 나누기 | 5단계로 나눠 병합 — ① 체번 기반 ② 코드 3층 ③ 용어·타입 ④ 중간 항목(이름·ENUM) ⑤ 로케이션 바코드·정의서 한글명·규칙 문서 |
| location / loc | `location`으로 통일 (④) |
| 공통코드 항목 칼럼 | `code_cd`·`code_nm`으로 줄임 (④) |
| 운영사 중량·길이 단위 | id(FK)로 (③) |
| 정의서 7장 결정 | 그대로 — 로케이션 바코드 `창고코드.로케이션코드`, 용어 shipper·customer, ENUM → VARCHAR+CHECK, 전면 재체번, 문서번호 하이픈 유지, sys_cd 삭제 |

## ① 체번 기반

### 표

- `tb_numbering_rule` (체번 규칙): 대상마다 번호 모양. `operator_id` NULL = 시스템 기본, 값이 있으면 그 운영사의 재정의(운영사 행이 이긴다 — 단위·팔레트 종류와 같은 공유 방식, `SHARED_SYSTEM_MODELS`).
  - 대상당 하나: 부분 고유 인덱스 2개 (운영사 행 `(operator_id, target_cd)`, 시스템 행 `(target_cd)`) — 정의서의 `NULLS NOT DISTINCT`를 Prisma가 표현할 수 있는 모양으로.
  - 값은 상수(`numbering-codes.ts`) + DB 검사 조건 (0040).
- `tb_numbering_seq` (체번 현재값): PK (운영사, 대상, 범위 키, 주기 키). 카운터라 FK를 두지 않는다.

### 번호 모양

`접두어 + 구분 문자 + 날짜 + 구분자 + 일련번호(0 채움)`

| 대상 | 접두어 | 예 | 범위 | 초기화 |
| --- | --- | --- | --- | --- |
| SHIPPER | `SH` | `SH0001` | 운영사 | 없음 |
| CUSTOMER | 화주 `code_prefix` + `C` | `ABC000123` | 화주사 | 없음 |
| SHIP_TO | 거래처코드 + `-` | `ABC000123-01` | 거래처 | 없음 |
| ITEM | 화주 `code_prefix` + `S` | `ABS000123` | 화주사 | 없음 |
| ASN · RECEIPT · ADJUST | `AS` · `RC` · `AJ` + YYMMDD + `-` | `AS261120-0001` | 운영사 | 매일 |
| LABEL | `LB` + YYMMDD + `-` | `LB261120-000001` (6자리) | 운영사 | 매일 |

- 날짜·주기는 **운영사 타임존**(`tb_operator.timezone`) 기준 등록일.
- 자리수를 넘으면 잘라 내지 않고 길어진다 (예: `AS261120-12345`).
- 거래처·납품처·품목 규칙은 시스템 기본만 넣어 두고, 화주 `code_prefix`·상위 코드 찾기는 ②에서 연결한다.

### 발급 (`numbering.ts`)

- `issueCodes(db, target, ctx, n)`: `INSERT … ON CONFLICT DO UPDATE SET last_seq = last_seq + n RETURNING last_seq` **한 문장**으로 원자적으로 n개 범위를 받는다 (MAX()+1 금지). 값은 모두 바인딩.
- `issueCode`: 한 건. `isAutoPattern`: 직접 입력한 코드가 자동 체번 모양인지 (②에서 직접 입력 거부에 쓴다).
- 등록과 같은 트랜잭션에서 받는다. 트랜잭션이 실패하면 결번이 생길 수 있다 (허용).

### 문서번호 (0047 대체)

- `nextDocumentNumber`는 체번을 부른다 (운영사는 출입증의 운영사). 옛 종류별 DB 시퀀스(`doc_no_*_seq`)와 `src/config/document-numbers.ts`는 지웠다.
- **H1**: 문서번호 UNIQUE를 전역 → `(operator_id, 번호)`로 (`tb_asn`·`tb_inbound_receipt`·`tb_inbound_label`·`tb_stock_adjust`). 운영사마다 같은 날 같은 번호가 나올 수 있으므로.

## ② 코드 3층

기준정보 코드를 세 겹으로 정리한다. 옛 0025의 "시스템 코드(`sys_cd`, CT000001 등)"는 없앴다.

| 층 | 칸 | 뜻 |
| - | - | - |
| 내부 키 | `*_id` | BIGINT, 화면에 안 보임 |
| 우리 코드 | `*_cd` | 비우면 자동 체번, 직접 넣어도 됨(자동 모양은 거부), **등록 후 바꿀 수 없음** |
| 사용자 정의 코드 | `*_cust_cd` | 화주(또는 운영사 ERP) 시스템의 코드, 선택·수정 가능, 같은 범위 안 중복 금지(부분 UNIQUE) |
| 외부 코드 | `tb_ext_code` | 연동 상대별 매핑 (그대로) |

- **sys_cd 5개 삭제**: 센터·창고·화주사·거래처·품목. 센터·창고 코드는 원래 필수 입력이라 그대로 두고, 시스템 코드 칸·검색·모양 검사만 지웠다. 종류별 시퀀스(`system_code_*_seq`)와 `src/config/master-codes.ts`·`system-code.ts`도 지웠다.
- **화주사**: 코드를 비우면 `SH0001`. `code_prefix`(2글자, `^[A-HJ-NP-Z][A-HJ-NP-Z2-9]$` — I·O·0·1 제외, 운영사 안 중복 금지)는 **필수**이고, 하위 거래처·품목 코드가 한 번이라도 발행되면(지운 것 포함) 바꿀 수 없다. 기존 화주사는 마이그레이션이 운영사별로 `AA`·`AB`…를 채웠다. `shipper_cust_cd`(운영사 ERP 코드 등), `if_key_type_cd` 추가.
- **거래처·납품처·품목**: 코드를 비우면 자동 — 거래처 `{접두어}C000001`, 납품처 `{거래처코드}-01`(기본 납품처도 이 모양), 품목 `{접두어}S000001`. 각각 `*_cust_cd` 추가. 납품처명 200자(H2).
- **연동 조회 키(`if_key_type_cd`)**: 화주사마다 `CODE`(우리 코드, 기본) / `CUST_CD`(사용자 정의 코드). 품목 엑셀 업로드·품목 API가 이 키로 대상을 찾는다(`src/lib/master-code/if-key.ts`의 `keyWhere`).
  - `CODE`: 업로드에서 품목코드를 비운 줄은 매번 새 품목(자동 체번). API는 `itemCd` 필수.
  - `CUST_CD`: 업로드는 사용자정의코드 칸, API는 `itemCustCd`가 필수. 새 품목의 품목코드는 함께 보낸 값 또는 자동. 기존 품목에 다른 품목코드를 보내면 `ITEM_CD_INVALID`. `GET /items/{key}`의 경로 값도 이 키.
  - 거래처 API·업로드의 조회 키 적용은 ③에서 했다.
- 화주사 수정에서 다른 화주사 코드를 보내면 거부한다(화면은 읽기 전용).

## ③ 용어·타입

- **client → shipper** (H5): `max_client_cnt`→`max_shipper_cnt`, `mix_client_yn`→`mix_shipper_yn`, 주문번호 중복 기준 값 `CLIENT`·`CLIENT_DAY`→`SHIPPER`·`SHIPPER_DAY`, 배송센터 확인 사유 `NOT_CLIENT_CENTER`→`NOT_SHIPPER_CENTER`. 칼럼은 `RENAME`으로(데이터 유지), 값은 마이그레이션에서 바꾸고 검사 조건을 다시 만들었다.
- **partner → customer** (H5): API 경로 `/partners`→`/customers`, 필드 `partnerCd`·`partnerNm`·`partnerType`·`partnerGroup`→`customerCd`·`customerNm`·`customerType`·`customerGroup`, 권한 `PARTNER_READ/WRITE`→`CUSTOMER_READ/WRITE`(발급된 키도 마이그레이션이 바꿈), API 구분(`api_cd`)·오류코드(`PARTNER_*`→`CUSTOMER_*`), 공통코드 그룹 `PARTNER_TYPE`→`CUSTOMER_TYPE`, 필드 대응표 `docs/api-customer-fields.md`. 개발 단계라 옛 경로는 남기지 않는다.
  - 그대로 둔 것: 센터 유형 `PARTNER`(협력·위탁 센터 — 거래처와 뜻이 다름), `tb_api_client`(API를 부르는 주체), 요청 로그 가리기에서 `customer` 칸은 계속 가린다(개인 구매자일 수 있음).
- **거래처 조회 키**: 화주 연동 조회 키가 `CUST_CD`면 거래처는 `customerCustCd`, 납품처는 `shipToCustCd`로 찾는다(API·엑셀). 새 거래처·납품처의 우리 코드는 보낸 값 또는 자동 체번이고, 다른 우리 코드를 보내면 `CUSTOMER_CD_INVALID`·`SHIP_TO_CD_INVALID`. 경로 `{customerCd}`도 조회 키 값. 응답은 우리 코드·사용자 정의 코드를 함께 준다.
- **H4 화주사 타입**: `tb_shipper`·`tb_shipper_contact`의 TEXT 칼럼을 운영사·거래처와 같은 길이의 VARCHAR로(코드 20, 이름 100, 주소 200, 전화·팩스 15, 이메일 100, 사업자번호 CHAR(10)), 사업자번호 10자리·전화·팩스 8~15자리 숫자 검사 추가.
- **H6 운영사 표시 단위**: `weight_unit_cd`·`length_unit_cd`(코드 글자) → `weight_unit_id`·`length_unit_id`(FK `tb_unit`). 기본값은 DB 함수 `system_unit_id('KG'/'CM')`(시스템 단위 id). 유형(중량·길이)과 범위(시스템 또는 그 운영사 단위)는 FK로 표현되지 않아 트리거로 검사한다. 단위 코드가 운영사마다 겹칠 수 있어 코드로는 어떤 단위인지 확정되지 않기 때문.

## ④ 중간 항목 (정의서 3장 M1~M18)

사용자 결정(2026-11-20): 세 번 나눠 병합(④-1 이름 · ④-2 타입·검사 · ④-3 구조), M18 센터 옛 담당자 칸은 삭제(값은 담당자 표로), M4 담당자 표는 화면에도 부서·직책·알림 칸, M17 그리드 설정·개인 설정 표는 둘 다 유지(용도가 다름)하고 설명만 고친다.

### ④-1 칼럼 이름

DB 칼럼 이름만 바꾸고(RENAME — 데이터 유지) 프로그램의 Prisma 필드 이름(`locType`·`palletBoxQty` 등)은 그대로 둔다. 화면·API 이름까지 바꾸면 변경 범위만 커지고 얻는 것이 없다.

| # | 전 | 후 |
| - | - | - |
| M1 | `tb_perm_group_perm`·`tb_user_perm_group`.`group_id` | `perm_group_id` |
| M2 | `tb_code_group`·`tb_code_item`.`group_id` | `code_group_id` |
| M3 | `code_item_cd`·`code_item_nm` | `code_cd`·`code_nm` |
| M8 | `expiry_alert_day_cnt` | `expiry_alert_days` (일수는 `_days`) |
| M9 | `conv_cnt`·`pallet_box_qty`·`max_stack_box`·`confirm_qty` | `conv_qty`·`pallet_box_cnt`·`max_stack_box_cnt`·`confirmed_qty` (수량 `_qty`, 개수 `_cnt`) |
| M10 | `loc_type_cd`·`default_*_loc_id`·`default_loc_id`·`loc_cd_prefix`·`loc_cd_separator` | `location_*` (PK가 `location_id`라 `loc` 약어를 쓰지 않는다) |
| M12 | `tb_customer.region_cd`(법정동코드)·`tb_center.region_nm`(시군구) | `bjd_cd`·`sigungu_nm` (납품처와 같은 이름) |
| M16 | `tb_api_rate_bucket.window_start` | `window_start_at` (일시는 `_at`) |

### ④-2 타입·검사

- **M6 ENUM 13개 → VARCHAR(20) + CHECK**: 칸 15개. 값은 `USING 칸::text`로 그대로 옮기고, ENUM 값을 직접 쓰던 검사 조건 7개는 지웠다가 다시 만들었다. `tb_asn.reg_channel_cd`에 `API`(입고예정 API용) 값을 더했다.
  - 값 목록 상수 ↔ DB CHECK 비교 테스트 `src/config/db-value-sets.db.test.ts`: DB의 모든 값 목록 검사 조건(89칸)을 읽어, 상수가 없는 칸·DB에 없는 상수·값이 다른 칸이 있으면 실패한다. 자리가 없던 값 목록은 `src/config/db-codes.ts`에 모았다.
  - Prisma가 주는 타입이 `string`이 되어, 값에 따라 동작이 달라지는 곳은 `toValue`로 좁히고(`src/lib/db-value.ts`), 표시용 행 타입은 `string`으로 넓혔다.
  - 단위 목록의 기본 정렬(유형 순서)은 ENUM 정의 순서에 기대고 있었다 → 정렬을 고르지 않았을 때 프로그램에서 `UNIT_TYPES` 순서로 정렬한다. 사용자가 고른 열 정렬(상태 등)은 알파벳 순이 된다.
- **M7**: 값 목록 코드 칸을 VARCHAR(20)으로(10자였던 26칸), 우리 표의 TEXT 칸 16개를 길이를 정한 VARCHAR로. 공통코드 코드는 업무 표의 코드 칸(20자)에 들어가므로 입력 규칙도 30자 → 20자.
- **M11**: 정제 우편번호 `tb_customer`·`tb_ship_to.zip_cd` CHAR(5) + 숫자 5자리 검사.
- **M14**: 같은 내용의 상태 검사 조건 중복(`tb_location`·`tb_warehouse`) 하나씩 삭제.
- **M15**: 빠진 FK 9개(`tb_putaway` 4, `tb_stock_adjust.center_id`, 입고확정·조정 줄의 `stock_txn_id`, API 멱등·호출 한도의 `api_client_id`). 이력·로그 표에서 나가는 FK는 일부러 두지 않는다(db-conventions).
- **M5**: 운영사·화주사·거래처 담당자에도 "대표 1명" 부분 UNIQUE.
- **M18**: `tb_center.manager_nm`·`manager_tel_no` 삭제. 값이 있고 담당자가 없는 센터는 대표 담당자(센터장, `MANAGER`)로 옮겼다.

### ④-3 구조

- **M4 담당자 표 4개 같은 모양**(운영사·센터·화주사·거래처): PK `{표}_id`(RENAME — 키 값 그대로), 부서·직책·알림 수신(`dept_nm`·`position_nm`·`notify_yn`), 감사 칸(등록·수정 일시·자). 화주사만 `if_contact_yn`(연동 담당)이 더 있다.
  - 등록·수정자는 `prisma.ts`의 `STAMPED_MODELS`(버전 칸 없는 표)가 채운다. 버전은 부모 표에서 검사한다.
  - 운영사·화주사·거래처 담당자는 저장 때 "지우고 다시 넣기"라 감사 칸은 마지막 저장 기준이다(센터만 줄을 유지). 줄 유지가 필요해지면 센터처럼 담당자 id를 화면에 둔다.
  - 화면: 공용 입력 규칙 `contactSchema`에 `deptName`·`positionName`·`notify`(안 보내면 빈 칸·받음), 공용 열 `contactExtraColumns()`, 표 부품 `EditableSubTable`에 `input: 'checkbox'` 추가.
- **M13**: 거래처에도 납품처와 같은 주소 정제 결과 칸(`sigungu_nm`·`bd_mgt_sn`·`addr_norm_method_cd`). 기존 거래처는 다음 주소 저장 때 채운다.
- **M17**: `tb_user_grid_setting`(그리드별 열 설정)과 `tb_user_pref`(그 밖의 고르기 기억)는 용도가 달라 둘 다 둔다. 그리드 설명 주석이 개인 설정 모델 위에 붙어 정의서에서 섞여 보였던 것을 바로잡았다.
- 함께 고친 것: 정제하지 못한 납품처의 원본 우편번호가 5자리가 아니면(옛 6자리) `zip_cd`를 비운다 — ④-2의 CHAR(5) 검사로 저장이 실패하던 문제.

## ⑤ 마무리

- **로케이션 바코드(H3)**: 로케이션 코드는 창고 안에서만 유일하므로(DB `UNIQUE (warehouse_id, location_cd)` 유지), 스캔용 바코드는 `창고코드.로케이션코드`(예: `STORAGE1.A-01-02`). 구분자 `.`은 창고·로케이션 코드 규칙과 DB 검사 조건이 이미 막는다.
  - `buildLocationBarcode`·`splitLocationScan`(`src/lib/locations/location-barcode.ts`, 화면·서버 공용), `parseLocationScan(db, centerId, 스캔값)`(`location-scan.ts`) — 바코드면 그 센터의 한 곳, 로케이션코드만이면 1건 확정·여러 건은 창고 후보. **앞으로 만드는 이동·피킹·실사 등 스캔 화면은 이 함수만 쓴다.**
  - 적치·실사 조정·재고 이력의 로케이션 표시를 바코드 모양으로 맞췄다(적치 검색칸에 스캐너로 찍으면 바로 찾아진다). 로케이션 목록에 바코드 열.
  - 로케이션 라벨 인쇄는 아직 없다. 만들 때 입고 라벨처럼 바코드 형식 버전을 넣는다.
- **DB 정의서 한글명(4장)**: 생성기에 칼럼별 예외 사전(`COLUMN_NAMES` — 업태·연면적·실사 수량·주문번호 중복 기준 코드 등)과 낱말 사전 수정(계정·면적·범위·가액), 설명 없던 표 8개에 설명, 같은 설명이 두 줄인 주석은 하나로.
- **규칙 문서**: `docs/db-conventions.md`의 손으로 쓴 표·칸 대응표(1단계 25개 표 기준이라 낡음)를 지우고 자동 생성 정의서를 가리키게 했다. 공통 칸 대상 표는 `prisma.ts`의 목록을 기준으로. 0025를 지금 구조(우리 코드 + 사용자 정의 코드 + 외부 코드)로 다시 썼다.

## 버린 안

- **종류별 DB 시퀀스 유지 (0047)**: 운영사·날짜별로 1부터 시작할 수 없고, 운영사마다 자리수·접두어를 바꿀 수 없다.
- **`MAX(번호)+1`**: 동시에 등록하면 같은 번호가 나온다.
- **ENUM 유지**: 값을 더할 때마다 `ALTER TYPE`이 필요하고 트랜잭션 안에서 새 값을 바로 못 쓰는 등 제약이 많다. 다른 기준정보 칸은 이미 VARCHAR + CHECK라 한 방식으로 통일한다.
- **옛 API 경로(`/partners`)를 별칭으로 남기기**: 아직 연동한 화주가 없는 개발 단계라 두 이름을 함께 유지할 이유가 없다.
- **시스템 코드(`sys_cd`)를 그대로 두기**: 사용자 코드가 비면 시스템 코드를 쓰는 이중 구조라 화면·API·라벨마다 어느 코드를 쓸지 헷갈렸다. 우리 코드 하나를 자동 체번으로 채우는 쪽이 단순하다.
- **`NULLS NOT DISTINCT` 고유 인덱스 하나**: Prisma 스키마로 표현되지 않아 스키마와 DB가 어긋난다 — 부분 인덱스 2개로.
