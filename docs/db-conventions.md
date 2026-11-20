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
| `_cd` | 코드 (공통코드·enum·사용자 코드) | `center_cd`, `status_cd`, `temp_zone_cd` |
| `_nm` | 명칭 | `center_nm`, `ceo_nm` |
| `_no` | 번호 — **숫자만** 저장 | `biz_reg_no`, `tel_no` |
| `_yn` | 예/아니오 — CHAR(1) `'Y'`/`'N'` (CHECK 제약) | `primary_yn`, `del_yn` |
| `_dt` / `_at` | 날짜 / 일시 | `establish_dt`, `created_at` |
| `_cnt` / `_amt` | 수량 / 금액 | `max_user_cnt`, `decimal_cnt` |
| 시스템 코드 | `sys_cd` | `CT000001` |
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

## 공통 칸 (모든 기준정보, 2단계)

| 칸 | 형식 | 설명 |
| --- | --- | --- |
| `status_cd` | VARCHAR(10) | 기준정보 공통 `ACTIVE`(사용) / `INACTIVE`(중지) — `isActive` 대체. 운영사는 `OPERATOR_STATUS` |
| `del_yn` | CHAR(1) | 논리 삭제. 모든 조회는 `del_yn = 'N'`만, 코드 중복 검사도 삭제 안 된 것끼리 (부분 고유 인덱스) |
| `created_at` / `created_by` | TIMESTAMP / VARCHAR(50) | 등록 일시·등록자 아이디 |
| `updated_at` / `updated_by` | TIMESTAMP / VARCHAR(50) | 수정 일시·수정자 아이디 |
| `row_version` | INT | 낙관적 락: 저장 때 같으면 +1, 다르면 "다른 사람이 먼저 고쳤습니다" |

- 대상(11개 표): 사용자·권한그룹·센터·창고·로케이션·화주사·운영사·공통코드 그룹·공통코드·단위(배송권역은 0076에서 제거). 부모와 통째로 바뀌는 하위 표(담당자·담당 지역·이용 센터·소속 등)는 부모 이력으로 본다. 사용자는 계정을 지우지 않으므로 `del_yn` 없음.
- **등록·수정자 자동 기록 (2a 적용)**: 화면·기능 코드에서 넣지 않는다. `createAction`이 로그인 사용자 아이디로 `runAsActor`를 감싸고(`src/lib/actor.ts`), `prisma.ts`의 확장이 등록·수정 때 `created_by`/`updated_by`를 채우고 수정 때마다 `row_version +1` 한다. 시드는 `seed`, 감싸지 않은 곳은 `system`.
  - 주의: 안쪽 관계로 함께 만드는 줄(nested create)은 확장이 채우지 못한다 → 공통 칸이 있는 표는 바깥에서 직접 만든다.
  - 화면 표시: `actorLabel(아이디)` → '이름 (아이디)' / '시스템'.
- **상태 `status_cd` (2b 적용)**: `is_active`를 대체, `'ACTIVE'`/`'INACTIVE'` + 검사 조건 (9개 표: 사용자·센터·창고·로케이션·화주사·공통코드 그룹·공통코드·단위). 코드는 `src/lib/status.ts`.
  - 화면·입력 규칙은 지금처럼 사용 여부 `isActive`(true/false). DB에 쓸 때 `toStatus`/`withStatus`, 읽을 때 `isActiveStatus`/`withIsActive`, 조건은 `ACTIVE_ONLY`, 목록 검색은 `statusWhere(filters)`.
  - 주의: 타입 검사가 못 보는 곳 — 목록 정렬 매핑(`sortable: { isActive: 'status' }`), 조건 목록 안의 객체, 입력값을 통째로 저장하는 `data`(반드시 `withStatus`).
  - Better Auth 사용자 추가 칸도 `status` (`ACTIVE`만 로그인).
- **논리 삭제 `del_yn` (2c 적용)**: 10개 표(사용자 제외). 지우기는 `del_yn = 'Y'`로만 (`DELETED_ONLY`), 실제로 지우지 않는다.
  - 자동 제외: `prisma.ts`가 읽기·개수·수정·upsert 조건에 `delYn: 'N'`을 붙인다. 지운 것을 다루려면 조건에 `delYn`을 직접 적는다(`DELETED_ONLY`). **include·select 안의 관계 목록, `_count`, 관계 조건(`zone: {…}`)은 자동으로 안 걸리므로 `NOT_DELETED`를 직접 붙인다.**
  - 코드(이름) 고유는 삭제 안 된 것끼리만: Prisma `partialIndexes`(미리보기) `@@unique([...], where: raw("del_yn = 'N'"))`. 지운 코드는 새로 쓸 수 있다.
  - 되살리기: 목록 상태 거르기 "삭제됨"(`DELETED_STATUS_OPTION`, 서버 `deletedWhere`) → [되살리기](`RestoreButton`). 공통코드는 [지운 항목] 팝업. 권한은 삭제 권한과 같다. 같은 코드가 다시 쓰이고 있거나 부모(코드 그룹)가 지워졌으면 거부 (`src/lib/soft-delete.ts`). 외부 코드는 되살아나지 않는다.
