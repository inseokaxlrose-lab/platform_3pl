-- 임시 비밀번호 표시 (0086): 'Y'면 처음 로그인 때 비밀번호를 바꿔야 한다. 기존 사용자는 모두 'N'
ALTER TABLE "tb_user" ADD COLUMN "password_change_req_yn" CHAR(1) NOT NULL DEFAULT 'N';
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_password_change_req_yn_check" CHECK ("password_change_req_yn" IN ('Y', 'N'));
