-- 단위 기준정보 정의서 반영 (docs/decisions/0078, docs/specs/unit.md)
-- - 시스템 기본 단위는 operator_id 없이 한 벌 (모든 운영사가 함께 본다). 운영사는 추가 단위만 갖는다
-- - 종류 BASE/PACK → 유형 QTY·PACK·WEIGHT·VOLUME·LENGTH·AREA, 물리 단위는 기준단위 × 환산계수
-- - 운영사마다 있던 복사본은 같은 코드의 시스템 단위로 참조를 옮기고 지운다 (CARTON처럼 목록에 없는 것은 운영사 단위로 남김)
-- - 외부 코드 매핑은 운영사마다 따로 (공유 시스템 단위도 운영사별 외부 코드)

-- 1) 유형과 새 칸 (유형은 기존 줄을 채운 뒤 필수로)
CREATE TYPE "UnitType" AS ENUM ('QTY', 'PACK', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA');

ALTER TABLE "tb_unit"
  ALTER COLUMN "operator_id" DROP NOT NULL,
  ADD COLUMN "unit_type_cd" "UnitType",
  ADD COLUMN "unit_nm_en" VARCHAR(50),
  ADD COLUMN "print_nm" VARCHAR(20),
  ADD COLUMN "base_yn" CHAR(1) NOT NULL DEFAULT 'N',
  ADD COLUMN "base_unit_id" BIGINT,
  ADD COLUMN "base_factor" DECIMAL(20,10),
  ADD COLUMN "std_unit_cd" VARCHAR(10),
  ADD COLUMN "description" VARCHAR(200),
  ADD COLUMN "ext_attr" JSONB,
  ADD COLUMN "remark" VARCHAR(1000);

ALTER TABLE "tb_unit" ADD CONSTRAINT "tb_unit_base_unit_id_fkey"
  FOREIGN KEY ("base_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 기존 운영사 단위의 유형: 환산단위 → PACK, 기본단위는 코드로 (나머지는 수량)
UPDATE "tb_unit" SET "unit_type_cd" = CASE
  WHEN "unit_kind_cd" = 'PACK' THEN 'PACK'
  WHEN "unit_cd" IN ('KG', 'G', 'TON', 'LB') THEN 'WEIGHT'
  WHEN "unit_cd" IN ('L', 'ML', 'CBM') THEN 'VOLUME'
  WHEN "unit_cd" IN ('M', 'CM', 'MM', 'INCH') THEN 'LENGTH'
  WHEN "unit_cd" = 'M2' THEN 'AREA'
  ELSE 'QTY'
END::"UnitType";

-- 옛 종류 칸 제거 (유형으로 옮겼다)
ALTER TABLE "tb_unit" DROP COLUMN "unit_kind_cd";
DROP TYPE "UnitKind";

-- 2) 시스템 기본 단위 20개 (표준코드: UN/ECE Rec.20 — 포장은 Rec.21 코드 앞에 X)
--    기준단위 먼저 (EA·KG·L·M·M2), 다음에 기준단위를 가리키는 단위
INSERT INTO "tb_unit"
  ("operator_id", "unit_cd", "unit_nm", "unit_nm_en", "unit_type_cd", "decimal_cnt", "sort_seq",
   "system_yn", "base_yn", "base_factor", "std_unit_cd", "created_by", "updated_by", "updated_at")
VALUES
  (NULL, 'EA',  '개',        'Each',         'QTY',    0,  10, 'Y', 'Y', 1, 'EA',  'system', 'system', now()),
  (NULL, 'SET', '세트',      'Set',          'QTY',    0,  20, 'Y', 'N', NULL, 'SET', 'system', 'system', now()),
  (NULL, 'PAIR','켤레',      'Pair',         'QTY',    0,  30, 'Y', 'N', NULL, 'PR',  'system', 'system', now()),
  (NULL, 'BOX', '박스',      'Box',          'PACK',   0, 110, 'Y', 'N', NULL, 'XBX', 'system', 'system', now()),
  (NULL, 'PACK','팩',        'Pack',         'PACK',   0, 120, 'Y', 'N', NULL, 'XPK', 'system', 'system', now()),
  (NULL, 'BAG', '포대',      'Bag',          'PACK',   0, 130, 'Y', 'N', NULL, 'XBG', 'system', 'system', now()),
  (NULL, 'BDL', '묶음',      'Bundle',       'PACK',   0, 140, 'Y', 'N', NULL, 'XBE', 'system', 'system', now()),
  (NULL, 'PLT', '팔레트',    'Pallet',       'PACK',   0, 150, 'Y', 'N', NULL, 'XPX', 'system', 'system', now()),
  (NULL, 'KG',  '킬로그램',  'Kilogram',     'WEIGHT', 3, 210, 'Y', 'Y', 1, 'KGM', 'system', 'system', now()),
  (NULL, 'L',   '리터',      'Litre',        'VOLUME', 3, 310, 'Y', 'Y', 1, 'LTR', 'system', 'system', now()),
  (NULL, 'M',   '미터',      'Metre',        'LENGTH', 3, 410, 'Y', 'Y', 1, 'MTR', 'system', 'system', now()),
  (NULL, 'M2',  '제곱미터',  'Square metre', 'AREA',   2, 510, 'Y', 'Y', 1, 'MTK', 'system', 'system', now());

INSERT INTO "tb_unit"
  ("operator_id", "unit_cd", "unit_nm", "unit_nm_en", "unit_type_cd", "decimal_cnt", "sort_seq",
   "system_yn", "base_yn", "base_unit_id", "base_factor", "std_unit_cd", "created_by", "updated_by", "updated_at")
SELECT NULL, v.code, v.name, v.name_en, v.type::"UnitType", v.decimals, v.sort_seq, 'Y', 'N', b."unit_id", v.factor, v.std,
       'system', 'system', now()
FROM (VALUES
  ('G',    '그램',       'Gram',        'WEIGHT', 0, 220, 'KG', 0.001,      'GRM'),
  ('TON',  '톤',         'Tonne',       'WEIGHT', 3, 230, 'KG', 1000,       'TNE'),
  ('LB',   '파운드',     'Pound',       'WEIGHT', 3, 240, 'KG', 0.45359237, 'LBR'),
  ('ML',   '밀리리터',   'Millilitre',  'VOLUME', 0, 320, 'L',  0.001,      'MLT'),
  ('CBM',  '세제곱미터', 'Cubic metre', 'VOLUME', 4, 330, 'L',  1000,       'MTQ'),
  ('CM',   '센티미터',   'Centimetre',  'LENGTH', 1, 420, 'M',  0.01,       'CMT'),
  ('MM',   '밀리미터',   'Millimetre',  'LENGTH', 0, 430, 'M',  0.001,      'MMT'),
  ('INCH', '인치',       'Inch',        'LENGTH', 2, 440, 'M',  0.0254,     'INH')
) AS v(code, name, name_en, type, decimals, sort_seq, base_code, factor, std)
JOIN "tb_unit" b ON b."unit_cd" = v.base_code AND b."operator_id" IS NULL;

-- 3) 운영사 복사본 → 같은 코드의 시스템 단위로 참조를 옮긴다 (품목 기본단위·품목 환산단위·외부 코드)
CREATE TEMP TABLE unit_move AS
SELECT o."unit_id" AS old_id, s."unit_id" AS new_id
FROM "tb_unit" o
JOIN "tb_unit" s ON s."unit_cd" = o."unit_cd" AND s."operator_id" IS NULL
WHERE o."operator_id" IS NOT NULL;

