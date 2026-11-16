-- 센터 컬럼 정의 반영 (docs/decisions/0073, docs/specs/center.md)
-- 사용자 결정: 센터코드 필수·불변 / 상태 4단계(INACTIVE → SUSPENDED) / 기본 창고 3개(다음 파일에서 보정) / 센터장 두 칸 유지 + 담당자 표
-- 담당자·온도대 표에도 감사 칸(등록·수정 일시·사람)

-- AlterEnum


ALTER TYPE "WarehouseType" ADD VALUE 'OUTBOUND_STAGING';
ALTER TYPE "WarehouseType" ADD VALUE 'RETURN_STAGING';

-- AlterTable
ALTER TABLE "tb_center" ADD COLUMN     "addr_jibun" VARCHAR(200),
ADD COLUMN     "alloc_rule_cd" VARCHAR(10),
ADD COLUMN     "biz_reg_no" CHAR(10),
ADD COLUMN     "bonded_area_cd" VARCHAR(20),
ADD COLUMN     "bonded_license_no" VARCHAR(30),
ADD COLUMN     "bonded_type_cd" VARCHAR(20),
ADD COLUMN     "bonded_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "ceiling_height_m" DECIMAL(5,2),
ADD COLUMN     "center_nm_en" VARCHAR(100),
ADD COLUMN     "center_short_nm" VARCHAR(30),
ADD COLUMN     "center_type_cd" VARCHAR(20) NOT NULL DEFAULT 'LEASE',
ADD COLUMN     "close_dt" DATE,
ADD COLUMN     "country_cd" CHAR(2) NOT NULL DEFAULT 'KR',
ADD COLUMN     "customs_office_cd" VARCHAR(10),
ADD COLUMN     "default_inbound_loc_id" BIGINT,
ADD COLUMN     "default_outbound_loc_id" BIGINT,
ADD COLUMN     "default_return_loc_id" BIGINT,
ADD COLUMN     "directions" VARCHAR(1000),
ADD COLUMN     "dock_cnt" INTEGER,
ADD COLUMN     "email" VARCHAR(100),
ADD COLUMN     "expiry_mgmt_yn" CHAR(1),
ADD COLUMN     "ext_attr" JSONB,
ADD COLUMN     "floor_area_m2" DECIMAL(12,2),
ADD COLUMN     "floor_cnt" INTEGER,
ADD COLUMN     "food_storage_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "gln_cd" VARCHAR(13),
ADD COLUMN     "hazmat_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "inbound_cutoff_time" TIME(0),
ADD COLUMN     "land_area_m2" DECIMAL(12,2),
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "lot_mgmt_yn" CHAR(1),
ADD COLUMN     "open_dt" DATE,
ADD COLUMN     "pallet_capa_cnt" INTEGER,
ADD COLUMN     "pharma_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "region_nm" VARCHAR(50),
ADD COLUMN     "remark" VARCHAR(1000),
ADD COLUMN     "serial_mgmt_yn" CHAR(1),
ADD COLUMN     "ship_cutoff_time" TIME(0),
ADD COLUMN     "sort_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status_reason" VARCHAR(200),
ADD COLUMN     "storage_area_m2" DECIMAL(12,2),
ADD COLUMN     "sub_biz_no" CHAR(4),
ADD COLUMN     "timezone" VARCHAR(50),
ADD COLUMN     "warehouse_reg_no" VARCHAR(30),
ADD COLUMN     "work_days" CHAR(7) NOT NULL DEFAULT 'YYYYYNN',
ADD COLUMN     "work_end_time" TIME(0),
ADD COLUMN     "work_start_time" TIME(0),
ALTER COLUMN "center_cd" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "center_nm" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "addr1" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "addr2" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "fax_no" SET DATA TYPE VARCHAR(15),
ALTER COLUMN "tel_no" SET DATA TYPE VARCHAR(15),
ALTER COLUMN "zip_cd" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "status_cd" SET DEFAULT 'PREPARING',
ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);

-- CreateTable
CREATE TABLE "tb_center_contact" (
    "contact_id" BIGSERIAL NOT NULL,
    "center_id" BIGINT NOT NULL,
    "sort_seq" INTEGER NOT NULL,
    "role_cd" VARCHAR(20) NOT NULL,
    "contact_nm" VARCHAR(50) NOT NULL,
    "tel_no" VARCHAR(15),
    "email" VARCHAR(100),
    "primary_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "dept_nm" VARCHAR(50),
    "position_nm" VARCHAR(50),
    "notify_yn" CHAR(1) NOT NULL DEFAULT 'Y',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_center_contact_pkey" PRIMARY KEY ("contact_id")
);

-- CreateTable
CREATE TABLE "tb_center_temp_zone" (
    "center_id" BIGINT NOT NULL,
    "temp_zone_cd" VARCHAR(20) NOT NULL,
    "area_m2" DECIMAL(12,2),
    "min_temp" DECIMAL(5,1),
    "max_temp" DECIMAL(5,1),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_center_temp_zone_pkey" PRIMARY KEY ("center_id","temp_zone_cd")
);

-- CreateIndex
CREATE INDEX "tb_center_contact_center_id_sort_seq_idx" ON "tb_center_contact"("center_id", "sort_seq");

