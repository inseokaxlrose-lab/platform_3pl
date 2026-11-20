-- DropIndex
DROP INDEX "tb_center_sys_cd_key";

-- DropIndex
DROP INDEX "tb_customer_sys_cd_key";

-- DropIndex
DROP INDEX "tb_item_sys_cd_key";

-- DropIndex
DROP INDEX "tb_shipper_sys_cd_key";

-- DropIndex
DROP INDEX "tb_warehouse_sys_cd_key";

-- AlterTable
ALTER TABLE "tb_center" DROP COLUMN "sys_cd";

-- AlterTable
ALTER TABLE "tb_customer" DROP COLUMN "sys_cd",
ADD COLUMN     "customer_cust_cd" VARCHAR(50);

-- AlterTable
ALTER TABLE "tb_item" DROP COLUMN "sys_cd",
ADD COLUMN     "item_cust_cd" VARCHAR(50);

-- AlterTable
ALTER TABLE "tb_ship_to" ADD COLUMN     "ship_to_cust_cd" VARCHAR(50),
ALTER COLUMN "ship_to_cd" SET DATA TYPE VARCHAR(40),
ALTER COLUMN "ship_to_nm" SET DATA TYPE VARCHAR(200);

-- AlterTable
ALTER TABLE "tb_shipper" DROP COLUMN "sys_cd",
ADD COLUMN     "code_prefix" CHAR(2),
ADD COLUMN     "if_key_type_cd" VARCHAR(20) NOT NULL DEFAULT 'CODE',
ADD COLUMN     "shipper_cust_cd" VARCHAR(50);

-- 기존 화주사의 코드 접두어: 운영사마다 키 순서로 AA, AB, … (I·O·0·1 제외 — 개발 단계라 시드·시험 데이터만)
UPDATE "tb_shipper" s SET "code_prefix" = p."prefix"
FROM (
  SELECT "shipper_id",
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ', ((n / 32) % 24)::int + 1, 1) ||
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (n % 32)::int + 1, 1) AS "prefix"
  FROM (
    SELECT "shipper_id", row_number() OVER (PARTITION BY "operator_id" ORDER BY "shipper_id") - 1 AS n
    FROM "tb_shipper"
  ) numbered
) p
WHERE s."shipper_id" = p."shipper_id";

ALTER TABLE "tb_shipper" ALTER COLUMN "code_prefix" SET NOT NULL;

-- AlterTable
ALTER TABLE "tb_warehouse" DROP COLUMN "sys_cd";

-- CreateIndex
CREATE UNIQUE INDEX "tb_customer_shipper_id_cust_cd_key" ON "tb_customer"("shipper_id", "customer_cust_cd") WHERE (customer_cust_cd IS NOT NULL AND del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_shipper_id_cust_cd_key" ON "tb_item"("shipper_id", "item_cust_cd") WHERE (item_cust_cd IS NOT NULL AND del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_ship_to_customer_id_cust_cd_key" ON "tb_ship_to"("customer_id", "ship_to_cust_cd") WHERE (ship_to_cust_cd IS NOT NULL AND del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_shipper_operator_id_code_prefix_key" ON "tb_shipper"("operator_id", "code_prefix") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_shipper_operator_id_cust_cd_key" ON "tb_shipper"("operator_id", "shipper_cust_cd") WHERE (shipper_cust_cd IS NOT NULL AND del_yn = 'N');


-- 값 검사 (0084)
ALTER TABLE "tb_shipper"
  ADD CONSTRAINT "tb_shipper_code_prefix_check" CHECK ("code_prefix" ~ '^[A-HJ-NP-Z][A-HJ-NP-Z2-9]$'),
  ADD CONSTRAINT "tb_shipper_if_key_type_cd_check" CHECK ("if_key_type_cd" IN ('CODE', 'CUST_CD'));

-- 시스템 코드 시퀀스 (0025) — 칼럼과 함께 삭제. 코드는 체번(0084)으로
DROP SEQUENCE IF EXISTS "system_code_center_seq";
DROP SEQUENCE IF EXISTS "system_code_warehouse_seq";
DROP SEQUENCE IF EXISTS "system_code_shipper_seq";
DROP SEQUENCE IF EXISTS "system_code_item_seq";
DROP SEQUENCE IF EXISTS "system_code_customer_seq";
DROP SEQUENCE IF EXISTS "system_code_delivery_zone_seq";
