-- M8 B2 배송 코스·코스 우편번호 배정·납품처 납품 조건 (docs/decisions/0095)
-- AlterTable
ALTER TABLE "tb_ship_to" ADD COLUMN     "delivery_days" CHAR(7),
ADD COLUMN     "delivery_time_from" TIME(0),
ADD COLUMN     "delivery_time_to" TIME(0),
ADD COLUMN     "pre_call_yn" CHAR(1) NOT NULL DEFAULT 'N',
ADD COLUMN     "route_id" BIGINT,
ADD COLUMN     "unload_method_cd" VARCHAR(20),
ADD COLUMN     "vehicle_limit_cd" VARCHAR(20);

-- CreateTable
CREATE TABLE "tb_route" (
    "route_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "center_id" BIGINT NOT NULL,
    "route_cd" VARCHAR(20) NOT NULL,
    "route_cust_cd" VARCHAR(50),
    "route_nm" VARCHAR(100) NOT NULL,
    "carrier_id" BIGINT,
    "run_days" CHAR(7) NOT NULL DEFAULT 'YYYYYNN',
    "depart_cutoff_time" TIME(0),
    "vehicle_ton_cd" VARCHAR(20),
    "dest_hub_nm" VARCHAR(100),
    "status_cd" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "sort_seq" INTEGER NOT NULL DEFAULT 0,
    "remark" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "updated_by" VARCHAR(50) NOT NULL DEFAULT 'system',
    "row_version" INTEGER NOT NULL DEFAULT 1,
    "del_yn" CHAR(1) NOT NULL DEFAULT 'N',

    CONSTRAINT "tb_route_pkey" PRIMARY KEY ("route_id")
);

-- CreateTable
CREATE TABLE "tb_route_zip" (
    "route_zip_id" BIGSERIAL NOT NULL,
    "operator_id" BIGINT NOT NULL,
    "center_id" BIGINT NOT NULL,
    "zip_cd" CHAR(5) NOT NULL,
    "route_id" BIGINT NOT NULL,
    "assigned_by" VARCHAR(50) NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_route_zip_pkey" PRIMARY KEY ("route_zip_id")
);

-- CreateIndex
CREATE INDEX "tb_route_operator_id_idx" ON "tb_route"("operator_id");

