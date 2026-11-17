-- 화주 연동 API 기반 (docs/decisions/0081, docs/specs/shipper.md PART 2)
-- 사용자 결정: 두 단계로 나눔 / 키 해시 비밀값 API_KEY_SECRET / 키 이력 표 따로 / 로그·호출 한도는 PostgreSQL

-- CreateTable
CREATE TABLE "tb_api_client" (
    "api_client_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "shipper_id" BIGINT NOT NULL,
    "key_nm" VARCHAR(50) NOT NULL,
    "env_cd" VARCHAR(10) NOT NULL,
    "key_prefix" VARCHAR(20) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMP(3),
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 120,
    "last_used_at" TIMESTAMP(3),
    "last_used_ip" VARCHAR(45),
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_by" VARCHAR(50) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_by" VARCHAR(50),
    "revoke_reason" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "tb_api_client_pkey" PRIMARY KEY ("api_client_id")
);

-- CreateTable
CREATE TABLE "tb_api_client_scope" (
    "api_client_id" BIGINT NOT NULL,
    "scope_cd" VARCHAR(30) NOT NULL,

    CONSTRAINT "tb_api_client_scope_pkey" PRIMARY KEY ("api_client_id","scope_cd")
);

-- CreateTable
CREATE TABLE "tb_api_client_ip" (
    "api_client_ip_id" BIGSERIAL NOT NULL,
    "api_client_id" BIGINT NOT NULL,
    "ip_cidr" VARCHAR(50) NOT NULL,
    "description" VARCHAR(100),

    CONSTRAINT "tb_api_client_ip_pkey" PRIMARY KEY ("api_client_ip_id")
);

