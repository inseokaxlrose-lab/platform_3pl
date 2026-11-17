-- 운영사별 시스템 기본 단위 사용 여부 (docs/decisions/0079)
-- 시스템 단위를 운영사마다 사용 중지할 수 있게: 사용 중지한 단위만 줄이 생긴다 (없으면 시스템 단위의 상태)

-- CreateTable
CREATE TABLE "tb_operator_unit" (
    "operator_unit_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_operator_unit_pkey" PRIMARY KEY ("operator_unit_id")
);

-- CreateIndex
CREATE INDEX "tb_operator_unit_unit_id_idx" ON "tb_operator_unit"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_operator_unit_operator_id_unit_id_key" ON "tb_operator_unit"("operator_id", "unit_id");

-- AddForeignKey
ALTER TABLE "tb_operator_unit" ADD CONSTRAINT "tb_operator_unit_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_operator_unit" ADD CONSTRAINT "tb_operator_unit_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "tb_operator_unit" ADD CONSTRAINT "tb_operator_unit_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));

-- 시스템 기본 단위(operator_id 없음)만 운영사별 설정을 둔다 (운영사 추가 단위는 자기 상태 칸을 쓴다)
CREATE FUNCTION "tb_operator_unit_system_only"() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "tb_unit" WHERE "unit_id" = NEW."unit_id" AND "operator_id" IS NULL) THEN
    RAISE EXCEPTION '운영사별 단위 설정은 시스템 기본 단위만 둘 수 있습니다 (unit_id=%)', NEW."unit_id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tb_operator_unit_system_only"
  BEFORE INSERT OR UPDATE OF "unit_id" ON "tb_operator_unit"
  FOR EACH ROW EXECUTE FUNCTION "tb_operator_unit_system_only"();
