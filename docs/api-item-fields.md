# 품목 API 필드 대응표

화주 연동 API의 **품목(item)** 필드가 화면의 어느 칸, 엑셀 업로드의 어느 제목, DB의 어느 칼럼과 같은지 정리합니다.
결정 기록: `docs/decisions/0083-item-spec.md`. 요청 규칙(Zod)의 출처는 `src/lib/items/item-api-schema.ts`(`apiItemSchema`)이고, 저장은 엑셀 업로드와 같은 서비스(`src/lib/items/item-upsert.ts`)입니다.

- 쓰기 규칙: **보낸 칸만** 고칩니다. 안 보낸 칸은 그대로, `null`은 값 지우기입니다 (필수 칸은 지울 수 없음).
- `uoms`·`barcodes`는 **보낸 행만** 추가·수정합니다. 빠진 행은 그대로이고, 지우려면 그 행에 `"delete": true`를 보냅니다.
- 엑셀 업로드도 같은 규칙입니다. 비운 칸은 "안 보냄"입니다 (엑셀로는 값을 지울 수 없음).
- 숫자 칸은 숫자 또는 숫자 글자(`"52.5"`)로 보냅니다. 규격은 cm·kg입니다.
- 단위 코드(`baseUom`·`uoms[].uom`·`barcodes[].uom`)는 **우리 단위 코드**(EA·KG·BOX·PLT 등) 또는 **외부코드 매핑**(대상: 단위)에 등록한 화주 코드(CS·CT 등)입니다. 매핑이 연동 상대마다 다른 단위를 가리키면 `UOM_NOT_FOUND`입니다.

## 품목 (`POST /items` 본문 한 건)