-- CreateIndex
CREATE INDEX "tb_route_carrier_id_idx" ON "tb_route"("carrier_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_route_center_id_route_cd_key" ON "tb_route"("center_id", "route_cd") WHERE (del_yn = 'N');

-- CreateIndex
CREATE UNIQUE INDEX "tb_route_center_id_cust_cd_key" ON "tb_route"("center_id", "route_cust_cd") WHERE (route_cust_cd IS NOT NULL AND del_yn = 'N');

-- CreateIndex
CREATE INDEX "tb_route_zip_route_id_idx" ON "tb_route_zip"("route_id");

-- CreateIndex
CREATE INDEX "tb_route_zip_operator_id_idx" ON "tb_route_zip"("operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "tb_route_zip_center_id_zip_cd_key" ON "tb_route_zip"("center_id", "zip_cd");

-- AddForeignKey
ALTER TABLE "tb_route" ADD CONSTRAINT "tb_route_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_route" ADD CONSTRAINT "tb_route_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_route" ADD CONSTRAINT "tb_route_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "tb_carrier"("carrier_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_route_zip" ADD CONSTRAINT "tb_route_zip_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tb_operator"("operator_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_route_zip" ADD CONSTRAINT "tb_route_zip_center_id_fkey" FOREIGN KEY ("center_id") REFERENCES "tb_center"("center_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_route_zip" ADD CONSTRAINT "tb_route_zip_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "tb_route"("route_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "tb_route"("route_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 값 검사 조건
ALTER TABLE "tb_route" ADD CONSTRAINT "tb_route_status_cd_check" CHECK ("status_cd" IN ('ACTIVE', 'INACTIVE'));
ALTER TABLE "tb_route" ADD CONSTRAINT "tb_route_del_yn_check" CHECK ("del_yn" IN ('Y', 'N'));
ALTER TABLE "tb_route" ADD CONSTRAINT "tb_route_run_days_check" CHECK ("run_days" ~ '^[YN]{7}$');
ALTER TABLE "tb_route_zip" ADD CONSTRAINT "tb_route_zip_zip_cd_check" CHECK ("zip_cd" ~ '^[0-9]{5}$');
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_delivery_days_check" CHECK ("delivery_days" IS NULL OR "delivery_days" ~ '^[YN]{7}$');
ALTER TABLE "tb_ship_to" ADD CONSTRAINT "tb_ship_to_pre_call_yn_check" CHECK ("pre_call_yn" IN ('Y', 'N'));

-- 외부코드 매핑 대상에 배송 코스 (0068)
ALTER TABLE "tb_ext_code" DROP CONSTRAINT "tb_ext_code_entity_type_cd_check";
ALTER TABLE "tb_ext_code" ADD CONSTRAINT "tb_ext_code_entity_type_cd_check" CHECK ("entity_type_cd" IN ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'UNIT', 'CARRIER', 'ROUTE'));

-- 공통코드 3그룹 (기존 운영사, 새 운영사는 src/config/defaults/codes.ts)
INSERT INTO "tb_code_group" ("operator_id", "group_cd", "group_nm", "description", "sort_seq", "system_yn", "updated_at")
SELECT o."operator_id", v.cd, v.nm, v.descr,
       COALESCE((SELECT MAX(g."sort_seq") FROM "tb_code_group" g WHERE g."operator_id" = o."operator_id"), 0) + v.seq, 'Y', now()
FROM "tb_operator" o
CROSS JOIN (VALUES
  ('VEHICLE_TON', '차량 톤수', '배송 코스의 기본 차량 크기', 10),
  ('VEHICLE_LIMIT', '차량 제한', '납품처에 들어갈 수 있는 차량', 20),
  ('UNLOAD_METHOD', '하차 방법', '납품처에서 물건을 내리는 방법', 30)
) AS v(cd, nm, descr, seq)
WHERE NOT EXISTS (SELECT 1 FROM "tb_code_group" g
                  WHERE g."operator_id" = o."operator_id" AND g."group_cd" = v.cd AND g."del_yn" = 'N');
INSERT INTO "tb_code_item" ("operator_id", "code_group_id", "code_cd", "code_nm", "sort_seq", "updated_at")
SELECT g."operator_id", g."code_group_id", v.code, v.name, v.seq, now()
FROM "tb_code_group" g
JOIN (VALUES
  ('VEHICLE_TON', '1T', '1톤', 10), ('VEHICLE_TON', '1_4T', '1.4톤', 20), ('VEHICLE_TON', '2_5T', '2.5톤', 30),
  ('VEHICLE_TON', '3_5T', '3.5톤', 40), ('VEHICLE_TON', '5T', '5톤', 50), ('VEHICLE_TON', '11T', '11톤', 60),
  ('VEHICLE_TON', '25T', '25톤', 70),
  ('VEHICLE_LIMIT', 'NONE', '제한 없음', 10), ('VEHICLE_LIMIT', 'UNDER_1T', '1톤 이하', 20),
  ('VEHICLE_LIMIT', 'UNDER_2_5T', '2.5톤 이하', 30), ('VEHICLE_LIMIT', 'UNDER_5T', '5톤 이하', 40),
  ('VEHICLE_LIMIT', 'NO_WING', '윙바디 불가', 50),
  ('UNLOAD_METHOD', 'HAND', '수작업', 10), ('UNLOAD_METHOD', 'FORKLIFT', '지게차', 20),
  ('UNLOAD_METHOD', 'PALLET_JACK', '핸드파렛트', 30), ('UNLOAD_METHOD', 'DOCK', '도크 하차', 40)
) AS v(grp, code, name, seq) ON v.grp = g."group_cd"
WHERE g."del_yn" = 'N'
  AND NOT EXISTS (SELECT 1 FROM "tb_code_item" i
                  WHERE i."code_group_id" = g."code_group_id" AND i."code_cd" = v.code AND i."del_yn" = 'N');

-- 권한 master.routes: 기존 운영사의 슈퍼 관리자 = 전체, 센터 운영자 = 전체 (소속 센터 코스)
INSERT INTO "tb_perm_group_perm" ("perm_group_id", "perm_cd")
SELECT g."perm_group_id", v.code
FROM "tb_perm_group" g
CROSS JOIN (VALUES ('master.routes.read'), ('master.routes.create'), ('master.routes.update'),
                   ('master.routes.delete'), ('master.routes.export')) AS v(code)
WHERE g."perm_group_nm" IN ('슈퍼 관리자', '센터 운영자') AND g."app_area_cd" = 'ADMIN' AND g."del_yn" = 'N'
ON CONFLICT DO NOTHING;
