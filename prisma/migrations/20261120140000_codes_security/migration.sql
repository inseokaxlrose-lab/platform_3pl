-- 센터·창고 사용자 정의 코드 (0093): ERP의 플랜트·저장위치 등. 운영사 안(센터)·센터 안(창고)에서 겹치지 않게는 프로그램이 검사
ALTER TABLE "tb_center" ADD COLUMN "center_cust_cd" VARCHAR(50);
ALTER TABLE "tb_warehouse" ADD COLUMN "warehouse_cust_cd" VARCHAR(50);

-- 사용자 보안·관리 (0093): 연락처·부서·직책·사번, 로그인 실패 잠금(5회 → 30분), 마지막 로그인
ALTER TABLE "tb_user" ADD COLUMN "tel_no" VARCHAR(20);
ALTER TABLE "tb_user" ADD COLUMN "dept_nm" VARCHAR(50);
ALTER TABLE "tb_user" ADD COLUMN "position_nm" VARCHAR(50);
ALTER TABLE "tb_user" ADD COLUMN "emp_no" VARCHAR(30);
ALTER TABLE "tb_user" ADD COLUMN "login_fail_cnt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tb_user" ADD COLUMN "locked_until" TIMESTAMP(3);
ALTER TABLE "tb_user" ADD COLUMN "last_login_at" TIMESTAMP(3);
ALTER TABLE "tb_user" ADD COLUMN "last_login_ip" VARCHAR(45);
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_login_fail_cnt_check" CHECK ("login_fail_cnt" >= 0);

-- 로그인 이력 (0093): 성공·실패·잠김·사용 중지. 없는 아이디로 시도하면 user_id 없이 아이디 글자만
CREATE TABLE "tb_login_hist" (
    "login_hist_id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "operator_id" BIGINT,
    "username" VARCHAR(50) NOT NULL,
    "result_cd" VARCHAR(20) NOT NULL,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tb_login_hist_pkey" PRIMARY KEY ("login_hist_id")
);
CREATE INDEX "tb_login_hist_user_id_created_at_idx" ON "tb_login_hist"("user_id", "created_at");
CREATE INDEX "tb_login_hist_created_at_idx" ON "tb_login_hist"("created_at");
ALTER TABLE "tb_login_hist" ADD CONSTRAINT "tb_login_hist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tb_user"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_login_hist" ADD CONSTRAINT "tb_login_hist_result_cd_check" CHECK ("result_cd" IN ('SUCCESS', 'FAIL', 'LOCKED', 'DISABLED'));
