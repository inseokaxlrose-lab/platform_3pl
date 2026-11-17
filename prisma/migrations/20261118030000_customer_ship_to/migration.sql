-- 거래처·납품처 정의서 반영 ① (docs/decisions/0082, docs/specs/customer.md — 표 이름은 tb_customer 유지)
-- 사용자 결정: 거래처코드 필수·변경 불가 / 담당자 표 유지 / 납품처는 거래처 저장 때 함께 / 2차 칸(납품 조건·온도대별 센터)은 빼기
-- 순서: 납품처 표 만들기 → 기존 거래처의 배송지를 기본 납품처로 옮기기 → 거래처 칸 바꾸기

-- CreateTable
CREATE TABLE "tb_ship_to" (
    "ship_to_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "ship_to_cd" VARCHAR(30) NOT NULL,
    "ship_to_nm" VARCHAR(100) NOT NULL,
    "default_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "system_created_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "addr_sync_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sort_seq" INTEGER NOT NULL DEFAULT 0,
    "raw_zip_cd" VARCHAR(10),
    "raw_addr" VARCHAR(500) NOT NULL,
    "zip_cd" VARCHAR(10),
    "addr1" VARCHAR(200) NOT NULL,
    "addr2" VARCHAR(200),
    "addr_jibun" VARCHAR(200),
    "bjd_cd" CHAR(10),
    "sigungu_nm" VARCHAR(50),
    "bd_mgt_sn" VARCHAR(30),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "addr_grade" CHAR(1) NOT NULL DEFAULT 'F',
    "addr_norm_method_cd" VARCHAR(20),
    "addr_norm_at" TIMESTAMP(3),
    "receiver_nm" VARCHAR(50),
    "receiver_tel_no" VARCHAR(15),
    "receiver_tel_no2" VARCHAR(15),
    "delivery_memo" VARCHAR(200),
    "delivery_center_id" BIGINT,
    "center_assign_type_cd" VARCHAR(10),
    "center_assign_status_cd" VARCHAR(20) NOT NULL DEFAULT 'NEED_CONFIRM',
    "center_confirm_reason_cd" VARCHAR(30),
    "region_center_id" BIGINT,
    "region_mismatch_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "resolve_level_cd" VARCHAR(20),
    "center_assigned_at" TIMESTAMP(3),
    "center_assigned_by" VARCHAR(50),
    "source_cd" VARCHAR(20) NOT NULL DEFAULT 'SCREEN',
    "last_if_at" TIMESTAMP(3),
    "last_request_id" VARCHAR(40),
    "remark" VARCHAR(1000),
    "ext_attr" JSONB,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_ship_to_pkey" PRIMARY KEY ("ship_to_id")
);

-- CreateIndex
CREATE INDEX "tb_ship_to_shipper_id_center_assign_status_cd_idx" ON "tb_ship_to"("shipper_id", "center_assign_status_cd");

-- CreateIndex
CREATE INDEX "tb_ship_to_delivery_center_id_idx" ON "tb_ship_to"("delivery_center_id");

-- CreateIndex
CREATE INDEX "tb_ship_to_shipper_id_zip_cd_idx" ON "tb_ship_to"("shipper_id", "zip_cd");

-- CreateIndex
CREATE INDEX "tb_ship_to_operator_id_region_mismatch_yn_idx" ON "tb_ship_to"("operator_id", "region_mismatch_yn");

