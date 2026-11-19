-- 품목 정의서 반영 (docs/decisions/0083): 품목 칸 확장 · 품목 단위(레벨·규격·CBM) · 바코드 표 · 팔레트 종류 · 단위 환산 이력
-- 순서: 구조 → 기존 데이터 옮기기(기본단위 행·레벨·입고/주문 단위·로트/기한 명시값·바코드) → 검사 조건 → 팔레트 시드

-- DropIndex
DROP INDEX "tb_item_operator_id_idx";

-- DropIndex
DROP INDEX "tb_item_shipper_id_barcode_cd_key";

-- AlterTable
ALTER TABLE "tb_item" ADD COLUMN     "abc_class_cd" VARCHAR(5),
ADD COLUMN     "alloc_rule_cd" VARCHAR(10),
ADD COLUMN     "box_only_ship_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "brand_nm" VARCHAR(100),
ADD COLUMN     "category1" VARCHAR(50),
ADD COLUMN     "category2" VARCHAR(50),
ADD COLUMN     "category3" VARCHAR(50),
ADD COLUMN     "currency_cd" CHAR(3),
ADD COLUMN     "default_inbound_unit_id" BIGINT,
ADD COLUMN     "default_order_unit_id" BIGINT,
ADD COLUMN     "expiry_input_cd" VARCHAR(20),
ADD COLUMN     "expiry_type_cd" VARCHAR(20),
ADD COLUMN     "ext_attr" JSONB,
ADD COLUMN     "fragile_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "hazmat_class_cd" VARCHAR(20),
ADD COLUMN     "hazmat_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "hs_cd" VARCHAR(12),
ADD COLUMN     "item_nm_en" VARCHAR(200),
ADD COLUMN     "item_short_nm" VARCHAR(50),
ADD COLUMN     "item_type_cd" VARCHAR(20) NOT NULL DEFAULT 'GOODS',
ADD COLUMN     "item_value_amt" DECIMAL(15,2),
ADD COLUMN     "last_if_at" TIMESTAMP(3),
ADD COLUMN     "last_request_id" VARCHAR(40),
ADD COLUMN     "lot_source_cd" VARCHAR(20),
ADD COLUMN     "maker_nm" VARCHAR(100),
ADD COLUMN     "max_stack_box" INTEGER,
ADD COLUMN     "min_inbound_shelf_days" INTEGER,
ADD COLUMN     "min_order_qty" DECIMAL(15,3),
ADD COLUMN     "min_outbound_shelf_days" INTEGER,
ADD COLUMN     "origin_country_cd" CHAR(2),
ADD COLUMN     "pallet_box_qty" INTEGER,
ADD COLUMN     "pallet_hi" INTEGER,
ADD COLUMN     "pallet_ti" INTEGER,
ADD COLUMN     "pallet_type_cd" VARCHAR(20),
ADD COLUMN     "serial_mgmt_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "set_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "shelf_life_days" INTEGER,
ADD COLUMN     "source_cd" VARCHAR(20) NOT NULL DEFAULT 'SCREEN',
ADD COLUMN     "storage_temp_max" DECIMAL(5,1),
ADD COLUMN     "storage_temp_min" DECIMAL(5,1),
ADD COLUMN     "temp_zone_cd" VARCHAR(20) NOT NULL DEFAULT 'AMBIENT',
ADD COLUMN     "upright_yn" CHAR(1) NOT NULL DEFAULT 'N',
ALTER COLUMN "item_cd" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "tb_item_unit" ADD COLUMN     "auto_calc_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "cbm" DECIMAL(12,6),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "depth_cm" DECIMAL(8,2),
ADD COLUMN     "gross_weight_kg" DECIMAL(10,3),
ADD COLUMN     "height_cm" DECIMAL(8,2),
ADD COLUMN     "net_weight_kg" DECIMAL(10,3),
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unit_level_cd" VARCHAR(10) NOT NULL DEFAULT 'BOX',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "width_cm" DECIMAL(8,2);

-- AlterTable
ALTER TABLE "tb_operator" ADD COLUMN     "default_pallet_type_cd" VARCHAR(20) NOT NULL DEFAULT 'T11';

