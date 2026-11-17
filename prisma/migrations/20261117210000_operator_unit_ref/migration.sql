-- 운영사 중량·길이 표시 단위를 단위 기준정보 참조로 (docs/decisions/0078)
-- 고정 목록 검사(KG·LB / CM·INCH)를 없애고, 단위 표에 있는 중량·길이 단위(시스템 또는 그 운영사의 단위)만 받는다
-- 코드 글자로 저장하므로(외래 키 대신) 트리거로 검사한다. 단위를 지우려 할 때의 사용 검사는 unit-usage.ts

ALTER TABLE "tb_operator"
  DROP CONSTRAINT "tb_operator_weight_unit_cd_check",
  DROP CONSTRAINT "tb_operator_length_unit_cd_check",
  ALTER COLUMN "weight_unit_cd" SET DATA TYPE VARCHAR(10),
  ALTER COLUMN "length_unit_cd" SET DATA TYPE VARCHAR(10);

CREATE FUNCTION "tb_operator_check_units"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "tb_unit" u
    WHERE u."unit_cd" = NEW."weight_unit_cd" AND u."unit_type_cd" = 'WEIGHT' AND u."del_yn" = 'N'
      AND (u."operator_id" IS NULL OR u."operator_id" = NEW."operator_id")
  ) THEN
    RAISE EXCEPTION '중량 단위가 단위 기준정보에 없습니다: %', NEW."weight_unit_cd";
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "tb_unit" u
    WHERE u."unit_cd" = NEW."length_unit_cd" AND u."unit_type_cd" = 'LENGTH' AND u."del_yn" = 'N'
      AND (u."operator_id" IS NULL OR u."operator_id" = NEW."operator_id")
  ) THEN
    RAISE EXCEPTION '길이 단위가 단위 기준정보에 없습니다: %', NEW."length_unit_cd";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tb_operator_units_ref"
  BEFORE INSERT OR UPDATE OF "weight_unit_cd", "length_unit_cd" ON "tb_operator"
  FOR EACH ROW EXECUTE FUNCTION "tb_operator_check_units"();