UPDATE "tb_item" i SET "base_unit_id" = m.new_id FROM unit_move m WHERE i."base_unit_id" = m.old_id;
UPDATE "tb_item_unit" iu SET "unit_id" = m.new_id FROM unit_move m WHERE iu."unit_id" = m.old_id;
UPDATE "tb_ext_code" e SET "entity_id" = m.new_id
FROM unit_move m WHERE e."entity_type_cd" = 'UNIT' AND e."entity_id" = m.old_id;

-- 옮긴 복사본은 지운다 (참조가 없으므로 실제 삭제). 남는 운영사 단위(CARTON 등)는 시스템 표시를 뗀다
DELETE FROM "tb_unit" u USING unit_move m WHERE u."unit_id" = m.old_id;
UPDATE "tb_unit" SET "system_yn" = 'N' WHERE "operator_id" IS NOT NULL;
DROP TABLE unit_move;

-- 4) 유형을 필수로
ALTER TABLE "tb_unit" ALTER COLUMN "unit_type_cd" SET NOT NULL;

-- 5) 코드 중복·기준단위 (부분 인덱스), 검사 조건
CREATE UNIQUE INDEX "tb_unit_system_unit_cd_key" ON "tb_unit"("unit_cd") WHERE (operator_id IS NULL AND del_yn = 'N');
CREATE UNIQUE INDEX "tb_unit_type_base_key" ON "tb_unit"("unit_type_cd") WHERE (base_yn = 'Y' AND operator_id IS NULL);
CREATE INDEX "tb_unit_operator_id_status_cd_idx" ON "tb_unit"("operator_id", "status_cd");
CREATE INDEX "tb_unit_unit_type_cd_idx" ON "tb_unit"("unit_type_cd");

