-- M2.5 1c: 예/아니오 칸을 BOOLEAN → CHAR(1) 'Y'/'N'으로 (docs/db-conventions.md, 0037)
-- 기존 값은 true → 'Y', false → 'N'으로 그대로 옮기고, 두 값만 들어가게 검사 조건을 붙인다.
-- is_active는 2단계에서 status_cd로 바뀌므로 여기서 바꾸지 않는다.

ALTER TABLE "tb_shipper" ALTER COLUMN "lot_mgmt_yn" DROP DEFAULT;
ALTER TABLE "tb_shipper" ALTER COLUMN "lot_mgmt_yn" SET DATA TYPE CHAR(1) USING (CASE WHEN "lot_mgmt_yn" THEN 'Y' ELSE 'N' END);
ALTER TABLE "tb_shipper" ALTER COLUMN "lot_mgmt_yn" SET DEFAULT 'N';
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_lot_mgmt_yn_check" CHECK ("lot_mgmt_yn" IN ('Y', 'N'));

ALTER TABLE "tb_shipper" ALTER COLUMN "expiry_mgmt_yn" DROP DEFAULT;
ALTER TABLE "tb_shipper" ALTER COLUMN "expiry_mgmt_yn" SET DATA TYPE CHAR(1) USING (CASE WHEN "expiry_mgmt_yn" THEN 'Y' ELSE 'N' END);
ALTER TABLE "tb_shipper" ALTER COLUMN "expiry_mgmt_yn" SET DEFAULT 'N';
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_expiry_mgmt_yn_check" CHECK ("expiry_mgmt_yn" IN ('Y', 'N'));

ALTER TABLE "tb_shipper_contact" ALTER COLUMN "primary_yn" DROP DEFAULT;
ALTER TABLE "tb_shipper_contact" ALTER COLUMN "primary_yn" SET DATA TYPE CHAR(1) USING (CASE WHEN "primary_yn" THEN 'Y' ELSE 'N' END);
ALTER TABLE "tb_shipper_contact" ALTER COLUMN "primary_yn" SET DEFAULT 'N';
ALTER TABLE "tb_shipper_contact" ADD CONSTRAINT "tb_shipper_contact_primary_yn_check" CHECK ("primary_yn" IN ('Y', 'N'));

ALTER TABLE "tb_operator_contact" ALTER COLUMN "primary_yn" DROP DEFAULT;
ALTER TABLE "tb_operator_contact" ALTER COLUMN "primary_yn" SET DATA TYPE CHAR(1) USING (CASE WHEN "primary_yn" THEN 'Y' ELSE 'N' END);
ALTER TABLE "tb_operator_contact" ALTER COLUMN "primary_yn" SET DEFAULT 'N';
ALTER TABLE "tb_operator_contact" ADD CONSTRAINT "tb_operator_contact_primary_yn_check" CHECK ("primary_yn" IN ('Y', 'N'));

ALTER TABLE "tb_code_group" ALTER COLUMN "system_yn" DROP DEFAULT;
ALTER TABLE "tb_code_group" ALTER COLUMN "system_yn" SET DATA TYPE CHAR(1) USING (CASE WHEN "system_yn" THEN 'Y' ELSE 'N' END);
ALTER TABLE "tb_code_group" ALTER COLUMN "system_yn" SET DEFAULT 'N';
ALTER TABLE "tb_code_group" ADD CONSTRAINT "tb_code_group_system_yn_check" CHECK ("system_yn" IN ('Y', 'N'));

ALTER TABLE "tb_unit" ALTER COLUMN "system_yn" DROP DEFAULT;
ALTER TABLE "tb_unit" ALTER COLUMN "system_yn" SET DATA TYPE CHAR(1) USING (CASE WHEN "system_yn" THEN 'Y' ELSE 'N' END);
ALTER TABLE "tb_unit" ALTER COLUMN "system_yn" SET DEFAULT 'N';
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_system_yn_check" CHECK ("system_yn" IN ('Y', 'N'));
