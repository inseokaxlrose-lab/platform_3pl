# 운영사 컬럼 정의 (반영 결과)

- 기준: 사용자 정의서 `docs/specs/operator.md` (M2.5 4단계, 2026-11-15)
- 결정: `docs/decisions/0040-operator-spec.md` · 명명 규칙: `docs/db-conventions.md`
- 반영 범위: **[1차]** = DB + API + 화면 / **[2차]** = DB + API(기본값)만, 화면 섹션은 아직 없음
- 코드 이름은 Prisma 모델 `Operator`의 필드 (`prisma/schema.prisma`)

## tb_operator

### ① 기본 정보 [1차] — 화면 섹션 "기본 정보"

| 칸 | 코드 | 형식 | 필수 | 기본값·검사 | 화면 |
| --- | --- | --- | --- | --- | --- |
| operator_id | id | BIGINT | ● | 자동 | — |
| operator_cd | code | VARCHAR(20) | ● | `^[A-Z0-9_-]{2,20}$`, 삭제 안 된 것끼리 고유, 수정 불가 | 읽기 전용(4) · 목·검 |
| operator_nm | name | VARCHAR(100) | ● | | "회사명"(8) · 목·검 |
| operator_nm_en | nameEn | VARCHAR(100) | | | (6) |
| operator_short_nm | shortName | VARCHAR(50) | | | (4) |
| operator_type_cd | type | VARCHAR(20) | ● | `3PL` · 값 목록 검사 | 고르기(4), 운영사 화면은 읽기 전용 · 목·상 |
| status_cd | status | VARCHAR(20) | ● | `ACTIVE` · 값 목록 검사 | 헤더 배지, 플랫폼 [상태 변경] · 목·검 |
| status_reason | statusReason | VARCHAR(200) | | 정지·해지면 필수(검사 조건) | 상태 변경 팝업, 헤더 배지 옆 |
| biz_reg_no | businessNumber | CHAR(10) | ● | 숫자 10자리, 검증번호 | BizNoInput(4) · 목·검 |
| biz_entity_cd | bizEntity | VARCHAR(10) | ● | `CORP` · 값 목록 검사 | 고르기(4) |
| corp_reg_no | corpRegNo | CHAR(13) | | 숫자 13자리, 검증번호, 개인이면 비움 | CorpRegNoInput(4), 법인일 때만 |
| sub_biz_no | subBizNo | CHAR(4) | | 숫자 4자리 | (2) |
| tax_type_cd | taxType | VARCHAR(10) | ○ | `GENERAL` · 값 목록 검사 | 고르기(4) |
| ceo_nm | ceoName | VARCHAR(50) | ○ | | (4) 권장 안내 · 목 |
| biz_condition | businessType | VARCHAR(100) | ○ | | (4) 권장 안내 |
| biz_item | businessItem | VARCHAR(100) | ○ | | (4) 권장 안내 |
| establish_dt | establishedOn | DATE | | | DateInput(3) |

### ② 연락처·주소 [1차] — 화면 섹션 "연락처·주소"

| 칸 | 코드 | 형식 | 필수 | 기본값·검사 | 화면 |
| --- | --- | --- | --- | --- | --- |
| tel_no | phone | VARCHAR(15) | ○ | 숫자만 | PhoneInput(4) 권장 안내 · 목 |
| fax_no | fax | VARCHAR(15) | | 숫자만 | PhoneInput(4) |
| email | email | VARCHAR(100) | | | EmailInput(8) |
| homepage_url | homepageUrl | VARCHAR(200) | | | 미노출 (정의서 "2차 노출") |
| country_cd | country | CHAR(2) | ● | `KR` | 미노출 |
| zip_cd · addr1 · addr2 | zipCode · address · addressDetail | VARCHAR(10/200/200) | ○ | | AddressInput(12), 기본주소 권장 안내 |
| addr_jibun | addressJibun | VARCHAR(200) | | 주소 검색 결과 자동 저장 | 미노출 |
| latitude · longitude | latitude · longitude | DECIMAL(10,7) | | 주소 검색이 주지 않아 비어 있음 | 미노출 |

### ③ 물류 자격 [2차]

| 칸 | 코드 | 형식 | 기본값·검사 |
| --- | --- | --- | --- |
| warehouse_reg_no | warehouseRegNo | VARCHAR(30) | |
| freight_license_no | freightLicenseNo | VARCHAR(30) | |
| bonded_yn | bondedYn | CHAR(1) | `N`, Y/N |
| customs_yn | customsYn | CHAR(1) | `N`, Y/N |
| gln_cd | glnCode | VARCHAR(13) | |
| 제공 서비스 | services | 하위 표 `tb_operator_service` | 운영사 공통코드 SERVICE_TYPE |
| 취급 온도대 | tempZones | 하위 표 `tb_operator_temp_zone` | TEMP_ZONE 값 목록 검사 |

### ④ 운영 기본값 [2차] (센터·화주가 상속)