-- CreateIndex
CREATE UNIQUE INDEX "tb_ship_to_customer_id_ship_to_cd_key" ON "tb_ship_to"("customer_id", "ship_to_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_ship_to_default_key" ON "tb_ship_to"("customer_id") WHERE (default_yn = 'Y' AND del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_customer_operator_id_shipper_id_status_cd_idx" ON "tb_customer"("operator_id", "shipper_id", "status_cd");

-- CreateIndex
CREATE INDEX "tb_customer_shipper_id_customer_nm_idx" ON "tb_customer"("shipper_id", "customer_nm");

-- CreateIndex
CREATE INDEX "tb_customer_biz_reg_no_idx" ON "tb_customer"("biz_reg_no");

-- AddForeignKey
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tb_customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_delivery_center_id_fkey" FOREIGN KEY ("delivery_center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_region_center_id_fkey" FOREIGN KEY ("region_center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────── 기존 거래처의 배송지 → 기본 납품처 (자동 생성·주소 동기화, 주소를 다시 정제할 때까지 등급 F·확인 필요)
INSERT INTO "tb_ship_to" ("operator_id", "shipper_id", "customer_id", "ship_to_cd", "ship_to_nm", "default_yn",
  "system_created_yn", "addr_sync_yn", "status_cd", "raw_zip_cd", "raw_addr", "zip_cd", "addr1", "addr2", "bjd_cd",
  "receiver_nm", "receiver_tel_no", "delivery_memo", "delivery_center_id", "center_assign_type_cd",
  "center_assign_status_cd", "center_confirm_reason_cd", "del_yn", "updated_at", "created_by", "updated_by")
SELECT c."operator_id", c."shipper_id", c."customer_id", c."customer_cd", LEFT(c."customer_nm", 100), 'Y',
  'Y', 'Y', 'ACTIVE', c."zip_cd", COALESCE(c."addr1", '(주소 없음)'), c."zip_cd", COALESCE(c."addr1", '(주소 없음)'),
  c."addr2", c."region_cd", c."receiver_nm", c."receiver_tel_no", c."delivery_memo", c."delivery_center_id",
  CASE WHEN c."delivery_center_id" IS NOT NULL THEN 'MANUAL' END,
  CASE WHEN c."delivery_center_id" IS NOT NULL THEN 'ASSIGNED' ELSE 'NEED_CONFIRM' END,
  CASE WHEN c."delivery_center_id" IS NULL THEN 'ADDR_NOT_RESOLVED' END,
  c."del_yn", now(), 'system', 'system'
FROM "tb_customer" c;

-- DropForeignKey
ALTER TABLE "tb_customer" DROP CONSTRAINT "tb_customer_delivery_center_id_fkey";

-- DropIndex
DROP INDEX "tb_customer_delivery_center_id_idx";

-- DropIndex
DROP INDEX "tb_customer_operator_id_idx";

-- AlterTable
ALTER TABLE "tb_customer" DROP COLUMN "delivery_center_id",
DROP COLUMN "delivery_memo",
DROP COLUMN "receiver_nm",
DROP COLUMN "receiver_tel_no",
ADD COLUMN     "addr_grade" CHAR(1),
ADD COLUMN     "addr_jibun" VARCHAR(200),
ADD COLUMN     "addr_norm_at" TIMESTAMP(3),
ADD COLUMN     "customer_group_cd" VARCHAR(30),
ADD COLUMN     "customer_short_nm" VARCHAR(30),
ADD COLUMN     "customer_type_cd" VARCHAR(20),
ADD COLUMN     "ext_attr" JSONB,
ADD COLUMN     "fax_no" VARCHAR(15),
ADD COLUMN     "last_if_at" TIMESTAMP(3),
ADD COLUMN     "last_request_id" VARCHAR(40),
ADD COLUMN     "min_shelf_days" INTEGER,
ADD COLUMN     "min_shelf_ratio" DECIMAL(5,2),
ADD COLUMN     "order_addr_mode_cd" VARCHAR(20) NOT NULL DEFAULT 'SHIP_TO',
ADD COLUMN     "raw_addr" VARCHAR(500),
ADD COLUMN     "raw_zip_cd" VARCHAR(10),
ADD COLUMN     "source_cd" VARCHAR(20) NOT NULL DEFAULT 'SCREEN',
ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);


-- ─────────── 데이터: 상태 2단계 (사용 중지 → 거래중지), 원본 주소 = 지금 주소
ALTER TABLE "tb_customer" DROP CONSTRAINT IF EXISTS "tb_customer_status_cd_check";
UPDATE "tb_customer" SET "status_cd" = 'SUSPENDED' WHERE "status_cd" = 'INACTIVE';
UPDATE "tb_customer" SET "raw_zip_cd" = "zip_cd", "raw_addr" = "addr1" WHERE "addr1" IS NOT NULL;

-- ─────────── 검사 조건 (값 목록은 src/lib/customers/customer-codes.ts와 같게)
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'SUSPENDED'));
-- 거래처코드·납품처코드: 영문 대문자·숫자·하이픈·밑줄 1~30자 (화주 코드 그대로, 등록 후 변경 불가)
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_customer_cd_check" CHECK ("customer_cd" ~ '^[A-Z0-9_-]{1,30}$');
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_ship_to_cd_check" CHECK ("ship_to_cd" ~ '^[A-Z0-9_-]{1,30}$');
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_order_addr_mode_cd_check"
  CHECK ("order_addr_mode_cd" IN ('SHIP_TO', 'ORDER_ADDR'));
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_source_cd_check"
  CHECK ("source_cd" IN ('SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO'));
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_addr_grade_check" CHECK ("addr_grade" IN ('A', 'B', 'C', 'D', 'F'));
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_shelf_check" CHECK (
  COALESCE("min_shelf_days", 0) BETWEEN 0 AND 9999 AND COALESCE("min_shelf_ratio", 0) BETWEEN 0 AND 100);

ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_yn_check" CHECK (
  "default_yn" IN ('Y', 'N') AND "system_created_yn" IN ('Y', 'N') AND "addr_sync_yn" IN ('Y', 'N')
  AND "region_mismatch_yn" IN ('Y', 'N') AND "del_yn" IN ('Y', 'N'));