- **동시 수정 막기 (2a 적용)**: 수정 화면·팝업은 불러올 때의 `rowVersion`을 들고 있다가 저장 때 보낸다(`useMasterForm`의 `version`, 결과의 새 버전으로 자동 갱신). 서버는 `assertRowVersion` + 수정 조건에 버전(`where: { id, rowVersion }`) + `withVersionGuard`(`src/lib/row-version.ts`). 사용 중지·일괄 처리는 검사 없이 버전만 올린다.

## 운영사 칸 `operator_id` (3단계 멀티테넌트, 0039)

- 대상(11개 표): 사용자·권한그룹·센터·창고·로케이션·화주사·외부 코드·공통코드 그룹·공통코드·단위. 하위 표는 부모를 따른다.
- 고유 규칙은 같은 운영사 안에서만 (`@@unique([operatorId, code], …)`). 로그인 아이디·이메일은 전체에서 하나.
- **서버 액션 안**: `createAction`이 운영사 출입증(`runInContext`, `src/lib/actor.ts`)을 만들고, `prisma.ts`가 11개 표의 읽기·수정·삭제에 지금 운영사 조건을 붙이고 등록에 운영사를 채운다. 새로 만드는 함수는 `requireOperatorId()`로 운영사를 받는다. 전체 고유 값(아이디·이메일) 중복 검사만 `acrossOperators()`.
- **서버 액션 밖(화면 조회 함수)**: 자동 거르기가 없다 → `scopeFilter`(운영사 조건 자동)·`isInScope`(줄의 `operatorId` 검사 — `select`에 `operatorId`를 꼭 넣는다)·`operatorFilter(scope)`(센터·화주사로 나누지 않는 데이터)를 쓴다.
- 플랫폼 관리자(`user_type_cd = PLATFORM`)만 `operator_id`가 비어 있다 (검사 조건). 운영사 상태 `tb_operator.status_cd`가 ACTIVE가 아니면 그 운영사 사용자는 로그인할 수 없다.
- 주의: 안쪽 관계로 함께 만드는 줄(nested create)은 안전망이 채우지 못한다 → `operatorId`를 직접 넣는다. 범위 검사는 넘겨받은 값(`{ centerId }`)이 아니라 DB에서 읽은 줄로 한다.

## 표·칸 대응표 (1단계 — 지금 25개 표, 197개 칸)

> 운영사 관련(`tb_operator` 등)의 최종 칸은 `docs/operator-columns.md`(4단계, 0040). 2단계(공통 칸)·3단계(`operator_id`) 칸은 여기 없다.

### tb_user ← `user` (코드 모델 `User`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `user_id` | TEXT(cuid) → BIGINT |
| `name` | `name` | `user_nm` |  |
| `email` | `email` | `email` |  |
| `emailVerified` | `emailVerified` | `email_verified` | Better Auth가 true/false로 씀 → boolean 유지(예외) |
| `image` | `image` | `image` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |
| `username` | `username` | `username` |  |
| `displayUsername` | `displayUsername` | `display_username` |  |
| `userType` | `userType` | `user_type_cd` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `shipperId` | `shipperId` | `shipper_id` | TEXT(cuid) → BIGINT |

### tb_session ← `session` (코드 모델 `Session`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `session_id` | TEXT(cuid) → BIGINT |
| `expiresAt` | `expiresAt` | `expires_at` |  |
| `token` | `token` | `token` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |
| `ipAddress` | `ipAddress` | `ip_address` |  |
| `userAgent` | `userAgent` | `user_agent` |  |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |

