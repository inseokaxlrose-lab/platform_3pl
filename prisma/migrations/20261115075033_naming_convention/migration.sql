-- M2.5 1a: DB 명명 규칙 전환 (docs/db-conventions.md) — 표·칸 이름만 바꾼다 (데이터 그대로)

-- User
ALTER TABLE "user" RENAME TO "tb_user";
ALTER TABLE "tb_user" RENAME COLUMN "id" TO "user_id";
ALTER TABLE "tb_user" RENAME COLUMN "name" TO "user_nm";
ALTER TABLE "tb_user" RENAME COLUMN "emailVerified" TO "email_verified";
ALTER TABLE "tb_user" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_user" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "tb_user" RENAME COLUMN "displayUsername" TO "display_username";
ALTER TABLE "tb_user" RENAME COLUMN "userType" TO "user_type_cd";
ALTER TABLE "tb_user" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_user" RENAME COLUMN "shipperId" TO "shipper_id";

-- Session
ALTER TABLE "session" RENAME TO "tb_session";
ALTER TABLE "tb_session" RENAME COLUMN "id" TO "session_id";
ALTER TABLE "tb_session" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "tb_session" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_session" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "tb_session" RENAME COLUMN "ipAddress" TO "ip_address";
ALTER TABLE "tb_session" RENAME COLUMN "userAgent" TO "user_agent";
ALTER TABLE "tb_session" RENAME COLUMN "userId" TO "user_id";

-- Account
ALTER TABLE "account" RENAME TO "tb_account";
ALTER TABLE "tb_account" RENAME COLUMN "id" TO "acct_id";
ALTER TABLE "tb_account" RENAME COLUMN "accountId" TO "provider_account_id";
ALTER TABLE "tb_account" RENAME COLUMN "providerId" TO "provider_id";
ALTER TABLE "tb_account" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "tb_account" RENAME COLUMN "accessToken" TO "access_token";
ALTER TABLE "tb_account" RENAME COLUMN "refreshToken" TO "refresh_token";
ALTER TABLE "tb_account" RENAME COLUMN "idToken" TO "id_token";
ALTER TABLE "tb_account" RENAME COLUMN "accessTokenExpiresAt" TO "access_token_expires_at";
ALTER TABLE "tb_account" RENAME COLUMN "refreshTokenExpiresAt" TO "refresh_token_expires_at";
ALTER TABLE "tb_account" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_account" RENAME COLUMN "updatedAt" TO "updated_at";

-- Verification
ALTER TABLE "verification" RENAME TO "tb_verification";
ALTER TABLE "tb_verification" RENAME COLUMN "id" TO "verification_id";
ALTER TABLE "tb_verification" RENAME COLUMN "expiresAt" TO "expires_at";
ALTER TABLE "tb_verification" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_verification" RENAME COLUMN "updatedAt" TO "updated_at";

-- PermissionGroup
ALTER TABLE "permission_group" RENAME TO "tb_perm_group";
ALTER TABLE "tb_perm_group" RENAME COLUMN "id" TO "perm_group_id";
ALTER TABLE "tb_perm_group" RENAME COLUMN "name" TO "perm_group_nm";
ALTER TABLE "tb_perm_group" RENAME COLUMN "area" TO "app_area_cd";
ALTER TABLE "tb_perm_group" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_perm_group" RENAME COLUMN "updatedAt" TO "updated_at";

-- PermissionGroupPermission
ALTER TABLE "permission_group_permission" RENAME TO "tb_perm_group_perm";
ALTER TABLE "tb_perm_group_perm" RENAME COLUMN "groupId" TO "group_id";
ALTER TABLE "tb_perm_group_perm" RENAME COLUMN "permissionCode" TO "perm_cd";

-- UserPermissionGroup
ALTER TABLE "user_permission_group" RENAME TO "tb_user_perm_group";
ALTER TABLE "tb_user_perm_group" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "tb_user_perm_group" RENAME COLUMN "groupId" TO "group_id";
ALTER TABLE "tb_user_perm_group" RENAME COLUMN "createdAt" TO "created_at";

