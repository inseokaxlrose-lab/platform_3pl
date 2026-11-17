-- 화주사 정의서 반영 PART 1 (docs/decisions/0080, docs/specs/shipper.md — 표 이름 tb_shipper 유지)
-- 사용자 결정: 상태 4단계(INACTIVE → SUSPENDED) / 로트·유통기한 비움 허용(기존 값 유지) / 연동 담당은 담당자 줄 표시 / 화주×센터 재정의 칸만 DB에

-- AlterTable
ALTER TABLE "tb_shipper" ADD COLUMN     "addr_jibun" VARCHAR(200),
ADD COLUMN     "alloc_rule_cd" VARCHAR(10),
ADD COLUMN     "api_enabled_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "auto_create_item_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "auto_create_ship_to_yn" CHAR(1) NOT NULL DEFAULT 'Y',
ADD COLUMN     "auto_renew_yn" CHAR(1) NOT NULL DEFAULT 'Y',
ADD COLUMN     "biz_entity_cd" VARCHAR(10) NOT NULL DEFAULT 'CORP',
ADD COLUMN     "closing_day" SMALLINT,
ADD COLUMN     "contract_end_dt" DATE,
ADD COLUMN     "contract_start_dt" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "corp_reg_no" CHAR(13),
ADD COLUMN     "country_cd" CHAR(2) NOT NULL DEFAULT 'KR',
ADD COLUMN     "ext_attr" JSONB,
ADD COLUMN     "homepage_url" VARCHAR(200),
ADD COLUMN     "if_method_cd" VARCHAR(20) NOT NULL DEFAULT 'PORTAL',
ADD COLUMN     "industry_cd" VARCHAR(20),
ADD COLUMN     "min_inbound_shelf_days" INTEGER,
ADD COLUMN     "min_outbound_shelf_days" INTEGER,
ADD COLUMN     "order_no_unique_scope_cd" VARCHAR(20) NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "partial_ship_yn" CHAR(1) NOT NULL DEFAULT 'Y',
ADD COLUMN     "payment_terms_days" INTEGER,
ADD COLUMN     "remark" VARCHAR(1000),
ADD COLUMN     "serial_mgmt_yn" CHAR(1),
ADD COLUMN     "settle_cycle_cd" VARCHAR(10) NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "ship_cutoff_time" TIME(0),
ADD COLUMN     "ship_to_center_policy_cd" VARCHAR(20) NOT NULL DEFAULT 'AUTO_HOLD',
ADD COLUMN     "shipper_nm_en" VARCHAR(100),
ADD COLUMN     "shipper_short_nm" VARCHAR(30),
ADD COLUMN     "shipper_type_cd" VARCHAR(20),
ADD COLUMN     "shortage_policy_cd" VARCHAR(20) NOT NULL DEFAULT 'HOLD',
ADD COLUMN     "sort_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "status_reason" VARCHAR(200),
ADD COLUMN     "sub_biz_no" CHAR(4),
ADD COLUMN     "tax_invoice_email" VARCHAR(100),
ADD COLUMN     "tax_type_cd" VARCHAR(10) NOT NULL DEFAULT 'GENERAL',
ALTER COLUMN "expiry_mgmt_yn" DROP NOT NULL,
ALTER COLUMN "expiry_mgmt_yn" DROP DEFAULT,
ALTER COLUMN "lot_mgmt_yn" DROP NOT NULL,
ALTER COLUMN "lot_mgmt_yn" DROP DEFAULT,
ALTER COLUMN "status_cd" SET DEFAULT 'PREPARING',
ALTER COLUMN "status_cd" SET DATA TYPE VARCHAR(20);

-- AlterTable
ALTER TABLE "tb_shipper_center" ADD COLUMN     "alloc_rule_cd" VARCHAR(10),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "default_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "end_dt" DATE,
ADD COLUMN     "expiry_mgmt_yn" CHAR(1),
ADD COLUMN     "lot_mgmt_yn" CHAR(1),
ADD COLUMN     "serial_mgmt_yn" CHAR(1),
ADD COLUMN     "ship_cutoff_time" TIME(0),
ADD COLUMN     "start_dt" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_shipper_contact" ADD COLUMN     "if_contact_yn" CHAR(1) NOT NULL DEFAULT 'N';

