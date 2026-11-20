-- M8 B1 외부코드 매핑 대상에 운송사 추가 (docs/decisions/0094, 0068)
ALTER TABLE "tb_ext_code" DROP CONSTRAINT "tb_ext_code_entity_type_cd_check";
ALTER TABLE "tb_ext_code" ADD CONSTRAINT "tb_ext_code_entity_type_cd_check" CHECK ("entity_type_cd" IN ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'UNIT', 'CARRIER'));
