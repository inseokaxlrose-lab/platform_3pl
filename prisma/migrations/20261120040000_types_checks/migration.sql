-- 타입·검사 정리 (docs/decisions/0084 ④-2, 정의서 system_code M5·M6·M7·M11·M14·M15·M18)

-- ── M18. 센터 옛 담당자 칸 삭제: 값이 있고 담당자가 없는 센터는 대표 담당자(센터장)로 옮긴다
INSERT INTO "tb_center_contact" ("center_id", "sort_seq", "role_cd", "contact_nm", "tel_no", "primary_yn")
SELECT c."center_id", 1, 'MANAGER', LEFT(c."manager_nm", 50),
       NULLIF(LEFT(REGEXP_REPLACE(COALESCE(c."manager_tel_no", ''), '[^0-9]', '', 'g'), 15), ''), 'Y'
FROM "tb_center" c
WHERE NULLIF(BTRIM(c."manager_nm"), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "tb_center_contact" x WHERE x."center_id" = c."center_id");
ALTER TABLE "tb_center" DROP COLUMN "manager_nm", DROP COLUMN "manager_tel_no";

-- ── M6. ENUM → VARCHAR(20) + CHECK (값은 그대로 글자로 옮긴다)
-- ENUM 값을 직접 쓰는 검사 조건은 먼저 지우고 아래에서 다시 만든다
ALTER TABLE "tb_user" DROP CONSTRAINT "tb_user_shipper_matches_type";
ALTER TABLE "tb_stock_txn" DROP CONSTRAINT "tb_stock_txn_reason_check";
ALTER TABLE "tb_asn" DROP CONSTRAINT "tb_asn_close_check";
ALTER TABLE "tb_stock_adjust" DROP CONSTRAINT "tb_stock_adjust_check";
ALTER TABLE "tb_unit" DROP CONSTRAINT "tb_unit_pack_no_factor";
ALTER TABLE "tb_unit" DROP CONSTRAINT "tb_unit_qty_no_factor";
ALTER TABLE "tb_unit" DROP CONSTRAINT "tb_unit_physical_factor";

ALTER TABLE "tb_user" ALTER COLUMN "user_type_cd" SET DATA TYPE VARCHAR(20) USING "user_type_cd"::text;
ALTER TABLE "tb_perm_group" ALTER COLUMN "app_area_cd" DROP DEFAULT;
ALTER TABLE "tb_perm_group" ALTER COLUMN "app_area_cd" SET DATA TYPE VARCHAR(20) USING "app_area_cd"::text;
ALTER TABLE "tb_perm_group" ALTER COLUMN "app_area_cd" SET DEFAULT 'ADMIN';
ALTER TABLE "tb_user_perm_override" ALTER COLUMN "effect_cd" SET DATA TYPE VARCHAR(20) USING "effect_cd"::text;
ALTER TABLE "tb_shipper" ALTER COLUMN "label_unit_cd" DROP DEFAULT;
ALTER TABLE "tb_shipper" ALTER COLUMN "label_unit_cd" SET DATA TYPE VARCHAR(20) USING "label_unit_cd"::text;
ALTER TABLE "tb_shipper" ALTER COLUMN "label_unit_cd" SET DEFAULT 'PLT';
ALTER TABLE "tb_item" ALTER COLUMN "label_unit_cd" SET DATA TYPE VARCHAR(20) USING "label_unit_cd"::text;
ALTER TABLE "tb_inbound_label" ALTER COLUMN "label_unit_cd" SET DATA TYPE VARCHAR(20) USING "label_unit_cd"::text;
ALTER TABLE "tb_ext_code" ALTER COLUMN "entity_type_cd" SET DATA TYPE VARCHAR(20) USING "entity_type_cd"::text;
ALTER TABLE "tb_unit" ALTER COLUMN "unit_type_cd" SET DATA TYPE VARCHAR(20) USING "unit_type_cd"::text;
ALTER TABLE "tb_stock_txn" ALTER COLUMN "txn_type_cd" SET DATA TYPE VARCHAR(20) USING "txn_type_cd"::text;
ALTER TABLE "tb_asn" ALTER COLUMN "inbound_type_cd" DROP DEFAULT;
ALTER TABLE "tb_asn" ALTER COLUMN "inbound_type_cd" SET DATA TYPE VARCHAR(20) USING "inbound_type_cd"::text;
ALTER TABLE "tb_asn" ALTER COLUMN "inbound_type_cd" SET DEFAULT 'SHIPPER';
ALTER TABLE "tb_asn" ALTER COLUMN "reg_channel_cd" SET DATA TYPE VARCHAR(20) USING "reg_channel_cd"::text;
ALTER TABLE "tb_asn" ALTER COLUMN "asn_status_cd" DROP DEFAULT;
ALTER TABLE "tb_asn" ALTER COLUMN "asn_status_cd" SET DATA TYPE VARCHAR(20) USING "asn_status_cd"::text;
ALTER TABLE "tb_asn" ALTER COLUMN "asn_status_cd" SET DEFAULT 'PLANNED';
ALTER TABLE "tb_asn" ALTER COLUMN "putaway_status_cd" DROP DEFAULT;
ALTER TABLE "tb_asn" ALTER COLUMN "putaway_status_cd" SET DATA TYPE VARCHAR(20) USING "putaway_status_cd"::text;
ALTER TABLE "tb_asn" ALTER COLUMN "putaway_status_cd" SET DEFAULT 'WAITING';
ALTER TABLE "tb_stock_adjust" ALTER COLUMN "adjust_type_cd" SET DATA TYPE VARCHAR(20) USING "adjust_type_cd"::text;
ALTER TABLE "tb_stock_adjust" ALTER COLUMN "adjust_status_cd" DROP DEFAULT;
ALTER TABLE "tb_stock_adjust" ALTER COLUMN "adjust_status_cd" SET DATA TYPE VARCHAR(20) USING "adjust_status_cd"::text;
ALTER TABLE "tb_stock_adjust" ALTER COLUMN "adjust_status_cd" SET DEFAULT 'DRAFT';

