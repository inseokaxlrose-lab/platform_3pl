-- 공통코드 STORAGE_METHOD 보관 방식 (창고 [2차] 칸, 0074)
-- 이미 있는 운영사에 추가, 새 운영사는 src/config/defaults/codes.ts에서 복사
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", 'STORAGE_METHOD', '보관 방식', '창고의 주된 보관 방식',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'STORAGE_METHOD' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "group_id", "code_item_cd", "code_item_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."group_id", v.code, v.name, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('RACK', '랙', 10), ('FLOOR', '평치', 20), ('SHELF', '선반', 30),
                   ('MEZZANINE', '복층', 40), ('AUTO', '자동화 설비', 50)) AS v(code, name, seq)
WHERE g."group_cd" = 'STORAGE_METHOD' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."group_id" = g."group_id" AND i."code_item_cd" = v.code AND i."del_yn" = 'N');
