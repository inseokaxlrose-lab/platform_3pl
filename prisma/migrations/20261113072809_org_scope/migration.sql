-- AlterTable
ALTER TABLE "user" ADD COLUMN     "shipperId" TEXT;

-- CreateTable
CREATE TABLE "center" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipper" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_center" (
    "userId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_center_pkey" PRIMARY KEY ("userId","centerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "center_code_key" ON "center"("code");

-- CreateIndex
CREATE UNIQUE INDEX "shipper_code_key" ON "shipper"("code");

-- CreateIndex
CREATE INDEX "user_center_centerId_idx" ON "user_center"("centerId");

-- CreateIndex
CREATE INDEX "user_shipperId_idx" ON "user"("shipperId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_shipperId_fkey" FOREIGN KEY ("shipperId") REFERENCES "shipper"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_center" ADD CONSTRAINT "user_center_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_center" ADD CONSTRAINT "user_center_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 데이터 범위 규칙 (Prisma 스키마로 표현할 수 없어 직접 추가)
-- 화주사 사용자는 소속 화주사가 반드시 있고, 다른 유형(운영사·센터)은 화주사 연결이 없어야 한다
ALTER TABLE "user" ADD CONSTRAINT "user_shipper_matches_type"
  CHECK (("userType" = 'SHIPPER') = ("shipperId" IS NOT NULL));
