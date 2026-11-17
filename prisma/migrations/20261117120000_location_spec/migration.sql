-- 구역·로케이션 정보 확장 (docs/specs/location.md, docs/decisions/0075)
-- 1) 구역 표 tb_zone 새로 만들기 (예전에는 로케이션의 글자 칸 zone_cd)
-- 2) 로케이션: 센터·구역 키, 명칭 → 설명, 열·단 칸 이름, 1차·2차 칸 추가
-- 3) 기존 데이터 보정: 구역 26개 만들어 연결, 센터 키 채우기, 시스템 기본 로케이션 표시
-- 4) 검사 조건·인덱스(코드 앞부분·범위 검색)
-- 5) 공통코드 ZONE_TYPE·LOC_TYPE(1차)·LOCK_REASON·ABC_CLASS(2차)
-- 로케이션 코드 중복 금지는 지금처럼 창고 단위 (사용자 결정, 0075)

-- ── 1) 구역 ──────────────────────────────────────────────────
CREATE TABLE "tb_zone" (
  "zone_id" BIGSERIAL NOT NULL,
  "operator_id" BIGINT NOT NULL,
  "center_id" BIGINT NOT NULL,
  "warehouse_id" BIGINT NOT NULL,
  "zone_cd" VARCHAR(10) NOT NULL,
  "zone_nm" VARCHAR(100) NOT NULL,
  "zone_type_cd" VARCHAR(20) NOT NULL DEFAULT 'STORAGE',
  "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  "pick_seq" INTEGER,
  "sort_seq" INTEGER NOT NULL DEFAULT 10,
  "description" VARCHAR(200),
  "remark" VARCHAR(1000),
  "ext_attr" JSONB,
  "del_yn" CHAR(1) NOT NULL DEFAULT 'N',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  "row_version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "tb_zone_pkey" PRIMARY KEY ("zone_id")
);
CREATE UNIQUE INDEX "tb_zone_warehouse_id_zone_cd_key" ON "tb_zone" ("warehouse_id", "zone_cd") WHERE "del_yn" = 'N';
CREATE INDEX "tb_zone_center_id_idx" ON "tb_zone" ("center_id");
CREATE INDEX "tb_zone_operator_id_idx" ON "tb_zone" ("operator_id");
ALTER TABLE "tb_zone" ADD CONSTRAINT "tb_zone_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_zone" ADD CONSTRAINT "tb_zone_center_id_fkey"
  FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_zone" ADD CONSTRAINT "tb_zone_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "tb_warehouse"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_zone" ADD CONSTRAINT "tb_zone_zone_cd_check" CHECK ("zone_cd" ~ '^[A-Z0-9]{1,10}$');
ALTER TABLE "tb_zone" ADD CONSTRAINT "tb_zone_status_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_zone" ADD CONSTRAINT "tb_zone_numbers_check" CHECK (
  "sort_seq" >= 0 AND ("pick_seq" IS NULL OR "pick_seq" >= 0) AND "del_yn" IN ('Y', 'N')
);

-- ── 2) 로케이션 칸 ────────────────────────────────────────────
ALTER TABLE "tb_location" RENAME COLUMN "location_nm" TO "description";
ALTER TABLE "tb_location" RENAME COLUMN "aisle_cd" TO "row_no";
ALTER TABLE "tb_location" RENAME COLUMN "level_cd" TO "level_no";

