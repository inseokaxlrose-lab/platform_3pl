-- CreateEnum
CREATE TYPE "AppArea" AS ENUM ('ADMIN', 'PORTAL');

-- AlterTable
ALTER TABLE "permission_group" ADD COLUMN     "area" "AppArea" NOT NULL DEFAULT 'ADMIN';
