-- M5 관리 라벨 (docs/decisions/0054): 검수 결과 → 라벨 여러 장, 2D 코드 글자·형식 버전, 인쇄 횟수

-- CreateTable
CREATE TABLE "tb_inbound_label" (
    "label_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "label_no" VARCHAR(20) NOT NULL,
    "inspection_id" BIGINT NOT NULL,
    "label_seq" INTEGER NOT NULL,
    "label_cnt" INTEGER NOT NULL,
    "label_unit_cd" "LabelUnit" NOT NULL,
    "label_qty" DECIMAL(18,3) NOT NULL,
    "format_ver" INTEGER NOT NULL,
    "payload" VARCHAR(500) NOT NULL,
    "print_cnt" INTEGER NOT NULL DEFAULT 0,
    "last_printed_at" TIMESTAMP(3),
    "last_printed_by" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_inbound_label_pkey" PRIMARY KEY ("label_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_inbound_label_label_no_key" ON "tb_inbound_label"("label_no");

-- CreateIndex
CREATE INDEX "tb_inbound_label_operator_id_idx" ON "tb_inbound_label"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_inbound_label_inspection_id_label_seq_key" ON "tb_inbound_label"("inspection_id", "label_seq");

-- AddForeignKey
ALTER TABLE "tb_inbound_label" ADD CONSTRAINT "tb_inbound_label_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_label" ADD CONSTRAINT "tb_inbound_label_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "tb_inbound_inspection"("inspection_id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE SEQUENCE "doc_no_label_seq" START 1;

ALTER TABLE "tb_inbound_label" ADD CONSTRAINT "tb_inbound_label_check" CHECK (
  "label_qty" > 0 AND "label_seq" >= 1 AND "label_cnt" >= "label_seq"
  AND "format_ver" >= 1 AND "print_cnt" >= 0
);
