-- 공급처 (0090): 거래처에 역할 — SALES 매출처(납품받는 곳) / PURCHASE 매입처(공급처) / BOTH 둘 다
-- 값 목록은 상수 CUSTOMER_ROLE과 같다 (db-value-sets 테스트). 기존 거래처는 모두 매출처
ALTER TABLE "tb_customer" ADD COLUMN "customer_role_cd" VARCHAR(20) NOT NULL DEFAULT 'SALES';
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_customer_role_cd_check" CHECK ("customer_role_cd" IN ('SALES', 'PURCHASE', 'BOTH'));

-- ASN 공급처: 같은 화주사의 매입처·둘 다 거래처 (선택). 화주사 일치·역할은 프로그램이 검사
ALTER TABLE "tb_asn" ADD COLUMN "supplier_id" BIGINT;
ALTER TABLE "tb_asn" ADD CONSTRAINT "tb_asn_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "tb_customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "tb_asn_supplier_id_idx" ON "tb_asn"("supplier_id");
