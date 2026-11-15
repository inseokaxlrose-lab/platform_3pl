-- M2.5 4단계 운영사 정의서 반영 (docs/specs/operator.md, docs/decisions/0040)
-- 1) tb_operator: 1차·2차 칸 추가, 기존 TEXT 칸을 정의서 길이로
-- 2) 기존 데이터 변환: 운영사코드(1 → DEMO, 2 → NARA, 그 밖 → OP0003 모양), 계약시작일 = 등록일
-- 3) 플랫폼이 정하는 코드 값은 검사 조건으로 (값 목록: src/config/operator-codes.ts)
-- 4) 운영사 공통코드: CONTACT_DUTY → CONTACT_ROLE, SERVICE_TYPE 추가 (운영사마다)
-- 5) 권한 코드 master.company.* → master.operator.*

-- AlterTable
ALTER TABLE "tb_operator" ADD COLUMN     "addr_jibun" VARCHAR(200),
ADD COLUMN     "alloc_rule_cd" VARCHAR(10) NOT NULL DEFAULT 'FIFO',
ADD COLUMN     "billing_basis_cd" VARCHAR(10),
ADD COLUMN     "billing_email" VARCHAR(100),
ADD COLUMN     "biz_entity_cd" VARCHAR(10) NOT NULL DEFAULT 'CORP',
ADD COLUMN     "bonded_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "closing_day" SMALLINT NOT NULL DEFAULT 99,
ADD COLUMN     "contract_end_dt" DATE,
ADD COLUMN     "contract_start_dt" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "corp_reg_no" CHAR(13),
ADD COLUMN     "country_cd" CHAR(2) NOT NULL DEFAULT 'KR',
ADD COLUMN     "currency_cd" CHAR(3) NOT NULL DEFAULT 'KRW',
ADD COLUMN     "customs_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "establish_dt" DATE,
ADD COLUMN     "expiry_mgmt_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "ext_attr" JSONB,
ADD COLUMN     "freight_license_no" VARCHAR(30),
ADD COLUMN     "gln_cd" VARCHAR(13),
ADD COLUMN     "homepage_url" VARCHAR(200),
ADD COLUMN     "lang_cd" VARCHAR(5) NOT NULL DEFAULT 'ko-KR',
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "length_unit_cd" VARCHAR(5) NOT NULL DEFAULT 'CM',
ADD COLUMN     "logo_file_id" BIGINT,
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "lot_mgmt_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "max_center_cnt" INTEGER,
ADD COLUMN     "max_client_cnt" INTEGER,
ADD COLUMN     "max_user_cnt" INTEGER,
ADD COLUMN     "operator_cd" VARCHAR(20),
ADD COLUMN     "operator_nm_en" VARCHAR(100),
ADD COLUMN     "operator_short_nm" VARCHAR(50),
ADD COLUMN     "operator_type_cd" VARCHAR(20) NOT NULL DEFAULT '3PL',
ADD COLUMN     "plan_cd" VARCHAR(20) NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "print_company_nm" VARCHAR(100),
ADD COLUMN     "remark" VARCHAR(1000),
ADD COLUMN     "sales_channel_cd" VARCHAR(20),
ADD COLUMN     "serial_mgmt_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "ship_cutoff_time" TIME(0),
ADD COLUMN     "stamp_file_id" BIGINT,
ADD COLUMN     "status_reason" VARCHAR(200),
ADD COLUMN     "sub_biz_no" CHAR(4),
ADD COLUMN     "tax_invoice_email" VARCHAR(100),
ADD COLUMN     "tax_type_cd" VARCHAR(10) NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Seoul',
ADD COLUMN     "warehouse_reg_no" VARCHAR(30),
ADD COLUMN     "weight_unit_cd" VARCHAR(5) NOT NULL DEFAULT 'KG',
ALTER COLUMN "operator_nm" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "biz_reg_no" SET DATA TYPE CHAR(10),
ALTER COLUMN "ceo_nm" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "biz_condition" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "biz_item" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "tel_no" SET DATA TYPE VARCHAR(15),
ALTER COLUMN "fax_no" SET DATA TYPE VARCHAR(15),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(100),
ALTER COLUMN "zip_cd" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "addr1" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "addr2" SET DATA TYPE VARCHAR(200);

