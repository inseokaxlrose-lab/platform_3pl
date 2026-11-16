-- M6 재고 실사·조정 (docs/decisions/0061): 등록 → 확정(재고 변경) 문서

-- CreateEnum
CREATE TYPE "StockAdjustType" AS ENUM ('COUNT', 'ADJUST');

-- CreateEnum
CREATE TYPE "StockAdjustStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELED');

-- CreateTable
CREATE TABLE "tb_stock_adjust" (
    "adjust_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "adjust_no" VARCHAR(20) NOT NULL,
    "adjust_type_cd" "StockAdjustType" NOT NULL,
    "center_id" BIGINT NOT NULL,
    "adjust_status_cd" "StockAdjustStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" VARCHAR(200) NOT NULL,
    "remark" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by" VARCHAR(50),
    "canceled_at" TIMESTAMP(3),
    "canceled_by" VARCHAR(50),

    CONSTRAINT "tb_stock_adjust_pkey" PRIMARY KEY ("adjust_id")
);

-- CreateTable
CREATE TABLE "tb_stock_adjust_line" (
    "adjust_line_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "adjust_id" BIGINT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "stock_id" BIGINT NOT NULL,
    "system_qty" DECIMAL(18,3) NOT NULL,
    "counted_qty" DECIMAL(18,3),
    "chg_qty" DECIMAL(18,3),
    "applied_qty" DECIMAL(18,3),
    "stock_txn_id" BIGINT,

    CONSTRAINT "tb_stock_adjust_line_pkey" PRIMARY KEY ("adjust_line_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_stock_adjust_adjust_no_key" ON "tb_stock_adjust"("adjust_no");

-- CreateIndex
CREATE INDEX "tb_stock_adjust_operator_id_created_at_idx" ON "tb_stock_adjust"("operator_id", "created_at");

-- CreateIndex
CREATE INDEX "tb_stock_adjust_center_id_adjust_status_cd_idx" ON "tb_stock_adjust"("center_id", "adjust_status_cd");

-- CreateIndex
CREATE INDEX "tb_stock_adjust_line_stock_id_idx" ON "tb_stock_adjust_line"("stock_id");

-- CreateIndex
CREATE INDEX "tb_stock_adjust_line_operator_id_idx" ON "tb_stock_adjust_line"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_stock_adjust_line_adjust_id_line_no_key" ON "tb_stock_adjust_line"("adjust_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "tb_stock_adjust_line_adjust_id_stock_id_key" ON "tb_stock_adjust_line"("adjust_id", "stock_id");

-- AddForeignKey
ALTER TABLE "tb_stock_adjust" ADD CONSTRAINT "tb_stock_adjust_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock_adjust_line" ADD CONSTRAINT "tb_stock_adjust_line_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock_adjust_line" ADD CONSTRAINT "tb_stock_adjust_line_adjust_id_fkey" FOREIGN KEY ("adjust_id") REFERENCES "tb_stock_adjust"("adjust_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock_adjust_line" ADD CONSTRAINT "tb_stock_adjust_line_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "tb_stock"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE SEQUENCE "doc_no_adjust_seq" START 1;

-- 사유 필수, 확정·취소면 그 사람·일시
ALTER TABLE "tb_stock_adjust" ADD CONSTRAINT "tb_stock_adjust_check" CHECK (
  btrim("reason") <> ''
  AND ("adjust_status_cd" <> 'CONFIRMED' OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL))
  AND ("adjust_status_cd" <> 'CANCELED' OR ("canceled_at" IS NOT NULL AND "canceled_by" IS NOT NULL))
);
-- 실사 줄은 센 수량(0 이상), 조정 줄은 바꿀 수량(0 아님) — 유형은 헤더에 있어 둘 중 하나만 있게
ALTER TABLE "tb_stock_adjust_line" ADD CONSTRAINT "tb_stock_adjust_line_check" CHECK (
  ("counted_qty" IS NOT NULL AND "counted_qty" >= 0 AND "chg_qty" IS NULL)
  OR ("chg_qty" IS NOT NULL AND "chg_qty" <> 0 AND "counted_qty" IS NULL)
);
