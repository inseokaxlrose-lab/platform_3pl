-- M3 화주사 품목 (docs/decisions/0041): 품목 + 환산단위
-- 관리 옵션(로트·유통기한·라벨 단위)은 비어 있으면 화주사 기본값을 따른다

-- CreateTable
CREATE TABLE "tb_item" (
    "item_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "sys_cd" TEXT NOT NULL,
    "item_cd" VARCHAR(30) NOT NULL,
    "item_nm" VARCHAR(200) NOT NULL,
    "spec_nm" VARCHAR(100),
    "barcode_cd" VARCHAR(50),
    "base_unit_id" BIGINT NOT NULL,
    "lot_mgmt_yn" CHAR(1),
    "expiry_mgmt_yn" CHAR(1),
    "label_unit_cd" "LabelUnit",
    "expiry_alert_day_cnt" INTEGER,
    "remark" VARCHAR(1000),
    "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_item_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "tb_item_unit" (
    "item_unit_id" BIGSERIAL NOT NULL,
    "item_id" BIGINT NOT NULL,
    "unit_id" BIGINT NOT NULL,
    "conv_cnt" DECIMAL(18,3) NOT NULL,
    "sort_seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_item_unit_pkey" PRIMARY KEY ("item_unit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_sys_cd_key" ON "tb_item"("sys_cd");

-- CreateIndex
CREATE INDEX "tb_item_operator_id_idx" ON "tb_item"("operator_id");

-- CreateIndex
CREATE INDEX "tb_item_base_unit_id_idx" ON "tb_item"("base_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_shipper_id_item_cd_key" ON "tb_item"("shipper_id", "item_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_shipper_id_barcode_cd_key" ON "tb_item"("shipper_id", "barcode_cd") WHERE (del_yn = 'N' AND barcode_cd IS NOT NULL);

-- CreateIndex
CREATE INDEX "tb_item_unit_unit_id_idx" ON "tb_item_unit"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_unit_item_id_unit_id_key" ON "tb_item_unit"("item_id", "unit_id");

-- AddForeignKey
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_base_unit_id_fkey" FOREIGN KEY ("base_unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_unit" ADD CONSTRAINT "tb_item_unit_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "tb_item"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_unit" ADD CONSTRAINT "tb_item_unit_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "tb_unit"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 검사 조건: 상태, 예/아니오(비어 있음 = 화주사 기본값 따름), 임박 기준 일수, 입수량
ALTER TABLE "tb_item"
  ADD CONSTRAINT "tb_item_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT "tb_item_del_yn_check" CHECK ("del_yn" IN ('Y', 'N')),
  ADD CONSTRAINT "tb_item_yn_check" CHECK (
    ("lot_mgmt_yn" IS NULL OR "lot_mgmt_yn" IN ('Y', 'N'))
    AND ("expiry_mgmt_yn" IS NULL OR "expiry_mgmt_yn" IN ('Y', 'N'))),
  ADD CONSTRAINT "tb_item_expiry_alert_day_cnt_check"
    CHECK ("expiry_alert_day_cnt" IS NULL OR "expiry_alert_day_cnt" BETWEEN 1 AND 3650);
ALTER TABLE "tb_item_unit" ADD CONSTRAINT "tb_item_unit_conv_cnt_check" CHECK ("conv_cnt" > 0);