-- CreateTable
CREATE TABLE "tb_item_unit_hist" (
    "item_unit_hist_id" BIGSERIAL NOT NULL,
    "item_id" BIGINT NOT NULL,
    "unit_cd" VARCHAR(20) NOT NULL,
    "unit_level_cd" VARCHAR(10) NOT NULL,
    "before_conv_cnt" DECIMAL(18,3),
    "after_conv_cnt" DECIMAL(18,3),
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_by" VARCHAR(50) NOT NULL,

    CONSTRAINT "tb_item_unit_hist_pkey" PRIMARY KEY ("item_unit_hist_id")
);

-- CreateTable
CREATE TABLE "tb_item_barcode" (
    "barcode_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "barcode" VARCHAR(50) NOT NULL,
    "barcode_type_cd" VARCHAR(20) NOT NULL,
    "primary_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_item_barcode_pkey" PRIMARY KEY ("barcode_id")
);

-- CreateTable
CREATE TABLE "tb_pallet_type" (
    "pallet_type_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT,
    "pallet_type_cd" VARCHAR(20) NOT NULL,
    "pallet_type_nm" VARCHAR(50) NOT NULL,
    "width_cm" DECIMAL(8,2) NOT NULL,
    "depth_cm" DECIMAL(8,2) NOT NULL,
    "height_cm" DECIMAL(8,2) NOT NULL,
    "weight_kg" DECIMAL(8,2) NOT NULL,
    "max_load_height_cm" DECIMAL(8,2),
    "max_load_weight_kg" DECIMAL(10,2),
    "system_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    "sort_seq" INTEGER NOT NULL DEFAULT 0,
    "remark" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_pallet_type_pkey" PRIMARY KEY ("pallet_type_id")
);

-- CreateIndex
CREATE INDEX "tb_item_unit_hist_item_id_changed_at_idx" ON "tb_item_unit_hist"("item_id", "changed_at");

-- CreateIndex
CREATE INDEX "tb_item_barcode_item_id_idx" ON "tb_item_barcode"("item_id");

-- CreateIndex
CREATE INDEX "tb_item_barcode_operator_id_idx" ON "tb_item_barcode"("operator_id");

-- CreateIndex
CREATE INDEX "tb_item_barcode_unit_id_idx" ON "tb_item_barcode"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_barcode_shipper_id_barcode_key" ON "tb_item_barcode"("shipper_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_barcode_primary_key" ON "tb_item_barcode"("item_id", "unit_id") WHERE (primary_yn = 'Y');

-- CreateIndex
CREATE INDEX "tb_pallet_type_operator_id_idx" ON "tb_pallet_type"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_pallet_type_operator_id_cd_key" ON "tb_pallet_type"("operator_id", "pallet_type_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_pallet_type_system_cd_key" ON "tb_pallet_type"("pallet_type_cd") WHERE (operator_id IS NULL AND del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_item_operator_id_shipper_id_status_cd_idx" ON "tb_item"("operator_id", "shipper_id", "status_cd");

-- CreateIndex
CREATE INDEX "tb_item_shipper_id_item_nm_idx" ON "tb_item"("shipper_id", "item_nm");

-- CreateIndex
CREATE INDEX "tb_item_shipper_id_category1_idx" ON "tb_item"("shipper_id", "category1");

-- CreateIndex
CREATE INDEX "tb_item_default_inbound_unit_id_idx" ON "tb_item"("default_inbound_unit_id");

-- CreateIndex
CREATE INDEX "tb_item_default_order_unit_id_idx" ON "tb_item"("default_order_unit_id");


-- AddForeignKey
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_default_inbound_unit_id_fkey" FOREIGN KEY ("default_inbound_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_default_order_unit_id_fkey" FOREIGN KEY ("default_order_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_unit_hist" ADD CONSTRAINT "tb_item_unit_hist_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_barcode" ADD CONSTRAINT "tb_item_barcode_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_barcode" ADD CONSTRAINT "tb_item_barcode_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_barcode" ADD CONSTRAINT "tb_item_barcode_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_barcode" ADD CONSTRAINT "tb_item_barcode_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_pallet_type" ADD CONSTRAINT "tb_pallet_type_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 기존 데이터 옮기기 ──

-- 로트·기한 관리: NULL(화주 기본값 따름) → 화주 실제 값(화주 ?? 운영사)으로 굳힌다 (0083 원칙 5: 명시값)
UPDATE "tb_item" i SET
  "lot_mgmt_yn" = COALESCE(i."lot_mgmt_yn", s."lot_mgmt_yn", o."lot_mgmt_yn"),
  "expiry_mgmt_yn" = COALESCE(i."expiry_mgmt_yn", s."expiry_mgmt_yn", o."expiry_mgmt_yn")
