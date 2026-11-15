-- M2.5 2b: 사용 여부(is_active BOOLEAN) → 상태 status_cd VARCHAR(10) 'ACTIVE'/'INACTIVE' (docs/db-conventions.md, 0038)
-- 기존 값은 true → 'ACTIVE', false → 'INACTIVE'로 옮기고, 두 값만 들어가게 검사 조건을 붙인다.

ALTER TABLE "tb_user" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_user" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_user" DROP COLUMN "is_active";
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_center" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_center" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_center" DROP COLUMN "is_active";
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_warehouse" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_warehouse" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_warehouse" DROP COLUMN "is_active";
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_location" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_location" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_location" DROP COLUMN "is_active";
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_shipper" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_shipper" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_shipper" DROP COLUMN "is_active";
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_code_group" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_code_group" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_code_group" DROP COLUMN "is_active";
ALTER TABLE "tb_code_group" ADD CONSTRAINT "tb_code_group_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_code_item" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_code_item" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_code_item" DROP COLUMN "is_active";
ALTER TABLE "tb_code_item" ADD CONSTRAINT "tb_code_item_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_delivery_zone" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_delivery_zone" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_delivery_zone" DROP COLUMN "is_active";
ALTER TABLE "tb_delivery_zone" ADD CONSTRAINT "tb_delivery_zone_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

ALTER TABLE "tb_unit" ADD COLUMN "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE';
UPDATE "tb_unit" SET "status_cd" = CASE WHEN "is_active" THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE "tb_unit" DROP COLUMN "is_active";
ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