DROP TYPE "AppArea";
DROP TYPE "AsnChannel";
DROP TYPE "AsnStatus";
DROP TYPE "ExternalEntityType";
DROP TYPE "InboundType";
DROP TYPE "LabelUnit";
DROP TYPE "PermissionEffect";
DROP TYPE "PutawayStatus";
DROP TYPE "StockAdjustStatus";
DROP TYPE "StockAdjustType";
DROP TYPE "StockTxnType";
DROP TYPE "UnitType";
DROP TYPE "UserType";

-- 값 목록 검사 (상수와 같은지는 src/config/db-value-sets.db.test.ts가 확인한다)
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_user_type_cd_check" CHECK ("user_type_cd" IN ('OPERATOR', 'CENTER', 'SHIPPER', 'PLATFORM'));
ALTER TABLE "tb_perm_group" ADD CONSTRAINT "tb_perm_group_app_area_cd_check" CHECK ("app_area_cd" IN ('ADMIN', 'PORTAL'));
ALTER TABLE "tb_user_perm_override" ADD CONSTRAINT "tb_user_perm_override_effect_cd_check" CHECK ("effect_cd" IN ('GRANT', 'DENY'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_label_unit_cd_check" CHECK ("label_unit_cd" IN ('PLT', 'BOX'));
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_label_unit_cd_check" CHECK ("label_unit_cd" IN ('PLT', 'BOX'));
ALTER TABLE "tb_inbound_label" ADD CONSTRAINT "tb_inbound_label_label_unit_cd_check" CHECK ("label_unit_cd" IN ('PLT', 'BOX'));
ALTER TABLE "tb_ext_code" ADD CONSTRAINT "tb_ext_code_entity_type_cd_check" CHECK ("entity_type_cd" IN ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'UNIT'));
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_unit_type_cd_check" CHECK ("unit_type_cd" IN ('QTY', 'PACK', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA'));
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_txn_type_cd_check" CHECK ("txn_type_cd" IN ('RECEIVE', 'MOVE_OUT', 'MOVE_IN', 'ADJUST'));
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_inbound_type_cd_check" CHECK ("inbound_type_cd" IN ('SHIPPER', 'TRANSFER'));
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_reg_channel_cd_check" CHECK ("reg_channel_cd" IN ('PORTAL', 'PROXY', 'EXCEL', 'API'));
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_asn_status_cd_check" CHECK ("asn_status_cd" IN ('PLANNED', 'INSPECTING', 'PARTIAL', 'COMPLETED', 'CLOSED'));
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_putaway_status_cd_check" CHECK ("putaway_status_cd" IN ('WAITING', 'PARTIAL', 'DONE'));
ALTER TABLE "tb_stock_adjust" ADD CONSTRAINT "tb_stock_adjust_adjust_type_cd_check" CHECK ("adjust_type_cd" IN ('COUNT', 'ADJUST'));
ALTER TABLE "tb_stock_adjust" ADD CONSTRAINT "tb_stock_adjust_adjust_status_cd_check" CHECK ("adjust_status_cd" IN ('DRAFT', 'CONFIRMED', 'CANCELED'));

-- 지웠던 검사 조건 다시 (ENUM 캐스트 없이)
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_shipper_matches_type" CHECK (("user_type_cd" = 'SHIPPER') = ("shipper_id" IS NOT NULL));
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_reason_check" CHECK ("txn_type_cd" <> 'ADJUST' OR ("reason" IS NOT NULL AND "reason" <> ''));
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_close_check" CHECK ("asn_status_cd" <> 'CLOSED' OR (BTRIM(COALESCE("close_reason", '')) <> '' AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL));
ALTER TABLE "tb_stock_adjust" ADD CONSTRAINT "tb_stock_adjust_check" CHECK (
  BTRIM("reason") <> ''
  AND ("adjust_status_cd" <> 'CONFIRMED' OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL))
  AND ("adjust_status_cd" <> 'CANCELED' OR ("canceled_at" IS NOT NULL AND "canceled_by" IS NOT NULL)));
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_pack_no_factor" CHECK ("unit_type_cd" <> 'PACK' OR ("base_factor" IS NULL AND "base_unit_id" IS NULL AND "base_yn" = 'N'));
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_qty_no_factor" CHECK ("unit_type_cd" <> 'QTY' OR "base_yn" = 'Y' OR ("base_factor" IS NULL AND "base_unit_id" IS NULL));
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_physical_factor" CHECK ("unit_type_cd" NOT IN ('WEIGHT', 'VOLUME', 'LENGTH', 'AREA') OR "base_yn" = 'Y' OR ("base_factor" IS NOT NULL AND "base_unit_id" IS NOT NULL));

