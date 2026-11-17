-- 창고 정보 확장 (docs/specs/warehouse.md, docs/decisions/0074)
-- 1) 유형·온도대: DB enum → 글자 칸 + 검사 조건 (플랫폼 상수 WAREHOUSE_TYPE·TEMP_ZONE과 같은 값)
-- 2) 칸 추가: 기본 정보·위치·시설·운영 속성 [1차], 시설 세부·관리 [2차], 비고·확장속성
-- 3) 기존 데이터 보정: 대기 창고 → 시스템 기본 창고, 유형별 운영 속성 기본값, 기본 로케이션 연결, 센터 취급 온도대
-- 4) 검사 조건·고유 인덱스·외래 키

-- ── 1) 유형·온도대 ─────────────────────────────────────────────
-- 대기 창고 고유 인덱스가 enum 값을 쓰므로 먼저 지우고 4)에서 시스템 기본 창고 기준으로 다시 만든다
DROP INDEX "tb_warehouse_one_staging_per_center";

ALTER TABLE "tb_warehouse" ALTER COLUMN "warehouse_type_cd" DROP DEFAULT;
ALTER TABLE "tb_warehouse" ALTER COLUMN "warehouse_type_cd" TYPE VARCHAR(20) USING (
  CASE "warehouse_type_cd"::text
    WHEN 'GENERAL' THEN 'STORAGE'
    WHEN 'INBOUND_STAGING' THEN 'INBOUND'
    WHEN 'OUTBOUND_STAGING' THEN 'OUTBOUND'
    WHEN 'RETURN_STAGING' THEN 'RETURN'
  END
);
ALTER TABLE "tb_warehouse" ALTER COLUMN "warehouse_type_cd" SET DEFAULT 'STORAGE';

-- 온도대는 화면·서버가 늘 정해서 넣는다 (센터 취급 온도대 중에서 고름) → 기본값 없음
ALTER TABLE "tb_warehouse" ALTER COLUMN "temp_zone_cd" DROP DEFAULT;
ALTER TABLE "tb_warehouse" ALTER COLUMN "temp_zone_cd" TYPE VARCHAR(20) USING "temp_zone_cd"::text;

DROP TYPE "WarehouseType";
DROP TYPE "StorageCondition";

-- ── 2) 칸 추가 ────────────────────────────────────────────────
ALTER TABLE "tb_warehouse"
  ALTER COLUMN "warehouse_cd" TYPE VARCHAR(20),
  ALTER COLUMN "warehouse_nm" TYPE VARCHAR(100),
  ALTER COLUMN "status_cd" TYPE VARCHAR(20),
  -- ① 기본 정보 [1차]
  ADD COLUMN "system_yn" CHAR(1) NOT NULL DEFAULT 'N',
  ADD COLUMN "description" VARCHAR(200),
  ADD COLUMN "sort_seq" INTEGER NOT NULL DEFAULT 10,
  -- ② 위치·시설 [1차: 동·층·면적 / 2차: 나머지]
  ADD COLUMN "building_nm" VARCHAR(50),
  ADD COLUMN "floor_no" VARCHAR(10),
  ADD COLUMN "area_m2" DECIMAL(12, 2),
  ADD COLUMN "ceiling_height_m" DECIMAL(5, 2),
  ADD COLUMN "pallet_capa_cnt" INTEGER,
  ADD COLUMN "storage_method_cd" VARCHAR(20),
  ADD COLUMN "bonded_yn" CHAR(1) NOT NULL DEFAULT 'N',
  ADD COLUMN "hazmat_yn" CHAR(1) NOT NULL DEFAULT 'N',
  -- ③ 운영 속성 [1차] (기본값 = 일반 보관 유형 기본값)
  ADD COLUMN "inbound_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "outbound_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "allocatable_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "default_stock_status_cd" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "alloc_priority" INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN "default_loc_id" BIGINT,
  -- ④ 관리·담당 [2차]
  ADD COLUMN "manager_user_id" BIGINT,
  ADD COLUMN "dedicated_shipper_id" BIGINT,
  ADD COLUMN "loc_cd_prefix" VARCHAR(10),
  ADD COLUMN "loc_cd_separator" CHAR(1),
  -- ⑤ 확장
  ADD COLUMN "remark" VARCHAR(1000),
  ADD COLUMN "ext_attr" JSONB;

-- ── 3) 기존 데이터 보정 ───────────────────────────────────────
-- 대기 창고(센터 등록 때 자동 생성) = 시스템 기본 창고, 정렬은 입고 → 출고 → 반품 → 나머지
UPDATE "tb_warehouse" SET "system_yn" = 'Y', "sort_seq" = 1 WHERE "warehouse_type_cd" = 'INBOUND';
UPDATE "tb_warehouse" SET "system_yn" = 'Y', "sort_seq" = 2 WHERE "warehouse_type_cd" = 'OUTBOUND';
UPDATE "tb_warehouse" SET "system_yn" = 'Y', "sort_seq" = 3 WHERE "warehouse_type_cd" = 'RETURN';