ALTER TABLE "tb_unit"
  -- 시스템 단위 ⇔ 운영사 없음
  ADD CONSTRAINT "tb_unit_system_matches_operator" CHECK (("system_yn" = 'Y') = ("operator_id" IS NULL)),
  ADD CONSTRAINT "tb_unit_decimal_range" CHECK ("decimal_cnt" BETWEEN 0 AND 6),
  ADD CONSTRAINT "tb_unit_base_factor_positive" CHECK ("base_factor" IS NULL OR "base_factor" > 0),
  -- 기준단위는 시스템 단위만, 자기 자신이 기준(계수 1, 가리키는 기준단위 없음)
  ADD CONSTRAINT "tb_unit_base_is_system" CHECK ("base_yn" = 'N' OR ("operator_id" IS NULL AND "base_factor" = 1 AND "base_unit_id" IS NULL)),
  -- 포장 단위는 환산계수·기준단위를 절대 두지 않는다 (품목별 입수량)
  ADD CONSTRAINT "tb_unit_pack_no_factor" CHECK ("unit_type_cd" <> 'PACK' OR ("base_factor" IS NULL AND "base_unit_id" IS NULL AND "base_yn" = 'N')),
  -- 수량 단위는 기준단위(EA) 외에 환산계수 없음 (SET·PAIR 환산은 품목에서)
  ADD CONSTRAINT "tb_unit_qty_no_factor" CHECK ("unit_type_cd" <> 'QTY' OR "base_yn" = 'Y' OR ("base_factor" IS NULL AND "base_unit_id" IS NULL)),
  -- 물리 단위(기준단위 아님)는 기준단위·환산계수 필수 (예: 근 = 0.6 KG)
  ADD CONSTRAINT "tb_unit_physical_factor" CHECK (
    "unit_type_cd" NOT IN ('WEIGHT', 'VOLUME', 'LENGTH', 'AREA') OR "base_yn" = 'Y'
    OR ("base_factor" IS NOT NULL AND "base_unit_id" IS NOT NULL));

-- 6) 외부 코드: 운영사마다 따로 (공유 시스템 단위도 운영사별로 매핑)
DROP INDEX "tb_ext_code_ext_system_cd_entity_type_cd_entity_id_key";
CREATE UNIQUE INDEX "tb_ext_code_operator_id_ext_system_cd_entity_type_cd_entity_key" ON "tb_ext_code"("operator_id", "ext_system_cd", "entity_type_cd", "entity_id");