FROM "tb_shipper" s JOIN "tb_operator" o ON o."operator_id" = s."operator_id"
WHERE s."shipper_id" = i."shipper_id" AND (i."lot_mgmt_yn" IS NULL OR i."expiry_mgmt_yn" IS NULL);
-- 기한 관리 품목은 기한 종류·입력 방식이 필수 → 기본값 (소비기한 · 기한일 입력), 로트 관리는 입고 시 입력
UPDATE "tb_item" SET "expiry_type_cd" = 'CONSUME', "expiry_input_cd" = 'EXPIRY' WHERE "expiry_mgmt_yn" = 'Y';
UPDATE "tb_item" SET "lot_source_cd" = 'INPUT' WHERE "lot_mgmt_yn" = 'Y';
ALTER TABLE "tb_item"
  ALTER COLUMN "lot_mgmt_yn" SET NOT NULL,
  ALTER COLUMN "lot_mgmt_yn" SET DEFAULT 'N',
  ALTER COLUMN "expiry_mgmt_yn" SET NOT NULL,
  ALTER COLUMN "expiry_mgmt_yn" SET DEFAULT 'N';

-- 품목 단위 레벨: 팔레트 단위는 PLT, 나머지 중 입수량이 가장 큰 것은 BOX, 그보다 작은 것은 INNER (레벨별 1행)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "tb_item_unit" iu JOIN "tb_unit" u ON u."unit_id" = iu."unit_id"
    WHERE u."unit_cd" <> 'PLT' GROUP BY iu."item_id" HAVING COUNT(*) > 2
  ) THEN
    RAISE EXCEPTION '팔레트 외 환산단위가 3개 이상인 품목이 있어 레벨(INNER·BOX)을 정할 수 없습니다. 먼저 정리해 주세요.';
  END IF;
END $$;
UPDATE "tb_item_unit" iu SET "unit_level_cd" = 'PLT'
FROM "tb_unit" u WHERE u."unit_id" = iu."unit_id" AND u."unit_cd" = 'PLT';
UPDATE "tb_item_unit" iu SET "unit_level_cd" = 'INNER'
WHERE iu."unit_level_cd" = 'BOX' AND EXISTS (
  SELECT 1 FROM "tb_item_unit" big
  WHERE big."item_id" = iu."item_id" AND big."unit_level_cd" = 'BOX' AND big."conv_cnt" > iu."conv_cnt");
-- 기본단위 행 (1 기본단위 = 1)
INSERT INTO "tb_item_unit" ("item_id", "unit_id", "unit_level_cd", "conv_cnt", "sort_seq", "updated_at")
SELECT i."item_id", i."base_unit_id", 'BASE', 1, 0, CURRENT_TIMESTAMP FROM "tb_item" i
WHERE NOT EXISTS (SELECT 1 FROM "tb_item_unit" x WHERE x."item_id" = i."item_id" AND x."unit_id" = i."base_unit_id");
UPDATE "tb_item_unit" SET "sort_seq" = CASE "unit_level_cd" WHEN 'BASE' THEN 0 WHEN 'INNER' THEN 1 WHEN 'BOX' THEN 2 ELSE 3 END;
CREATE UNIQUE INDEX "tb_item_unit_item_id_unit_level_cd_key" ON "tb_item_unit"("item_id", "unit_level_cd");
-- 기존 행을 채우려고 둔 기본값은 지운다 (스키마의 @updatedAt과 같게)
ALTER TABLE "tb_item_unit" ALTER COLUMN "updated_at" DROP DEFAULT;

-- 기본 입고단위 = BOX 단위(없으면 기본단위), 기본 주문단위 = 기본단위
UPDATE "tb_item" i SET
  "default_inbound_unit_id" = COALESCE(
    (SELECT iu."unit_id" FROM "tb_item_unit" iu WHERE iu."item_id" = i."item_id" AND iu."unit_level_cd" = 'BOX'),
    i."base_unit_id"),
  "default_order_unit_id" = i."base_unit_id";
ALTER TABLE "tb_item"
  ALTER COLUMN "default_inbound_unit_id" SET NOT NULL,
  ALTER COLUMN "default_order_unit_id" SET NOT NULL;