-- UserPermissionOverride
ALTER TABLE "user_permission_override" RENAME TO "tb_user_perm_override";
ALTER TABLE "tb_user_perm_override" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "tb_user_perm_override" RENAME COLUMN "permissionCode" TO "perm_cd";
ALTER TABLE "tb_user_perm_override" RENAME COLUMN "effect" TO "effect_cd";
ALTER TABLE "tb_user_perm_override" RENAME COLUMN "createdAt" TO "created_at";

-- Center
ALTER TABLE "center" RENAME TO "tb_center";
ALTER TABLE "tb_center" RENAME COLUMN "id" TO "center_id";
ALTER TABLE "tb_center" RENAME COLUMN "systemCode" TO "sys_cd";
ALTER TABLE "tb_center" RENAME COLUMN "code" TO "center_cd";
ALTER TABLE "tb_center" RENAME COLUMN "name" TO "center_nm";
ALTER TABLE "tb_center" RENAME COLUMN "phone" TO "tel_no";
ALTER TABLE "tb_center" RENAME COLUMN "fax" TO "fax_no";
ALTER TABLE "tb_center" RENAME COLUMN "managerName" TO "manager_nm";
ALTER TABLE "tb_center" RENAME COLUMN "managerPhone" TO "manager_tel_no";
ALTER TABLE "tb_center" RENAME COLUMN "zipCode" TO "zip_cd";
ALTER TABLE "tb_center" RENAME COLUMN "address" TO "addr1";
ALTER TABLE "tb_center" RENAME COLUMN "addressDetail" TO "addr2";
ALTER TABLE "tb_center" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_center" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_center" RENAME COLUMN "updatedAt" TO "updated_at";

-- Warehouse
ALTER TABLE "warehouse" RENAME TO "tb_warehouse";
ALTER TABLE "tb_warehouse" RENAME COLUMN "id" TO "warehouse_id";
ALTER TABLE "tb_warehouse" RENAME COLUMN "centerId" TO "center_id";
ALTER TABLE "tb_warehouse" RENAME COLUMN "systemCode" TO "sys_cd";
ALTER TABLE "tb_warehouse" RENAME COLUMN "code" TO "warehouse_cd";
ALTER TABLE "tb_warehouse" RENAME COLUMN "name" TO "warehouse_nm";
ALTER TABLE "tb_warehouse" RENAME COLUMN "type" TO "warehouse_type_cd";
ALTER TABLE "tb_warehouse" RENAME COLUMN "storageCondition" TO "temp_zone_cd";
ALTER TABLE "tb_warehouse" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_warehouse" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_warehouse" RENAME COLUMN "updatedAt" TO "updated_at";

-- Location
ALTER TABLE "location" RENAME TO "tb_location";
ALTER TABLE "tb_location" RENAME COLUMN "id" TO "location_id";
ALTER TABLE "tb_location" RENAME COLUMN "warehouseId" TO "warehouse_id";
ALTER TABLE "tb_location" RENAME COLUMN "code" TO "location_cd";
ALTER TABLE "tb_location" RENAME COLUMN "zone" TO "zone_cd";
ALTER TABLE "tb_location" RENAME COLUMN "aisle" TO "aisle_cd";
ALTER TABLE "tb_location" RENAME COLUMN "level" TO "level_cd";
ALTER TABLE "tb_location" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_location" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_location" RENAME COLUMN "updatedAt" TO "updated_at";

