-- 권한 코드 integration.api-keys (0081): 기존 운영사의 "슈퍼 관리자" 그룹에만 (운영사 관리자 전용)
-- 새 운영사는 src/config/defaults/roles.ts(슈퍼 관리자 = 운영사 화면 모든 권한)에서 복사된다
INSERT INTO "tb_perm_group_perm" ("group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('integration.api-keys.read'), ('integration.api-keys.create'),
                   ('integration.api-keys.update')) AS v(code)
WHERE g."perm_group_nm" = '슈퍼 관리자' AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
