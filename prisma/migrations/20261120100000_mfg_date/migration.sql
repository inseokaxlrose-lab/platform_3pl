-- 제조일 (0089): ASN 줄(화주가 알려 준 값)·검수·입고확정 줄·재고·이력
-- 재고 주소(고유키)에는 넣지 않는다 — 같은 유통기한이면 같은 재고. 재고 줄의 제조일은 그 줄이 처음 생길 때의 값
ALTER TABLE "tb_asn_line" ADD COLUMN "mfg_dt" DATE;
ALTER TABLE "tb_inbound_inspection" ADD COLUMN "mfg_dt" DATE;
ALTER TABLE "tb_inbound_receipt_line" ADD COLUMN "mfg_dt" DATE;
ALTER TABLE "tb_stock" ADD COLUMN "mfg_dt" DATE;
ALTER TABLE "tb_stock_txn" ADD COLUMN "mfg_dt" DATE;