-- Shipper
ALTER TABLE "shipper" RENAME TO "tb_shipper";
ALTER TABLE "tb_shipper" RENAME COLUMN "id" TO "shipper_id";
ALTER TABLE "tb_shipper" RENAME COLUMN "systemCode" TO "sys_cd";
ALTER TABLE "tb_shipper" RENAME COLUMN "code" TO "shipper_cd";
ALTER TABLE "tb_shipper" RENAME COLUMN "name" TO "shipper_nm";
ALTER TABLE "tb_shipper" RENAME COLUMN "businessNumber" TO "biz_reg_no";
ALTER TABLE "tb_shipper" RENAME COLUMN "ceoName" TO "ceo_nm";
ALTER TABLE "tb_shipper" RENAME COLUMN "businessType" TO "biz_condition";
ALTER TABLE "tb_shipper" RENAME COLUMN "businessItem" TO "biz_item";
ALTER TABLE "tb_shipper" RENAME COLUMN "phone" TO "tel_no";
ALTER TABLE "tb_shipper" RENAME COLUMN "fax" TO "fax_no";
ALTER TABLE "tb_shipper" RENAME COLUMN "zipCode" TO "zip_cd";
ALTER TABLE "tb_shipper" RENAME COLUMN "address" TO "addr1";
ALTER TABLE "tb_shipper" RENAME COLUMN "addressDetail" TO "addr2";
ALTER TABLE "tb_shipper" RENAME COLUMN "useLot" TO "lot_mgmt_yn";
ALTER TABLE "tb_shipper" RENAME COLUMN "useExpiry" TO "expiry_mgmt_yn";
ALTER TABLE "tb_shipper" RENAME COLUMN "labelUnit" TO "label_unit_cd";
ALTER TABLE "tb_shipper" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_shipper" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_shipper" RENAME COLUMN "updatedAt" TO "updated_at";

-- ShipperCenter
ALTER TABLE "shipper_center" RENAME TO "tb_shipper_center";
ALTER TABLE "tb_shipper_center" RENAME COLUMN "shipperId" TO "shipper_id";
ALTER TABLE "tb_shipper_center" RENAME COLUMN "centerId" TO "center_id";

-- ShipperContact
ALTER TABLE "shipper_contact" RENAME TO "tb_shipper_contact";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "id" TO "contact_id";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "shipperId" TO "shipper_id";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "sortOrder" TO "sort_seq";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "duty" TO "role_cd";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "name" TO "contact_nm";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "phone" TO "tel_no";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "isPrimary" TO "primary_yn";

-- UserCenter
ALTER TABLE "user_center" RENAME TO "tb_user_center";
ALTER TABLE "tb_user_center" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "tb_user_center" RENAME COLUMN "centerId" TO "center_id";
ALTER TABLE "tb_user_center" RENAME COLUMN "createdAt" TO "created_at";

-- UserGridSetting
ALTER TABLE "user_grid_setting" RENAME TO "tb_user_grid_setting";
ALTER TABLE "tb_user_grid_setting" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "tb_user_grid_setting" RENAME COLUMN "gridId" TO "grid_cd";
ALTER TABLE "tb_user_grid_setting" RENAME COLUMN "updatedAt" TO "updated_at";

-- UserFavoriteMenu
ALTER TABLE "user_favorite_menu" RENAME TO "tb_user_favorite_menu";
ALTER TABLE "tb_user_favorite_menu" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "tb_user_favorite_menu" RENAME COLUMN "href" TO "menu_href";
ALTER TABLE "tb_user_favorite_menu" RENAME COLUMN "createdAt" TO "created_at";

-- Company
ALTER TABLE "company" RENAME TO "tb_operator";
ALTER TABLE "tb_operator" RENAME COLUMN "id" TO "operator_id";
ALTER TABLE "tb_operator" RENAME COLUMN "name" TO "operator_nm";
ALTER TABLE "tb_operator" RENAME COLUMN "businessNumber" TO "biz_reg_no";
ALTER TABLE "tb_operator" RENAME COLUMN "ceoName" TO "ceo_nm";
ALTER TABLE "tb_operator" RENAME COLUMN "businessType" TO "biz_condition";
ALTER TABLE "tb_operator" RENAME COLUMN "businessItem" TO "biz_item";
ALTER TABLE "tb_operator" RENAME COLUMN "phone" TO "tel_no";
ALTER TABLE "tb_operator" RENAME COLUMN "fax" TO "fax_no";
ALTER TABLE "tb_operator" RENAME COLUMN "zipCode" TO "zip_cd";
ALTER TABLE "tb_operator" RENAME COLUMN "address" TO "addr1";
ALTER TABLE "tb_operator" RENAME COLUMN "addressDetail" TO "addr2";
ALTER TABLE "tb_operator" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_operator" RENAME COLUMN "updatedAt" TO "updated_at";
ALTER TABLE "tb_operator" RENAME COLUMN "updatedById" TO "updated_by_id";

