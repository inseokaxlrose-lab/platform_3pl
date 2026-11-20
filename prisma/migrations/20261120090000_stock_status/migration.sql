-- 재고상태 (0088): 재고 주소에 상태를 넣는다 — 같은 로케이션·품목·로트·기한이라도 정상/보류/불량/격리는 다른 재고 줄
-- 값 목록은 상수 STOCK_STATUS와 같다 (db-value-sets 테스트)

ALTER TABLE "tb_stock" ADD COLUMN "stock_status_cd" VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "tb_stock" ADD CONSTRAINT "tb_stock_stock_status_cd_check" CHECK ("stock_status_cd" IN ('NORMAL', 'HOLD', 'DAMAGED', 'QUARANTINE'));
DROP INDEX "tb_stock_address_key";
CREATE UNIQUE INDEX "tb_stock_address_key" ON "tb_stock"("location_id", "item_id", "lot_no", "expiry_dt", "stock_status_cd") NULLS NOT DISTINCT;

-- 이력: 그때의 재고상태 (주소 칸과 같이 그대로 남긴다) + 상태 변경 거래
ALTER TABLE "tb_stock_txn" ADD COLUMN "stock_status_cd" VARCHAR(20) NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_stock_status_cd_check" CHECK ("stock_status_cd" IN ('NORMAL', 'HOLD', 'DAMAGED', 'QUARANTINE'));
ALTER TABLE "tb_stock_txn" DROP CONSTRAINT "tb_stock_txn_txn_type_cd_check";
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_txn_type_cd_check" CHECK ("txn_type_cd" IN ('RECEIVE', 'MOVE_OUT', 'MOVE_IN', 'ADJUST', 'STATUS_CHANGE'));
-- 조정은 사유 필수: 사유 글자나 사유 코드(0087) 중 하나
ALTER TABLE "tb_stock_txn" DROP CONSTRAINT "tb_stock_txn_reason_check";
ALTER TABLE "tb_stock_txn" ADD CONSTRAINT "tb_stock_txn_reason_check" CHECK ("txn_type_cd" <> 'ADJUST' OR ("reason" IS NOT NULL AND "reason" <> '') OR "reason_cd" IS NOT NULL);

-- 권한 stock.inventory.update (재고 상태 변경): 기존 운영사의 슈퍼 관리자·센터 운영자 그룹
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", 'stock.inventory.update'
FROM "tb_perm_group" g
WHERE g."perm_group_nm" IN ('슈퍼 관리자', '센터 운영자') AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