ALTER TABLE "tb_location"
  -- 코드는 글자 그대로 비교 (C 정렬): 'A-01%' 앞부분 검색·범위 검색이 인덱스를 탄다
  ALTER COLUMN "location_cd" TYPE VARCHAR(30) COLLATE "C",
  ALTER COLUMN "description" TYPE VARCHAR(200),
  ALTER COLUMN "description" DROP NOT NULL,
  ALTER COLUMN "row_no" TYPE VARCHAR(10),
  ALTER COLUMN "level_no" TYPE VARCHAR(10),
  ALTER COLUMN "status_cd" TYPE VARCHAR(20),
  ADD COLUMN "center_id" BIGINT,
  ADD COLUMN "zone_id" BIGINT,
  -- ① 기본 정보 [1차]
  ADD COLUMN "loc_type_cd" VARCHAR(20) NOT NULL DEFAULT 'RACK',
  ADD COLUMN "system_yn" CHAR(1) NOT NULL DEFAULT 'N',
  -- ② 위치 구성 [2차: 연·칸·좌표]
  ADD COLUMN "bay_no" VARCHAR(10),
  ADD COLUMN "cell_no" VARCHAR(10),
  ADD COLUMN "pos_x" DECIMAL(10, 2),
  ADD COLUMN "pos_y" DECIMAL(10, 2),
  -- ③ 용량 [1차: 입력만] (저장은 cm·kg)
  ADD COLUMN "width_cm" DECIMAL(8, 2),
  ADD COLUMN "depth_cm" DECIMAL(8, 2),
  ADD COLUMN "height_cm" DECIMAL(8, 2),
  ADD COLUMN "max_cbm" DECIMAL(10, 4),
  ADD COLUMN "max_weight_kg" DECIMAL(10, 2),
  ADD COLUMN "max_pallet_cnt" INTEGER,
  -- ④ 운영 속성 [1차] (NULL = 창고 값을 따름)
  ADD COLUMN "inbound_yn" CHAR(1),
  ADD COLUMN "outbound_yn" CHAR(1),
  ADD COLUMN "allocatable_yn" CHAR(1),
  ADD COLUMN "mix_item_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "mix_lot_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "mix_client_yn" CHAR(1) NOT NULL DEFAULT 'N',
  ADD COLUMN "putaway_seq" INTEGER,
  ADD COLUMN "pick_seq" INTEGER,
  -- ⑤ 잠금·관리 [2차]
  ADD COLUMN "lock_yn" CHAR(1) NOT NULL DEFAULT 'N',
  ADD COLUMN "lock_reason_cd" VARCHAR(20),
  ADD COLUMN "lock_at" TIMESTAMP(3),
  ADD COLUMN "abc_class_cd" VARCHAR(5),
  ADD COLUMN "dedicated_shipper_id" BIGINT,
  ADD COLUMN "check_digit" VARCHAR(4),
  ADD COLUMN "last_count_dt" DATE,
  -- ⑥ 확장
  ADD COLUMN "ext_attr" JSONB;

-- ── 3) 기존 데이터 보정 ───────────────────────────────────────
-- 센터 키 = 창고의 센터
UPDATE "tb_location" l SET "center_id" = w."center_id" FROM "tb_warehouse" w WHERE w."warehouse_id" = l."warehouse_id";
ALTER TABLE "tb_location" ALTER COLUMN "center_id" SET NOT NULL;

-- 구역: 창고마다 쓰던 구역 글자로 구역을 만든다 (이름 = 'A구역', 정렬순서 = 글자 순)
INSERT INTO "tb_zone" ("operator_id", "center_id", "warehouse_id", "zone_cd", "zone_nm", "sort_seq", "updated_at")
SELECT w."operator_id", w."center_id", w."warehouse_id", z."zone_cd", z."zone_cd" || '구역',
       (ROW_NUMBER() OVER (PARTITION BY w."warehouse_id" ORDER BY z."zone_cd"))::int * 10, now()
FROM (SELECT DISTINCT "warehouse_id", "zone_cd" FROM "tb_location" WHERE "zone_cd" IS NOT NULL) z
JOIN "tb_warehouse" w ON w."warehouse_id" = z."warehouse_id";
UPDATE "tb_location" l SET "zone_id" = z."zone_id"
  FROM "tb_zone" z WHERE z."warehouse_id" = l."warehouse_id" AND z."zone_cd" = l."zone_cd";
DROP INDEX IF EXISTS "tb_location_warehouse_id_zone_cd_idx";
ALTER TABLE "tb_location" DROP COLUMN "zone_cd";

-- 명칭이 코드와 같으면(대부분, 0071 기본값) 설명은 비운다
UPDATE "tb_location" SET "description" = NULL WHERE "description" = "location_cd" OR "description" = '';

-- 시스템 기본 창고의 DEFAULT 로케이션 = 시스템 기본 로케이션 (작업대기 유형)
UPDATE "tb_location" l SET "system_yn" = 'Y', "loc_type_cd" = 'STAGING'
  FROM "tb_warehouse" w
  WHERE w."warehouse_id" = l."warehouse_id" AND w."system_yn" = 'Y' AND l."location_cd" = 'DEFAULT';

-- ── 4) 검사 조건·인덱스·외래 키 ────────────────────────────────
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_location_cd_check" CHECK ("location_cd" ~ '^[A-Z0-9-]{1,30}$');
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_status_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_yn_check" CHECK (
  "system_yn" IN ('Y', 'N') AND "mix_item_yn" IN ('Y', 'N') AND "mix_lot_yn" IN ('Y', 'N')
  AND "mix_client_yn" IN ('Y', 'N') AND "lock_yn" IN ('Y', 'N')
  AND ("inbound_yn" IS NULL OR "inbound_yn" IN ('Y', 'N'))
  AND ("outbound_yn" IS NULL OR "outbound_yn" IN ('Y', 'N'))
  AND ("allocatable_yn" IS NULL OR "allocatable_yn" IN ('Y', 'N'))
);
-- 시스템 기본 로케이션은 늘 사용 중
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_system_check" CHECK ("system_yn" = 'N' OR "status_cd" = 'ACTIVE');
-- 잠그면 사유 필수
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_lock_check" CHECK ("lock_yn" = 'N' OR "lock_reason_cd" IS NOT NULL);
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_numbers_check" CHECK (
  ("width_cm" IS NULL OR "width_cm" >= 0) AND ("depth_cm" IS NULL OR "depth_cm" >= 0)
  AND ("height_cm" IS NULL OR "height_cm" >= 0) AND ("max_cbm" IS NULL OR "max_cbm" >= 0)
  AND ("max_weight_kg" IS NULL OR "max_weight_kg" >= 0) AND ("max_pallet_cnt" IS NULL OR "max_pallet_cnt" >= 0)
  AND ("putaway_seq" IS NULL OR "putaway_seq" >= 0) AND ("pick_seq" IS NULL OR "pick_seq" >= 0)
);

