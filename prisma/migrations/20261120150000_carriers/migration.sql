-- M8 B1 운송사·운송 계약·화주 발송인 (docs/decisions/0094)

-- AlterTable
ALTER TABLE "tb_shipper" ADD COLUMN     "default_carrier_id" BIGINT,
ADD COLUMN     "sender_addr1" VARCHAR(200),
ADD COLUMN     "sender_addr2" VARCHAR(200),
ADD COLUMN     "sender_addr_type_cd" VARCHAR(20) NOT NULL DEFAULT 'CENTER',
ADD COLUMN     "sender_nm" VARCHAR(100),
ADD COLUMN     "sender_tel_no" VARCHAR(15),
ADD COLUMN     "sender_zip_cd" VARCHAR(10);

-- CreateTable
CREATE TABLE "tb_carrier" (
    "carrier_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "carrier_cd" VARCHAR(20) NOT NULL,
    "carrier_cust_cd" VARCHAR(50),
    "carrier_nm" VARCHAR(50) NOT NULL,
    "carrier_type_cd" VARCHAR(20) NOT NULL DEFAULT 'PARCEL',
    "invoice_digits" SMALLINT,
    "invoice_check_cd" VARCHAR(20) NOT NULL DEFAULT 'NONE',
    "tracking_url" VARCHAR(300),
    "tel_no" VARCHAR(15),
    "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sort_seq" INTEGER NOT NULL DEFAULT 0,
    "remark" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_carrier_pkey" PRIMARY KEY ("carrier_id")
);

-- CreateTable
CREATE TABLE "tb_carrier_contract" (
    "contract_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "carrier_id" BIGINT NOT NULL,
    "center_id" BIGINT NOT NULL,
    "shipper_id" BIGINT,
    "carrier_cust_no" VARCHAR(30) NOT NULL,
    "pickup_branch_nm" VARCHAR(50),
    "invoice_start_no" VARCHAR(20),
    "invoice_end_no" VARCHAR(20),
    "invoice_next_no" VARCHAR(20),
    "default_yn" CHAR(1) NOT NULL DEFAULT 'N',
    "valid_from_dt" DATE,
    "valid_to_dt" DATE,
    "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "remark" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_carrier_contract_pkey" PRIMARY KEY ("contract_id")
);

-- CreateIndex
CREATE INDEX "tb_carrier_operator_id_idx" ON "tb_carrier"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_carrier_operator_id_carrier_cd_key" ON "tb_carrier"("operator_id", "carrier_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_carrier_operator_id_cust_cd_key" ON "tb_carrier"("operator_id", "carrier_cust_cd") WHERE (carrier_cust_cd IS NOT NULL AND del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_carrier_contract_operator_id_idx" ON "tb_carrier_contract"("operator_id");

-- CreateIndex
CREATE INDEX "tb_carrier_contract_center_id_shipper_id_idx" ON "tb_carrier_contract"("center_id", "shipper_id");

-- CreateIndex
CREATE INDEX "tb_carrier_contract_carrier_id_idx" ON "tb_carrier_contract"("carrier_id");

-- AddForeignKey
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_default_carrier_id_fkey" FOREIGN KEY ("default_carrier_id") REFERENCES "tb_carrier"("carrier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_carrier" ADD CONSTRAINT "tb_carrier_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "tb_carrier"("carrier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 값 검사 조건 (상수: src/lib/carriers/carrier-codes.ts)
ALTER TABLE "tb_carrier" ADD CONSTRAINT "tb_carrier_carrier_type_cd_check" CHECK ("carrier_type_cd" IN ('PARCEL', 'FREIGHT', 'OWN', 'CHARTER'));
ALTER TABLE "tb_carrier" ADD CONSTRAINT "tb_carrier_invoice_check_cd_check" CHECK ("invoice_check_cd" IN ('NONE', 'MOD7'));
ALTER TABLE "tb_carrier" ADD CONSTRAINT "tb_carrier_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_carrier" ADD CONSTRAINT "tb_carrier_invoice_digits_check" CHECK ("invoice_digits" IS NULL OR "invoice_digits" BETWEEN 4 AND 20);
ALTER TABLE "tb_carrier" ADD CONSTRAINT "tb_carrier_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_default_yn_check" CHECK ("default_yn" IN ('Y', 'N'));
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_carrier_contract" ADD CONSTRAINT "tb_carrier_contract_valid_check" CHECK ("valid_to_dt" IS NULL OR "valid_from_dt" IS NULL OR "valid_from_dt" <= "valid_to_dt");
ALTER TABLE "tb_shipper" ADD CONSTRAINT "tb_shipper_sender_addr_type_cd_check" CHECK ("sender_addr_type_cd" IN ('CENTER', 'SHIPPER', 'CUSTOM'));

-- 기존 운영사에 기본 운송사 7곳 (새 운영사는 provisionOperator가 src/config/defaults/carriers.ts로 넣는다)
INSERT INTO "tb_carrier" ("operator_id", "carrier_cd", "carrier_nm", "carrier_type_cd", "invoice_digits", "invoice_check_cd", "sort_seq", "updated_at")
SELECT o."operator_id", v.cd, v.nm, v.type_cd, v.digits, v.check_cd, v.seq, CURRENT_TIMESTAMP
FROM "tb_operator" o
CROSS JOIN (VALUES
  ('CJ', 'CJ대한통운', 'PARCEL', 12, 'MOD7', 10),
  ('HANJIN', '한진택배', 'PARCEL', 12, 'MOD7', 20),
  ('LOTTE', '롯데택배', 'PARCEL', 12, 'MOD7', 30),
  ('EPOST', '우체국택배', 'PARCEL', 13, 'NONE', 40),
  ('LOGEN', '로젠택배', 'PARCEL', 11, 'MOD7', 50),
  ('OWN', '자차', 'OWN', NULL, 'NONE', 60),
  ('CHARTER', '용차', 'CHARTER', NULL, 'NONE', 70)
) AS v(cd, nm, type_cd, digits, check_cd, seq);

-- 권한: 기존 운영사의 슈퍼 관리자 = 운송사·운송 계약 전체, 센터 운영자 = 운송사 조회 + 운송 계약 전체
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES
  ('master.carriers.read'), ('master.carriers.create'), ('master.carriers.update'), ('master.carriers.delete'),
  ('master.carrier-contracts.read'), ('master.carrier-contracts.create'), ('master.carrier-contracts.update'),
  ('master.carrier-contracts.delete'), ('master.carrier-contracts.export')
) AS v(code)
WHERE g."perm_group_nm" = '슈퍼 관리자' AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;

INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES
  ('master.carriers.read'),
  ('master.carrier-contracts.read'), ('master.carrier-contracts.create'), ('master.carrier-contracts.update'),
  ('master.carrier-contracts.delete'), ('master.carrier-contracts.export')
) AS v(code)
WHERE g."perm_group_nm" = '센터 운영자' AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