### tb_account ← `account` (코드 모델 `Account`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `acct_id` | TEXT(cuid) → BIGINT (아래 account_id와 겹치지 않게) |
| `accountId` | `accountId` | `provider_account_id` | 로그인 제공자 쪽 계정 id (Better Auth) |
| `providerId` | `providerId` | `provider_id` |  |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |
| `accessToken` | `accessToken` | `access_token` |  |
| `refreshToken` | `refreshToken` | `refresh_token` |  |
| `idToken` | `idToken` | `id_token` |  |
| `accessTokenExpiresAt` | `accessTokenExpiresAt` | `access_token_expires_at` |  |
| `refreshTokenExpiresAt` | `refreshTokenExpiresAt` | `refresh_token_expires_at` |  |
| `scope` | `scope` | `scope` |  |
| `password` | `password` | `password` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_verification ← `verification` (코드 모델 `Verification`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `verification_id` | TEXT(cuid) → BIGINT |
| `identifier` | `identifier` | `identifier` |  |
| `value` | `value` | `value` |  |
| `expiresAt` | `expiresAt` | `expires_at` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_perm_group ← `permission_group` (코드 모델 `PermissionGroup`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `perm_group_id` | TEXT(cuid) → BIGINT |
| `name` | `name` | `perm_group_nm` |  |
| `area` | `area` | `app_area_cd` |  |
| `description` | `description` | `description` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_perm_group_perm ← `permission_group_permission` (코드 모델 `PermissionGroupPermission`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `groupId` | `groupId` | `group_id` | TEXT(cuid) → BIGINT |
| `permissionCode` | `permissionCode` | `perm_cd` |  |

### tb_user_perm_group ← `user_permission_group` (코드 모델 `UserPermissionGroup`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |
| `groupId` | `groupId` | `group_id` | TEXT(cuid) → BIGINT |
| `createdAt` | `createdAt` | `created_at` |  |

### tb_user_perm_override ← `user_permission_override` (코드 모델 `UserPermissionOverride`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |
| `permissionCode` | `permissionCode` | `perm_cd` |  |
| `effect` | `effect` | `effect_cd` |  |
| `createdAt` | `createdAt` | `created_at` |  |

### tb_center ← `center` (코드 모델 `Center`, 0026·0073)

1차 = DB·API·화면, 2차 = DB·API만 (화면은 나중에). 상속 = NULL이면 운영사 값 (`getEffectiveSetting`, 0073).

| 코드 | DB | 형식 | 구분 | 비고 |
| --- | --- | --- | --- | --- |
| `id` | `center_id` | BIGINT | | |
| `operatorId` | `operator_id` | BIGINT | | 운영사 (0039) |
| `systemCode` | `sys_cd` | VARCHAR | 1차 | 자동·불변 `CT000001` |
| `code` | `center_cd` | VARCHAR(20) | 1차 | **필수·불변**, 영문 대문자·숫자 |
| `name` | `center_nm` | VARCHAR(100) | 1차 | 필수 |
| `nameEn` | `center_nm_en` | VARCHAR(100) | 1차 | |
| `shortName` | `center_short_nm` | VARCHAR(30) | 1차 | |
| `type` | `center_type_cd` | VARCHAR(20) | 1차 | OWN·LEASE·PARTNER·VIRTUAL, 기본 LEASE |
| `status` | `status_cd` | VARCHAR(20) | 1차 | PREPARING·ACTIVE·SUSPENDED·CLOSED, 기본 PREPARING |
| `statusReason` | `status_reason` | VARCHAR(200) | 1차 | 일시중지·폐쇄면 필수 |
| `openedOn` / `closedOn` | `open_dt` / `close_dt` | DATE | 1차 | 폐쇄면 `close_dt` 필수 |
| `businessNumber` / `subBizNo` | `biz_reg_no` / `sub_biz_no` | CHAR(10) / CHAR(4) | 1차 | 숫자만 |
| `sortOrder` | `sort_seq` | INT | 1차 | 목록 기본 정렬 |
| `remark` | `remark` | VARCHAR(1000) | 1차 | |
| `extAttr` | `ext_attr` | JSONB | 2차 | 확장 속성 |
| `countryCode` | `country_cd` | CHAR(2) | 2차 | 기본 KR |
| `zipCode` / `address` / `addressDetail` | `zip_cd` / `addr1` / `addr2` | VARCHAR(10/200/200) | 1차 | 주소 필수(화면·서버) |
| `addressJibun` / `regionName` | `addr_jibun` / `region_nm` | VARCHAR(200/50) | 1차 | 주소 검색으로 자동 |
| `latitude` / `longitude` | `latitude` / `longitude` | DECIMAL(10,7) | 2차 | 아직 비움 |
| `phone` / `fax` | `tel_no` / `fax_no` | VARCHAR(15) | 1차 | 숫자만 |
| `email` / `directions` | `email` / `directions` | VARCHAR(100/1000) | 1차 | |
| `managerName` / `managerPhone` | `manager_nm` / `manager_tel_no` | VARCHAR | — | 예전 칸 (담당자 표로 대체, 목록에서 대표 담당자 없을 때만) |
| `floorAreaM2` / `storageAreaM2` | `floor_area_m2` / `storage_area_m2` | DECIMAL(12,2) | 1차 | ≥ 0 |
| `dockCount` | `dock_cnt` | INT | 1차 | ≥ 0 |
| `landAreaM2` / `floorCount` / `ceilingHeightM` / `palletCapacity` | `land_area_m2` / `floor_cnt` / `ceiling_height_m` / `pallet_capa_cnt` | | 2차 | ≥ 0 |
| `bondedYn` | `bonded_yn` | CHAR(1) | 1차 | 'Y'/'N' |
| `bondedType` / `bondedLicenseNo` / `bondedAreaCode` / `customsOfficeCode` | `bonded_type_cd` / `bonded_license_no` / `bonded_area_cd` / `customs_office_cd` | | 2차 | 보세가 아니면 비움 (검사 조건) |
| `warehouseRegNo` / `glnCode` | `warehouse_reg_no` / `gln_cd` | VARCHAR(30) / VARCHAR(13) | 2차 | GLN 숫자 13자리 |
| `hazmatYn` / `foodStorageYn` / `pharmaYn` | `hazmat_yn` / `food_storage_yn` / `pharma_yn` | CHAR(1) | 2차 | 기본 'N' |
| `workStartTime` / `workEndTime` | `work_start_time` / `work_end_time` | TIME(0) | 1차 | 화면 'HH:MM' |
| `workDays` | `work_days` | CHAR(7) | 1차 | 월~일 Y/N, 기본 `YYYYYNN` |
| `inboundCutoffTime` | `inbound_cutoff_time` | TIME(0) | 1차 | |
| `shipCutoffTime` | `ship_cutoff_time` | TIME(0) | 1차·상속 | |
| `defaultInboundLocId` / `defaultOutboundLocId` / `defaultReturnLocId` | `default_inbound_loc_id` / `default_outbound_loc_id` / `default_return_loc_id` | BIGINT → `tb_location` | 1차 | 대기 창고 DEFAULT로 자동, 이 센터 로케이션만, 입고 필수 |
| `timezone` / `allocRule` | `timezone` / `alloc_rule_cd` | VARCHAR(50/10) | 2차·상속 | |
| `useLot` / `useExpiry` / `useSerial` | `lot_mgmt_yn` / `expiry_mgmt_yn` / `serial_mgmt_yn` | CHAR(1) NULL | 2차·상속 | |
| 공통 칸 | `created_at`·`updated_at`·`created_by`·`updated_by`·`row_version`·`del_yn` | | | 0038 |

### tb_center_contact ← 센터 담당자 (코드 모델 `CenterContact`, 0073)

| 코드 | DB | 형식 | 비고 |
| --- | --- | --- | --- |
| `id` | `contact_id` | BIGINT | 줄 키 (화면이 들고 있다가 그 줄을 고친다) |
| `centerId` | `center_id` | BIGINT | 센터 지우면 함께 (CASCADE) |
| `sortOrder` | `sort_seq` | INT | 화면 순서 |
| `duty` | `role_cd` | VARCHAR(20) | 공통코드 `CENTER_CONTACT_ROLE` |
| `name` / `phone` / `email` | `contact_nm` / `tel_no` / `email` | | 연락처·이메일 중 하나 필수 |
| `isPrimary` | `primary_yn` | CHAR(1) | 센터당 대표 1명 (부분 고유 인덱스) |
| `deptName` / `positionName` / `notifyYn` | `dept_nm` / `position_nm` / `notify_yn` | | 2차 |
| 등록·수정 | `created_at`·`updated_at`·`created_by`·`updated_by` | | |

### tb_center_temp_zone ← 센터 취급 온도대 (코드 모델 `CenterTempZone`, 0073)

| 코드 | DB | 형식 | 비고 |
| --- | --- | --- | --- |
| `centerId` + `tempZoneCd` | `center_id` + `temp_zone_cd` | 기본 키 | AMBIENT·CHILLED·FROZEN·CONSTANT |
| `areaM2` / `minTemp` / `maxTemp` | `area_m2` / `min_temp` / `max_temp` | DECIMAL | 2차 |
| 등록·수정 | `created_at`·`updated_at`·`created_by`·`updated_by` | | |

### tb_warehouse ← `warehouse` (코드 모델 `Warehouse`, 0027·0074)

1차 = DB·API·화면, 2차 = DB·API만. 유형·온도대·상태·기본 재고상태는 플랫폼 상수 + 검사 조건 (`warehouse-codes.ts`, `operator-codes.ts`).

| 코드 | DB | 형식 | 구분 | 비고 |
| --- | --- | --- | --- | --- |
| `id` | `warehouse_id` | BIGINT | | |
| `operatorId` | `operator_id` | BIGINT | | 운영사 (0039) |
| `centerId` | `center_id` | BIGINT | 1차 | 등록 후 불변 |
| `systemCode` | `sys_cd` | VARCHAR | 1차 | 자동·불변 `WH000001` |
| `code` | `warehouse_cd` | VARCHAR(20) | 1차 | **필수·불변**, 영문 대문자·숫자·밑줄, 센터 안 고유 |
| `name` | `warehouse_nm` | VARCHAR(100) | 1차 | 필수 |
| `type` | `warehouse_type_cd` | VARCHAR(20) | 1차 | STORAGE·INBOUND·OUTBOUND·RETURN·QC·DAMAGED·VAS·CROSSDOCK, 기본 STORAGE |
| `tempZone` | `temp_zone_cd` | VARCHAR(20) | 1차 | AMBIENT·CHILLED·FROZEN·CONSTANT, 센터 취급 온도대 중 |
| `status` | `status_cd` | VARCHAR(20) | 1차 | ACTIVE·INACTIVE |
| `systemYn` | `system_yn` | CHAR(1) | 1차 | 시스템 기본 창고 (입고·출고·반품 대기, 센터마다 유형별 1개) |
| `description` | `description` | VARCHAR(200) | 1차 | 목록 코드 옆 보조 문구 |
| `sortOrder` | `sort_seq` | INT | 1차 | 기본 10 (기본 창고 1·2·3) |
| `buildingName` / `floorNo` / `areaM2` | `building_nm` / `floor_no` / `area_m2` | VARCHAR(50) / VARCHAR(10) / DECIMAL(12,2) | 1차 | |
| `ceilingHeightM` / `palletCapacity` | `ceiling_height_m` / `pallet_capa_cnt` | DECIMAL(5,2) / INT | 2차 | ≥ 0 |
| `storageMethod` | `storage_method_cd` | VARCHAR(20) | 2차 | 공통코드 `STORAGE_METHOD` |
| `bondedYn` / `hazmatYn` | `bonded_yn` / `hazmat_yn` | CHAR(1) | 2차 | 센터 자격이 있을 때만 Y |
| `inboundYn` / `outboundYn` / `allocatableYn` | `inbound_yn` / `outbound_yn` / `allocatable_yn` | CHAR(1) | 1차 | 유형별 기본값 (0074 표) |
| `defaultStockStatus` | `default_stock_status_cd` | VARCHAR(20) | 1차 | NORMAL·HOLD·DAMAGED·QUARANTINE |
| `allocPriority` | `alloc_priority` | INT | 1차 | 1~999, 작을수록 먼저, 기본 100 |
| `defaultLocId` | `default_loc_id` | BIGINT → `tb_location` | 1차 | 이 창고의 사용 중 로케이션 (기본 창고는 DEFAULT) |
| `managerUserId` | `manager_user_id` | BIGINT → `tb_user` | 2차 | 지우면 NULL |
| `dedicatedShipperId` | `dedicated_shipper_id` | BIGINT → `tb_shipper` | 2차 | NULL = 공용 창고 |
| `locCodePrefix` / `locCodeSeparator` | `loc_cd_prefix` / `loc_cd_separator` | VARCHAR(10) / CHAR(1) | 2차 | 로케이션 일괄 생성용 (구분자 없으면 '-') |
| `remark` / `extAttr` | `remark` / `ext_attr` | VARCHAR(1000) / JSONB | 1차 / 2차 | |
| 공통 칸 | `created_at`·`updated_at`·`created_by`·`updated_by`·`row_version`·`del_yn` | | | 0038 |

### tb_zone ← 구역 (코드 모델 `Zone`, 0075)

창고 안에서 같은 방식으로 운영되는 로케이션 묶음. 창고 수정 화면의 "구역" 표에서 관리한다.

| 코드 | DB | 형식 | 비고 |
| --- | --- | --- | --- |
| `id` | `zone_id` | BIGINT | |
| `operatorId` / `centerId` / `warehouseId` | `operator_id` / `center_id` / `warehouse_id` | BIGINT | 센터는 창고의 센터, 창고는 등록 후 불변 |
| `code` | `zone_cd` | VARCHAR(10) | 영문 대문자·숫자, 창고 안 고유, 저장 후 불변 (로케이션 코드 앞자리) |
| `name` | `zone_nm` | VARCHAR(100) | 필수 |
| `type` | `zone_type_cd` | VARCHAR(20) | 공통코드 `ZONE_TYPE`, 기본 STORAGE |
| `status` | `status_cd` | VARCHAR(20) | ACTIVE·INACTIVE |
| `pickSeq` / `sortOrder` | `pick_seq` / `sort_seq` | INT | 피킹 동선 순서 / 정렬순서(기본 10) |
| `description` / `remark` / `extAttr` | `description` / `remark` / `ext_attr` | VARCHAR(200/1000) / JSONB | |
| 공통 칸 | `created_at`·`updated_at`·`created_by`·`updated_by`·`row_version`·`del_yn` | | 0038 |

### tb_location ← `location` (코드 모델 `Location`, 0028·0071·0075)

1차 = DB·API·화면, 2차 = DB·API만. 상속 = NULL이면 창고 값 (`resolveLocationOps`·`getEffectiveLocationOps`).

| 코드 | DB | 형식 | 구분 | 비고 |
| --- | --- | --- | --- | --- |
| `id` | `location_id` | BIGINT | | |
| `operatorId` / `centerId` / `warehouseId` | `operator_id` / `center_id` / `warehouse_id` | BIGINT | 1차 | 센터는 창고의 센터(조회·범위용), 창고 불변 |
| `zoneId` | `zone_id` | BIGINT → `tb_zone` | 1차 | 같은 창고의 구역, 시스템 기본 로케이션 등은 NULL |
| `code` | `location_cd` | VARCHAR(30) **COLLATE "C"** | 1차 | 영문 대문자·숫자·하이픈, **창고 안 고유**(사용자 결정), 불변. C 정렬이라 앞부분·범위 검색이 인덱스 `(center_id, location_cd)`를 쓴다 |
| `description` | `description` | VARCHAR(200) | 1차 | 예전 명칭 `location_nm`(0071) — 코드와 같던 값은 비움 |
| `locType` | `loc_type_cd` | VARCHAR(20) | 1차 | 공통코드 `LOC_TYPE`, 기본 RACK (시스템 기본은 STAGING) |
| `status` / `systemYn` | `status_cd` / `system_yn` | VARCHAR(20) / CHAR(1) | 1차 | 시스템 기본 로케이션은 사용 중만 |
| `rowNo` / `levelNo` | `row_no` / `level_no` | VARCHAR(10) | 1차 | 예전 `aisle_cd`·`level_cd`. 일괄 생성은 0을 채워 글자 순서 = 숫자 순서 |
| `bayNo` / `cellNo` / `posX` / `posY` | `bay_no` / `cell_no` / `pos_x` / `pos_y` | VARCHAR(10) / DECIMAL(10,2) | 2차 | |
| `widthCm` / `depthCm` / `heightCm` | `width_cm` / `depth_cm` / `height_cm` | DECIMAL(8,2) | 1차 | 저장은 cm (화면은 운영사 단위) |
| `maxCbm` / `maxWeightKg` / `maxPalletCnt` | `max_cbm` / `max_weight_kg` / `max_pallet_cnt` | DECIMAL(10,4) / DECIMAL(10,2) / INT | 1차 | 무게 저장은 kg |
| `inboundYn` / `outboundYn` / `allocatableYn` | `inbound_yn` / `outbound_yn` / `allocatable_yn` | CHAR(1) NULL | 1차·상속 | NULL = 창고 값 |
| `mixItemYn` / `mixLotYn` / `mixShipperYn` | `mix_item_yn` / `mix_lot_yn` / `mix_shipper_yn` | CHAR(1) | 1차 | 기본 Y / Y / **N** |
| `putawaySeq` / `pickSeq` | `putaway_seq` / `pick_seq` | INT | 1차 | |
| `lockYn` / `lockReason` / `lockAt` | `lock_yn` / `lock_reason_cd` / `lock_at` | | 2차 | 잠그면 사유(공통코드 `LOCK_REASON`) 필수 (검사 조건) |
| `abcClass` / `dedicatedShipperId` / `checkDigit` / `lastCountOn` | `abc_class_cd` / `dedicated_shipper_id` / `check_digit` / `last_count_dt` | | 2차 | 공통코드 `ABC_CLASS` / 화주사 FK |
| `remark` / `extAttr` | `remark` / `ext_attr` | VARCHAR(1000) / JSONB | 1차 / 2차 | |
| 공통 칸 | `created_at`·`updated_at`·`created_by`·`updated_by`·`row_version`·`del_yn` | | | 0038 |

인덱스: 고유 `(warehouse_id, location_cd) WHERE del_yn='N'`, `(center_id, location_cd)`, `(warehouse_id, zone_id, status_cd)`, `(center_id, status_cd, del_yn)`, `(zone_id)`.

### tb_region_* ← 권역설정 · 지역 마스터 (0076)

지역 마스터(운영사 공통, `operator_id` 없음, `npm run region:load`로만 갱신)와 운영사별 권역 배정.

| 표 (코드 모델) | 키 | 핵심 칸 |
| --- | --- | --- |
| `tb_region_bjd` (`RegionBjd`) | `bjd_cd` CHAR(10) | 시도·시군구 코드/이름, `emd_nm`·`ri_nm`, `bjd_level` 1~4, `abolished_yn`·`abolished_dt`, `load_ver` |
| `tb_region_zip` (`RegionZip`) | `zip_cd` CHAR(5) | `sido_cd`·`sigungu_cd`, `rep_addr`(대표 주소), `addr_cnt`, `abolished_yn`, `first_load_ver`·`last_load_ver` |
| `tb_region_zip_bjd` (`RegionZipBjd`) | (`zip_cd`, `bjd_cd`) | `addr_cnt` — 2개 이상 법정동 = 경계 우편번호 |
| `tb_region_load_hist` (`RegionLoadHist`) | `load_id` | `load_ver`, `load_type_cd` FULL·DELTA, `status_cd` RUNNING·DONE·FAILED, 건수, `error_msg` |
| `tb_region_center_map` (`RegionCenterMap`) | `map_id`, **고유 (`operator_id`, `zip_cd`, `temp_zone_cd`)** | `temp_zone_cd` ALL·온도대, `center_id`, `assign_type_cd` MANUAL·SUGGESTED·UPLOAD, `confirm_yn`, `last_batch_id`, 공통 칸(삭제 없음) |
| `tb_region_change_batch` (`RegionChangeBatch`) | `batch_id` | `change_type_cd`(7가지), `scope_desc`, `temp_zone_cd`, `target_center_id`, `changed_cnt`, `reason`, `created_at/by` |
| `tb_region_center_map_hist` (`RegionCenterMapHist`) | `hist_id` | `batch_id`, 우편번호·온도대, `before_center_id`·`after_center_id`(NULL = 미배정), `changed_at` |
| `tb_address_norm_cache` (`AddressNormCache`, 공통) | `addr_hash` CHAR(64) | `raw_addr`, `grade` A~D·F, `method_cd`, 정제 결과(우편번호·법정동·도로명·지번·건물관리번호), `addr_load_ver`, `hit_cnt` |

운영사 칸 추가: `tb_operator.region_auto_grade` CHAR(1) 기본 'D' — 자동 지정을 허용하는 주소 정제 등급.

### tb_shipper ← `shipper` (코드 모델 `Shipper`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `shipper_id` | TEXT(cuid) → BIGINT |
| `systemCode` | `systemCode` | `sys_cd` |  |
| `code` | `code` | `shipper_cd` |  |
| `name` | `name` | `shipper_nm` |  |
| `businessNumber` | `businessNumber` | `biz_reg_no` |  |
| `ceoName` | `ceoName` | `ceo_nm` |  |
| `businessType` | `businessType` | `biz_condition` |  |
| `businessItem` | `businessItem` | `biz_item` |  |
| `phone` | `phone` | `tel_no` |  |
| `fax` | `fax` | `fax_no` |  |
| `email` | `email` | `email` |  |
| `zipCode` | `zipCode` | `zip_cd` |  |
| `address` | `address` | `addr1` |  |
| `addressDetail` | `addressDetail` | `addr2` |  |
| `useLot` | `useLot` | `lot_mgmt_yn` |  |
| `useExpiry` | `useExpiry` | `expiry_mgmt_yn` |  |
| `labelUnit` | `labelUnit` | `label_unit_cd` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_shipper_center ← `shipper_center` (코드 모델 `ShipperCenter`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `shipperId` | `shipperId` | `shipper_id` | TEXT(cuid) → BIGINT |
| `centerId` | `centerId` | `center_id` | TEXT(cuid) → BIGINT |

### tb_shipper_contact ← `shipper_contact` (코드 모델 `ShipperContact`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `contact_id` | TEXT(cuid) → BIGINT |
| `shipperId` | `shipperId` | `shipper_id` | TEXT(cuid) → BIGINT |
| `sortOrder` | `sortOrder` | `sort_seq` |  |
| `duty` | `duty` | `role_cd` |  |
| `name` | `name` | `contact_nm` |  |
| `phone` | `phone` | `tel_no` |  |
| `email` | `email` | `email` |  |
| `isPrimary` | `isPrimary` | `primary_yn` |  |

### tb_user_center ← `user_center` (코드 모델 `UserCenter`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |
| `centerId` | `centerId` | `center_id` | TEXT(cuid) → BIGINT |
| `createdAt` | `createdAt` | `created_at` |  |

### tb_user_grid_setting ← `user_grid_setting` (코드 모델 `UserGridSetting`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |
| `gridId` | `gridId` | `grid_cd` |  |
| `settings` | `settings` | `settings` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_user_favorite_menu ← `user_favorite_menu` (코드 모델 `UserFavoriteMenu`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `userId` | `userId` | `user_id` | TEXT(cuid) → BIGINT |
| `href` | `href` | `menu_href` |  |
| `createdAt` | `createdAt` | `created_at` |  |

### tb_operator ← `company` (코드 모델 `Company`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `operator_id` | TEXT(cuid) → BIGINT |
| `name` | `name` | `operator_nm` |  |
| `businessNumber` | `businessNumber` | `biz_reg_no` |  |
| `ceoName` | `ceoName` | `ceo_nm` |  |
| `businessType` | `businessType` | `biz_condition` |  |
| `businessItem` | `businessItem` | `biz_item` |  |
| `phone` | `phone` | `tel_no` |  |
| `fax` | `fax` | `fax_no` |  |
| `email` | `email` | `email` |  |
| `zipCode` | `zipCode` | `zip_cd` |  |
| `address` | `address` | `addr1` |  |
| `addressDetail` | `addressDetail` | `addr2` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |
| `updatedById` | `updatedById` | `updated_by` | 사용자 FK → updated_by VARCHAR(50) 아이디 (2단계) |

### tb_operator_contact ← `company_contact` (코드 모델 `CompanyContact`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `contact_id` | TEXT(cuid) → BIGINT |
| `companyId` | `companyId` | `company_id` | TEXT(cuid) → BIGINT |
| `sortOrder` | `sortOrder` | `sort_seq` |  |
| `duty` | `duty` | `role_cd` |  |
| `name` | `name` | `contact_nm` |  |
| `phone` | `phone` | `tel_no` |  |
| `email` | `email` | `email` |  |
| `isPrimary` | `isPrimary` | `primary_yn` |  |

### tb_ext_code ← `external_code` (코드 모델 `ExternalCode`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `ext_code_id` | TEXT(cuid) → BIGINT |
| `system` | `system` | `ext_system_cd` |  |
| `entityType` | `entityType` | `entity_type_cd` |  |
| `entityId` | `entityId` | `entity_id` | TEXT → BIGINT (가리키는 표의 키) |
| `code` | `code` | `ext_cd` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_code_group ← `code_group` (코드 모델 `CodeGroup`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `group_id` | TEXT(cuid) → BIGINT |
| `code` | `code` | `group_cd` |  |
| `name` | `name` | `group_nm` |  |
| `description` | `description` | `description` |  |
| `sortOrder` | `sortOrder` | `sort_seq` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `isSystem` | `isSystem` | `system_yn` | 0078: `operator_id`가 비어 있는 시스템 기본 단위만 Y |
| `operatorId` | — | `operator_id` | 0078: NULL 허용 (NULL = 시스템 기본 단위, 모든 운영사 공유) |
| `type` | — | `unit_type_cd` | 0078: QTY·PACK·WEIGHT·VOLUME·LENGTH·AREA |
| `nameEn` / `printName` | — | `unit_nm_en` / `print_nm` | 0078 |
| `isBase` / `baseUnitId` / `baseFactor` | — | `base_yn` / `base_unit_id` / `base_factor` | 0078: 물리 단위 환산 (DECIMAL(20,10)) |
| `stdCode` / `description` / `extAttr` / `remark` | — | `std_unit_cd` / `description` / `ext_attr` / `remark` | 0078: UN/ECE Rec.20, 확장속성 JSONB |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_code_item ← `code_item` (코드 모델 `CodeItem`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `code_item_id` | TEXT(cuid) → BIGINT |
| `groupId` | `groupId` | `group_id` | TEXT(cuid) → BIGINT |
| `code` | `code` | `code_item_cd` |  |
| `name` | `name` | `code_item_nm` |  |
| `description` | `description` | `description` |  |
| `sortOrder` | `sortOrder` | `sort_seq` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

<!-- tb_delivery_zone·tb_delivery_zone_region: 0076 권역설정으로 교체되어 제거 (20261117180000_remove_delivery_zone) -->

### tb_unit ← `unit` (코드 모델 `Unit`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `unit_id` | TEXT(cuid) → BIGINT |
| `code` | `code` | `unit_cd` |  |
| `name` | `name` | `unit_nm` |  |
| `kind` | `kind` | ~~`unit_kind_cd`~~ | 0078에서 `type`(`unit_type_cd`, enum UnitType)으로 바뀜 |
| `decimals` | `decimals` | `decimal_cnt` |  |
| `sortOrder` | `sortOrder` | `sort_seq` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `isSystem` | `isSystem` | `system_yn` | 0078: `operator_id`가 비어 있는 시스템 기본 단위만 Y |
| `operatorId` | — | `operator_id` | 0078: NULL 허용 (NULL = 시스템 기본 단위, 모든 운영사 공유) |
| `type` | — | `unit_type_cd` | 0078: QTY·PACK·WEIGHT·VOLUME·LENGTH·AREA |
| `nameEn` / `printName` | — | `unit_nm_en` / `print_nm` | 0078 |
| `isBase` / `baseUnitId` / `baseFactor` | — | `base_yn` / `base_unit_id` / `base_factor` | 0078: 물리 단위 환산 (DECIMAL(20,10)) |
| `stdCode` / `description` / `extAttr` / `remark` | — | `std_unit_cd` / `description` / `ext_attr` / `remark` | 0078: UN/ECE Rec.20, 확장속성 JSONB |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |