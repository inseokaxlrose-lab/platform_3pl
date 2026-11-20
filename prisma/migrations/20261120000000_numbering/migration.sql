-- DropIndex
DROP INDEX "tb_asn_asn_no_key";

-- DropIndex
DROP INDEX "tb_inbound_label_label_no_key";

-- DropIndex
DROP INDEX "tb_inbound_receipt_receipt_no_key";

-- DropIndex
DROP INDEX "tb_stock_adjust_adjust_no_key";

-- CreateTable
CREATE TABLE "tb_numbering_rule" (
    "numbering_rule_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT,
    "target_cd" VARCHAR(20) NOT NULL,
    "scope_cd" VARCHAR(20) NOT NULL,
    "prefix_src_cd" VARCHAR(20) NOT NULL,
    "fixed_prefix" VARCHAR(5),
    "type_char" CHAR(1),
    "separator" VARCHAR(1),
    "date_fmt_cd" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "seq_len" SMALLINT NOT NULL,
    "reset_cycle_cd" VARCHAR(10) NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_numbering_rule_pkey" PRIMARY KEY ("numbering_rule_id")
);

-- CreateTable
CREATE TABLE "tb_numbering_seq" (
    "operator_id" BIGINT NOT NULL,
    "target_cd" VARCHAR(20) NOT NULL,
    "scope_id" BIGINT NOT NULL,
    "period_key" VARCHAR(8) NOT NULL,
    "last_seq" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_numbering_seq_pkey" PRIMARY KEY ("operator_id","target_cd","scope_id","period_key")
);

-- CreateIndex
CREATE INDEX "tb_numbering_rule_operator_id_idx" ON "tb_numbering_rule"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_numbering_rule_operator_target_key" ON "tb_numbering_rule"("operator_id", "target_cd") WHERE (operator_id IS NOT NULL);

-- CreateIndex
CREATE UNIQUE INDEX "tb_numbering_rule_system_target_key" ON "tb_numbering_rule"("target_cd") WHERE (operator_id IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "tb_asn_operator_id_asn_no_key" ON "tb_asn"("operator_id", "asn_no");

-- CreateIndex
CREATE UNIQUE INDEX "tb_inbound_label_operator_id_label_no_key" ON "tb_inbound_label"("operator_id", "label_no");

-- CreateIndex
CREATE UNIQUE INDEX "tb_inbound_receipt_operator_id_receipt_no_key" ON "tb_inbound_receipt"("operator_id", "receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "tb_stock_adjust_operator_id_adjust_no_key" ON "tb_stock_adjust"("operator_id", "adjust_no");

-- AddForeignKey
ALTER TABLE "tb_numbering_rule" ADD CONSTRAINT "tb_numbering_rule_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 체번 규칙 값 검사 (상수: src/lib/numbering/numbering-codes.ts, 0084)
ALTER TABLE "tb_numbering_rule"
  ADD CONSTRAINT "tb_numbering_rule_target_cd_check"
    CHECK ("target_cd" IN ('SHIPPER', 'CUSTOMER', 'SHIP_TO', 'ITEM', 'ASN', 'RECEIPT', 'LABEL', 'ADJUST')),
  ADD CONSTRAINT "tb_numbering_rule_scope_cd_check" CHECK ("scope_cd" IN ('OPERATOR', 'SHIPPER', 'CUSTOMER')),
  ADD CONSTRAINT "tb_numbering_rule_prefix_src_cd_check"
    CHECK ("prefix_src_cd" IN ('FIXED', 'SHIPPER_PREFIX', 'PARENT_CD')),
  ADD CONSTRAINT "tb_numbering_rule_fixed_prefix_check"
    CHECK (("prefix_src_cd" = 'FIXED') = ("fixed_prefix" IS NOT NULL) AND ("fixed_prefix" IS NULL OR "fixed_prefix" ~ '^[A-Z]{1,5}$')),
  ADD CONSTRAINT "tb_numbering_rule_type_char_check" CHECK ("type_char" IS NULL OR "type_char" ~ '^[A-Z]$'),
  ADD CONSTRAINT "tb_numbering_rule_separator_check" CHECK ("separator" IS NULL OR "separator" IN ('-', '_')),
  ADD CONSTRAINT "tb_numbering_rule_date_fmt_cd_check" CHECK ("date_fmt_cd" IN ('NONE', 'YYMMDD')),
  ADD CONSTRAINT "tb_numbering_rule_seq_len_check" CHECK ("seq_len" BETWEEN 2 AND 8),
  ADD CONSTRAINT "tb_numbering_rule_reset_cycle_cd_check" CHECK ("reset_cycle_cd" IN ('NONE', 'DAY', 'MONTH', 'YEAR'));

ALTER TABLE "tb_numbering_seq"
  ADD CONSTRAINT "tb_numbering_seq_last_seq_check" CHECK ("last_seq" >= 0);

-- 시스템 기본 규칙 (정의서 5-3·5-4)
-- 마스터: 화주사 SH0001 / 거래처 {prefix}C000001 / 품목 {prefix}S000001 / 납품처 {거래처코드}-01
-- 전표: AS·RC·AJ + YYMMDD + '-' + 4자리, 라벨 LB + YYMMDD + '-' + 6자리 (운영사별, 날마다 1부터)
INSERT INTO "tb_numbering_rule"
  ("operator_id", "target_cd", "scope_cd", "prefix_src_cd", "fixed_prefix", "type_char", "separator", "date_fmt_cd", "seq_len", "reset_cycle_cd", "updated_at")
VALUES
  (NULL, 'SHIPPER',  'OPERATOR', 'FIXED',          'SH', NULL, NULL, 'NONE',   4, 'NONE', now()),
  (NULL, 'CUSTOMER', 'SHIPPER',  'SHIPPER_PREFIX', NULL, 'C',  NULL, 'NONE',   6, 'NONE', now()),
  (NULL, 'SHIP_TO',  'CUSTOMER', 'PARENT_CD',      NULL, NULL, '-',  'NONE',   2, 'NONE', now()),
  (NULL, 'ITEM',     'SHIPPER',  'SHIPPER_PREFIX', NULL, 'S',  NULL, 'NONE',   6, 'NONE', now()),
  (NULL, 'ASN',      'OPERATOR', 'FIXED',          'AS', NULL, '-',  'YYMMDD', 4, 'DAY',  now()),
  (NULL, 'RECEIPT',  'OPERATOR', 'FIXED',          'RC', NULL, '-',  'YYMMDD', 4, 'DAY',  now()),
  (NULL, 'LABEL',    'OPERATOR', 'FIXED',          'LB', NULL, '-',  'YYMMDD', 6, 'DAY',  now()),
  (NULL, 'ADJUST',   'OPERATOR', 'FIXED',          'AJ', NULL, '-',  'YYMMDD', 4, 'DAY',  now());

-- 옛 문서번호 시퀀스 (0047) — 체번 표로 바뀜
DROP SEQUENCE IF EXISTS "doc_no_asn_seq";
DROP SEQUENCE IF EXISTS "doc_no_receipt_seq";
DROP SEQUENCE IF EXISTS "doc_no_label_seq";
DROP SEQUENCE IF EXISTS "doc_no_adjust_seq";
