-- CreateEnum
CREATE TYPE "StorageCondition" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN');

-- AlterTable
ALTER TABLE "warehouse" ADD COLUMN     "storageCondition" "StorageCondition" NOT NULL DEFAULT 'AMBIENT';
