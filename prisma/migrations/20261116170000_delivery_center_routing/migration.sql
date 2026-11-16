-- 배송 센터 자동 배정 규칙 (docs/decisions/0072)
-- 거래처 배송 센터: 배송권역이 겹칠 때 맨 먼저 따르는 지정 (비우면 권역 규칙으로)
ALTER TABLE "tb_customer" ADD COLUMN "delivery_center_id" BIGINT;
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_delivery_center_id_fkey" FOREIGN KEY ("delivery_center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tb_customer_delivery_center_id_idx" ON "tb_customer"("delivery_center_id");

-- 배송권역 우선순위: 다른 센터 권역과 같은 수준으로 겹칠 때 작은 번호가 먼저
ALTER TABLE "tb_delivery_zone" ADD COLUMN "priority_no" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "tb_delivery_zone" ADD CONSTRAINT "tb_delivery_zone_priority_no_check" CHECK ("priority_no" BETWEEN 1 AND 999);