-- AddForeignKey
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_default_inbound_loc_id_fkey" FOREIGN KEY ("default_inbound_loc_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_default_outbound_loc_id_fkey" FOREIGN KEY ("default_outbound_loc_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_default_return_loc_id_fkey" FOREIGN KEY ("default_return_loc_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_center_contact" ADD CONSTRAINT "tb_center_contact_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_center_temp_zone" ADD CONSTRAINT "tb_center_temp_zone_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 대표 담당자: 센터당 1명
CREATE UNIQUE INDEX "tb_center_contact_primary_key" ON "tb_center_contact"("center_id") WHERE primary_yn = 'Y';

-- ─────────── 데이터 옮기기
-- 운영 상태 4단계: 기존 INACTIVE → SUSPENDED (사유 자동), 새 센터 기본은 PREPARING
ALTER TABLE "tb_center" DROP CONSTRAINT "tb_center_status_cd_check";
UPDATE "tb_center" SET "status_cd" = 'SUSPENDED', "status_reason" = '기존 사용 중지에서 옮김' WHERE "status_cd" = 'INACTIVE';
-- 기존 센터 정렬순서: 운영사별 코드 순으로 10, 20, 30 …
UPDATE "tb_center" c SET "sort_seq" = s.seq
  FROM (SELECT "center_id", ROW_NUMBER() OVER (PARTITION BY "operator_id" ORDER BY "center_cd") * 10 AS seq FROM "tb_center") s
  WHERE c."center_id" = s."center_id";

-- ─────────── 검사 조건
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_center_cd_check" CHECK ("center_cd" ~ '^[A-Z0-9]{1,20}$');
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_center_type_cd_check"
  CHECK ("center_type_cd" IN ('OWN', 'LEASE', 'PARTNER', 'VIRTUAL'));
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_status_cd_check"
  CHECK ("status_cd" IN ('PREPARING', 'ACTIVE', 'SUSPENDED', 'CLOSED'));
-- 일시중지·폐쇄는 사유 필수, 폐쇄는 운영 종료일 필수
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_status_reason_check"
  CHECK ("status_cd" NOT IN ('SUSPENDED', 'CLOSED') OR "status_reason" IS NOT NULL);
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_close_dt_check"
  CHECK ("status_cd" <> 'CLOSED' OR "close_dt" IS NOT NULL);
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_biz_reg_no_check" CHECK ("biz_reg_no" ~ '^[0-9]{10}$');
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_sub_biz_no_check" CHECK ("sub_biz_no" ~ '^[0-9]{4}$');
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_facility_check" CHECK (
  COALESCE("floor_area_m2", 0) >= 0 AND COALESCE("storage_area_m2", 0) >= 0 AND COALESCE("dock_cnt", 0) >= 0
  AND COALESCE("land_area_m2", 0) >= 0 AND COALESCE("floor_cnt", 0) >= 0
  AND COALESCE("ceiling_height_m", 0) >= 0 AND COALESCE("pallet_capa_cnt", 0) >= 0);
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_yn_check" CHECK (
  "bonded_yn" IN ('Y', 'N') AND "hazmat_yn" IN ('Y', 'N') AND "food_storage_yn" IN ('Y', 'N') AND "pharma_yn" IN ('Y', 'N'));
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_gln_cd_check" CHECK ("gln_cd" ~ '^[0-9]{13}$');
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_bonded_type_cd_check"
  CHECK ("bonded_type_cd" IN ('BW_COMMERCIAL', 'BW_PRIVATE', 'BONDED_FACTORY', 'GENERAL_BONDED', 'FTZ'));
-- 보세가 아니면 보세 칸은 비운다
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_bonded_check" CHECK (
  "bonded_yn" = 'Y' OR ("bonded_type_cd" IS NULL AND "bonded_license_no" IS NULL
                        AND "bonded_area_cd" IS NULL AND "customs_office_cd" IS NULL));
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_work_days_check" CHECK ("work_days" ~ '^[YN]{7}$');
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_alloc_rule_cd_check" CHECK ("alloc_rule_cd" IN ('FIFO', 'FEFO', 'LIFO'));
ALTER TABLE "tb_center" ADD CONSTRAINT "tb_center_mgmt_yn_check" CHECK (
  COALESCE("lot_mgmt_yn", 'N') IN ('Y', 'N') AND COALESCE("expiry_mgmt_yn", 'N') IN ('Y', 'N')
  AND COALESCE("serial_mgmt_yn", 'N') IN ('Y', 'N'));
ALTER TABLE "tb_center_contact" ADD CONSTRAINT "tb_center_contact_yn_check"
  CHECK ("primary_yn" IN ('Y', 'N') AND "notify_yn" IN ('Y', 'N'));
ALTER TABLE "tb_center_temp_zone" ADD CONSTRAINT "tb_center_temp_zone_cd_check"
  CHECK ("temp_zone_cd" IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'));

-- ─────────── 공통코드 CENTER_CONTACT_ROLE (이미 있는 운영사에 추가, 새 운영사는 src/config/defaults/codes.ts에서 복사)
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", 'CENTER_CONTACT_ROLE', '센터 담당 업무', '센터 담당자의 주요 업무',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'CENTER_CONTACT_ROLE' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "group_id", "code_item_cd", "code_item_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."group_id", v.code, v.name, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('MANAGER', '센터장', 10), ('INBOUND', '입고', 20), ('OUTBOUND', '출고', 30),
                   ('INVENTORY', '재고', 40), ('RETURN', '반품', 50), ('SAFETY', '안전관리', 60),
                   ('IT', 'IT', 70), ('ETC', '기타', 80)) AS v(code, name, seq)
WHERE g."group_cd" = 'CENTER_CONTACT_ROLE' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."group_id" = g."group_id" AND i."code_item_cd" = v.code AND i."del_yn" = 'N');
