# DB 명명 규칙 · 공통 칸

- 상태: 1a(이름 바꾸기) **적용 완료** — 마이그레이션 `20261115075033_naming_convention` / 1b(BIGINT 키) **적용 완료** — `20261115083253_bigint_keys`. 1c(Y/N)·2단계(공통 칸)는 아래 규칙대로 진행 예정
- 결정: 사용자 결정 2026-11-15 — 정의서 규칙을 모든 표에 적용, `_yn`은 CHAR(1) 'Y'/'N', 내부 키 BIGINT, 코드 쪽 이름은 camelCase 유지
- 관련: `docs/specs/operator.md`(운영사 컬럼 정의서, 받는 대로 추가), 0037(명명 규칙)·0038(공통 칸)·0039(멀티테넌트) 예정

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
- **`_yn` 값**: 코드에서는 `'Y' | 'N'` 타입(`Yn`), 화면 입력(스위치)·입력 규칙(Zod)에서 boolean ↔ `'Y'/'N'`으로 바꾼다.
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
  - 운영사는 아직 1곳이라 고정 키 `1n`(`COMPANY_ID`) — 3단계 멀티테넌트에서 바뀐다.
- 길이: 정의서의 VARCHAR(n)·CHAR(n)를 DB에도 `@db.VarChar(n)`로 둔다 (입력 규칙 최대 길이와 같게).

## 공통 칸 (모든 기준정보, 2단계)

| 칸 | 형식 | 설명 |
| --- | --- | --- |
| `status_cd` | VARCHAR(10) | 기준정보 공통 `ACTIVE`(사용) / `INACTIVE`(중지) — `isActive` 대체. 운영사는 `OPERATOR_STATUS` |
| `del_yn` | CHAR(1) | 논리 삭제. 모든 조회는 `del_yn = 'N'`만, 코드 중복 검사도 삭제 안 된 것끼리 (부분 고유 인덱스) |
| `created_at` / `created_by` | TIMESTAMP / VARCHAR(50) | 등록 일시·등록자 아이디 |
| `updated_at` / `updated_by` | TIMESTAMP / VARCHAR(50) | 수정 일시·수정자 아이디 |
| `row_version` | INT | 낙관적 락: 저장 때 같으면 +1, 다르면 "다른 사람이 먼저 고쳤습니다" |

## 표·칸 대응표 (1단계 — 지금 25개 표, 197개 칸)

> 운영사 관련(`tb_operator` 등)은 4단계에서 정의서대로 칸이 더 늘어난다. 2단계(공통 칸)·3단계(`operator_id`) 칸은 여기 없다.

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

### tb_center ← `center` (코드 모델 `Center`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `center_id` | TEXT(cuid) → BIGINT |
| `systemCode` | `systemCode` | `sys_cd` |  |
| `code` | `code` | `center_cd` |  |
| `name` | `name` | `center_nm` |  |
| `phone` | `phone` | `tel_no` |  |
| `fax` | `fax` | `fax_no` |  |
| `managerName` | `managerName` | `manager_nm` |  |
| `managerPhone` | `managerPhone` | `manager_tel_no` |  |
| `zipCode` | `zipCode` | `zip_cd` |  |
| `address` | `address` | `addr1` |  |
| `addressDetail` | `addressDetail` | `addr2` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_warehouse ← `warehouse` (코드 모델 `Warehouse`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `warehouse_id` | TEXT(cuid) → BIGINT |
| `centerId` | `centerId` | `center_id` | TEXT(cuid) → BIGINT |
| `systemCode` | `systemCode` | `sys_cd` |  |
| `code` | `code` | `warehouse_cd` |  |
| `name` | `name` | `warehouse_nm` |  |
| `type` | `type` | `warehouse_type_cd` |  |
| `storageCondition` | `storageCondition` | `temp_zone_cd` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_location ← `location` (코드 모델 `Location`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `location_id` | TEXT(cuid) → BIGINT |
| `warehouseId` | `warehouseId` | `warehouse_id` | TEXT(cuid) → BIGINT |
| `code` | `code` | `location_cd` |  |
| `zone` | `zone` | `zone_cd` |  |
| `aisle` | `aisle` | `aisle_cd` |  |
| `level` | `level` | `level_cd` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

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
| `isSystem` | `isSystem` | `system_yn` |  |
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

### tb_delivery_zone ← `delivery_zone` (코드 모델 `DeliveryZone`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `zone_id` | TEXT(cuid) → BIGINT |
| `centerId` | `centerId` | `center_id` | TEXT(cuid) → BIGINT |
| `systemCode` | `systemCode` | `sys_cd` |  |
| `code` | `code` | `zone_cd` |  |
| `name` | `name` | `zone_nm` |  |
| `description` | `description` | `description` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |

### tb_delivery_zone_region ← `delivery_zone_region` (코드 모델 `DeliveryZoneRegion`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `zone_region_id` | TEXT(cuid) → BIGINT |
| `zoneId` | `zoneId` | `zone_id` | TEXT(cuid) → BIGINT |
| `regionCode` | `regionCode` | `region_cd` |  |

### tb_unit ← `unit` (코드 모델 `Unit`)

| 코드(그대로) | 지금 DB | 새 DB | 비고 |
| --- | --- | --- | --- |
| `id` | `id` | `unit_id` | TEXT(cuid) → BIGINT |
| `code` | `code` | `unit_cd` |  |
| `name` | `name` | `unit_nm` |  |
| `kind` | `kind` | `unit_kind_cd` |  |
| `decimals` | `decimals` | `decimal_cnt` |  |
| `sortOrder` | `sortOrder` | `sort_seq` |  |
| `isActive` | `isActive` | `status_cd` | Boolean → status_cd (2단계, ACTIVE/INACTIVE) |
| `isSystem` | `isSystem` | `system_yn` |  |
| `createdAt` | `createdAt` | `created_at` |  |
| `updatedAt` | `updatedAt` | `updated_at` |  |