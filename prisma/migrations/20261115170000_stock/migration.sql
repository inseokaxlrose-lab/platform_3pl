-- M4 재고 기반 (docs/decisions/0044): 재고(주소별 지금 수량) + 재고 이력(변경 기록)
-- 수량은 재고 변경 공통 함수로만 바꾼다. DB는 마지막 안전장치로 음수·할당 초과·이력 수정을 막는다

-- CreateEnum
CREATE TYPE "StockTxnType" AS ENUM ('RECEIVE', 'MOVE_OUT', 'MOVE_IN', 'ADJUST');

-- CreateTable
CREATE TABLE "tb_stock" (
    "stock_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "center_id" BIGINT NOT NULL,
    "warehouse_id" BIGINT NOT NULL,
    "location_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "lot_no" VARCHAR(50),
    "expiry_dt" DATE,
    "stock_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "alloc_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_stock_pkey" PRIMARY KEY ("stock_id")
);

-- CreateTable
CREATE TABLE "tb_stock_txn" (
    "stock_txn_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "stock_id" BIGINT NOT NULL,
    "center_id" BIGINT NOT NULL,
    "warehouse_id" BIGINT NOT NULL,
    "location_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "lot_no" VARCHAR(50),
    "expiry_dt" DATE,
    "txn_type_cd" "StockTxnType" NOT NULL,
    "chg_qty" DECIMAL(18,3) NOT NULL,
    "after_qty" DECIMAL(18,3) NOT NULL,
    "txn_group_id" BIGINT,
    "ref_type_cd" VARCHAR(20),
    "ref_id" BIGINT,
    "ref_no" VARCHAR(50),
    "reason" VARCHAR(200),
    "txn_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',

    CONSTRAINT "tb_stock_txn_pkey" PRIMARY KEY ("stock_txn_id")
);

-- CreateIndex
CREATE INDEX "tb_stock_operator_id_idx" ON "tb_stock"("operator_id");

-- CreateIndex
CREATE INDEX "tb_stock_center_id_shipper_id_item_id_idx" ON "tb_stock"("center_id", "shipper_id", "item_id");

-- CreateIndex
CREATE INDEX "tb_stock_item_id_idx" ON "tb_stock"("item_id");

-- CreateIndex
-- 재고 주소 고유: 로트·유통기한을 쓰지 않는 품목은 비어 있으므로 빈 칸도 같은 값으로 본다 (PostgreSQL 15+)
-- Prisma 7 구조 파일은 NULLS NOT DISTINCT를 적을 수 없어 여기서 직접 만든다 (구조 파일의 @@unique와 이름·칸이 같다, 0044)
CREATE UNIQUE INDEX "tb_stock_address_key" ON "tb_stock"("location_id", "item_id", "lot_no", "expiry_dt") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "tb_stock_txn_stock_id_txn_at_idx" ON "tb_stock_txn"("stock_id", "txn_at");

-- CreateIndex
CREATE INDEX "tb_stock_txn_operator_id_txn_at_idx" ON "tb_stock_txn"("operator_id", "txn_at");

-- CreateIndex
CREATE INDEX "tb_stock_txn_item_id_txn_at_idx" ON "tb_stock_txn"("item_id", "txn_at");

-- CreateIndex
CREATE INDEX "tb_stock_txn_location_id_txn_at_idx" ON "tb_stock_txn"("location_id", "txn_at");

-- CreateIndex
CREATE INDEX "tb_stock_txn_ref_type_cd_ref_id_idx" ON "tb_stock_txn"("ref_type_cd", "ref_id");

-- CreateIndex
CREATE INDEX "tb_stock_txn_txn_group_id_idx" ON "tb_stock_txn"("txn_group_id");

-- AddForeignKey
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "tb_warehouse"("warehouse_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "tb_location"("location_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "tb_stock"("stock_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 검사 조건: 수량 0 이상, 할당 0 이상·수량 이하, 로트번호는 비우거나 글자(빈 글자 금지)
ALTER TABLE "tb_stock"
  ADD CONSTRAINT "tb_stock_qty_check" CHECK ("stock_qty" >= 0),
  ADD CONSTRAINT "tb_stock_alloc_qty_check" CHECK ("alloc_qty" >= 0 AND "alloc_qty" <= "stock_qty"),
  ADD CONSTRAINT "tb_stock_lot_no_check" CHECK ("lot_no" IS NULL OR "lot_no" <> '');

-- 검사 조건: 변동 수량은 0 아님, 변동 후 0 이상, 조정은 사유 필수, 로트번호 빈 글자 금지
ALTER TABLE "tb_stock_txn"
  ADD CONSTRAINT "tb_stock_txn_chg_qty_check" CHECK ("chg_qty" <> 0),
  ADD CONSTRAINT "tb_stock_txn_after_qty_check" CHECK ("after_qty" >= 0),
  ADD CONSTRAINT "tb_stock_txn_reason_check" CHECK ("txn_type_cd" <> 'ADJUST' OR ("reason" IS NOT NULL AND "reason" <> '')),
  ADD CONSTRAINT "tb_stock_txn_lot_no_check" CHECK ("lot_no" IS NULL OR "lot_no" <> '');

-- 재고 이력은 고치거나 지울 수 없다 (기록이 사후에 바뀌면 재고 추적의 의미가 없다)
-- 테스트의 표 비우기(TRUNCATE)는 이 트리거와 상관없다
CREATE FUNCTION "tb_stock_txn_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '재고 이력은 고치거나 지울 수 없습니다 (stock_txn_id=%)', OLD."stock_txn_id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "tb_stock_txn_no_update_delete"
  BEFORE UPDATE OR DELETE ON "tb_stock_txn"
  FOR EACH ROW EXECUTE FUNCTION "tb_stock_txn_immutable"();
