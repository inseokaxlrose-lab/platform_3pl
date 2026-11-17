-- 기존 배송권역 제거 (docs/decisions/0076: 우편번호별 권역설정으로 교체, 0033·0072 대체)
-- 배송권역·담당 지역 데이터는 0건 (교체 결정 때 확인). 거래처의 지정 배송 센터(delivery_center_id)는 남긴다

-- 1) 권한 코드: 배송권역 조회·수정·엑셀 → 권역설정. 등록·삭제는 권역설정에 없는 동작이라 지운다
UPDATE "tb_perm_group_perm" SET "perm_cd" = 'master.regions.' || split_part("perm_cd", '.', 3)
WHERE "perm_cd" IN ('master.delivery-zones.read', 'master.delivery-zones.update', 'master.delivery-zones.export');
DELETE FROM "tb_perm_group_perm" WHERE "perm_cd" LIKE 'master.delivery-zones.%';

UPDATE "tb_user_perm_override" SET "perm_cd" = 'master.regions.' || split_part("perm_cd", '.', 3)
WHERE "perm_cd" IN ('master.delivery-zones.read', 'master.delivery-zones.update', 'master.delivery-zones.export');
DELETE FROM "tb_user_perm_override" WHERE "perm_cd" LIKE 'master.delivery-zones.%';

-- 2) 외부코드 대상에서 배송권역 빼기 (enum 값은 지울 수 없어 새로 만든다)
DELETE FROM "tb_ext_code" WHERE "entity_type_cd" = 'DELIVERY_ZONE';
ALTER TYPE "ExternalEntityType" RENAME TO "ExternalEntityType_old";
CREATE TYPE "ExternalEntityType" AS ENUM ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'UNIT');
ALTER TABLE "tb_ext_code"
  ALTER COLUMN "entity_type_cd" TYPE "ExternalEntityType" USING "entity_type_cd"::text::"ExternalEntityType";
DROP TYPE "ExternalEntityType_old";

-- 3) 표·시스템 코드 시퀀스
DROP TABLE "tb_delivery_zone_region";
DROP TABLE "tb_delivery_zone";
DROP SEQUENCE IF EXISTS "system_code_delivery_zone_seq";
