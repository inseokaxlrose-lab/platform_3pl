-- M2.5 3b 플랫폼 관리자 (docs/decisions/0039)
-- 사용자 유형 PLATFORM: 운영사에 속하지 않는 플랫폼 관리자 (operator_id 비움)
-- 운영사 상태 status_cd: ACTIVE가 아니면 그 운영사 사용자는 로그인할 수 없다

-- AlterEnum
ALTER TYPE "UserType" ADD VALUE 'PLATFORM';

-- AlterTable
ALTER TABLE "tb_operator" ADD COLUMN     "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "tb_operator" ADD CONSTRAINT "tb_operator_status_cd_check"
  CHECK ("status_cd" IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'));

-- AlterTable
ALTER TABLE "tb_user" ALTER COLUMN "operator_id" DROP NOT NULL;
-- 플랫폼 관리자만 운영사가 없고, 나머지는 반드시 있다
-- (방금 추가한 enum 값을 같은 마이그레이션에서 쓰면 PostgreSQL이 거부할 수 있어 글자로 비교한다)
ALTER TABLE "tb_user" ADD CONSTRAINT "tb_user_operator_matches_type"
  CHECK (("user_type_cd"::text = 'PLATFORM') = ("operator_id" IS NULL));