| API 필드 | 화면 칸 | 엑셀 제목 | DB 칼럼 (`tb_item`) | 비고 |
| --- | --- | --- | --- | --- |
| `itemCd` | 품목코드 | 품목코드 | `item_cd` | **필수**, 업무 키, 바꿀 수 없음. 영문·숫자·`.`·`-`·`_` 50자 (소문자는 대문자로) |
| `itemNm` | 품목명 | 품목명 | `item_nm` | 새 품목은 필수 |
| `itemNmEn` | 영문명 | 영문명 | `item_nm_en` | |
| `shortNm` | 약칭 | 약칭 | `item_short_nm` | |
| `spec` | 규격 | 규격 | `spec_nm` | |
| `itemType` | 품목 유형 | 품목유형 | `item_type_cd` | `GOODS`·`PRODUCT`·`SEMI`·`RAW`·`SUB`·`SET`·`SUPPLY`·`ETC` |
| `category1`~`3` | 분류 1~3 | 분류1~3 | `category1`~`3` | 자유 글자 |
| `brandNm` | 브랜드 | 브랜드 | `brand_nm` | |
| `makerNm` | 제조사 | 제조사 | `maker_nm` | |
| `originCountry` | 원산지 | 원산지 | `origin_country_cd` | 국가코드 두 글자 (KR) |
| `hsCode` | HS 코드 | HS코드 | `hs_cd` | 숫자 4~12자리 |
| `itemValue` | 품목 가액 | 품목가액 | `item_value_amt` | 기본단위 1개 기준 |
| `currency` | 통화 | 통화 | `currency_cd` | 세 글자 (KRW) |
| `baseUom` | 기본단위 | 기본단위 | `base_unit_id` | 새 품목은 필수. 포장 단위는 안 됨. 재고·미완료 ASN이 있으면 바꿀 수 없음 |
| `defaultInboundUom` | 기본 입고단위 | — | `default_inbound_unit_id` | `null` = 자동 (BOX, 없으면 기본단위) |
| `defaultOrderUom` | 기본 주문단위 | — | `default_order_unit_id` | `null` = 자동 (기본단위) |
| `uoms[]` | 단위·규격 표 | INNER·BOX·PLT 칸들 | `tb_item_unit` | 아래 표 |
| `pallet.type` | 팔레트 종류 | 팔레트종류 | `pallet_type_cd` | 팔레트 종류 코드 (T11·T12·운영사 추가) |
| `pallet.ti` · `pallet.hi` | 단당 박스 수 · 단수 | TI · HI | `pallet_ti` · `pallet_hi` | 둘 다 있으면 박스 수 = TI × HI |
| `pallet.boxQty` | 팔레트당 박스 수 | 팔레트당박스수 | `pallet_box_qty` | TI·HI를 모를 때. `pallet: null`이면 적재 정보를 모두 지움 |
| `tempZone` | 보관 온도대 | 온도대 | `temp_zone_cd` | `AMBIENT`·`CHILLED`·`FROZEN`·`CONSTANT` |
| `storageTempMin` · `Max` | 보관 최저·최고온도 | — | `storage_temp_min` · `max` | ℃, 소수 1자리 |
| `hazmat` · `fragile` · `upright` | 위험물 · 파손 주의 · 세워서 보관 | 위험물 · 파손주의 · 세워서보관 | `hazmat_yn` · `fragile_yn` · `upright_yn` | true / false |
| `maxStackBox` | 최대 적층 박스 단수 | 최대적층단수 | `max_stack_box` | HI보다 작으면 경고 |
| `expiryMgmt` | 기한 관리 | 기한관리 | `expiry_mgmt_yn` | 새 품목에서 안 보내면 화주 설정. 재고가 있으면 바꿀 수 없음 |
| `expiryType` | 기한 종류 | 기한종류 | `expiry_type_cd` | `CONSUME`·`SELL`·`USE`·`VALID` (기한 관리면 필수) |
| `expiryInput` | 기한 입력 방식 | 기한입력방식 | `expiry_input_cd` | `EXPIRY`·`MFG`·`BOTH` (기한 관리면 필수) |
| `shelfLifeDays` | 총 기한 일수 | 총기한일수 | `shelf_life_days` | `MFG`·`BOTH`면 필수 |
| `minInboundShelfDays` · `minOutboundShelfDays` | 최소 입고·출고 잔여일 | 최소입고잔여일 · 최소출고잔여일 | `min_inbound_shelf_days` · `min_outbound_shelf_days` | |
| `expiryAlertDays` | 임박 기준 일수 | 임박기준일수 | `expiry_alert_day_cnt` | |
| `lotMgmt` | LOT 관리 | LOT관리 | `lot_mgmt_yn` | 새 품목에서 안 보내면 화주 설정. 재고가 있으면 바꿀 수 없음 |
| `lotSource` | LOT 생성 방식 | LOT생성방식 | `lot_source_cd` | `INPUT`·`MFG_DATE`·`EXPIRY_DATE`·`SYSTEM` (LOT 관리면 필수) |
| `serialMgmt` | 시리얼 관리 | — | `serial_mgmt_yn` | 값만 저장 (시리얼 기능은 2차) |
| `allocRule` | 재고할당 규칙 | — | `alloc_rule_cd` | `FIFO`·`FEFO`·`LIFO`, `null` = 화주사 값 |
| `labelUom` | 라벨 단위 | — | `label_unit_cd` | `PLT`·`BOX`, `null` = 화주사 값 |
| `boxOnlyShip` | 박스 단위 출고만 | 박스단위출고만 | `box_only_ship_yn` | |
| `barcodes[]` | 바코드 표 | 단위별 바코드 칸 | `tb_item_barcode` | 아래 표 |
| `status` | 상태 | 상태 | `status_cd` | `ACTIVE`·`INACTIVE`·`DISCONTINUED`(단종: 새 입고예정 불가) |
| `remark` | 비고 | 비고 | `remark` | |
| (응답) `source` | 등록 경로 | — | `source_cd` | `SCREEN`·`PORTAL`·`API`·`UPLOAD`·`ORDER_AUTO` |
| (응답) `lastIfAt` | 연동 정보 | — | `last_if_at` | 연동·업로드로 고친 시각 (요청 ID는 `last_request_id`) |

## 단위 (`uoms[]`) — `tb_item_unit`

