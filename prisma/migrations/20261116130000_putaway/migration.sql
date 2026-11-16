-- M5 적치 (docs/decisions/0058): 입고확정 라인의 재고를 보관 로케이션으로 옮긴 기록

-- CreateTable
CREATE TABLE "tb_putaway" (
    "putaway_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "receipt_line_id" BIGINT NOT NULL,
    "asn_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "from_location_id" BIGINT NOT NULL,
    "to_location_id" BIGINT NOT NULL,
    "lot_no" VARCHAR(50),
    "expiry_dt" DATE,
    "putaway_qty" DECIMAL(18,3) NOT NULL,
    "txn_group_id" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_putaway_pkey" PRIMARY KEY ("putaway_id")
);

-- CreateIndex
CREATE INDEX "tb_putaway_receipt_line_id_idx" ON "tb_putaway"("receipt_line_id");

-- CreateIndex
CREATE INDEX "tb_putaway_asn_id_idx" ON "tb_putaway"("asn_id");

-- CreateIndex
CREATE INDEX "tb_putaway_operator_id_created_at_idx" ON "tb_putaway"("operator_id", "created_at");

-- AddForeignKey
ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "tb_inbound_receipt_line"("receipt_line_id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "tb_putaway" ADD CONSTRAINT "tb_putaway_qty_check" CHECK ("putaway_qty" > 0 AND "from_location_id" <> "to_location_id");
