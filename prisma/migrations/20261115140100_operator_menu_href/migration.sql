-- M2.5 4단계: 운영사 화면 주소 변경 /admin/master/company → /admin/master/operator (0040)
-- 사이드바 즐겨찾기는 메뉴 주소로 저장되므로 함께 옮긴다 (이미 새 주소가 있으면 예전 것은 지운다)
DELETE FROM "tb_user_favorite_menu" f
WHERE f."menu_href" = '/admin/master/company'
  AND EXISTS (
    SELECT 1 FROM "tb_user_favorite_menu" n
    WHERE n."user_id" = f."user_id" AND n."menu_href" = '/admin/master/operator'
  );
UPDATE "tb_user_favorite_menu" SET "menu_href" = '/admin/master/operator'
WHERE "menu_href" = '/admin/master/company';