-- ── M7. 값 목록 코드 칸은 VARCHAR(20), TEXT 칸은 길이를 정한 VARCHAR
-- (예외: 로그 본문 req_body·resp_body·response_body, 인증 라이브러리 표 tb_user·tb_account·tb_session·tb_verification의 인증 칸)
ALTER TABLE "tb_api_client" ALTER COLUMN "env_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_api_request_log" ALTER COLUMN "env_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_center" ALTER COLUMN "alloc_rule_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_code_group" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_code_item" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_item" ALTER COLUMN "alloc_rule_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_item_unit" ALTER COLUMN "unit_level_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_item_unit_hist" ALTER COLUMN "unit_level_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_numbering_rule" ALTER COLUMN "date_fmt_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_numbering_rule" ALTER COLUMN "reset_cycle_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_operator" ALTER COLUMN "alloc_rule_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_operator" ALTER COLUMN "billing_basis_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_operator" ALTER COLUMN "biz_entity_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_operator" ALTER COLUMN "tax_type_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_operator_unit" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_pallet_type" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_region_load_hist" ALTER COLUMN "load_type_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_region_load_hist" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_ship_to" ALTER COLUMN "center_assign_type_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_shipper" ALTER COLUMN "alloc_rule_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_shipper" ALTER COLUMN "biz_entity_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_shipper" ALTER COLUMN "settle_cycle_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_shipper" ALTER COLUMN "tax_type_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_shipper_center" ALTER COLUMN "alloc_rule_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_unit" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_user" ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_code_group" ALTER COLUMN "group_cd" SET DATA TYPE VARCHAR(30);
ALTER TABLE "tb_code_group" ALTER COLUMN "group_nm" SET DATA TYPE VARCHAR(50);
ALTER TABLE "tb_code_group" ALTER COLUMN "description" SET DATA TYPE VARCHAR(200);
ALTER TABLE "tb_code_item" ALTER COLUMN "code_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_code_item" ALTER COLUMN "code_nm" SET DATA TYPE VARCHAR(50);
ALTER TABLE "tb_code_item" ALTER COLUMN "description" SET DATA TYPE VARCHAR(200);
ALTER TABLE "tb_ext_code" ALTER COLUMN "ext_cd" SET DATA TYPE VARCHAR(50);
ALTER TABLE "tb_ext_code" ALTER COLUMN "ext_system_cd" SET DATA TYPE VARCHAR(20);
ALTER TABLE "tb_perm_group" ALTER COLUMN "perm_group_nm" SET DATA TYPE VARCHAR(50);
ALTER TABLE "tb_perm_group" ALTER COLUMN "description" SET DATA TYPE VARCHAR(200);
ALTER TABLE "tb_perm_group_perm" ALTER COLUMN "perm_cd" SET DATA TYPE VARCHAR(100);
ALTER TABLE "tb_unit" ALTER COLUMN "unit_cd" SET DATA TYPE VARCHAR(10);
ALTER TABLE "tb_unit" ALTER COLUMN "unit_nm" SET DATA TYPE VARCHAR(50);
ALTER TABLE "tb_user_favorite_menu" ALTER COLUMN "menu_href" SET DATA TYPE VARCHAR(200);
ALTER TABLE "tb_user_grid_setting" ALTER COLUMN "grid_cd" SET DATA TYPE VARCHAR(50);
ALTER TABLE "tb_user_perm_override" ALTER COLUMN "perm_cd" SET DATA TYPE VARCHAR(100);