-- 기존 운영사 변환: 운영사코드 (사용자 결정 DEMO·NARA), 계약시작일 = 등록일
UPDATE "tb_operator" SET "operator_cd" = CASE "operator_id"
  WHEN 1 THEN 'DEMO'
  WHEN 2 THEN 'NARA'
  ELSE 'OP' || LPAD("operator_id"::text, 4, '0')
END;
UPDATE "tb_operator" SET "contract_start_dt" = "created_at"::date;
ALTER TABLE "tb_operator" ALTER COLUMN "operator_cd" SET NOT NULL;

-- 검사 조건: 코드 모양, 플랫폼이 정하는 값 목록, 예/아니오, 숫자만 저장하는 번호
ALTER TABLE "tb_operator"
  ADD CONSTRAINT "tb_operator_operator_cd_check" CHECK ("operator_cd" ~ '^[A-Z0-9_-]{2,20}$'),
  ADD CONSTRAINT "tb_operator_operator_type_cd_check"
    CHECK ("operator_type_cd" IN ('3PL', 'FULFILLMENT', 'IN_HOUSE', 'FORWARDING', 'MIXED')),
  ADD CONSTRAINT "tb_operator_biz_entity_cd_check" CHECK ("biz_entity_cd" IN ('CORP', 'INDIVIDUAL')),
  ADD CONSTRAINT "tb_operator_tax_type_cd_check" CHECK ("tax_type_cd" IN ('GENERAL', 'SIMPLE', 'EXEMPT')),
  ADD CONSTRAINT "tb_operator_plan_cd_check" CHECK ("plan_cd" IN ('TRIAL', 'BASIC', 'STANDARD', 'ENTERPRISE')),
  ADD CONSTRAINT "tb_operator_billing_basis_cd_check"
    CHECK ("billing_basis_cd" IS NULL OR "billing_basis_cd" IN ('FIXED', 'USAGE', 'MIXED')),
  ADD CONSTRAINT "tb_operator_alloc_rule_cd_check" CHECK ("alloc_rule_cd" IN ('FIFO', 'FEFO', 'LIFO')),
  ADD CONSTRAINT "tb_operator_weight_unit_cd_check" CHECK ("weight_unit_cd" IN ('KG', 'LB')),
  ADD CONSTRAINT "tb_operator_length_unit_cd_check" CHECK ("length_unit_cd" IN ('CM', 'INCH')),
  ADD CONSTRAINT "tb_operator_yn_check" CHECK (
    "bonded_yn" IN ('Y', 'N') AND "customs_yn" IN ('Y', 'N') AND "lot_mgmt_yn" IN ('Y', 'N')
    AND "expiry_mgmt_yn" IN ('Y', 'N') AND "serial_mgmt_yn" IN ('Y', 'N')),
  ADD CONSTRAINT "tb_operator_closing_day_check" CHECK ("closing_day" BETWEEN 1 AND 31 OR "closing_day" = 99),
  ADD CONSTRAINT "tb_operator_number_digits_check" CHECK (
    "biz_reg_no" ~ '^[0-9]{10}$'
    AND ("corp_reg_no" IS NULL OR "corp_reg_no" ~ '^[0-9]{13}$')
    AND ("sub_biz_no" IS NULL OR "sub_biz_no" ~ '^[0-9]{4}$')),
  -- 정지·해지 상태에는 사유가 있어야 한다
  ADD CONSTRAINT "tb_operator_status_reason_check"
    CHECK ("status_cd" NOT IN ('SUSPENDED', 'TERMINATED') OR "status_reason" IS NOT NULL);