-- 기본 납품처는 사용 중이어야 한다
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_default_active_check"
  CHECK ("default_yn" = 'N' OR "status_cd" = 'ACTIVE' OR "del_yn" = 'Y');
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_addr_grade_check" CHECK ("addr_grade" IN ('A', 'B', 'C', 'D', 'F'));
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_center_assign_type_cd_check"
  CHECK ("center_assign_type_cd" IN ('IF', 'AUTO', 'MANUAL'));
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_center_assign_status_cd_check"
  CHECK ("center_assign_status_cd" IN ('ASSIGNED', 'NEED_CONFIRM'));
-- 배송센터가 없으면 반드시 확인 필요
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_center_required_check"
  CHECK ("delivery_center_id" IS NOT NULL OR "center_assign_status_cd" = 'NEED_CONFIRM');
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_confirm_reason_cd_check" CHECK ("center_confirm_reason_cd" IN (
  'ADDR_NOT_RESOLVED', 'REGION_UNASSIGNED', 'REGION_MIXED', 'NOT_CLIENT_CENTER', 'CENTER_INACTIVE', 'INVALID_CENTER_CD'));
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_source_cd_check"
  CHECK ("source_cd" IN ('SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO'));
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_resolve_level_cd_check" CHECK ("resolve_level_cd" IN ('ZIP', 'BJD', 'SIGUNGU'));

-- ─────────── 공통코드 PARTNER_TYPE (이미 있는 운영사에 추가, 새 운영사는 src/config/defaults/codes.ts에서 복사)
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", 'PARTNER_TYPE', '거래처 유형', '거래처(화주가 물건을 파는 상대)의 형태',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'PARTNER_TYPE' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "group_id", "code_item_cd", "code_item_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."group_id", v.code, v.name, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('STORE', '매장', 10), ('AGENCY', '대리점', 20), ('WHOLESALE', '도매', 30),
                   ('RETAIL_CHAIN', '유통사·체인 본사', 40), ('ONLINE_MALL', '온라인몰', 50),
                   ('CORPORATE', '기업·기관', 60), ('INTERNAL', '자사·계열사', 70), ('ETC', '기타', 80)) AS v(code, name, seq)
WHERE g."group_cd" = 'PARTNER_TYPE' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."group_id" = g."group_id" AND i."code_item_cd" = v.code AND i."del_yn" = 'N');
