-- 권역설정 (우편번호 → 배송센터) · 지역 마스터 · 주소 정제 캐시 (docs/specs/region.md, docs/decisions/0076)
-- 1) 지역 마스터 (운영사 공통, operator_id 없음, 적재 스크립트로만 갱신): 법정동 · 우편번호 · 우편번호↔법정동 · 적재 이력
-- 2) 권역 배정 (운영사별): 우편번호+온도대 → 센터 배정표 · 변경 작업 단위 · 배정 변경 이력
-- 3) 주소 정제 캐시 (운영사 공통)
-- 4) 운영사 설정: 자동 지정 허용 정제 등급 region_auto_grade
-- 구우편번호(6자리) 대조표 tb_region_old_zip은 공식 자료를 구할 수 없어 만들지 않는다 (0076)
-- 기존 배송권역(tb_delivery_zone·tb_delivery_zone_region)은 새 권역설정 화면이 대신하는 3단계에서 지운다

-- ── 1) 지역 마스터 ────────────────────────────────────────────
-- 적재 이력: 적재 한 번 = 한 줄 (버전 = 기준 데이터 연월, 예: 202611)
CREATE TABLE "tb_region_load_hist" (
  "load_id" BIGSERIAL NOT NULL,
  "load_ver" VARCHAR(20) NOT NULL,
  "source_nm" VARCHAR(500) NOT NULL,
  "load_type_cd" VARCHAR(10) NOT NULL,
  "status_cd" VARCHAR(10) NOT NULL DEFAULT 'RUNNING',
  "bjd_cnt" INTEGER NOT NULL DEFAULT 0,
  "zip_cnt" INTEGER NOT NULL DEFAULT 0,
  "new_cnt" INTEGER NOT NULL DEFAULT 0,
  "changed_cnt" INTEGER NOT NULL DEFAULT 0,
  "abolished_cnt" INTEGER NOT NULL DEFAULT 0,
  "error_msg" VARCHAR(2000),
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  CONSTRAINT "tb_region_load_hist_pkey" PRIMARY KEY ("load_id"),
  CONSTRAINT "tb_region_load_hist_type_check" CHECK ("load_type_cd" IN ('FULL', 'DELTA')),
  CONSTRAINT "tb_region_load_hist_status_check" CHECK ("status_cd" IN ('RUNNING', 'DONE', 'FAILED'))
);

-- 법정동: 시도2 + 시군구3 + 읍면동3 + 리2 (단계 1 시도 ~ 4 리)
CREATE TABLE "tb_region_bjd" (
  "bjd_cd" CHAR(10) NOT NULL,
  "sido_cd" CHAR(2) NOT NULL,
  "sido_nm" VARCHAR(30) NOT NULL,
  "sigungu_cd" CHAR(5) NOT NULL,
  "sigungu_nm" VARCHAR(50) NOT NULL DEFAULT '',
  "emd_nm" VARCHAR(50),
  "ri_nm" VARCHAR(50),
  "bjd_level" SMALLINT NOT NULL,
  "abolished_yn" CHAR(1) NOT NULL DEFAULT 'N',
  "abolished_dt" DATE,
  "load_ver" VARCHAR(20) NOT NULL,
  CONSTRAINT "tb_region_bjd_pkey" PRIMARY KEY ("bjd_cd"),
  CONSTRAINT "tb_region_bjd_cd_check" CHECK ("bjd_cd" ~ '^[0-9]{10}$'),
  CONSTRAINT "tb_region_bjd_level_check" CHECK ("bjd_level" BETWEEN 1 AND 4),
  CONSTRAINT "tb_region_bjd_yn_check" CHECK ("abolished_yn" IN ('Y', 'N'))
);
CREATE INDEX "tb_region_bjd_sigungu_cd_idx" ON "tb_region_bjd" ("sigungu_cd");
CREATE INDEX "tb_region_bjd_sido_cd_idx" ON "tb_region_bjd" ("sido_cd");

