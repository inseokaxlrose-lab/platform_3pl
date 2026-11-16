-- 외부코드 매핑 메뉴 권한 (docs/decisions/0068)
-- 새 운영사는 등록 때 기본 권한그룹을 복사하지만, 이미 있는 운영사의 권한그룹에는 새 메뉴 권한이 없다
-- → 지우지 않은 기본 권한그룹에만 넣는다 (사용자가 만든 그룹은 운영사 관리자가 직접 고른다)
-- 여러 번 실행돼도 같은 결과 (이미 있으면 건너뜀)

-- 슈퍼 관리자: 조회·수정·엑셀
INSERT INTO "tb_perm_group_perm" ("group_id", "perm_cd")
SELECT g."perm_group_id", c.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('master.external-codes.read'), ('master.external-codes.update'), ('master.external-codes.export')) AS c(code)
WHERE g."perm_group_nm" = '슈퍼 관리자' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;

-- 센터 운영자: 품목·거래처 화면에서 고치던 외부코드를 이 메뉴에서 (조회·수정·엑셀)
INSERT INTO "tb_perm_group_perm" ("group_id", "perm_cd")
SELECT g."perm_group_id", c.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('master.external-codes.read'), ('master.external-codes.update'), ('master.external-codes.export')) AS c(code)
WHERE g."perm_group_nm" = '센터 운영자' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
