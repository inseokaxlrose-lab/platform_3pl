-- M3 화주사 거래처 (docs/decisions/0043): 거래처 + 담당자, 배송지 법정동코드

-- CreateTable
CREATE TABLE "tb_customer" (
    "customer_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "sys_cd" TEXT NOT NULL,
    "customer_cd" VARCHAR(30) NOT NULL,
    "customer_nm" VARCHAR(200) NOT NULL,
    "biz_reg_no" CHAR(10),
    "ceo_nm" VARCHAR(50),
    "tel_no" VARCHAR(15),
    "email" VARCHAR(100),
    "zip_cd" VARCHAR(10),
    "addr1" VARCHAR(200),
    "addr2" VARCHAR(200),
    "region_cd" CHAR(10),
    "receiver_nm" VARCHAR(50),
    "receiver_tel_no" VARCHAR(15),
    "delivery_memo" VARCHAR(200),
    "remark" VARCHAR(1000),
    "status_cd" VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_customer_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "tb_customer_contact" (
    "contact_id" BIGSERIAL NOT NULL,
    "customer_id" BIGINT NOT NULL,
    "sort_seq" INTEGER NOT NULL,
    "role_cd" VARCHAR(20) NOT NULL,
    "contact_nm" VARCHAR(50) NOT NULL,
    "tel_no" VARCHAR(15),
    "email" VARCHAR(100),
    "primary_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_customer_contact_pkey" PRIMARY KEY ("contact_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_customer_sys_cd_key" ON "tb_customer"("sys_cd");

-- CreateIndex
CREATE INDEX "tb_customer_operator_id_idx" ON "tb_customer"("operator_id");

-- CreateIndex
CREATE INDEX "tb_customer_region_cd_idx" ON "tb_customer"("region_cd");

-- CreateIndex
CREATE UNIQUE INDEX "tb_customer_shipper_id_customer_cd_key" ON "tb_customer"("shipper_id", "customer_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_customer_contact_customer_id_sort_seq_idx" ON "tb_customer_contact"("customer_id", "sort_seq");

-- AddForeignKey
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_customer" ADD CONSTRAINT "tb_customer_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_customer_contact" ADD CONSTRAINT "tb_customer_contact_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "tb_customer"("customer_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 검사 조건: 상태, 삭제, 번호는 숫자만, 법정동코드 10자리, 대표 Y/N
ALTER TABLE "tb_customer"
  ADD CONSTRAINT "tb_customer_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE')),
  ADD CONSTRAINT "tb_customer_del_yn_check" CHECK ("del_yn" IN ('Y', 'N')),
  ADD CONSTRAINT "tb_customer_number_digits_check" CHECK (
    ("biz_reg_no" IS NULL OR "biz_reg_no" ~ '^[0-9]{10}$')
    AND ("tel_no" IS NULL OR "tel_no" ~ '^[0-9]+$')
    AND ("receiver_tel_no" IS NULL OR "receiver_tel_no" ~ '^[0-9]+$')),
  ADD CONSTRAINT "tb_customer_region_cd_check" CHECK ("region_cd" IS NULL OR "region_cd" ~ '^[0-9]{10}$');
ALTER TABLE "tb_customer_contact"
  ADD CONSTRAINT "tb_customer_contact_primary_yn_check" CHECK ("primary_yn" IN ('Y', 'N'));
