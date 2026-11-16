-- 센터 기본 창고 3개 + 기본 로케이션 연결 보정 (docs/decisions/0073)
-- 앞 파일에서 추가한 창고 유형(OUTBOUND_STAGING·RETURN_STAGING)은 같은 트랜잭션에서 쓸 수 없어 파일을 나눈다
-- 규칙은 ensureCenterDefaults와 같다: 유형별 창고가 없을 때만 만들고, 그 안에 DEFAULT 로케이션이 없을 때만 만든다
-- 창고 시스템 코드는 앱과 같은 시퀀스(system_code_warehouse_seq)로 'WH' + 6자리

-- 1) 출고대기·반품대기 창고 (지운 센터 제외). 같은 코드를 일반 창고가 이미 쓰고 있으면 코드 뒤에 _STG
INSERT INTO "tb_warehouse" ("operator_id", "center_id", "sys_cd", "warehouse_cd", "warehouse_nm", "warehouse_type_cd", "updated_at")
SELECT c."operator_id", c."center_id",
       'WH' || LPAD(nextval('"system_code_warehouse_seq"')::text, 6, '0'),
       CASE WHEN EXISTS (SELECT 1 FROM "tb_warehouse" w2
                         WHERE w2."center_id" = c."center_id" AND w2."warehouse_cd" = t.code AND w2."del_yn" = 'N')
            THEN t.code || '_STG' ELSE t.code END,
       t.name, t.type::"WarehouseType", now()
FROM "tb_center" c
CROSS JOIN (VALUES ('OUTBOUND', '출고대기', 'OUTBOUND_STAGING'), ('RETURN', '반품대기', 'RETURN_STAGING')) AS t(code, name, type)
WHERE c."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_warehouse" w
                  WHERE w."center_id" = c."center_id" AND w."warehouse_type_cd" = t.type::"WarehouseType");

-- 2) 대기 창고 3종마다 DEFAULT 로케이션 (명칭 = 코드, 0071)
INSERT INTO "tb_location" ("operator_id", "warehouse_id", "location_cd", "location_nm", "updated_at")
SELECT w."operator_id", w."warehouse_id", 'DEFAULT', 'DEFAULT', now()
FROM "tb_warehouse" w
WHERE w."warehouse_type_cd" IN ('INBOUND_STAGING', 'OUTBOUND_STAGING', 'RETURN_STAGING')
  AND NOT EXISTS (SELECT 1 FROM "tb_location" l
                  WHERE l."warehouse_id" = w."warehouse_id" AND l."location_cd" = 'DEFAULT' AND l."del_yn" = 'N');

-- 3) 센터의 기본 로케이션 3개 연결 (비어 있을 때만)
UPDATE "tb_center" c SET
  "default_inbound_loc_id"  = COALESCE(c."default_inbound_loc_id",  d.inbound),
  "default_outbound_loc_id" = COALESCE(c."default_outbound_loc_id", d.outbound),
  "default_return_loc_id"   = COALESCE(c."default_return_loc_id",   d.ret)
FROM (
  SELECT w."center_id",
         MAX(l."location_id") FILTER (WHERE w."warehouse_type_cd" = 'INBOUND_STAGING')  AS inbound,
         MAX(l."location_id") FILTER (WHERE w."warehouse_type_cd" = 'OUTBOUND_STAGING') AS outbound,
         MAX(l."location_id") FILTER (WHERE w."warehouse_type_cd" = 'RETURN_STAGING')   AS ret
  FROM "tb_warehouse" w
  JOIN "tb_location" l ON l."warehouse_id" = w."warehouse_id" AND l."location_cd" = 'DEFAULT' AND l."del_yn" = 'N'
  WHERE w."del_yn" = 'N'
  GROUP BY w."center_id"
) d
WHERE c."center_id" = d."center_id";