-- CompanyContact
ALTER TABLE "company_contact" RENAME TO "tb_operator_contact";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "id" TO "contact_id";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "companyId" TO "company_id";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "sortOrder" TO "sort_seq";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "duty" TO "role_cd";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "name" TO "contact_nm";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "phone" TO "tel_no";
ALTER TABLE "tb_operator_contact" RENAME COLUMN "isPrimary" TO "primary_yn";

-- ExternalCode
ALTER TABLE "external_code" RENAME TO "tb_ext_code";
ALTER TABLE "tb_ext_code" RENAME COLUMN "id" TO "ext_code_id";
ALTER TABLE "tb_ext_code" RENAME COLUMN "system" TO "ext_system_cd";
ALTER TABLE "tb_ext_code" RENAME COLUMN "entityType" TO "entity_type_cd";
ALTER TABLE "tb_ext_code" RENAME COLUMN "entityId" TO "entity_id";
ALTER TABLE "tb_ext_code" RENAME COLUMN "code" TO "ext_cd";
ALTER TABLE "tb_ext_code" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_ext_code" RENAME COLUMN "updatedAt" TO "updated_at";

-- CodeGroup
ALTER TABLE "code_group" RENAME TO "tb_code_group";
ALTER TABLE "tb_code_group" RENAME COLUMN "id" TO "group_id";
ALTER TABLE "tb_code_group" RENAME COLUMN "code" TO "group_cd";
ALTER TABLE "tb_code_group" RENAME COLUMN "name" TO "group_nm";
ALTER TABLE "tb_code_group" RENAME COLUMN "sortOrder" TO "sort_seq";
ALTER TABLE "tb_code_group" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_code_group" RENAME COLUMN "isSystem" TO "system_yn";
ALTER TABLE "tb_code_group" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_code_group" RENAME COLUMN "updatedAt" TO "updated_at";

-- CodeItem
ALTER TABLE "code_item" RENAME TO "tb_code_item";
ALTER TABLE "tb_code_item" RENAME COLUMN "id" TO "code_item_id";
ALTER TABLE "tb_code_item" RENAME COLUMN "groupId" TO "group_id";
ALTER TABLE "tb_code_item" RENAME COLUMN "code" TO "code_item_cd";
ALTER TABLE "tb_code_item" RENAME COLUMN "name" TO "code_item_nm";
ALTER TABLE "tb_code_item" RENAME COLUMN "sortOrder" TO "sort_seq";
ALTER TABLE "tb_code_item" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_code_item" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_code_item" RENAME COLUMN "updatedAt" TO "updated_at";

-- DeliveryZone
ALTER TABLE "delivery_zone" RENAME TO "tb_delivery_zone";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "id" TO "zone_id";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "centerId" TO "center_id";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "systemCode" TO "sys_cd";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "code" TO "zone_cd";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "name" TO "zone_nm";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_delivery_zone" RENAME COLUMN "updatedAt" TO "updated_at";

-- DeliveryZoneRegion
ALTER TABLE "delivery_zone_region" RENAME TO "tb_delivery_zone_region";
ALTER TABLE "tb_delivery_zone_region" RENAME COLUMN "id" TO "zone_region_id";
ALTER TABLE "tb_delivery_zone_region" RENAME COLUMN "zoneId" TO "zone_id";
ALTER TABLE "tb_delivery_zone_region" RENAME COLUMN "regionCode" TO "region_cd";

