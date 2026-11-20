-- 휴무관리 (0096): 국가 공휴일(운영사 공통)·연도별 가져오기 결과·운영사 개별 휴일(휴무·특근)

-- CreateTable
CREATE TABLE "tb_holiday" (
    "holiday_id" BIGSERIAL NOT NULL,
    "holiday_dt" DATE NOT NULL,
    "holiday_nm" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_holiday_pkey" PRIMARY KEY ("holiday_id")
);

-- CreateTable
CREATE TABLE "tb_holiday_year" (
    "holiday_year" INTEGER NOT NULL,
    "status_cd" VARCHAR(20) NOT NULL,
    "holiday_cnt" INTEGER NOT NULL DEFAULT 0,
    "result_msg" VARCHAR(500),
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_holiday_year_pkey" PRIMARY KEY ("holiday_year")
);

-- CreateTable
CREATE TABLE "tb_operator_holiday" (
    "operator_holiday_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "center_id" BIGINT,
    "holiday_dt" DATE NOT NULL,
    "holiday_nm" VARCHAR(100) NOT NULL,
    "day_type_cd" VARCHAR(20) NOT NULL DEFAULT 'CLOSED',
    "remark" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_operator_holiday_pkey" PRIMARY KEY ("operator_holiday_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_holiday_holiday_dt_holiday_nm_key" ON "tb_holiday"("holiday_dt", "holiday_nm");

-- CreateIndex
CREATE INDEX "tb_operator_holiday_holiday_dt_idx" ON "tb_operator_holiday"("holiday_dt");

-- CreateIndex
CREATE UNIQUE INDEX "tb_operator_holiday_operator_dt_key" ON "tb_operator_holiday"("operator_id", "holiday_dt") WHERE (center_id IS NULL AND del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_operator_holiday_center_dt_key" ON "tb_operator_holiday"("center_id", "holiday_dt") WHERE (center_id IS NOT NULL AND del_yn = 'N');

-- AddForeignKey
ALTER TABLE "tb_operator_holiday" ADD CONSTRAINT "tb_operator_holiday_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_operator_holiday" ADD CONSTRAINT "tb_operator_holiday_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 값 목록 (상수 + CHECK, src/lib/holidays/holiday-codes.ts)
ALTER TABLE "tb_holiday_year" ADD CONSTRAINT "tb_holiday_year_status_cd_check" CHECK ("status_cd" IN ('OK', 'EMPTY', 'FAILED'));
ALTER TABLE "tb_operator_holiday" ADD CONSTRAINT "tb_operator_holiday_day_type_cd_check" CHECK ("day_type_cd" IN ('CLOSED', 'OPEN'));
ALTER TABLE "tb_operator_holiday" ADD CONSTRAINT "tb_operator_holiday_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));

-- 권한 system.holidays: 기존 운영사의 슈퍼 관리자 = 전체 (시스템 메뉴는 운영사 사용자만 — 0018)
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('system.holidays.read'), ('system.holidays.create'), ('system.holidays.update'),
                   ('system.holidays.delete')) AS v(code)
WHERE g."perm_group_nm" = '슈퍼 관리자' AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
