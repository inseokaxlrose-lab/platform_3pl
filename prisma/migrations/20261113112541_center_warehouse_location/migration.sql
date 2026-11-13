-- CreateEnum
CREATE TYPE "WarehouseType" AS ENUM ('GENERAL', 'INBOUND_STAGING');

-- AlterTable
ALTER TABLE "center" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressDetail" TEXT,
ADD COLUMN     "fax" TEXT,
ADD COLUMN     "managerName" TEXT,
ADD COLUMN     "managerPhone" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "systemCode" TEXT,
ADD COLUMN     "zipCode" TEXT;

-- 이미 있는 센터에 시스템 코드 채우기 (등록 순서대로 CT000001, CT000002 …), 그 뒤 필수로
UPDATE "center" AS c
SET "systemCode" = s."code"
FROM (
  SELECT o."id", 'CT' || lpad(nextval('system_code_center_seq')::text, 6, '0') AS "code"
  FROM (SELECT "id" FROM "center" ORDER BY "createdAt", "code") AS o
) AS s
WHERE c."id" = s."id";

ALTER TABLE "center" ALTER COLUMN "systemCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "warehouse" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "systemCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "WarehouseType" NOT NULL DEFAULT 'GENERAL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_systemCode_key" ON "warehouse"("systemCode");

-- CreateIndex
CREATE INDEX "warehouse_centerId_idx" ON "warehouse"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouse_centerId_code_key" ON "warehouse"("centerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "location_warehouseId_code_key" ON "location"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "center_systemCode_key" ON "center"("systemCode");

-- AddForeignKey
ALTER TABLE "warehouse" ADD CONSTRAINT "warehouse_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 센터마다 입고대기 창고는 1개만 (docs/decisions/0026). Prisma 설계 파일로는 표현할 수 없는 부분 고유 인덱스
CREATE UNIQUE INDEX "warehouse_one_inbound_staging_per_center"
  ON "warehouse"("centerId") WHERE "type" = 'INBOUND_STAGING';
