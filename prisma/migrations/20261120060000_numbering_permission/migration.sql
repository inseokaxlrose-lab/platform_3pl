-- 권한 코드 system.numbering (체번 규칙 관리, 0085): 기존 운영사의 "슈퍼 관리자" 그룹에만 (운영사 관리자 전용)
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('system.numbering.read'), ('system.numbering.update')) AS v(code)
WHERE g."perm_group_nm" = '슈퍼 관리자' AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
