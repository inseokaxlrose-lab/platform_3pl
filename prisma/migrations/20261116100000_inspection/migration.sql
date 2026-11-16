-- M5 입고 검수 (docs/decisions/0053): 검수 결과 표 + 입고확정 라인이 어느 검수 결과를 확정했는지
-- (입고확정 라인은 아직 한 줄도 없어 NOT NULL 칸을 바로 더할 수 있다 — 입고 확정은 M5 뒤 작업)

-- AlterTable
ALTER TABLE "tb_inbound_receipt_line" ADD COLUMN     "inspection_id" BIGINT NOT NULL;

-- CreateTable
CREATE TABLE "tb_inbound_inspection" (
    "inspection_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "asn_id" BIGINT NOT NULL,
    "asn_line_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "lot_no" VARCHAR(50),
    "expiry_dt" DATE,
    "inspect_qty" DECIMAL(18,3) NOT NULL,
    "defect_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "confirmed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "entry_unit_cd" VARCHAR(20),
    "entry_qty" DECIMAL(18,3),
    "remark" VARCHAR(200),
    "inspected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inspected_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_inbound_inspection_pkey" PRIMARY KEY ("inspection_id")
);

-- CreateIndex
CREATE INDEX "tb_inbound_inspection_asn_id_idx" ON "tb_inbound_inspection"("asn_id");

-- CreateIndex
CREATE INDEX "tb_inbound_inspection_asn_line_id_idx" ON "tb_inbound_inspection"("asn_line_id");

-- CreateIndex
CREATE INDEX "tb_inbound_inspection_operator_id_idx" ON "tb_inbound_inspection"("operator_id");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_line_inspection_id_idx" ON "tb_inbound_receipt_line"("inspection_id");

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "tb_inbound_inspection"("inspection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_inspection" ADD CONSTRAINT "tb_inbound_inspection_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_inspection" ADD CONSTRAINT "tb_inbound_inspection_asn_id_fkey" FOREIGN KEY ("asn_id") REFERENCES "tb_asn"("asn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_inspection" ADD CONSTRAINT "tb_inbound_inspection_asn_line_id_fkey" FOREIGN KEY ("asn_line_id") REFERENCES "tb_asn_line"("asn_line_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_inspection" ADD CONSTRAINT "tb_inbound_inspection_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 수량 검사: 검수·불량 0 이상, 둘 중 하나는 0보다 큼, 0 ≤ 확정 ≤ 검수, 로트 빈 글자 금지
ALTER TABLE "tb_inbound_inspection" ADD CONSTRAINT "tb_inbound_inspection_qty_check" CHECK (
  "inspect_qty" >= 0 AND "defect_qty" >= 0 AND ("inspect_qty" + "defect_qty") > 0
  AND "confirmed_qty" >= 0 AND "confirmed_qty" <= "inspect_qty"
  AND ("entry_qty" IS NULL OR "entry_qty" > 0)
);
ALTER TABLE "tb_inbound_inspection" ADD CONSTRAINT "tb_inbound_inspection_lot_check" CHECK ("lot_no" IS NULL OR "lot_no" <> '');