-- ─────────── 데이터 옮기기
-- 상태 4단계: 기존 ACTIVE → 운영중 그대로, INACTIVE → SUSPENDED (사유 자동). 새 화주 기본은 PREPARING
ALTER TABLE "tb_shipper" DROP CONSTRAINT "tb_shipper_status_cd_check";
UPDATE "tb_shipper" SET "status_cd" = 'SUSPENDED', "status_reason" = '기존 사용 중지에서 옮김' WHERE "status_cd" = 'INACTIVE';
-- 계약시작일: 등록일
UPDATE "tb_shipper" SET "contract_start_dt" = "created_at"::date;
-- 정렬순서: 운영사별 코드 순으로 10, 20, 30 …
UPDATE "tb_shipper" t SET "sort_seq" = s.seq
  FROM (SELECT "shipper_id", ROW_NUMBER() OVER (PARTITION BY "operator_id" ORDER BY "shipper_cd") * 10 AS seq FROM "tb_shipper") s
  WHERE t."shipper_id" = s."shipper_id";
-- 이용 센터: 화주마다 센터 코드가 가장 앞인 센터를 기본 센터로, 시작일은 화주 등록일
UPDATE "tb_shipper_center" sc SET "default_yn" = 'Y'
  FROM (SELECT DISTINCT ON (sc2."shipper_id") sc2."shipper_id", sc2."center_id"
        FROM "tb_shipper_center" sc2 JOIN "tb_center" c ON c."center_id" = sc2."center_id"
        ORDER BY sc2."shipper_id", c."center_cd") f
  WHERE sc."shipper_id" = f."shipper_id" AND sc."center_id" = f."center_id";
UPDATE "tb_shipper_center" sc SET "start_dt" = s."created_at"::date
  FROM "tb_shipper" s WHERE s."shipper_id" = sc."shipper_id";

-- ─────────── 검사 조건
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_status_cd_check"
  CHECK ("status_cd" IN ('PREPARING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'));
