-- 사유 코드 (0087): 공통코드 귀책 속성, 업무 표 사유 코드 칸, 기존 운영사에 사유 그룹 넣기

-- 공통코드: 그룹은 귀책 사용 여부, 코드는 귀책 (값 목록은 상수 FAULT_PARTY와 같다 — db-value-sets 테스트)
ALTER TABLE "tb_code_group" ADD COLUMN "fault_party_yn" CHAR(1) NOT NULL DEFAULT 'N';
ALTER TABLE "tb_code_group" ADD CONSTRAINT "tb_code_group_fault_party_yn_check" CHECK ("fault_party_yn" IN ('Y', 'N'));
ALTER TABLE "tb_code_item" ADD COLUMN "fault_party_cd" VARCHAR(20);
ALTER TABLE "tb_code_item" ADD CONSTRAINT "tb_code_item_fault_party_cd_check" CHECK ("fault_party_cd" IN ('SHIPPER', 'CENTER', 'CARRIER', 'ETC'));

-- 업무 표: 사유 코드 (공통코드 글자) + 기존 자유 입력은 메모로 남는다
ALTER TABLE "tb_inbound_inspection" ADD COLUMN "defect_reason_cd" VARCHAR(20);
ALTER TABLE "tb_stock_adjust" ADD COLUMN "reason_cd" VARCHAR(20);
ALTER TABLE "tb_stock_adjust" ALTER COLUMN "reason" DROP NOT NULL;
ALTER TABLE "tb_stock_txn" ADD COLUMN "reason_cd" VARCHAR(20);
ALTER TABLE "tb_asn" ADD COLUMN "close_reason_cd" VARCHAR(20);

-- 검수 불량 사유
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "fault_party_yn", "updated_at")
SELECT o."operator_id", 'DEFECT_REASON', '검수 불량 사유', '입고 검수에서 불량으로 잡은 이유 (귀책별 집계)',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'DEFECT_REASON' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "fault_party_cd", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.fault, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('OUTER_DAMAGE', '외박스 파손', 'CARRIER', 10), ('PRODUCT_DAMAGE', '제품 파손', 'SHIPPER', 20), ('CONTAMINATION', '오염·변질', 'SHIPPER', 30), ('WRONG_ITEM', '오품·혼입', 'SHIPPER', 40), ('EXPIRY_SHORT', '유통기한 부족', 'SHIPPER', 50), ('LABEL_ERROR', '표시·라벨 불량', 'SHIPPER', 60), ('ETC', '기타', 'ETC', 70)) AS v(code, name, fault, seq)
WHERE g."group_cd" = 'DEFECT_REASON' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');

-- 재고 조정 사유
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "fault_party_yn", "updated_at")
SELECT o."operator_id", 'ADJUST_REASON', '재고 조정 사유', '재고 실사·조정을 한 이유 (귀책별 집계)',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'ADJUST_REASON' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "fault_party_cd", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.fault, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('COUNT_DIFF', '실사 차이', 'CENTER', 10), ('STORAGE_DAMAGE', '보관 중 파손', 'CENTER', 20), ('LOSS', '분실', 'CENTER', 30), ('EXPIRED_DISPOSAL', '기한 경과 폐기', 'SHIPPER', 40), ('SHIPPER_REQUEST', '화주 요청', 'SHIPPER', 50), ('INPUT_ERROR', '입력 오류 정정', 'CENTER', 60), ('ETC', '기타', 'ETC', 70)) AS v(code, name, fault, seq)
WHERE g."group_cd" = 'ADJUST_REASON' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');

-- 재고 보류 사유
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "fault_party_yn", "updated_at")
SELECT o."operator_id", 'HOLD_REASON', '재고 보류 사유', '재고를 보류·불량·격리로 바꾼 이유',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'HOLD_REASON' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "fault_party_cd", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.fault, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('QUALITY_CHECK', '품질 검사', 'SHIPPER', 10), ('SHIPPER_REQUEST', '화주 요청', 'SHIPPER', 20), ('DAMAGE_SUSPECT', '파손 의심', 'CENTER', 30), ('RECALL', '리콜', 'SHIPPER', 40), ('EXPIRY_NEAR', '기한 임박', 'SHIPPER', 50), ('ETC', '기타', 'ETC', 60)) AS v(code, name, fault, seq)
WHERE g."group_cd" = 'HOLD_REASON' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');

-- 입고 잔량 마감 사유
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "fault_party_yn", "updated_at")
SELECT o."operator_id", 'ASN_CLOSE_REASON', '입고 잔량 마감 사유', 'ASN 남은 수량을 마감한 이유',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'ASN_CLOSE_REASON' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "fault_party_cd", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.fault, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('NOT_SHIPPED', '공급처 미발송', 'SHIPPER', 10), ('SHIPPER_CANCEL', '화주 취소', 'SHIPPER', 20), ('DEFECT_RETURN', '불량 반송', 'SHIPPER', 30), ('SHORT_DELIVERY', '운송 중 누락', 'CARRIER', 40), ('ETC', '기타', 'ETC', 50)) AS v(code, name, fault, seq)
WHERE g."group_cd" = 'ASN_CLOSE_REASON' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');

-- 출고 취소 사유
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "fault_party_yn", "updated_at")
SELECT o."operator_id", 'CANCEL_REASON', '출고 취소 사유', '출고 주문을 취소한 이유 (출고 기능에서 사용)',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'CANCEL_REASON' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "fault_party_cd", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.fault, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('CUSTOMER_REQUEST', '고객 요청', 'SHIPPER', 10), ('SHIPPER_REQUEST', '화주 요청', 'SHIPPER', 20), ('STOCK_SHORT', '재고 부족', 'CENTER', 30), ('ADDRESS_ERROR', '주소 오류', 'SHIPPER', 40), ('ETC', '기타', 'ETC', 50)) AS v(code, name, fault, seq)
WHERE g."group_cd" = 'CANCEL_REASON' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');

-- 반품 사유
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "fault_party_yn", "updated_at")
SELECT o."operator_id", 'RETURN_REASON', '반품 사유', '반품을 받은 이유 (반품 기능에서 사용)',
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + 10, 'Y', 'Y', now()
FROM "tb_operator" o
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = 'RETURN_REASON' AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "fault_party_cd", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.fault, v.seq, now()
FROM "tb_code_group" g
CROSS JOIN (VALUES ('CHANGE_MIND', '단순 변심', 'ETC', 10), ('PRODUCT_DEFECT', '제품 불량', 'SHIPPER', 20), ('WRONG_SHIP', '오배송', 'CENTER', 30), ('DELIVERY_DAMAGE', '배송 중 파손', 'CARRIER', 40), ('DELAY', '배송 지연', 'CARRIER', 50), ('ETC', '기타', 'ETC', 60)) AS v(code, name, fault, seq)
WHERE g."group_cd" = 'RETURN_REASON' AND g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');