| API 필드 | 화면 칸 | 엑셀 제목 | DB 칼럼 | 비고 |
| --- | --- | --- | --- | --- |
| `uom` | 단위 | INNER단위 · BOX단위 | `unit_id` | 포장 단위만 |
| `level` | 레벨 | (칸 이름) | `unit_level_cd` | `INNER`·`BOX`·`PLT`. 새 행은 필수, 이미 있는 같은 단위면 생략 가능. 기본단위(`BASE`)는 `baseUom`으로 |
| `qtyInBase` | 환산수량 | INNER입수 · BOX입수 · PLT입수 | `conv_cnt` | 1 이 단위 = 기본단위 n개. 레벨 순서대로 커야 함 (`UOM_QTY_INVALID`) |
| `widthCm` · `depthCm` · `heightCm` | 가로 · 세로 · 높이 | BOX가로·세로·높이(cm) | `width_cm` · `depth_cm` · `height_cm` | CBM(`cbm`)은 자동 계산 |
| `grossWeightKg` · `netWeightKg` | 총중량 · 순중량 | BOX총중량(kg) | `gross_weight_kg` · `net_weight_kg` | |
| `delete` | (행 빼기) | — | — | true면 그 레벨 행을 지움 |
| (응답) `cbm` · `calculated` | CBM · 계산 배지 | — | `cbm` · `auto_calc_yn` | PLT를 팔레트 적재로 계산했으면 `calculated: true` |

PLT는 `pallet`(종류·ti·hi 또는 boxQty)이 있으면 계산합니다: 수량 = 박스 수 × BOX 환산수량, 높이 = HI × BOX 높이 + 팔레트 높이, 중량 = 박스 수 × BOX 총중량 + 팔레트 자체 중량. 이때 `uoms`로 보낸 PLT 수량이 계산과 다르면 계산값을 쓰고 경고 `PLT_RECALCULATED`를 돌려줍니다. 적재 정보가 없을 때만 PLT `qtyInBase`를 직접 받습니다.

## 바코드 (`barcodes[]`) — `tb_item_barcode`

| API 필드 | 화면 칸 | 엑셀 제목 | DB 칼럼 | 비고 |
| --- | --- | --- | --- | --- |
| `uom` | 단위 | (칸 이름: 기본단위·INNER·BOX·PLT바코드) | `unit_id` | 이 품목의 단위 |
| `barcode` | 바코드 | 단위별 바코드 칸 | `barcode` | 50자. **같은 화주사의 다른 품목과 겹칠 수 없음** (다른 화주사는 같아도 됨) |
| `type` | 종류 | — | `barcode_type_cd` | `EAN13`·`EAN8`·`UPCA`·`ITF14`·`GS1_128`·`CODE128`·`QR`·`CUSTOM`. 안 보내면 숫자 자리수로 짐작. 체크디지트 종류는 검사 |
| `primary` | 대표 | (엑셀 칸은 늘 대표) | `primary_yn` | 단위별 1개. 대표가 없으면 그 단위의 첫 바코드 |
| `delete` | (행 빼기) | — | — | true면 그 바코드를 지움 |

## 응답 계산값 (`POST /items` 건별 결과, `GET /items` · `GET /items/{itemCd}`)

| 필드 | 뜻 |
| --- | --- |
| `volumeStatus` | `OK` = BOX 가로·세로·높이·총중량이 모두 있음, `MISSING` = 체적 미등록 |
| `box` | BOX 환산수량·CBM·총중량 (BOX가 없으면 `null`) |
| `plt` | PLT 환산수량·팔레트당 박스 수·높이·CBM·중량·계산 여부 (PLT가 없으면 `null`) |
| `warnings[]` | 저장은 됐지만 확인할 것 (`POST` 결과만): 아래 경고 코드 |

### 경고 코드 (저장은 됨)

- `VOLUME_MISSING`: BOX 규격이 없어 체적 미등록
- `DENSITY_SUSPICIOUS`: 밀도가 10~5,000 kg/m³ 밖 — cm 대신 mm로 넣었는지 확인
- `PLT_RECALCULATED`: 보낸 PLT를 팔레트 적재 정보로 다시 계산함
- `PALLET_HEIGHT_EXCEEDED` · `PALLET_WEIGHT_EXCEEDED`: 팔레트 권장 높이 · 최대 중량 초과
- `UOM_NOT_MULTIPLE`: BOX 환산수량이 INNER의 배수가 아님
- `STACK_LIMIT_CONFLICT`: 최대 적층 단수보다 팔레트 단수(HI)가 많음

오류 코드는 `docs/api-error-codes.md`의 품목 칸을 보세요.