-- ── M11. 정제한 우편번호는 5자리 숫자 (원본은 raw_zip_cd VARCHAR(10) 그대로)
ALTER TABLE "tb_customer" ALTER COLUMN "zip_cd" SET DATA TYPE CHAR(5);
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_zip_cd_check" CHECK ("zip_cd" IS NULL OR "zip_cd" ~ '^[0-9]{5}$');
ALTER TABLE "tb_ship_to" ALTER COLUMN "zip_cd" SET DATA TYPE CHAR(5);
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_zip_cd_check" CHECK ("zip_cd" IS NULL OR "zip_cd" ~ '^[0-9]{5}$');

-- ── M14. 같은 내용의 검사 조건이 두 개씩 — 하나만 남긴다
ALTER TABLE "tb_location" DROP CONSTRAINT "tb_location_status_check";
ALTER TABLE "tb_warehouse" DROP CONSTRAINT "tb_warehouse_status_check";

-- ── M5. 대표 담당자는 1명 (센터 담당자와 같게)
CREATE UNIQUE INDEX "tb_operator_contact_primary_key" ON "tb_operator_contact"("operator_id") WHERE (primary_yn = 'Y');
CREATE UNIQUE INDEX "tb_shipper_contact_primary_key" ON "tb_shipper_contact"("shipper_id") WHERE (primary_yn = 'Y');
CREATE UNIQUE INDEX "tb_customer_contact_primary_key" ON "tb_customer_contact"("customer_id") WHERE (primary_yn = 'Y');

-- ── M15. 업무 문서 표의 빠진 FK (이력·로그 표 tb_stock_txn·*_hist·API 로그에서 나가는 FK는 일부러 두지 않는다)
ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_asn_id_fkey" FOREIGN KEY ("asn_id") REFERENCES "tb_asn"("asn_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_stock_adjust" ADD CONSTRAINT "tb_stock_adjust_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_stock_txn_id_fkey" FOREIGN KEY ("stock_txn_id") REFERENCES "tb_stock_txn"("stock_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_stock_adjust_line" ADD CONSTRAINT "tb_stock_adjust_line_stock_txn_id_fkey" FOREIGN KEY ("stock_txn_id") REFERENCES "tb_stock_txn"("stock_txn_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_api_idempotency" ADD CONSTRAINT "tb_api_idempotency_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "tb_api_client"("api_client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tb_api_rate_bucket" ADD CONSTRAINT "tb_api_rate_bucket_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "tb_api_client"("api_client_id") ON DELETE CASCADE ON UPDATE CASCADE;
