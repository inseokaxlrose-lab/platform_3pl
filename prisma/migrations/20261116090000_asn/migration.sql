-- M5 입고 (docs/decisions/0047): ASN(헤더 + 라인) + 입고확정 문서(헤더 + 라인)
-- 수량은 모두 기본단위. 잔량·초과는 저장하지 않고 계산한다 (0003 결정 5)

-- CreateEnum
CREATE TYPE "InboundType" AS ENUM ('SHIPPER', 'TRANSFER');

-- CreateEnum
CREATE TYPE "AsnChannel" AS ENUM ('PORTAL', 'PROXY', 'EXCEL');

-- CreateEnum
CREATE TYPE "AsnStatus" AS ENUM ('PLANNED', 'INSPECTING', 'PARTIAL', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PutawayStatus" AS ENUM ('WAITING', 'PARTIAL', 'DONE');

-- CreateTable
CREATE TABLE "tb_asn" (
    "asn_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "center_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "asn_no" VARCHAR(20) NOT NULL,
    "inbound_type_cd" "InboundType" NOT NULL DEFAULT 'SHIPPER',
    "reg_channel_cd" "AsnChannel" NOT NULL,
    "expected_dt" DATE NOT NULL,
    "shipper_ref_no" VARCHAR(50),
    "remark" VARCHAR(1000),
    "asn_status_cd" "AsnStatus" NOT NULL DEFAULT 'PLANNED',
    "putaway_status_cd" "PutawayStatus" NOT NULL DEFAULT 'WAITING',
    "close_reason" VARCHAR(200),
    "closed_at" TIMESTAMP(3),
    "closed_by" VARCHAR(50),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_asn_pkey" PRIMARY KEY ("asn_id")
);

-- CreateTable
CREATE TABLE "tb_asn_line" (
    "asn_line_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "asn_id" BIGINT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" BIGINT NOT NULL,
    "expected_qty" DECIMAL(18,3) NOT NULL,
    "entry_unit_cd" VARCHAR(20),
    "entry_qty" DECIMAL(18,3),
    "lot_no" VARCHAR(50),
    "expiry_dt" DATE,
    "confirmed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "putaway_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "closed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "remark" VARCHAR(200),

    CONSTRAINT "tb_asn_line_pkey" PRIMARY KEY ("asn_line_id")
);

-- CreateTable
CREATE TABLE "tb_inbound_receipt" (
    "receipt_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "asn_id" BIGINT NOT NULL,
    "receipt_no" VARCHAR(20) NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "remark" VARCHAR(200),

    CONSTRAINT "tb_inbound_receipt_pkey" PRIMARY KEY ("receipt_id")
);

-- CreateTable
CREATE TABLE "tb_inbound_receipt_line" (
    "receipt_line_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "receipt_id" BIGINT NOT NULL,
    "asn_line_id" BIGINT NOT NULL,
    "stock_id" BIGINT NOT NULL,
    "stock_txn_id" BIGINT NOT NULL,
    "lot_no" VARCHAR(50),
    "expiry_dt" DATE,
    "confirm_qty" DECIMAL(18,3) NOT NULL,
    "putaway_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "tb_inbound_receipt_line_pkey" PRIMARY KEY ("receipt_line_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_asn_asn_no_key" ON "tb_asn"("asn_no");

-- CreateIndex
CREATE INDEX "tb_asn_operator_id_idx" ON "tb_asn"("operator_id");

-- CreateIndex
CREATE INDEX "tb_asn_center_id_asn_status_cd_idx" ON "tb_asn"("center_id", "asn_status_cd");

-- CreateIndex
CREATE INDEX "tb_asn_shipper_id_expected_dt_idx" ON "tb_asn"("shipper_id", "expected_dt");

-- CreateIndex
CREATE INDEX "tb_asn_line_item_id_idx" ON "tb_asn_line"("item_id");

-- CreateIndex
CREATE INDEX "tb_asn_line_operator_id_idx" ON "tb_asn_line"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_asn_line_asn_id_line_no_key" ON "tb_asn_line"("asn_id", "line_no");

-- CreateIndex
CREATE UNIQUE INDEX "tb_inbound_receipt_receipt_no_key" ON "tb_inbound_receipt"("receipt_no");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_asn_id_idx" ON "tb_inbound_receipt"("asn_id");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_operator_id_confirmed_at_idx" ON "tb_inbound_receipt"("operator_id", "confirmed_at");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_line_receipt_id_idx" ON "tb_inbound_receipt_line"("receipt_id");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_line_asn_line_id_idx" ON "tb_inbound_receipt_line"("asn_line_id");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_line_stock_id_idx" ON "tb_inbound_receipt_line"("stock_id");

-- CreateIndex
CREATE INDEX "tb_inbound_receipt_line_operator_id_idx" ON "tb_inbound_receipt_line"("operator_id");

-- AddForeignKey
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_asn_line" ADD CONSTRAINT "tb_asn_line_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_asn_line" ADD CONSTRAINT "tb_asn_line_asn_id_fkey" FOREIGN KEY ("asn_id") REFERENCES "tb_asn"("asn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_asn_line" ADD CONSTRAINT "tb_asn_line_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt" ADD CONSTRAINT "tb_inbound_receipt_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt" ADD CONSTRAINT "tb_inbound_receipt_asn_id_fkey" FOREIGN KEY ("asn_id") REFERENCES "tb_asn"("asn_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "tb_inbound_receipt"("receipt_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_asn_line_id_fkey" FOREIGN KEY ("asn_line_id") REFERENCES "tb_asn_line"("asn_line_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "tb_stock"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 문서 번호 일련번호 (번호 = 접두어 + 날짜 + '-' + 이 값, 날짜가 바뀌어도 이어진다 → 항상 하나)
CREATE SEQUENCE "doc_no_asn_seq" START 1;
CREATE SEQUENCE "doc_no_receipt_seq" START 1;

-- 예/아니오·수량 검사 (마지막 안전장치)
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
-- 마감 상태면 사유·마감자·일시가 있어야 한다
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_close_check"
  CHECK ("asn_status_cd" <> 'CLOSED' OR (btrim(coalesce("close_reason", '')) <> '' AND "closed_at" IS NOT NULL AND "closed_by" IS NOT NULL));

ALTER TABLE "tb_asn_line" ADD CONSTRAINT "tb_asn_line_qty_check" CHECK (
  "expected_qty" > 0
  AND "confirmed_qty" >= 0
  AND "putaway_qty" >= 0 AND "putaway_qty" <= "confirmed_qty"
  AND "closed_qty" >= 0
  AND ("entry_qty" IS NULL OR "entry_qty" > 0)
);
ALTER TABLE "tb_asn_line" ADD CONSTRAINT "tb_asn_line_lot_check" CHECK ("lot_no" IS NULL OR "lot_no" <> '');
ALTER TABLE "tb_asn_line" ADD CONSTRAINT "tb_asn_line_no_check" CHECK ("line_no" > 0);

ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_qty_check"
  CHECK ("confirm_qty" > 0 AND "putaway_qty" >= 0 AND "putaway_qty" <= "confirm_qty");
ALTER TABLE "tb_inbound_receipt_line" ADD CONSTRAINT "tb_inbound_receipt_line_lot_check" CHECK ("lot_no" IS NULL OR "lot_no" <> '');
