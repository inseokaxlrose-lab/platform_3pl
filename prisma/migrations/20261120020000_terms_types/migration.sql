-- 용어·타입 정리 (docs/decisions/0084 ③, 정의서 system_code H4·H5·H6)

-- ── H5. client → shipper
ALTER TABLE "tb_operator" RENAME COLUMN "max_client_cnt" TO "max_shipper_cnt";
ALTER TABLE "tb_location" RENAME COLUMN "mix_client_yn" TO "mix_shipper_yn";
ALTER TABLE "tb_location" RENAME CONSTRAINT "tb_location_mix_client_yn_not_null" TO "tb_location_mix_shipper_yn_not_null";

-- 주문번호 중복 기준 값: CLIENT·CLIENT_DAY → SHIPPER·SHIPPER_DAY
ALTER TABLE "tb_shipper" DROP CONSTRAINT "tb_shipper_order_no_scope_cd_check";
UPDATE "tb_shipper" SET "order_no_unique_scope_cd" = REPLACE("order_no_unique_scope_cd", 'CLIENT', 'SHIPPER');
ALTER TABLE "tb_shipper" ALTER COLUMN "order_no_unique_scope_cd" SET DEFAULT 'SHIPPER';
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_order_no_scope_cd_check"
  CHECK ("order_no_unique_scope_cd" IN ('SHIPPER', 'SHIPPER_DAY'));

-- 납품처 배송센터 확인 사유: NOT_CLIENT_CENTER → NOT_SHIPPER_CENTER
ALTER TABLE "tb_ship_to" DROP CONSTRAINT "tb_ship_to_confirm_reason_cd_check";
UPDATE "tb_ship_to" SET "center_confirm_reason_cd" = 'NOT_SHIPPER_CENTER' WHERE "center_confirm_reason_cd" = 'NOT_CLIENT_CENTER';
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_confirm_reason_cd_check"
  CHECK ("center_confirm_reason_cd" IN ('ADDR_NOT_RESOLVED', 'REGION_UNASSIGNED', 'REGION_MIXED', 'NOT_SHIPPER_CENTER', 'CENTER_INACTIVE', 'INVALID_CENTER_CD'));

-- ── H5. partner → customer
-- API 키 권한
ALTER TABLE "tb_api_client_scope" DROP CONSTRAINT "tb_api_client_scope_cd_check";
UPDATE "tb_api_client_scope" SET "scope_cd" = REPLACE("scope_cd", 'PARTNER_', 'CUSTOMER_') WHERE "scope_cd" LIKE 'PARTNER\_%';
ALTER TABLE "tb_api_client_scope" ADD CONSTRAINT "tb_api_client_scope_cd_check"
  CHECK ("scope_cd" IN ('CUSTOMER_READ', 'CUSTOMER_WRITE', 'ITEM_READ', 'ITEM_WRITE', 'ASN_READ', 'ASN_WRITE', 'ORDER_READ', 'ORDER_WRITE', 'STOCK_READ'));
-- API 호출 이력의 API 구분
UPDATE "tb_api_request_log" SET "api_cd" = REPLACE("api_cd", 'PARTNER_', 'CUSTOMER_') WHERE "api_cd" LIKE 'PARTNER\_%';
-- 공통코드 그룹: 거래처 유형
UPDATE "tb_code_group" SET "group_cd" = 'CUSTOMER_TYPE' WHERE "group_cd" = 'PARTNER_TYPE';

-- ── H4. 화주사·화주사 담당자 TEXT → 길이를 정한 VARCHAR (운영사·거래처와 같은 길이), 번호 숫자 검사
ALTER TABLE "tb_shipper"
  ALTER COLUMN "shipper_cd" SET DATA TYPE VARCHAR(20),
  ALTER COLUMN "shipper_nm" SET DATA TYPE VARCHAR(100),
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
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_number_digits_check" CHECK (
  ("biz_reg_no" IS NULL OR "biz_reg_no" ~ '^[0-9]{10}$')
  AND ("tel_no" IS NULL OR "tel_no" ~ '^[0-9]{8,15}$')
  AND ("fax_no" IS NULL OR "fax_no" ~ '^[0-9]{8,15}$')
);
ALTER TABLE "tb_shipper_contact"
  ALTER COLUMN "role_cd" SET DATA TYPE VARCHAR(20),
  ALTER COLUMN "contact_nm" SET DATA TYPE VARCHAR(50),
  ALTER COLUMN "tel_no" SET DATA TYPE VARCHAR(15),
  ALTER COLUMN "email" SET DATA TYPE VARCHAR(100);