-- Unit
ALTER TABLE "unit" RENAME TO "tb_unit";
ALTER TABLE "tb_unit" RENAME COLUMN "id" TO "unit_id";
ALTER TABLE "tb_unit" RENAME COLUMN "code" TO "unit_cd";
ALTER TABLE "tb_unit" RENAME COLUMN "name" TO "unit_nm";
ALTER TABLE "tb_unit" RENAME COLUMN "kind" TO "unit_kind_cd";
ALTER TABLE "tb_unit" RENAME COLUMN "decimals" TO "decimal_cnt";
ALTER TABLE "tb_unit" RENAME COLUMN "sortOrder" TO "sort_seq";
ALTER TABLE "tb_unit" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "tb_unit" RENAME COLUMN "isSystem" TO "system_yn";
ALTER TABLE "tb_unit" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "tb_unit" RENAME COLUMN "updatedAt" TO "updated_at";

-- 인덱스·제약 이름도 새 표·칸 이름에 맞춘다 (Prisma 기본 이름 규칙)
ALTER TABLE "tb_account" RENAME CONSTRAINT "account_pkey" TO "tb_account_pkey";
ALTER TABLE "tb_center" RENAME CONSTRAINT "center_pkey" TO "tb_center_pkey";
ALTER TABLE "tb_code_group" RENAME CONSTRAINT "code_group_pkey" TO "tb_code_group_pkey";
ALTER TABLE "tb_code_item" RENAME CONSTRAINT "code_item_pkey" TO "tb_code_item_pkey";
ALTER TABLE "tb_delivery_zone" RENAME CONSTRAINT "delivery_zone_pkey" TO "tb_delivery_zone_pkey";
ALTER TABLE "tb_delivery_zone_region" RENAME CONSTRAINT "delivery_zone_region_pkey" TO "tb_delivery_zone_region_pkey";
ALTER TABLE "tb_ext_code" RENAME CONSTRAINT "external_code_pkey" TO "tb_ext_code_pkey";
ALTER TABLE "tb_location" RENAME CONSTRAINT "location_pkey" TO "tb_location_pkey";
ALTER TABLE "tb_operator" RENAME CONSTRAINT "company_pkey" TO "tb_operator_pkey";
ALTER TABLE "tb_operator_contact" RENAME CONSTRAINT "company_contact_pkey" TO "tb_operator_contact_pkey";
ALTER TABLE "tb_perm_group" RENAME CONSTRAINT "permission_group_pkey" TO "tb_perm_group_pkey";
ALTER TABLE "tb_perm_group_perm" RENAME CONSTRAINT "permission_group_permission_pkey" TO "tb_perm_group_perm_pkey";
ALTER TABLE "tb_session" RENAME CONSTRAINT "session_pkey" TO "tb_session_pkey";
ALTER TABLE "tb_shipper" RENAME CONSTRAINT "shipper_pkey" TO "tb_shipper_pkey";
ALTER TABLE "tb_shipper_center" RENAME CONSTRAINT "shipper_center_pkey" TO "tb_shipper_center_pkey";
ALTER TABLE "tb_shipper_contact" RENAME CONSTRAINT "shipper_contact_pkey" TO "tb_shipper_contact_pkey";
ALTER TABLE "tb_unit" RENAME CONSTRAINT "unit_pkey" TO "tb_unit_pkey";
ALTER TABLE "tb_user" RENAME CONSTRAINT "user_pkey" TO "tb_user_pkey";
ALTER TABLE "tb_user_center" RENAME CONSTRAINT "user_center_pkey" TO "tb_user_center_pkey";
ALTER TABLE "tb_user_favorite_menu" RENAME CONSTRAINT "user_favorite_menu_pkey" TO "tb_user_favorite_menu_pkey";
ALTER TABLE "tb_user_grid_setting" RENAME CONSTRAINT "user_grid_setting_pkey" TO "tb_user_grid_setting_pkey";
ALTER TABLE "tb_user_perm_group" RENAME CONSTRAINT "user_permission_group_pkey" TO "tb_user_perm_group_pkey";
ALTER TABLE "tb_user_perm_override" RENAME CONSTRAINT "user_permission_override_pkey" TO "tb_user_perm_override_pkey";
ALTER TABLE "tb_verification" RENAME CONSTRAINT "verification_pkey" TO "tb_verification_pkey";
ALTER TABLE "tb_warehouse" RENAME CONSTRAINT "warehouse_pkey" TO "tb_warehouse_pkey";
ALTER TABLE "tb_account" RENAME CONSTRAINT "account_userId_fkey" TO "tb_account_user_id_fkey";
ALTER TABLE "tb_code_item" RENAME CONSTRAINT "code_item_groupId_fkey" TO "tb_code_item_group_id_fkey";
ALTER TABLE "tb_delivery_zone" RENAME CONSTRAINT "delivery_zone_centerId_fkey" TO "tb_delivery_zone_center_id_fkey";
ALTER TABLE "tb_delivery_zone_region" RENAME CONSTRAINT "delivery_zone_region_zoneId_fkey" TO "tb_delivery_zone_region_zone_id_fkey";
ALTER TABLE "tb_location" RENAME CONSTRAINT "location_warehouseId_fkey" TO "tb_location_warehouse_id_fkey";
ALTER TABLE "tb_operator" RENAME CONSTRAINT "company_updatedById_fkey" TO "tb_operator_updated_by_id_fkey";
ALTER TABLE "tb_operator_contact" RENAME CONSTRAINT "company_contact_companyId_fkey" TO "tb_operator_contact_company_id_fkey";
ALTER TABLE "tb_perm_group_perm" RENAME CONSTRAINT "permission_group_permission_groupId_fkey" TO "tb_perm_group_perm_group_id_fkey";
ALTER TABLE "tb_session" RENAME CONSTRAINT "session_userId_fkey" TO "tb_session_user_id_fkey";
ALTER TABLE "tb_shipper_center" RENAME CONSTRAINT "shipper_center_centerId_fkey" TO "tb_shipper_center_center_id_fkey";
ALTER TABLE "tb_shipper_center" RENAME CONSTRAINT "shipper_center_shipperId_fkey" TO "tb_shipper_center_shipper_id_fkey";
ALTER TABLE "tb_shipper_contact" RENAME CONSTRAINT "shipper_contact_shipperId_fkey" TO "tb_shipper_contact_shipper_id_fkey";
ALTER TABLE "tb_user" RENAME CONSTRAINT "user_shipperId_fkey" TO "tb_user_shipper_id_fkey";
ALTER TABLE "tb_user_center" RENAME CONSTRAINT "user_center_centerId_fkey" TO "tb_user_center_center_id_fkey";
ALTER TABLE "tb_user_center" RENAME CONSTRAINT "user_center_userId_fkey" TO "tb_user_center_user_id_fkey";
ALTER TABLE "tb_user_favorite_menu" RENAME CONSTRAINT "user_favorite_menu_userId_fkey" TO "tb_user_favorite_menu_user_id_fkey";
ALTER TABLE "tb_user_grid_setting" RENAME CONSTRAINT "user_grid_setting_userId_fkey" TO "tb_user_grid_setting_user_id_fkey";
ALTER TABLE "tb_user_perm_group" RENAME CONSTRAINT "user_permission_group_groupId_fkey" TO "tb_user_perm_group_group_id_fkey";
ALTER TABLE "tb_user_perm_group" RENAME CONSTRAINT "user_permission_group_userId_fkey" TO "tb_user_perm_group_user_id_fkey";
ALTER TABLE "tb_user_perm_override" RENAME CONSTRAINT "user_permission_override_userId_fkey" TO "tb_user_perm_override_user_id_fkey";
ALTER TABLE "tb_warehouse" RENAME CONSTRAINT "warehouse_centerId_fkey" TO "tb_warehouse_center_id_fkey";
ALTER INDEX "account_userId_idx" RENAME TO "tb_account_user_id_idx";
ALTER INDEX "center_code_key" RENAME TO "tb_center_center_cd_key";
ALTER INDEX "center_systemCode_key" RENAME TO "tb_center_sys_cd_key";
ALTER INDEX "code_group_code_key" RENAME TO "tb_code_group_group_cd_key";
ALTER INDEX "code_item_groupId_code_key" RENAME TO "tb_code_item_group_id_code_item_cd_key";
ALTER INDEX "code_item_groupId_sortOrder_idx" RENAME TO "tb_code_item_group_id_sort_seq_idx";
ALTER INDEX "delivery_zone_centerId_code_key" RENAME TO "tb_delivery_zone_center_id_zone_cd_key";
ALTER INDEX "delivery_zone_centerId_idx" RENAME TO "tb_delivery_zone_center_id_idx";
ALTER INDEX "delivery_zone_systemCode_key" RENAME TO "tb_delivery_zone_sys_cd_key";
ALTER INDEX "delivery_zone_region_regionCode_idx" RENAME TO "tb_delivery_zone_region_region_cd_idx";
ALTER INDEX "delivery_zone_region_zoneId_regionCode_key" RENAME TO "tb_delivery_zone_region_zone_id_region_cd_key";
ALTER INDEX "external_code_entityType_entityId_idx" RENAME TO "tb_ext_code_entity_type_cd_entity_id_idx";
ALTER INDEX "external_code_system_entityType_code_key" RENAME TO "tb_ext_code_ext_system_cd_entity_type_cd_ext_cd_key";
ALTER INDEX "external_code_system_entityType_entityId_key" RENAME TO "tb_ext_code_ext_system_cd_entity_type_cd_entity_id_key";
ALTER INDEX "location_warehouseId_code_key" RENAME TO "tb_location_warehouse_id_location_cd_key";
ALTER INDEX "location_warehouseId_zone_idx" RENAME TO "tb_location_warehouse_id_zone_cd_idx";
ALTER INDEX "company_contact_companyId_sortOrder_idx" RENAME TO "tb_operator_contact_company_id_sort_seq_idx";
ALTER INDEX "permission_group_name_key" RENAME TO "tb_perm_group_perm_group_nm_key";
ALTER INDEX "session_token_key" RENAME TO "tb_session_token_key";
ALTER INDEX "session_userId_idx" RENAME TO "tb_session_user_id_idx";
ALTER INDEX "shipper_code_key" RENAME TO "tb_shipper_shipper_cd_key";
ALTER INDEX "shipper_systemCode_key" RENAME TO "tb_shipper_sys_cd_key";
ALTER INDEX "shipper_center_centerId_idx" RENAME TO "tb_shipper_center_center_id_idx";
ALTER INDEX "shipper_contact_shipperId_sortOrder_idx" RENAME TO "tb_shipper_contact_shipper_id_sort_seq_idx";
ALTER INDEX "unit_code_key" RENAME TO "tb_unit_unit_cd_key";
ALTER INDEX "user_email_key" RENAME TO "tb_user_email_key";
ALTER INDEX "user_shipperId_idx" RENAME TO "tb_user_shipper_id_idx";
ALTER INDEX "user_username_key" RENAME TO "tb_user_username_key";
ALTER INDEX "user_center_centerId_idx" RENAME TO "tb_user_center_center_id_idx";
ALTER INDEX "user_permission_group_groupId_idx" RENAME TO "tb_user_perm_group_group_id_idx";
ALTER INDEX "verification_identifier_idx" RENAME TO "tb_verification_identifier_idx";
ALTER INDEX "warehouse_centerId_code_key" RENAME TO "tb_warehouse_center_id_warehouse_cd_key";
ALTER INDEX "warehouse_centerId_idx" RENAME TO "tb_warehouse_center_id_idx";
ALTER INDEX "warehouse_systemCode_key" RENAME TO "tb_warehouse_sys_cd_key";

-- 직접 만든 부분 고유 인덱스 (센터마다 입고대기 창고 1개)도 새 규칙 이름으로
ALTER INDEX "warehouse_one_inbound_staging_per_center" RENAME TO "tb_warehouse_one_inbound_per_center";

-- 직접 만든 검사 조건도 새 표 이름에 맞춘다 (칸 참조는 PostgreSQL이 자동으로 갱신)
ALTER TABLE "tb_user" RENAME CONSTRAINT "user_shipper_matches_type" TO "tb_user_shipper_matches_type";
