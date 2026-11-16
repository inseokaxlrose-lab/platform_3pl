-- 로케이션 명칭·비고 (docs/decisions/0071)
-- 명칭은 필수: 이미 있는 로케이션은 코드와 같게 채운 뒤 NOT NULL
ALTER TABLE "tb_location" ADD COLUMN "location_nm" VARCHAR(100);
ALTER TABLE "tb_location" ADD COLUMN "remark" VARCHAR(1000);
UPDATE "tb_location" SET "location_nm" = "location_cd" WHERE "location_nm" IS NULL;
ALTER TABLE "tb_location" ALTER COLUMN "location_nm" SET NOT NULL;
