-- 시스템 기본 단위의 운영사별 소수 자리수 (docs/decisions/0079)
-- 비어 있으면 시스템 단위의 소수 자리수를 따른다
ALTER TABLE "tb_operator_unit" ADD COLUMN "decimal_cnt" INTEGER;
ALTER TABLE "tb_operator_unit" ADD CONSTRAINT "tb_operator_unit_decimal_range"
  CHECK ("decimal_cnt" IS NULL OR "decimal_cnt" BETWEEN 0 AND 6);