-- CreateTable
CREATE TABLE "tb_api_client_event" (
    "event_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "api_client_id" BIGINT NOT NULL,
    "event_cd" VARCHAR(20) NOT NULL,
    "detail" JSONB,
    "actor" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_api_client_event_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "tb_api_request_log" (
    "request_id" VARCHAR(40) NOT NULL,
    "operator_id" BIGINT,
    "shipper_id" BIGINT,
    "api_client_id" BIGINT,
    "env_cd" VARCHAR(10),
    "api_cd" VARCHAR(50) NOT NULL,
    "http_method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(300) NOT NULL,
    "client_ip" VARCHAR(45),
    "idempotency_key" VARCHAR(100),
    "req_at" TIMESTAMP(3) NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "http_status" INTEGER NOT NULL,
    "result_cd" VARCHAR(20) NOT NULL,
    "total_cnt" INTEGER NOT NULL DEFAULT 0,
    "success_cnt" INTEGER NOT NULL DEFAULT 0,
    "fail_cnt" INTEGER NOT NULL DEFAULT 0,
    "error_cd" VARCHAR(30),
    "req_body" TEXT,
    "resp_body" TEXT,

    CONSTRAINT "tb_api_request_log_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "tb_api_request_item" (
    "request_id" VARCHAR(40) NOT NULL,
    "seq" INTEGER NOT NULL,
    "ext_doc_no" VARCHAR(50),
    "result_cd" VARCHAR(20) NOT NULL,
    "error_cd" VARCHAR(30),
    "error_msg" VARCHAR(500),
    "internal_id" BIGINT,

    CONSTRAINT "tb_api_request_item_pkey" PRIMARY KEY ("request_id","seq")
);

-- CreateTable
CREATE TABLE "tb_api_idempotency" (
    "api_client_id" BIGINT NOT NULL,
    "idempotency_key" VARCHAR(100) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "request_id" VARCHAR(40) NOT NULL,
    "http_status" INTEGER NOT NULL,
    "response_body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_api_idempotency_pkey" PRIMARY KEY ("api_client_id","idempotency_key")
);

-- CreateTable
CREATE TABLE "tb_api_rate_bucket" (
    "api_client_id" BIGINT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "req_cnt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_api_rate_bucket_pkey" PRIMARY KEY ("api_client_id","window_start")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_api_client_key_prefix_key" ON "tb_api_client"("key_prefix");

-- CreateIndex
CREATE INDEX "tb_api_client_shipper_id_env_cd_status_cd_idx" ON "tb_api_client"("shipper_id", "env_cd", "status_cd");

-- CreateIndex
CREATE INDEX "tb_api_client_ip_api_client_id_idx" ON "tb_api_client_ip"("api_client_id");

-- CreateIndex
CREATE INDEX "tb_api_client_event_api_client_id_created_at_idx" ON "tb_api_client_event"("api_client_id", "created_at");

-- CreateIndex
CREATE INDEX "tb_api_request_log_operator_id_req_at_idx" ON "tb_api_request_log"("operator_id", "req_at");

-- CreateIndex
CREATE INDEX "tb_api_request_log_shipper_id_req_at_idx" ON "tb_api_request_log"("shipper_id", "req_at");

-- CreateIndex
CREATE INDEX "tb_api_request_log_api_client_id_req_at_idx" ON "tb_api_request_log"("api_client_id", "req_at");

-- CreateIndex
CREATE INDEX "tb_api_idempotency_created_at_idx" ON "tb_api_idempotency"("created_at");

-- AddForeignKey
ALTER TABLE "tb_api_client" ADD CONSTRAINT "tb_api_client_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_api_client" ADD CONSTRAINT "tb_api_client_shipper_id_fkey" FOREIGN KEY ("shipper_id") REFERENCES "tb_shipper"("shipper_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_api_client_scope" ADD CONSTRAINT "tb_api_client_scope_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "tb_api_client"("api_client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_api_client_ip" ADD CONSTRAINT "tb_api_client_ip_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "tb_api_client"("api_client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_api_client_event" ADD CONSTRAINT "tb_api_client_event_api_client_id_fkey" FOREIGN KEY ("api_client_id") REFERENCES "tb_api_client"("api_client_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_api_request_item" ADD CONSTRAINT "tb_api_request_item_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "tb_api_request_log"("request_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────── 검사 조건 (값 목록은 src/lib/api/api-codes.ts와 같게)
ALTER TABLE "tb_api_client" ADD CONSTRAINT "tb_api_client_env_cd_check" CHECK ("env_cd" IN ('TEST', 'LIVE'));
ALTER TABLE "tb_api_client" ADD CONSTRAINT "tb_api_client_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'REVOKED', 'EXPIRED'));
ALTER TABLE "tb_api_client" ADD CONSTRAINT "tb_api_client_rate_limit_check" CHECK ("rate_limit_per_min" BETWEEN 1 AND 6000);
-- 폐기한 키는 사유 필수
ALTER TABLE "tb_api_client" ADD CONSTRAINT "tb_api_client_revoke_check"
  CHECK ("status_cd" <> 'REVOKED' OR ("revoked_at" IS NOT NULL AND "revoke_reason" IS NOT NULL));
ALTER TABLE "tb_api_client_scope" ADD CONSTRAINT "tb_api_client_scope_cd_check" CHECK ("scope_cd" IN (
  'PARTNER_READ', 'PARTNER_WRITE', 'ITEM_READ', 'ITEM_WRITE', 'ASN_READ', 'ASN_WRITE',
  'ORDER_READ', 'ORDER_WRITE', 'STOCK_READ'));
ALTER TABLE "tb_api_client_event" ADD CONSTRAINT "tb_api_client_event_cd_check"
  CHECK ("event_cd" IN ('ISSUED', 'UPDATED', 'REVOKED', 'EXPIRED'));
ALTER TABLE "tb_api_request_log" ADD CONSTRAINT "tb_api_request_log_result_cd_check"
  CHECK ("result_cd" IN ('SUCCESS', 'PARTIAL', 'FAIL'));
ALTER TABLE "tb_api_request_item" ADD CONSTRAINT "tb_api_request_item_result_cd_check"
  CHECK ("result_cd" IN ('CREATED', 'UPDATED', 'UNCHANGED', 'DUPLICATE', 'FAIL'));