ALTER TABLE "tb_shipper_contact" ADD CONSTRAINT "tb_shipper_contact_tel_no_check"
  CHECK ("tel_no" IS NULL OR "tel_no" ~ '^[0-9]{8,15}$');

-- ── H6. 운영사 표시 단위: 코드 글자 → 단위 id (FK)
-- 시스템 단위 id (운영사 표시 단위의 기본값으로 쓴다)
CREATE FUNCTION "system_unit_id"("code" VARCHAR) RETURNS BIGINT AS $$
  SELECT "unit_id" FROM "tb_unit" WHERE "unit_cd" = "code" AND "operator_id" IS NULL AND "del_yn" = 'N'
$$ LANGUAGE sql STABLE;

DROP TRIGGER "tb_operator_units_ref" ON "tb_operator";
DROP FUNCTION "tb_operator_check_units"();

ALTER TABLE "tb_operator"
  ADD COLUMN "weight_unit_id" BIGINT,
  ADD COLUMN "length_unit_id" BIGINT;
-- 같은 코드면 이 운영사의 단위가 시스템 단위보다 먼저
UPDATE "tb_operator" o SET
  "weight_unit_id" = COALESCE((
    SELECT u."unit_id" FROM "tb_unit" u
    WHERE u."unit_cd" = o."weight_unit_cd" AND u."unit_type_cd" = 'WEIGHT' AND u."del_yn" = 'N'
      AND (u."operator_id" IS NULL OR u."operator_id" = o."operator_id")
    ORDER BY u."operator_id" NULLS LAST LIMIT 1), "system_unit_id"('KG')),
  "length_unit_id" = COALESCE((
    SELECT u."unit_id" FROM "tb_unit" u
    WHERE u."unit_cd" = o."length_unit_cd" AND u."unit_type_cd" = 'LENGTH' AND u."del_yn" = 'N'
      AND (u."operator_id" IS NULL OR u."operator_id" = o."operator_id")
    ORDER BY u."operator_id" NULLS LAST LIMIT 1), "system_unit_id"('CM'));
ALTER TABLE "tb_operator"
  DROP COLUMN "weight_unit_cd",
  DROP COLUMN "length_unit_cd",
  ALTER COLUMN "weight_unit_id" SET NOT NULL,
  ALTER COLUMN "weight_unit_id" SET DEFAULT system_unit_id('KG'::character varying),
  ALTER COLUMN "length_unit_id" SET NOT NULL,
  ALTER COLUMN "length_unit_id" SET DEFAULT system_unit_id('CM'::character varying);
ALTER TABLE "tb_operator"
  ADD CONSTRAINT "tb_operator_weight_unit_id_fkey" FOREIGN KEY ("weight_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "tb_operator_length_unit_id_fkey" FOREIGN KEY ("length_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 유형(중량·길이)과 범위(시스템 또는 이 운영사의 단위)는 FK로 표현되지 않아 트리거로 검사한다
CREATE FUNCTION "tb_operator_check_units"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "tb_unit" u
    WHERE u."unit_id" = NEW."weight_unit_id" AND u."unit_type_cd" = 'WEIGHT'
      AND (u."operator_id" IS NULL OR u."operator_id" = NEW."operator_id")
  ) THEN
    RAISE EXCEPTION '중량 단위가 아니거나 이 운영사의 단위가 아닙니다: %', NEW."weight_unit_id";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "tb_unit" u
    WHERE u."unit_id" = NEW."length_unit_id" AND u."unit_type_cd" = 'LENGTH'
      AND (u."operator_id" IS NULL OR u."operator_id" = NEW."operator_id")
  ) THEN
    RAISE EXCEPTION '길이 단위가 아니거나 이 운영사의 단위가 아닙니다: %', NEW."length_unit_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tb_operator_units_ref"
  BEFORE INSERT OR UPDATE OF "weight_unit_id", "length_unit_id" ON "tb_operator"
  FOR EACH ROW EXECUTE FUNCTION "tb_operator_check_units"();
