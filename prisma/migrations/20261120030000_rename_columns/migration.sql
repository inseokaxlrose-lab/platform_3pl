-- 칼럼 이름 정리 (docs/decisions/0084 ④-1, 정의서 system_code M1·M2·M3·M8·M9·M10·M12·M16)
-- RENAME이라 데이터는 그대로다. 검사 조건·인덱스 정의는 PostgreSQL이 따라 바꾸고, 이름만 새 칼럼에 맞춘다

-- M1. 권한그룹 FK: group_id → perm_group_id
ALTER TABLE "tb_perm_group_perm" RENAME COLUMN "group_id" TO "perm_group_id";
ALTER TABLE "tb_perm_group_perm" RENAME CONSTRAINT "tb_perm_group_perm_group_id_fkey" TO "tb_perm_group_perm_perm_group_id_fkey";
ALTER TABLE "tb_user_perm_group" RENAME COLUMN "group_id" TO "perm_group_id";
ALTER TABLE "tb_user_perm_group" RENAME CONSTRAINT "tb_user_perm_group_group_id_fkey" TO "tb_user_perm_group_perm_group_id_fkey";
ALTER INDEX "tb_user_perm_group_group_id_idx" RENAME TO "tb_user_perm_group_perm_group_id_idx";

-- M2·M3. 공통코드: group_id → code_group_id, code_item_cd·code_item_nm → code_cd·code_nm
ALTER TABLE "tb_code_group" RENAME COLUMN "group_id" TO "code_group_id";
ALTER SEQUENCE IF EXISTS "tb_code_group_group_id_seq" RENAME TO "tb_code_group_code_group_id_seq";
ALTER TABLE "tb_code_item" RENAME COLUMN "group_id" TO "code_group_id";
ALTER TABLE "tb_code_item" RENAME COLUMN "code_item_cd" TO "code_cd";
ALTER TABLE "tb_code_item" RENAME COLUMN "code_item_nm" TO "code_nm";
ALTER TABLE "tb_code_item" RENAME CONSTRAINT "tb_code_item_group_id_fkey" TO "tb_code_item_code_group_id_fkey";
ALTER INDEX "tb_code_item_group_id_code_item_cd_key" RENAME TO "tb_code_item_code_group_id_code_cd_key";
ALTER INDEX "tb_code_item_group_id_sort_seq_idx" RENAME TO "tb_code_item_code_group_id_sort_seq_idx";

-- M8. 일수는 _days
ALTER TABLE "tb_item" RENAME COLUMN "expiry_alert_day_cnt" TO "expiry_alert_days";

-- M9. 수량은 _qty, 개수는 _cnt
ALTER TABLE "tb_item_unit" RENAME COLUMN "conv_cnt" TO "conv_qty";
ALTER TABLE "tb_item" RENAME COLUMN "pallet_box_qty" TO "pallet_box_cnt";
ALTER TABLE "tb_item" RENAME COLUMN "max_stack_box" TO "max_stack_box_cnt";
ALTER TABLE "tb_inbound_receipt_line" RENAME COLUMN "confirm_qty" TO "confirmed_qty";

-- M10. loc → location (PK가 location_id)
ALTER TABLE "tb_location" RENAME COLUMN "loc_type_cd" TO "location_type_cd";
ALTER TABLE "tb_center" RENAME COLUMN "default_inbound_loc_id" TO "default_inbound_location_id";
ALTER TABLE "tb_center" RENAME COLUMN "default_outbound_loc_id" TO "default_outbound_location_id";
ALTER TABLE "tb_center" RENAME COLUMN "default_return_loc_id" TO "default_return_location_id";
ALTER TABLE "tb_center" RENAME CONSTRAINT "tb_center_default_inbound_loc_id_fkey" TO "tb_center_default_inbound_location_id_fkey";
ALTER TABLE "tb_center" RENAME CONSTRAINT "tb_center_default_outbound_loc_id_fkey" TO "tb_center_default_outbound_location_id_fkey";
ALTER TABLE "tb_center" RENAME CONSTRAINT "tb_center_default_return_loc_id_fkey" TO "tb_center_default_return_location_id_fkey";
ALTER TABLE "tb_warehouse" RENAME COLUMN "default_loc_id" TO "default_location_id";
ALTER TABLE "tb_warehouse" RENAME COLUMN "loc_cd_prefix" TO "location_cd_prefix";
ALTER TABLE "tb_warehouse" RENAME COLUMN "loc_cd_separator" TO "location_cd_separator";
ALTER TABLE "tb_warehouse" RENAME CONSTRAINT "tb_warehouse_default_loc_id_fkey" TO "tb_warehouse_default_location_id_fkey";
ALTER INDEX "tb_warehouse_default_loc_id_idx" RENAME TO "tb_warehouse_default_location_id_idx";

-- M12. 내용에 맞는 이름: 거래처 법정동코드, 센터 시군구명 (납품처와 같은 이름)
ALTER TABLE "tb_customer" RENAME COLUMN "region_cd" TO "bjd_cd";
ALTER INDEX "tb_customer_region_cd_idx" RENAME TO "tb_customer_bjd_cd_idx";
ALTER TABLE "tb_center" RENAME COLUMN "region_nm" TO "sigungu_nm";

-- M16. 일시는 _at
ALTER TABLE "tb_api_rate_bucket" RENAME COLUMN "window_start" TO "window_start_at";

-- 검사 조건 이름도 새 칼럼 이름으로
ALTER TABLE "tb_item" RENAME CONSTRAINT "tb_item_expiry_alert_day_cnt_check" TO "tb_item_expiry_alert_days_check";
ALTER TABLE "tb_item_unit" RENAME CONSTRAINT "tb_item_unit_conv_cnt_check" TO "tb_item_unit_conv_qty_check";
ALTER TABLE "tb_customer" RENAME CONSTRAINT "tb_customer_region_cd_check" TO "tb_customer_bjd_cd_check";
