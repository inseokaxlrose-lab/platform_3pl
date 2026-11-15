-- M2.5 3단계 멀티테넌트 (docs/decisions/0039)
-- 운영사 데이터가 들어가는 11개 표에 operator_id를 붙이고, 기존 데이터는 가장 먼저 만든 운영사(운영사 1)로 채운다
-- 순서: ① 빈 칸 허용으로 추가 → ② 기존 줄 채우기 → ③ 빈 칸 금지

-- DropForeignKey
ALTER TABLE "tb_operator_contact" DROP CONSTRAINT "tb_operator_contact_company_id_fkey";

-- DropIndex
DROP INDEX "tb_center_center_cd_key";

-- DropIndex
DROP INDEX "tb_code_group_group_cd_key";

-- DropIndex
DROP INDEX "tb_ext_code_ext_system_cd_entity_type_cd_ext_cd_key";

-- DropIndex
DROP INDEX "tb_perm_group_perm_group_nm_key";

-- DropIndex
DROP INDEX "tb_shipper_shipper_cd_key";

-- DropIndex
DROP INDEX "tb_unit_unit_cd_key";

-- AlterTable
ALTER TABLE "tb_center" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_code_group" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_code_item" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_delivery_zone" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_ext_code" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_location" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_operator_contact" RENAME COLUMN "company_id" TO "operator_id";
ALTER INDEX "tb_operator_contact_company_id_sort_seq_idx" RENAME TO "tb_operator_contact_operator_id_sort_seq_idx";

-- AlterTable
ALTER TABLE "tb_perm_group" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_shipper" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_unit" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_user" ADD COLUMN     "operator_id" BIGINT;

-- AlterTable
ALTER TABLE "tb_warehouse" ADD COLUMN     "operator_id" BIGINT;

-- 운영사 정보를 등록하지 않은 채 데이터만 있는 DB: 기본 운영사를 하나 만든다 (이름은 화면에서 고친다)
INSERT INTO "tb_operator" ("operator_nm", "biz_reg_no", "updated_at")
SELECT '운영사', '', CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "tb_operator")
  AND (EXISTS (SELECT 1 FROM "tb_user") OR EXISTS (SELECT 1 FROM "tb_center")
    OR EXISTS (SELECT 1 FROM "tb_shipper") OR EXISTS (SELECT 1 FROM "tb_unit")
    OR EXISTS (SELECT 1 FROM "tb_code_group") OR EXISTS (SELECT 1 FROM "tb_perm_group")
    OR EXISTS (SELECT 1 FROM "tb_ext_code"));

-- 기존 줄을 운영사 1로 채우고 빈 칸 금지
UPDATE "tb_center" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_center" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_code_group" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_code_group" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_code_item" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_code_item" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_delivery_zone" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_delivery_zone" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_ext_code" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_ext_code" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_location" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_location" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_perm_group" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_perm_group" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_shipper" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_shipper" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_unit" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_unit" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_user" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_user" ALTER COLUMN "operator_id" SET NOT NULL;
UPDATE "tb_warehouse" SET "operator_id" = (SELECT MIN("operator_id") FROM "tb_operator");
ALTER TABLE "tb_warehouse" ALTER COLUMN "operator_id" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tb_center_operator_id_center_cd_key" ON "tb_center"("operator_id", "center_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_code_group_operator_id_group_cd_key" ON "tb_code_group"("operator_id", "group_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_code_item_operator_id_idx" ON "tb_code_item"("operator_id");

-- CreateIndex
CREATE INDEX "tb_delivery_zone_operator_id_idx" ON "tb_delivery_zone"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_ext_code_operator_id_ext_system_cd_entity_type_cd_ext_cd_key" ON "tb_ext_code"("operator_id", "ext_system_cd", "entity_type_cd", "ext_cd");

-- CreateIndex
CREATE INDEX "tb_location_operator_id_idx" ON "tb_location"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_perm_group_operator_id_perm_group_nm_key" ON "tb_perm_group"("operator_id", "perm_group_nm") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_shipper_operator_id_shipper_cd_key" ON "tb_shipper"("operator_id", "shipper_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_unit_operator_id_unit_cd_key" ON "tb_unit"("operator_id", "unit_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_user_operator_id_idx" ON "tb_user"("operator_id");

-- CreateIndex
CREATE INDEX "tb_warehouse_operator_id_idx" ON "tb_warehouse"("operator_id");

-- AddForeignKey
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_perm_group" ADD CONSTRAINT "tb_perm_group_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_operator_contact" ADD CONSTRAINT "tb_operator_contact_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ext_code" ADD CONSTRAINT "tb_ext_code_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_code_group" ADD CONSTRAINT "tb_code_group_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_code_item" ADD CONSTRAINT "tb_code_item_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_delivery_zone" ADD CONSTRAINT "tb_delivery_zone_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

