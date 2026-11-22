-- 세트 구성품·세트 방식 (0098)
-- AlterTable
ALTER TABLE "tb_item" ADD COLUMN     "set_type_cd" VARCHAR(20);

-- CreateTable
CREATE TABLE "tb_item_set_component" (
    "set_component_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "set_item_id" BIGINT NOT NULL,
    "component_item_id" BIGINT NOT NULL,
    "component_qty" DECIMAL(15,3) NOT NULL,
    "sort_seq" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_item_set_component_pkey" PRIMARY KEY ("set_component_id")
);

-- CreateIndex
CREATE INDEX "tb_item_set_component_component_item_id_idx" ON "tb_item_set_component"("component_item_id");

-- CreateIndex
CREATE INDEX "tb_item_set_component_operator_id_idx" ON "tb_item_set_component"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_item_set_component_set_item_id_component_item_id_key" ON "tb_item_set_component"("set_item_id", "component_item_id");

-- AddForeignKey
ALTER TABLE "tb_item_set_component" ADD CONSTRAINT "tb_item_set_component_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_set_component" ADD CONSTRAINT "tb_item_set_component_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_set_component" ADD CONSTRAINT "tb_item_set_component_set_item_id_fkey" FOREIGN KEY ("set_item_id") REFERENCES "tb_item"("item_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_item_set_component" ADD CONSTRAINT "tb_item_set_component_component_item_id_fkey" FOREIGN KEY ("component_item_id") REFERENCES "tb_item"("item_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 세트 방식: VIRTUAL 가상 세트 / KIT 실물 세트 (상수 SET_TYPE)
ALTER TABLE "tb_item" ADD CONSTRAINT "tb_item_set_type_cd_check" CHECK ("set_type_cd" IN ('VIRTUAL', 'KIT'));
-- 이미 등록된 세트 품목은 가상 세트로 (1차는 가상 세트만 출고에 쓴다)
UPDATE "tb_item" SET "set_type_cd" = 'VIRTUAL' WHERE "item_type_cd" = 'SET' AND "set_type_cd" IS NULL;
-- 구성 수량은 0보다 크게
ALTER TABLE "tb_item_set_component" ADD CONSTRAINT "tb_item_set_component_qty_check" CHECK ("component_qty" > 0);
