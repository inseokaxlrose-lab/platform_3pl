-- 사용자 개인 설정 (docs/decisions/0056): 화면이 기억하는 고르기 값 (라벨 인쇄 양식·코드 종류 등)

-- CreateTable
CREATE TABLE "tb_user_pref" (
    "user_id" BIGINT NOT NULL,
    "pref_key" VARCHAR(50) NOT NULL,
    "pref_value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tb_user_pref_pkey" PRIMARY KEY ("user_id","pref_key")
);

-- AddForeignKey
ALTER TABLE "tb_user_pref" ADD CONSTRAINT "tb_user_pref_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tb_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

