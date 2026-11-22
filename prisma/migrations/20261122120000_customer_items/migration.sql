-- 거래처별 품목코드 (0098)
-- CreateTable
CREATE TABLE "tb_customer_item" (
    "customer_item_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "item_id" BIGINT NOT NULL,
    "cust_item_cd" VARCHAR(50) NOT NULL,
    "cust_item_nm" VARCHAR(200),
    "cust_barcode" VARCHAR(50),
    "delivery_unit_id" BIGINT,
    "min_shelf_days" INTEGER,
    "min_shelf_ratio" DECIMAL(5,2),
    "remark" VARCHAR(1000),
    "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_customer_item_pkey" PRIMARY KEY ("customer_item_id")
);

-- CreateIndex
CREATE INDEX "tb_customer_item_operator_id_shipper_id_idx" ON "tb_customer_item"("operator_id", "shipper_id");

-- CreateIndex
CREATE INDEX "tb_customer_item_item_id_idx" ON "tb_customer_item"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_customer_item_customer_item_key" ON "tb_customer_item"("customer_id", "item_id") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_customer_item_customer_cd_key" ON "tb_customer_item"("customer_id", "cust_item_cd") WHERE (del_yn = 'N');

-- AddForeignKey
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tb_customer"("customer_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_delivery_unit_id_fkey" FOREIGN KEY ("delivery_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 값 검사: 상태 사용/사용 중지, 지움 표시, 최소 잔여 유통기한(일수 0~9999·비율 0~100)
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_min_shelf_days_check" CHECK ("min_shelf_days" IS NULL OR "min_shelf_days" BETWEEN 0 AND 9999);
ALTER TABLE "tb_customer_item" ADD CONSTRAINT "tb_customer_item_min_shelf_ratio_check" CHECK ("min_shelf_ratio" IS NULL OR "min_shelf_ratio" BETWEEN 0 AND 100);

-- 권한 master.customer-items: 기존 운영사의 슈퍼 관리자 = 전체, 센터 운영자 = 전체 (소속 센터 화주사의 것)
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('master.customer-items.read'), ('master.customer-items.create'), ('master.customer-items.update'),
                   ('master.customer-items.delete'), ('master.customer-items.export')) AS v(code)
WHERE g."perm_group_nm" IN ('슈퍼 관리자', '센터 운영자') AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