| 칸 | 코드 | 형식 | 기본값·검사 |
| --- | --- | --- | --- |
| currency_cd | currency | CHAR(3) | `KRW` |
| timezone | timezone | VARCHAR(50) | `Asia/Seoul` |
| lang_cd | lang | VARCHAR(5) | `ko-KR` |
| weight_unit_id | weightUnitId | BIGINT (FK `tb_unit`) | 시스템 `KG` · 중량 단위 (0084) |
| length_unit_id | lengthUnitId | BIGINT (FK `tb_unit`) | 시스템 `CM` · 길이 단위 (0084) |
| alloc_rule_cd | allocRule | VARCHAR(10) | `FIFO` · FIFO/FEFO/LIFO |
| lot_mgmt_yn · expiry_mgmt_yn · serial_mgmt_yn | useLot · useExpiry · useSerial | CHAR(1) | `N`, Y/N |
| ship_cutoff_time | shipCutoffTime | TIME(0) | 비어 있음 (TimeInput은 2차 화면 때 만든다) |
| closing_day | closingDay | SMALLINT | `99`(말일), 1~31 또는 99 (정의서 TINYINT → PostgreSQL SMALLINT) |

### ⑤ 계약·요금제 [2차] (플랫폼만)

| 칸 | 코드 | 형식 | 기본값·검사 |
| --- | --- | --- | --- |
| plan_cd | plan | VARCHAR(20) | `TRIAL` · 값 목록 검사 · 목록 칸 |
| contract_start_dt | contractStartOn | DATE | 등록일 (기존 운영사는 등록일로 변환) |
| contract_end_dt | contractEndOn | DATE | 비어 있으면 무기한 · 목록 칸 |
| billing_basis_cd | billingBasis | VARCHAR(10) | 비어 있음 · 값 목록 검사 |
| max_user_cnt · max_center_cnt · max_shipper_cnt | maxUserCount · maxCenterCount · maxShipperCount | INT | 비어 있으면 무제한 |
| billing_email · tax_invoice_email | billingEmail · taxInvoiceEmail | VARCHAR(100) | |
| sales_channel_cd | salesChannel | VARCHAR(20) | 값 목록 미정 → 검사 없음 |

### ⑥ 출력 설정 [2차]

| 칸 | 코드 | 형식 | 비고 |
| --- | --- | --- | --- |
| print_company_nm | printCompanyName | VARCHAR(100) | 비어 있으면 운영사명 |
| logo_file_id · stamp_file_id | logoFileId · stampFileId | BIGINT | 파일 표가 아직 없어 외래 키 없음 |

### ⑦ 확장·시스템

| 칸 | 코드 | 비고 |
| --- | --- | --- |
| ext_attr | extAttr | JSONB |
| remark | remark | VARCHAR(1000), [1차] 기본 정보 아래 TextArea(12) |
| del_yn · created_* · updated_* · row_version | 공통 칸 | `docs/db-conventions.md` "공통 칸". 수정일은 목록 기본 숨김 |

## 하위 표

| 표 | 칸 | 비고 |
| --- | --- | --- |
| tb_operator_contact [1차] | contact_id, operator_id, role_cd(CONTACT_ROLE), contact_nm, tel_no, email, primary_yn, sort_seq | 최대 5명, 연락처·이메일 중 하나, 대표 1명, 운영사 저장 때 통째로 함께(한 트랜잭션) |
| | dept_nm, position_nm, notify_yn(`Y`) [2차] | 화면 미노출 |
| tb_operator_service [2차] | operator_id, service_cd | PK(operator_id, service_cd) |
| tb_operator_temp_zone [2차] | operator_id, temp_zone_cd | PK(operator_id, temp_zone_cd) |

- 하위 표에는 감사 칸을 두지 않았다 — 운영사의 이력(등록·수정자·버전)으로 본다 (0038, 사용자 결정).

## 코드 값

| 그룹 | 어디에 | 값 |
| --- | --- | --- |
| OPERATOR_TYPE · OPERATOR_STATUS · BIZ_ENTITY · TAX_TYPE · PLAN · BILLING_BASIS · ALLOC_RULE · WEIGHT_UNIT · LENGTH_UNIT · TEMP_ZONE | 상수 `src/config/operator-codes.ts` + DB 검사 조건 (플랫폼이 정하는 값) | 정의서 "3. 공통코드"와 같음 |
| CONTACT_ROLE (← CONTACT_DUTY) · SERVICE_TYPE | 운영사 공통코드 (운영사마다, 기본값 `src/config/defaults/codes.ts`) | 정의서와 같음 |

## 화면

| 화면 | 주소 | 누가 | 고칠 수 있는 것 |
| --- | --- | --- | --- |
| 운영사 목록 | `/platform/operators` | 플랫폼 | 검색: 통합(코드·명)·사업자번호·운영 상태(여러 개) / 상세: 유형·등록일. 칸: 코드·명(고정)·사업자번호·대표자·대표전화·상태·유형·요금제·계약종료일·센터 수·화주 수·등록일·수정일(숨김). 등록일 내림차순 |
| 운영사 등록 | `/platform/operators/new` | 플랫폼 | 코드·회사명·유형·사업자번호·대표자 → 관리자 `admin.{코드 소문자}` |
| 운영사 편집 | `/platform/operators/[id]` | 플랫폼 | [1차] 전체(코드 제외) + [상태 변경] 팝업 |
| 운영사 (자기 화면) | `/admin/master/operator` | 운영사 | [1차] 중 코드·유형·상태를 뺀 나머지 |
