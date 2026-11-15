-- 화주사 정보 확장, 이용 센터·담당자 표 (docs/decisions/0035)
-- CreateEnum
CREATE TYPE "LabelUnit" AS ENUM ('PLT', 'BOX');

-- AlterTable
ALTER TABLE "shipper" ADD COLUMN     "address" TEXT,
ADD COLUMN     "addressDetail" TEXT,
ADD COLUMN     "businessItem" TEXT,
ADD COLUMN     "businessNumber" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "ceoName" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fax" TEXT,
ADD COLUMN     "labelUnit" "LabelUnit" NOT NULL DEFAULT 'PLT',
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "systemCode" TEXT,
ADD COLUMN     "useExpiry" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "useLot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "zipCode" TEXT;

-- 기존 화주사에 시스템 코드 채우기 (만든 순서대로 SH000001…, 0025) 후 필수로
UPDATE "shipper" s SET "systemCode" = t."code"
FROM (
  SELECT o."id", 'SH' || lpad(nextval('system_code_shipper_seq')::text, 6, '0') AS "code"
  FROM (SELECT "id" FROM "shipper" ORDER BY "createdAt", "id") o
) t
WHERE s."id" = t."id";
ALTER TABLE "shipper" ALTER COLUMN "systemCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "shipper_center" (
    "shipperId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,

    CONSTRAINT "shipper_center_pkey" PRIMARY KEY ("shipperId","centerId")
);

-- CreateTable
CREATE TABLE "shipper_contact" (
    "id" TEXT NOT NULL,
    "shipperId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "duty" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "shipper_contact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shipper_center_centerId_idx" ON "shipper_center"("centerId");

-- CreateIndex
CREATE INDEX "shipper_contact_shipperId_sortOrder_idx" ON "shipper_contact"("shipperId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shipper_systemCode_key" ON "shipper"("systemCode");

-- AddForeignKey
ALTER TABLE "shipper_center" ADD CONSTRAINT "shipper_center_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "shipper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipper_center" ADD CONSTRAINT "shipper_center_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipper_contact" ADD CONSTRAINT "shipper_contact_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "shipper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

