-- M2.5 2c: 기준정보 논리 삭제 del_yn + 코드는 삭제 안 된 것끼리만 고유 (지운 코드를 다시 쓸 수 있게) (docs/db-conventions.md, 0038)
-- 기존 데이터는 모두 삭제 안 됨('N').

-- DropIndex
DROP INDEX "tb_center_center_cd_key";

-- DropIndex
DROP INDEX "tb_code_group_group_cd_key";

-- DropIndex
DROP INDEX "tb_code_item_group_id_code_item_cd_key";

-- DropIndex
DROP INDEX "tb_delivery_zone_center_id_zone_cd_key";

-- DropIndex
DROP INDEX "tb_location_warehouse_id_location_cd_key";

-- DropIndex
DROP INDEX "tb_perm_group_perm_group_nm_key";

-- DropIndex
DROP INDEX "tb_shipper_shipper_cd_key";

-- DropIndex
DROP INDEX "tb_unit_unit_cd_key";

-- DropIndex
DROP INDEX "tb_warehouse_center_id_warehouse_cd_key";

-- AlterTable
ALTER TABLE "tb_center" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_code_group" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_code_item" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_delivery_zone" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_location" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_operator" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_perm_group" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_shipper" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_unit" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- AlterTable
ALTER TABLE "tb_warehouse" ADD COLUMN     "del_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- CreateIndex
CREATE UNIQUE INDEX "tb_center_center_cd_key" ON "tb_center"("center_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_code_group_group_cd_key" ON "tb_code_group"("group_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_code_item_group_id_code_item_cd_key" ON "tb_code_item"("group_id", "code_item_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_delivery_zone_center_id_zone_cd_key" ON "tb_delivery_zone"("center_id", "zone_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_location_warehouse_id_location_cd_key" ON "tb_location"("warehouse_id", "location_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_perm_group_perm_group_nm_key" ON "tb_perm_group"("perm_group_nm") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_shipper_shipper_cd_key" ON "tb_shipper"("shipper_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_unit_unit_cd_key" ON "tb_unit"("unit_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_warehouse_center_id_warehouse_cd_key" ON "tb_warehouse"("center_id", "warehouse_cd") WHERE (del_yn = 'N');

-- 두 값만 들어가게 검사 조건
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_code_group" ADD CONSTRAINT "tb_code_group_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_code_item" ADD CONSTRAINT "tb_code_item_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_delivery_zone" ADD CONSTRAINT "tb_delivery_zone_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_operator" ADD CONSTRAINT "tb_operator_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_perm_group" ADD CONSTRAINT "tb_perm_group_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
