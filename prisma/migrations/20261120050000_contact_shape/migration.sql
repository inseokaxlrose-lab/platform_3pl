-- 구조 정리 (docs/decisions/0084 ④-3, 정의서 system_code M4·M13)

-- ── M4. 담당자 표 4개를 같은 모양으로: PK 이름 {표}_id, 부서·직책·알림 수신, 감사 칸 (RENAME — 키 값 그대로)
ALTER TABLE "tb_operator_contact" RENAME COLUMN "contact_id" TO "operator_contact_id";
ALTER SEQUENCE IF EXISTS "tb_operator_contact_contact_id_seq" RENAME TO "tb_operator_contact_operator_contact_id_seq";
ALTER TABLE "tb_center_contact" RENAME COLUMN "contact_id" TO "center_contact_id";
ALTER SEQUENCE IF EXISTS "tb_center_contact_contact_id_seq" RENAME TO "tb_center_contact_center_contact_id_seq";
ALTER TABLE "tb_shipper_contact" RENAME COLUMN "contact_id" TO "shipper_contact_id";
ALTER SEQUENCE IF EXISTS "tb_shipper_contact_contact_id_seq" RENAME TO "tb_shipper_contact_shipper_contact_id_seq";
ALTER TABLE "tb_customer_contact" RENAME COLUMN "contact_id" TO "customer_contact_id";
ALTER SEQUENCE IF EXISTS "tb_customer_contact_contact_id_seq" RENAME TO "tb_customer_contact_customer_contact_id_seq";

ALTER TABLE "tb_operator_contact"
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  ADD COLUMN "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';

ALTER TABLE "tb_shipper_contact"
  ADD COLUMN "dept_nm" VARCHAR(50),
  ADD COLUMN "position_nm" VARCHAR(50),
  ADD COLUMN "notify_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  ADD COLUMN "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';
ALTER TABLE "tb_shipper_contact" ADD CONSTRAINT "tb_shipper_contact_notify_yn_check" CHECK ("notify_yn" IN ('Y', 'N'));

ALTER TABLE "tb_customer_contact"
  ADD COLUMN "dept_nm" VARCHAR(50),
  ADD COLUMN "position_nm" VARCHAR(50),
  ADD COLUMN "notify_yn" CHAR(1) NOT NULL DEFAULT 'Y',
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
  ADD COLUMN "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system';
ALTER TABLE "tb_customer_contact" ADD CONSTRAINT "tb_customer_contact_notify_yn_check" CHECK ("notify_yn" IN ('Y', 'N'));

-- ── M13. 거래처도 납품처와 같은 주소 정제 결과 칸 (기존 거래처는 다음 주소 저장 때 채운다)
ALTER TABLE "tb_customer"
  ADD COLUMN "sigungu_nm" VARCHAR(50),
  ADD COLUMN "bd_mgt_sn" VARCHAR(30),
  ADD COLUMN "addr_norm_method_cd" VARCHAR(20);
