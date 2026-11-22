-- 외부코드 대상에 납품처·구역 추가 (0098)
ALTER TABLE "tb_ext_code" DROP CONSTRAINT "tb_ext_code_entity_type_cd_check";
ALTER TABLE "tb_ext_code" ADD CONSTRAINT "tb_ext_code_entity_type_cd_check" CHECK ("entity_type_cd" IN ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'UNIT', 'CARRIER', 'ROUTE', 'SHIP_TO', 'ZONE'));
