-- 센터마다 대기 창고는 유형별로 1개 (입고대기만 막던 것을 출고대기·반품대기까지, 0073)
DROP INDEX "tb_warehouse_one_inbound_per_center";
CREATE UNIQUE INDEX "tb_warehouse_one_staging_per_center" ON "tb_warehouse"("center_id", "warehouse_type_cd") WHERE (warehouse_type_cd <> 'GENERAL'::"WarehouseType");