-- 유형별 운영 속성 기본값 (src/config/operator-codes.ts WAREHOUSE_TYPE_DEFAULTS와 같게)
UPDATE "tb_warehouse" SET "inbound_yn" = 'Y', "outbound_yn" = 'N', "allocatable_yn" = 'N', "default_stock_status_cd" = 'NORMAL'
  WHERE "warehouse_type_cd" = 'INBOUND';
UPDATE "tb_warehouse" SET "inbound_yn" = 'N', "outbound_yn" = 'Y', "allocatable_yn" = 'N', "default_stock_status_cd" = 'NORMAL'
  WHERE "warehouse_type_cd" = 'OUTBOUND';
UPDATE "tb_warehouse" SET "inbound_yn" = 'Y', "outbound_yn" = 'N', "allocatable_yn" = 'N', "default_stock_status_cd" = 'HOLD'
  WHERE "warehouse_type_cd" = 'RETURN';

-- 기본 창고의 기본 로케이션 = 그 창고의 DEFAULT 로케이션
UPDATE "tb_warehouse" w SET "default_loc_id" = l."location_id"
  FROM "tb_location" l
  WHERE l."warehouse_id" = w."warehouse_id" AND l."location_cd" = 'DEFAULT' AND l."del_yn" = 'N'
    AND w."system_yn" = 'Y';

-- 센터가 취급 온도대를 정해 두었으면, 그 안에 없는 기본 창고 온도대를 센터 온도대로 (상온 우선, 없으면 첫 번째)
UPDATE "tb_warehouse" w SET "temp_zone_cd" = (
    SELECT tz."temp_zone_cd" FROM "tb_center_temp_zone" tz
    WHERE tz."center_id" = w."center_id"
    ORDER BY array_position(ARRAY['AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'], tz."temp_zone_cd")
    LIMIT 1
  )
  WHERE w."system_yn" = 'Y'
    AND EXISTS (SELECT 1 FROM "tb_center_temp_zone" tz WHERE tz."center_id" = w."center_id")
    AND NOT EXISTS (
      SELECT 1 FROM "tb_center_temp_zone" tz
      WHERE tz."center_id" = w."center_id" AND tz."temp_zone_cd" = w."temp_zone_cd"
    );

-- 나머지 창고가 쓰는 온도대는 센터 취급 온도대에 더한다 (창고 온도대 ⊂ 센터 온도대가 되도록)
INSERT INTO "tb_center_temp_zone" ("center_id", "temp_zone_cd")
  SELECT DISTINCT "center_id", "temp_zone_cd" FROM "tb_warehouse" WHERE "del_yn" = 'N'
  ON CONFLICT DO NOTHING;

-- ── 4) 검사 조건·인덱스·외래 키 ────────────────────────────────
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_warehouse_cd_check"
  CHECK ("warehouse_cd" ~ '^[A-Z0-9_]{1,20}$');
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_type_check"
  CHECK ("warehouse_type_cd" IN ('STORAGE', 'INBOUND', 'OUTBOUND', 'RETURN', 'QC', 'DAMAGED', 'VAS', 'CROSSDOCK'));
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_temp_zone_check"
  CHECK ("temp_zone_cd" IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'));
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_status_check"
  CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_stock_status_check"
  CHECK ("default_stock_status_cd" IN ('NORMAL', 'HOLD', 'DAMAGED', 'QUARANTINE'));
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_yn_check" CHECK (
  "system_yn" IN ('Y', 'N') AND "bonded_yn" IN ('Y', 'N') AND "hazmat_yn" IN ('Y', 'N')
  AND "inbound_yn" IN ('Y', 'N') AND "outbound_yn" IN ('Y', 'N') AND "allocatable_yn" IN ('Y', 'N')
);
-- 시스템 기본 창고는 입고·출고·반품 대기 유형만, 사용 중지 불가
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_system_check" CHECK (
  "system_yn" = 'N' OR ("warehouse_type_cd" IN ('INBOUND', 'OUTBOUND', 'RETURN') AND "status_cd" = 'ACTIVE')
);
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_numbers_check" CHECK (
  "sort_seq" >= 0 AND "alloc_priority" BETWEEN 1 AND 999
  AND ("area_m2" IS NULL OR "area_m2" >= 0)
  AND ("ceiling_height_m" IS NULL OR "ceiling_height_m" >= 0)
  AND ("pallet_capa_cnt" IS NULL OR "pallet_capa_cnt" >= 0)
);

-- 센터마다 시스템 기본 창고는 유형별 1개
CREATE UNIQUE INDEX "tb_warehouse_one_system_per_center"
  ON "tb_warehouse" ("center_id", "warehouse_type_cd") WHERE "system_yn" = 'Y';

CREATE INDEX "tb_warehouse_default_loc_id_idx" ON "tb_warehouse" ("default_loc_id");
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_default_loc_id_fkey"
  FOREIGN KEY ("default_loc_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_manager_user_id_fkey"
  FOREIGN KEY ("manager_user_id") REFERENCES "tb_user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_warehouse" ADD CONSTRAINT "tb_warehouse_dedicated_shipper_id_fkey"
  FOREIGN KEY ("dedicated_shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;
