-- 품목 기본 입고·주문단위: NULL = 자동 (입고 = BOX, 없으면 기본단위 / 주문 = 기본단위) — 0083
ALTER TABLE "tb_item" ALTER COLUMN "default_inbound_unit_id" DROP NOT NULL,
ALTER COLUMN "default_order_unit_id" DROP NOT NULL;