-- 우편번호 (5자리 기초구역번호)
CREATE TABLE "tb_region_zip" (
  "zip_cd" CHAR(5) NOT NULL,
  "sido_cd" CHAR(2) NOT NULL,
  "sigungu_cd" CHAR(5) NOT NULL,
  "rep_addr" VARCHAR(200),
  "addr_cnt" INTEGER,
  "abolished_yn" CHAR(1) NOT NULL DEFAULT 'N',
  "first_load_ver" VARCHAR(20) NOT NULL,
  "last_load_ver" VARCHAR(20) NOT NULL,
  CONSTRAINT "tb_region_zip_pkey" PRIMARY KEY ("zip_cd"),
  CONSTRAINT "tb_region_zip_cd_check" CHECK ("zip_cd" ~ '^[0-9]{5}$'),
  CONSTRAINT "tb_region_zip_yn_check" CHECK ("abolished_yn" IN ('Y', 'N'))
);
CREATE INDEX "tb_region_zip_sigungu_cd_idx" ON "tb_region_zip" ("sigungu_cd");

-- 우편번호 ↔ 법정동 (N:M, 한 우편번호가 2개 이상 법정동에 걸치면 "경계 우편번호")
CREATE TABLE "tb_region_zip_bjd" (
  "zip_cd" CHAR(5) NOT NULL,
  "bjd_cd" CHAR(10) NOT NULL,
  "addr_cnt" INTEGER,
  CONSTRAINT "tb_region_zip_bjd_pkey" PRIMARY KEY ("zip_cd", "bjd_cd"),
  CONSTRAINT "tb_region_zip_bjd_zip_cd_fkey" FOREIGN KEY ("zip_cd") REFERENCES "tb_region_zip"("zip_cd") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "tb_region_zip_bjd_bjd_cd_fkey" FOREIGN KEY ("bjd_cd") REFERENCES "tb_region_bjd"("bjd_cd") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tb_region_zip_bjd_bjd_cd_idx" ON "tb_region_zip_bjd" ("bjd_cd");

-- ── 2) 권역 배정 (운영사별) ─────────────────────────────────────
-- 변경 작업 단위: 사용자 작업 한 번(지역 선택 지정·붙여넣기·업로드 등) = 한 줄
CREATE TABLE "tb_region_change_batch" (
  "batch_id" BIGSERIAL NOT NULL,
  "operator_id" BIGINT NOT NULL,
  "change_type_cd" VARCHAR(20) NOT NULL,
  "scope_desc" VARCHAR(500) NOT NULL,
  "temp_zone_cd" VARCHAR(20) NOT NULL DEFAULT 'ALL',
  "target_center_id" BIGINT,
  "changed_cnt" INTEGER NOT NULL DEFAULT 0,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  CONSTRAINT "tb_region_change_batch_pkey" PRIMARY KEY ("batch_id"),
  CONSTRAINT "tb_region_change_batch_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_change_batch_target_center_id_fkey" FOREIGN KEY ("target_center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_change_batch_type_check" CHECK ("change_type_cd" IN ('TREE_ASSIGN', 'GRID_ASSIGN', 'PASTE', 'UPLOAD', 'UNASSIGN', 'SUGGEST', 'CONFIRM')),
  CONSTRAINT "tb_region_change_batch_temp_zone_check" CHECK ("temp_zone_cd" IN ('ALL', 'AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))
);
CREATE INDEX "tb_region_change_batch_operator_id_created_at_idx" ON "tb_region_change_batch" ("operator_id", "created_at");

-- 배정표: 운영사 안에서 우편번호 + 온도대 하나에 센터 하나 (배정이 없으면 미배정 = 행 없음)
CREATE TABLE "tb_region_center_map" (
  "map_id" BIGSERIAL NOT NULL,
  "operator_id" BIGINT NOT NULL,
  "zip_cd" CHAR(5) NOT NULL,
  "temp_zone_cd" VARCHAR(20) NOT NULL DEFAULT 'ALL',
  "center_id" BIGINT NOT NULL,
  "assign_type_cd" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  "confirm_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  "last_batch_id" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  "row_version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "tb_region_center_map_pkey" PRIMARY KEY ("map_id"),
  CONSTRAINT "tb_region_center_map_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_center_map_zip_cd_fkey" FOREIGN KEY ("zip_cd") REFERENCES "tb_region_zip"("zip_cd") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_center_map_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_center_map_last_batch_id_fkey" FOREIGN KEY ("last_batch_id") REFERENCES "tb_region_change_batch"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_center_map_temp_zone_check" CHECK ("temp_zone_cd" IN ('ALL', 'AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT')),
  CONSTRAINT "tb_region_center_map_assign_type_check" CHECK ("assign_type_cd" IN ('MANUAL', 'SUGGESTED', 'UPLOAD')),
  CONSTRAINT "tb_region_center_map_confirm_check" CHECK ("confirm_yn" IN ('Y', 'N'))
);
-- 중복 배정을 DB에서 원천 차단
CREATE UNIQUE INDEX "tb_region_center_map_operator_zip_temp_key" ON "tb_region_center_map" ("operator_id", "zip_cd", "temp_zone_cd");
CREATE INDEX "tb_region_center_map_operator_id_center_id_idx" ON "tb_region_center_map" ("operator_id", "center_id");
CREATE INDEX "tb_region_center_map_operator_id_confirm_yn_idx" ON "tb_region_center_map" ("operator_id", "confirm_yn");

-- 배정 변경 이력: 우편번호마다 전·후 센터 (NULL = 미배정). "그날 기준 배송센터" 조회·작업 단위 되돌리기(2차)용
CREATE TABLE "tb_region_center_map_hist" (
  "hist_id" BIGSERIAL NOT NULL,
  "batch_id" BIGINT NOT NULL,
  "operator_id" BIGINT NOT NULL,
  "zip_cd" CHAR(5) NOT NULL,
  "temp_zone_cd" VARCHAR(20) NOT NULL,
  "before_center_id" BIGINT,
  "after_center_id" BIGINT,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tb_region_center_map_hist_pkey" PRIMARY KEY ("hist_id"),
  CONSTRAINT "tb_region_center_map_hist_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tb_region_change_batch"("batch_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tb_region_center_map_hist_change_check" CHECK ("before_center_id" IS DISTINCT FROM "after_center_id")
);
CREATE INDEX "tb_region_center_map_hist_batch_id_idx" ON "tb_region_center_map_hist" ("batch_id");
-- 특정 날짜 기준 조회: 운영사 + 우편번호 + 온도대 + 시각
CREATE INDEX "tb_region_center_map_hist_lookup_idx" ON "tb_region_center_map_hist" ("operator_id", "zip_cd", "temp_zone_cd", "changed_at");

-- ── 3) 주소 정제 캐시 (운영사 공통) ──────────────────────────────
CREATE TABLE "tb_address_norm_cache" (
  "addr_hash" CHAR(64) NOT NULL,
  "raw_addr" VARCHAR(500) NOT NULL,
  "grade" CHAR(1) NOT NULL,
  "method_cd" VARCHAR(20) NOT NULL,
  "zip_cd" CHAR(5),
  "bjd_cd" CHAR(10),
  "sigungu_cd" CHAR(5),
  "sido_cd" CHAR(2),
  "road_addr" VARCHAR(300),
  "jibun_addr" VARCHAR(300),
  "bd_mgt_sn" VARCHAR(30),
  "addr_load_ver" VARCHAR(20),
  "hit_cnt" INTEGER NOT NULL DEFAULT 0,
  "last_hit_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tb_address_norm_cache_pkey" PRIMARY KEY ("addr_hash"),
  CONSTRAINT "tb_address_norm_cache_grade_check" CHECK ("grade" IN ('A', 'B', 'C', 'D', 'F'))
);

-- ── 4) 운영사: 자동 지정 허용 정제 등급 (기본 D = D 이상 자동) ───────────
ALTER TABLE "tb_operator" ADD COLUMN "region_auto_grade" CHAR(1) NOT NULL DEFAULT 'D';
ALTER TABLE "tb_operator" ADD CONSTRAINT "tb_operator_region_auto_grade_check"
  CHECK ("region_auto_grade" IN ('A', 'B', 'C', 'D'));
