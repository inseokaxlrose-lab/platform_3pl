-- 첨부파일 (0091): 파일 정보 + 대상 연결. 실제 바이트는 저장소(지금은 로컬 폴더, 운영 저장소는 배포 결정 때)에 있다
CREATE TABLE "tb_file" (
    "file_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "storage_key" VARCHAR(300) NOT NULL,
    "original_nm" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    CONSTRAINT "tb_file_pkey" PRIMARY KEY ("file_id")
);
CREATE UNIQUE INDEX "tb_file_storage_key_key" ON "tb_file"("storage_key");
CREATE INDEX "tb_file_operator_id_idx" ON "tb_file"("operator_id");
ALTER TABLE "tb_file" ADD CONSTRAINT "tb_file_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_file" ADD CONSTRAINT "tb_file_size_bytes_check" CHECK ("size_bytes" >= 0);

-- 대상 연결: 여러 장 붙는 곳 (품목 이미지·검수 사진). 대상 종류·용도는 상수 + DB 검사
CREATE TABLE "tb_file_link" (
    "file_link_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "file_id" BIGINT NOT NULL,
    "entity_type_cd" VARCHAR(20) NOT NULL,
    "entity_id" BIGINT NOT NULL,
    "purpose_cd" VARCHAR(20) NOT NULL,
    "sort_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    CONSTRAINT "tb_file_link_pkey" PRIMARY KEY ("file_link_id")
);
CREATE UNIQUE INDEX "tb_file_link_file_id_key" ON "tb_file_link"("file_id");
CREATE INDEX "tb_file_link_entity_idx" ON "tb_file_link"("entity_type_cd", "entity_id");
CREATE INDEX "tb_file_link_operator_id_idx" ON "tb_file_link"("operator_id");
ALTER TABLE "tb_file_link" ADD CONSTRAINT "tb_file_link_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "tb_file"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tb_file_link" ADD CONSTRAINT "tb_file_link_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tb_file_link" ADD CONSTRAINT "tb_file_link_entity_type_cd_check" CHECK ("entity_type_cd" IN ('ITEM', 'INSPECTION'));
ALTER TABLE "tb_file_link" ADD CONSTRAINT "tb_file_link_purpose_cd_check" CHECK ("purpose_cd" IN ('IMAGE', 'PHOTO'));

-- 운영사 로고·직인 → 파일 (0039 "파일 표가 생기면 외래 키를 건다"). 없는 파일을 가리키던 값은 비운다
UPDATE "tb_operator" SET "logo_file_id" = NULL WHERE "logo_file_id" IS NOT NULL;
UPDATE "tb_operator" SET "stamp_file_id" = NULL WHERE "stamp_file_id" IS NOT NULL;
ALTER TABLE "tb_operator" ADD CONSTRAINT "tb_operator_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "tb_file"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_operator" ADD CONSTRAINT "tb_operator_stamp_file_id_fkey" FOREIGN KEY ("stamp_file_id") REFERENCES "tb_file"("file_id") ON DELETE SET NULL ON UPDATE CASCADE;
