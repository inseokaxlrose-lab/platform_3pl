-- CreateTable
CREATE TABLE "delivery_zone" (
    "id" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "systemCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_zone_region" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,

    CONSTRAINT "delivery_zone_region_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_systemCode_key" ON "delivery_zone"("systemCode");

-- CreateIndex
CREATE INDEX "delivery_zone_centerId_idx" ON "delivery_zone"("centerId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_centerId_code_key" ON "delivery_zone"("centerId", "code");

-- CreateIndex
CREATE INDEX "delivery_zone_region_regionCode_idx" ON "delivery_zone_region"("regionCode");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_zone_region_zoneId_regionCode_key" ON "delivery_zone_region"("zoneId", "regionCode");

-- AddForeignKey
ALTER TABLE "delivery_zone" ADD CONSTRAINT "delivery_zone_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_zone_region" ADD CONSTRAINT "delivery_zone_region_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "delivery_zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
