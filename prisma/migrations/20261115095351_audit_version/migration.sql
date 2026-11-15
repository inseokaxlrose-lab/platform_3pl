-- M2.5 2a: 기준정보 공통 칸 — 등록·수정한 사람(아이디), 동시 수정 막기용 버전 (docs/db-conventions.md, 0038)
-- 기존 데이터는 등록·수정자 'system', 버전 1로 시작한다.

-- DropForeignKey
ALTER TABLE "tb_operator" DROP CONSTRAINT "tb_operator_updated_by_id_fkey";

-- AlterTable
ALTER TABLE "tb_center" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_code_group" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_code_item" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_delivery_zone" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_location" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable: 운영사의 "마지막으로 고친 사람"(사용자 키)을 아이디 글자(updated_by)로 옮긴 뒤 옛 칸을 지운다
ALTER TABLE "tb_operator" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';
UPDATE "tb_operator" o SET "updated_by" = u."username"
FROM "tb_user" u WHERE u."user_id" = o."updated_by_id" AND u."username" IS NOT NULL;
ALTER TABLE "tb_operator" DROP COLUMN "updated_by_id";

-- AlterTable
ALTER TABLE "tb_perm_group" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_shipper" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_unit" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_user" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

-- AlterTable
ALTER TABLE "tb_warehouse" ADD COLUMN     "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
ADD COLUMN     "row_version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