-- 일시정지·해지는 사유 필수
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_status_reason_check"
  CHECK ("status_cd" NOT IN ('SUSPENDED', 'TERMINATED') OR "status_reason" IS NOT NULL);
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_biz_entity_cd_check" CHECK ("biz_entity_cd" IN ('CORP', 'INDIVIDUAL'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_tax_type_cd_check" CHECK ("tax_type_cd" IN ('GENERAL', 'SIMPLE', 'EXEMPT'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_corp_reg_no_check" CHECK ("corp_reg_no" ~ '^[0-9]{13}$');
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_sub_biz_no_check" CHECK ("sub_biz_no" ~ '^[0-9]{4}$');
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_contract_dt_check"
  CHECK ("contract_end_dt" IS NULL OR "contract_end_dt" >= "contract_start_dt");
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_closing_day_check"
  CHECK ("closing_day" IS NULL OR "closing_day" BETWEEN 1 AND 31 OR "closing_day" = 99);
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_count_check" CHECK (
  COALESCE("payment_terms_days", 0) BETWEEN 0 AND 365
  AND COALESCE("min_inbound_shelf_days", 0) BETWEEN 0 AND 9999
  AND COALESCE("min_outbound_shelf_days", 0) BETWEEN 0 AND 9999);
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_yn_check" CHECK (
  "auto_renew_yn" IN ('Y', 'N') AND "partial_ship_yn" IN ('Y', 'N') AND "auto_create_ship_to_yn" IN ('Y', 'N')
  AND "auto_create_item_yn" IN ('Y', 'N') AND "api_enabled_yn" IN ('Y', 'N')
  AND COALESCE("serial_mgmt_yn", 'N') IN ('Y', 'N'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_alloc_rule_cd_check" CHECK ("alloc_rule_cd" IN ('FIFO', 'FEFO', 'LIFO'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_shortage_policy_cd_check"
  CHECK ("shortage_policy_cd" IN ('HOLD', 'PARTIAL', 'CANCEL_SHORT'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_ship_to_center_policy_cd_check"
  CHECK ("ship_to_center_policy_cd" IN ('AUTO_HOLD', 'AUTO_REJECT', 'REQUIRED'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_order_no_scope_cd_check"
  CHECK ("order_no_unique_scope_cd" IN ('CLIENT', 'CLIENT_DAY'));
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_if_method_cd_check" CHECK ("if_method_cd" IN ('PORTAL', 'API', 'FILE', 'EDI'));

ALTER TABLE "tb_shipper_center" ADD CONSTRAINT "tb_shipper_center_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_shipper_center" ADD CONSTRAINT "tb_shipper_center_dt_check" CHECK ("end_dt" IS NULL OR "end_dt" >= "start_dt");
ALTER TABLE "tb_shipper_center" ADD CONSTRAINT "tb_shipper_center_yn_check" CHECK (
  "default_yn" IN ('Y', 'N') AND COALESCE("lot_mgmt_yn", 'N') IN ('Y', 'N')
  AND COALESCE("expiry_mgmt_yn", 'N') IN ('Y', 'N') AND COALESCE("serial_mgmt_yn", 'N') IN ('Y', 'N'));
ALTER TABLE "tb_shipper_center" ADD CONSTRAINT "tb_shipper_center_alloc_rule_cd_check" CHECK ("alloc_rule_cd" IN ('FIFO', 'FEFO', 'LIFO'));
-- 기본 센터: 화주당 1개
CREATE UNIQUE INDEX "tb_shipper_center_default_key" ON "tb_shipper_center"("shipper_id") WHERE "default_yn" = 'Y';

ALTER TABLE "tb_shipper_contact" ADD CONSTRAINT "tb_shipper_contact_if_contact_yn_check" CHECK ("if_contact_yn" IN ('Y', 'N'));
-- 연동 담당: 화주당 최대 1명, 이메일 필수
CREATE UNIQUE INDEX "tb_shipper_contact_if_contact_key" ON "tb_shipper_contact"("shipper_id") WHERE "if_contact_yn" = 'Y';
ALTER TABLE "tb_shipper_contact" ADD CONSTRAINT "tb_shipper_contact_if_email_check"
  CHECK ("if_contact_yn" = 'N' OR "email" IS NOT NULL);

-- ─────────── 공통코드 (이미 있는 운영사에 추가, 새 운영사는 src/config/defaults/codes.ts에서 복사)
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", v.code, v.name, v.description,
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + v.seq, 'Y', now()
FROM "tb_operator" o
CROSS JOIN (VALUES ('SHIPPER_TYPE', '화주 유형', '화주사의 사업 형태', 10),
                   ('SHIPPER_INDUSTRY', '화주 업종', '화주사가 다루는 상품 분야', 20),
                   ('SETTLE_CYCLE', '정산 주기', '화주사 정산 주기', 30)) AS v(code, name, description, seq)
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = v.code AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "group_id", "code_item_cd", "code_item_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."group_id", v.code, v.name, v.seq, now()
FROM "tb_code_group" g
JOIN (VALUES ('SHIPPER_TYPE', 'MANUFACTURER', '제조', 10), ('SHIPPER_TYPE', 'DISTRIBUTOR', '유통·도매', 20),
             ('SHIPPER_TYPE', 'ECOMMERCE', '이커머스', 30), ('SHIPPER_TYPE', 'IMPORTER', '수입', 40),
             ('SHIPPER_TYPE', 'BRAND', '브랜드', 50), ('SHIPPER_TYPE', 'ETC', '기타', 60),
             ('SHIPPER_INDUSTRY', 'FOOD', '식품', 10), ('SHIPPER_INDUSTRY', 'BEVERAGE', '음료', 20),
             ('SHIPPER_INDUSTRY', 'APPAREL', '의류·잡화', 30), ('SHIPPER_INDUSTRY', 'COSMETIC', '화장품', 40),
             ('SHIPPER_INDUSTRY', 'PHARMA', '의약·건기식', 50), ('SHIPPER_INDUSTRY', 'ELECTRONICS', '전자', 60),
             ('SHIPPER_INDUSTRY', 'LIVING', '생활용품', 70), ('SHIPPER_INDUSTRY', 'ETC', '기타', 80),
             ('SETTLE_CYCLE', 'MONTHLY', '월', 10), ('SETTLE_CYCLE', 'SEMI_MONTHLY', '반월', 20),
             ('SETTLE_CYCLE', 'WEEKLY', '주', 30),
             ('CONTACT_ROLE', 'SALES', '영업', 5), ('CONTACT_ROLE', 'CS', '고객응대', 65)) AS v(grp, code, name, seq)
  ON v.grp = g."group_cd"
WHERE g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."group_id" = g."group_id" AND i."code_item_cd" = v.code AND i."del_yn" = 'N');
