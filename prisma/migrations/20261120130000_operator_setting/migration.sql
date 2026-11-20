-- 운영사 설정 (0092): 키-값. 키 목록·기본값·검사 규칙은 코드 상수(src/config/operator-settings.ts), 행이 없으면 기본값
CREATE TABLE "tb_operator_setting" (
    "operator_id" BIGINT NOT NULL,
    "setting_key" VARCHAR(50) NOT NULL,
    "setting_value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    CONSTRAINT "tb_operator_setting_pkey" PRIMARY KEY ("operator_id", "setting_key")
);
ALTER TABLE "tb_operator_setting" ADD CONSTRAINT "tb_operator_setting_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 권한 system.settings (운영 설정): 기존 운영사의 슈퍼 관리자 그룹
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('system.settings.read'), ('system.settings.update')) AS v(code)
WHERE g."perm_group_nm" = '슈퍼 관리자' AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