-- AlterTable
ALTER TABLE "tb_operator_contact" ADD COLUMN     "dept_nm" VARCHAR(50),
ADD COLUMN     "notify_yn" CHAR(1) NOT NULL DEFAULT 'Y',
ADD COLUMN     "position_nm" VARCHAR(50),
ALTER COLUMN "role_cd" SET DATA TYPE VARCHAR(20),
ALTER COLUMN "contact_nm" SET DATA TYPE VARCHAR(50),
ALTER COLUMN "tel_no" SET DATA TYPE VARCHAR(15),
ALTER COLUMN "email" SET DATA TYPE VARCHAR(100);

-- CreateTable
CREATE TABLE "tb_operator_service" (
    "operator_id" BIGINT NOT NULL,
    "service_cd" VARCHAR(20) NOT NULL,

    CONSTRAINT "tb_operator_service_pkey" PRIMARY KEY ("operator_id","service_cd")
);

-- CreateTable
CREATE TABLE "tb_operator_temp_zone" (
    "operator_id" BIGINT NOT NULL,
    "temp_zone_cd" VARCHAR(20) NOT NULL,

    CONSTRAINT "tb_operator_temp_zone_pkey" PRIMARY KEY ("operator_id","temp_zone_cd")
);

ALTER TABLE "tb_operator_contact" ADD CONSTRAINT "tb_operator_contact_notify_yn_check" CHECK ("notify_yn" IN ('Y', 'N'));
ALTER TABLE "tb_operator_temp_zone" ADD CONSTRAINT "tb_operator_temp_zone_cd_check"
  CHECK ("temp_zone_cd" IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'));

-- CreateIndex
CREATE UNIQUE INDEX "tb_operator_operator_cd_key" ON "tb_operator"("operator_cd") WHERE (del_yn = 'N');

-- AddForeignKey
ALTER TABLE "tb_operator_service" ADD CONSTRAINT "tb_operator_service_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_operator_temp_zone" ADD CONSTRAINT "tb_operator_temp_zone_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 운영사 공통코드: 담당 업무 그룹 이름을 정의서대로 (값은 같아 담당자 데이터는 그대로)
UPDATE "tb_code_group" SET "group_cd" = 'CONTACT_ROLE', "updated_at" = CURRENT_TIMESTAMP
WHERE "group_cd" = 'CONTACT_DUTY';

-- 운영사 공통코드: 제공 서비스 SERVICE_TYPE (시스템 그룹, 운영사마다 — 새 운영사는 기본값 복사로 만들어진다)
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", 'SERVICE_TYPE', '제공 서비스', '운영사가 제공하는 물류 서비스', 0, 'Y', CURRENT_TIMESTAMP
FROM "tb_operator" o
WHERE NOT EXISTS (
  SELECT 1 FROM "tb_code_group" g
  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'SERVICE_TYPE' AND g."del_yn" = 'N'
);
INSERT INTO "tb_code_item" ("operator_id", "group_id", "code_item_cd", "code_item_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."group_id", v.cd, v.nm, v.seq, CURRENT_TIMESTAMP
FROM "tb_code_group" g
CROSS JOIN (VALUES
  ('STORAGE', '보관', 10), ('INOUT', '입출고', 20), ('PARCEL', '택배', 30), ('RETURN', '반품', 40),
  ('VAS', '유통가공', 50), ('KITTING', '키팅', 60), ('TRANSPORT', '운송', 70)
) AS v(cd, nm, seq)
WHERE g."group_cd" = 'SERVICE_TYPE' AND g."del_yn" = 'N'
  AND NOT EXISTS (
    SELECT 1 FROM "tb_code_item" i
    WHERE i."group_id" = g."group_id" AND i."code_item_cd" = v.cd AND i."del_yn" = 'N'
  );

-- 권한 코드 이름 변경: master.company.* → master.operator.* (화면 주소 /admin/master/operator)
UPDATE "tb_perm_group_perm" SET "perm_cd" = REPLACE("perm_cd", 'master.company.', 'master.operator.')
WHERE "perm_cd" LIKE 'master.company.%';
UPDATE "tb_user_perm_override" SET "perm_cd" = REPLACE("perm_cd", 'master.company.', 'master.operator.')
WHERE "perm_cd" LIKE 'master.company.%';
