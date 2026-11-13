-- CreateEnum
CREATE TYPE "ExternalEntityType" AS ENUM ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'DELIVERY_ZONE', 'UNIT');

-- CreateTable
CREATE TABLE "external_code" (
    "id" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "entityType" "ExternalEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_code_entityType_entityId_idx" ON "external_code"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "external_code_system_entityType_code_key" ON "external_code"("system", "entityType", "code");

-- CreateIndex
CREATE UNIQUE INDEX "external_code_system_entityType_entityId_key" ON "external_code"("system", "entityType", "entityId");

-- 시스템 코드 일련번호 (docs/decisions/0025, src/config/master-codes.ts와 이름을 맞춘다)
-- 여러 사람이 동시에 등록해도 번호가 겹치지 않는다. 등록이 실패하면 번호가 건너뛸 수 있다(허용)
CREATE SEQUENCE "system_code_center_seq" START 1;
CREATE SEQUENCE "system_code_warehouse_seq" START 1;
CREATE SEQUENCE "system_code_shipper_seq" START 1;
CREATE SEQUENCE "system_code_item_seq" START 1;
CREATE SEQUENCE "system_code_customer_seq" START 1;
CREATE SEQUENCE "system_code_delivery_zone_seq" START 1;