-- 코드 중복 금지(창고 단위) 인덱스는 칸 정렬이 바뀌었으니 다시 만든다
DROP INDEX "tb_location_warehouse_id_location_cd_key";
CREATE UNIQUE INDEX "tb_location_warehouse_id_location_cd_key" ON "tb_location" ("warehouse_id", "location_cd") WHERE "del_yn" = 'N';
-- 센터 안 코드 앞부분·범위 검색 (C 정렬이라 LIKE 'A-01%'도 이 인덱스를 쓴다)
CREATE INDEX "tb_location_center_id_location_cd_idx" ON "tb_location" ("center_id", "location_cd");
CREATE INDEX "tb_location_warehouse_id_zone_id_status_cd_idx" ON "tb_location" ("warehouse_id", "zone_id", "status_cd");
CREATE INDEX "tb_location_center_id_status_cd_del_yn_idx" ON "tb_location" ("center_id", "status_cd", "del_yn");
CREATE INDEX "tb_location_zone_id_idx" ON "tb_location" ("zone_id");

ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_center_id_fkey"
  FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_zone_id_fkey"
  FOREIGN KEY ("zone_id") REFERENCES "tb_zone"("zone_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_location" ADD CONSTRAINT "tb_location_dedicated_shipper_id_fkey"
  FOREIGN KEY ("dedicated_shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 5) 공통코드 (이미 있는 운영사에 추가, 새 운영사는 src/config/defaults/codes.ts에서 복사) ──
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", g.code, g.name, g.description,
       COALESCE((SELECT MAX(x."sort_seq") FROM "tb_code_group" x WHERE x."operator_id" = o."operator_id"), 0) + g.seq, 'Y', now()
FROM "tb_operator" o
CROSS JOIN (VALUES ('ZONE_TYPE', '구역 유형', '창고 안 구역의 운영 방식', 10),
                   ('LOC_TYPE', '로케이션 유형', '로케이션(보관 칸)의 형태', 20),
                   ('LOCK_REASON', '로케이션 잠금 사유', '로케이션을 잠근 이유', 30),
                   ('ABC_CLASS', '회전 등급', '로케이션 회전 등급 (적치 추천용)', 40)) AS g(code, name, description, seq)
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" x
                  WHERE x."operator_id" = o."operator_id" AND x."group_cd" = g.code AND x."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "group_id", "code_item_cd", "code_item_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."group_id", v.code, v.name, v.seq, now()
FROM "tb_code_group" g
JOIN (VALUES ('ZONE_TYPE', 'STORAGE', '보관', 10), ('ZONE_TYPE', 'PICKING', '피킹', 20),
             ('ZONE_TYPE', 'RESERVE', '벌크·예비', 30), ('ZONE_TYPE', 'STAGING', '작업대기', 40),
             ('ZONE_TYPE', 'VAS', '유통가공', 50), ('ZONE_TYPE', 'ETC', '기타', 60),
             ('LOC_TYPE', 'RACK', '랙', 10), ('LOC_TYPE', 'FLOOR', '평치', 20), ('LOC_TYPE', 'SHELF', '선반', 30),
             ('LOC_TYPE', 'BIN', '빈·소형칸', 40), ('LOC_TYPE', 'DOCK', '도크', 50),
             ('LOC_TYPE', 'STAGING', '작업대기', 60), ('LOC_TYPE', 'VIRTUAL', '가상', 70),
             ('LOCK_REASON', 'COUNT', '재고 실사', 10), ('LOCK_REASON', 'DAMAGE', '설비 파손', 20),
             ('LOCK_REASON', 'INSPECTION', '점검', 30), ('LOCK_REASON', 'ETC', '기타', 40),
             ('ABC_CLASS', 'A', 'A', 10), ('ABC_CLASS', 'B', 'B', 20), ('ABC_CLASS', 'C', 'C', 30))
  AS v(grp, code, name, seq) ON v.grp = g."group_cd"
WHERE g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."group_id" = g."group_id" AND i."code_item_cd" = v.code AND i."del_yn" = 'N');
