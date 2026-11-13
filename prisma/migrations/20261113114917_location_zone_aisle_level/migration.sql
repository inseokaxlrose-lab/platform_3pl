-- AlterTable
ALTER TABLE "location" ADD COLUMN     "aisle" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "zone" TEXT;

-- CreateIndex
CREATE INDEX "location_warehouseId_zone_idx" ON "location"("warehouseId", "zone");