-- 바코드: 품목의 한 칸 → 바코드 표 (기본단위 대표 바코드, 13자리 숫자면 EAN13 아니면 화주 자체)
INSERT INTO "tb_item_barcode" ("operator_id", "shipper_id", "item_id", "unit_id", "barcode", "barcode_type_cd", "primary_yn", "updated_at")
SELECT "operator_id", "shipper_id", "item_id", "base_unit_id", "barcode_cd",
  CASE WHEN "barcode_cd" ~ '^[0-9]{13}$' THEN 'EAN13' ELSE 'CUSTOM' END, 'Y', CURRENT_TIMESTAMP
FROM "tb_item" WHERE "barcode_cd" IS NOT NULL AND "del_yn" = 'N';
DROP INDEX IF EXISTS "tb_item_shipper_id_barcode_cd_key";
ALTER TABLE "tb_item" DROP COLUMN "barcode_cd";

-- ── 검사 조건 (상수 값 목록: src/lib/items/item-codes.ts 와 같아야 한다) ──
ALTER TABLE "tb_item" DROP CONSTRAINT "tb_item_status_cd_check";
ALTER TABLE "tb_item" DROP CONSTRAINT "tb_item_yn_check";
ALTER TABLE "tb_item"
  ADD CONSTRAINT "tb_item_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED')),
  ADD CONSTRAINT "tb_item_item_type_cd_check"
    CHECK ("item_type_cd" IN ('GOODS', 'PRODUCT', 'SEMI', 'RAW', 'SUB', 'SET', 'SUPPLY', 'ETC')),
  ADD CONSTRAINT "tb_item_temp_zone_cd_check" CHECK ("temp_zone_cd" IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT')),
  ADD CONSTRAINT "tb_item_yn_check" CHECK (
    "lot_mgmt_yn" IN ('Y', 'N') AND "expiry_mgmt_yn" IN ('Y', 'N') AND "serial_mgmt_yn" IN ('Y', 'N')
    AND "hazmat_yn" IN ('Y', 'N') AND "fragile_yn" IN ('Y', 'N') AND "upright_yn" IN ('Y', 'N')
    AND "box_only_ship_yn" IN ('Y', 'N') AND "set_yn" IN ('Y', 'N')),
  -- 세트 여부는 품목 유형으로 정한다
  ADD CONSTRAINT "tb_item_set_yn_check" CHECK (("set_yn" = 'Y') = ("item_type_cd" = 'SET')),
  ADD CONSTRAINT "tb_item_expiry_type_cd_check"
    CHECK ("expiry_type_cd" IS NULL OR "expiry_type_cd" IN ('CONSUME', 'SELL', 'USE', 'VALID')),
  ADD CONSTRAINT "tb_item_expiry_input_cd_check"
    CHECK ("expiry_input_cd" IS NULL OR "expiry_input_cd" IN ('EXPIRY', 'MFG', 'BOTH')),
  ADD CONSTRAINT "tb_item_lot_source_cd_check"
    CHECK ("lot_source_cd" IS NULL OR "lot_source_cd" IN ('INPUT', 'MFG_DATE', 'EXPIRY_DATE', 'SYSTEM')),
  ADD CONSTRAINT "tb_item_alloc_rule_cd_check"
    CHECK ("alloc_rule_cd" IS NULL OR "alloc_rule_cd" IN ('FIFO', 'FEFO', 'LIFO')),
  ADD CONSTRAINT "tb_item_source_cd_check"
    CHECK ("source_cd" IN ('SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO')),
  -- 조건부 필수: 기한 관리 → 기한 종류·입력 방식, 제조일 입력 → 총 기한 일수, 로트 관리 → 로트 생성 방식
  ADD CONSTRAINT "tb_item_expiry_required_check" CHECK (
    "expiry_mgmt_yn" = 'N' OR ("expiry_type_cd" IS NOT NULL AND "expiry_input_cd" IS NOT NULL)),
  ADD CONSTRAINT "tb_item_shelf_life_required_check" CHECK (
    "expiry_mgmt_yn" = 'N' OR "expiry_input_cd" = 'EXPIRY' OR "shelf_life_days" IS NOT NULL),
  ADD CONSTRAINT "tb_item_lot_source_required_check" CHECK ("lot_mgmt_yn" = 'N' OR "lot_source_cd" IS NOT NULL),
  ADD CONSTRAINT "tb_item_days_check" CHECK (
    ("shelf_life_days" IS NULL OR "shelf_life_days" BETWEEN 1 AND 36500)
    AND ("min_inbound_shelf_days" IS NULL OR "min_inbound_shelf_days" >= 0)
    AND ("min_outbound_shelf_days" IS NULL OR "min_outbound_shelf_days" >= 0)),
  ADD CONSTRAINT "tb_item_pallet_check" CHECK (
    ("pallet_ti" IS NULL OR "pallet_ti" > 0) AND ("pallet_hi" IS NULL OR "pallet_hi" > 0)
    AND ("pallet_box_qty" IS NULL OR "pallet_box_qty" > 0) AND ("max_stack_box" IS NULL OR "max_stack_box" > 0)),
  ADD CONSTRAINT "tb_item_temp_range_check" CHECK (
    "storage_temp_min" IS NULL OR "storage_temp_max" IS NULL OR "storage_temp_min" <= "storage_temp_max"),
  ADD CONSTRAINT "tb_item_value_check" CHECK ("item_value_amt" IS NULL OR "item_value_amt" >= 0);

ALTER TABLE "tb_item_unit"
  ADD CONSTRAINT "tb_item_unit_level_cd_check" CHECK ("unit_level_cd" IN ('BASE', 'INNER', 'BOX', 'PLT')),
  -- 기본단위 행은 환산수량 1
  ADD CONSTRAINT "tb_item_unit_base_conv_check" CHECK ("unit_level_cd" <> 'BASE' OR "conv_cnt" = 1),
  ADD CONSTRAINT "tb_item_unit_auto_calc_yn_check" CHECK ("auto_calc_yn" IN ('Y', 'N')),
  ADD CONSTRAINT "tb_item_unit_size_check" CHECK (
    ("width_cm" IS NULL OR "width_cm" > 0) AND ("depth_cm" IS NULL OR "depth_cm" > 0)
    AND ("height_cm" IS NULL OR "height_cm" > 0) AND ("gross_weight_kg" IS NULL OR "gross_weight_kg" > 0)
    AND ("net_weight_kg" IS NULL OR "net_weight_kg" > 0));

ALTER TABLE "tb_item_barcode"
  ADD CONSTRAINT "tb_item_barcode_type_cd_check" CHECK (
    "barcode_type_cd" IN ('EAN13', 'EAN8', 'UPCA', 'ITF14', 'GS1_128', 'CODE128', 'QR', 'CUSTOM')),
  ADD CONSTRAINT "tb_item_barcode_primary_yn_check" CHECK ("primary_yn" IN ('Y', 'N'));

ALTER TABLE "tb_pallet_type"
  ADD CONSTRAINT "tb_pallet_type_size_check" CHECK (
    "width_cm" > 0 AND "depth_cm" > 0 AND "height_cm" > 0 AND "weight_kg" >= 0
    AND ("max_load_height_cm" IS NULL OR "max_load_height_cm" > "height_cm")
    AND ("max_load_weight_kg" IS NULL OR "max_load_weight_kg" > 0)),
  ADD CONSTRAINT "tb_pallet_type_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT "tb_pallet_type_yn_check" CHECK ("system_yn" IN ('Y', 'N') AND "del_yn" IN ('Y', 'N')),
  -- 시스템 기본 행 = 운영사 없음
  ADD CONSTRAINT "tb_pallet_type_system_check" CHECK (("system_yn" = 'Y') = ("operator_id" IS NULL));

-- ── 팔레트 시드 (시스템 기본, 사용자 확인 값): KS 표준 T-11 / T-12 ──
INSERT INTO "tb_pallet_type" ("operator_id", "pallet_type_cd", "pallet_type_nm", "width_cm", "depth_cm", "height_cm",
  "weight_kg", "max_load_height_cm", "max_load_weight_kg", "system_yn", "sort_seq", "created_by", "updated_by", "updated_at")
VALUES
  (NULL, 'T11', 'T11 (1100×1100)', 110, 110, 15, 25, 180, 1000, 'Y', 1, 'seed', 'seed', CURRENT_TIMESTAMP),
  (NULL, 'T12', 'T12 (1200×1000)', 120, 100, 15, 25, 180, 1000, 'Y', 2, 'seed', 'seed', CURRENT_TIMESTAMP);
