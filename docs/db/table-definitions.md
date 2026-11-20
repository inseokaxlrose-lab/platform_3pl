# DB 테이블 정의서

> 이 문서는 `npm run db:doc`가 실제 DB 구조와 `prisma/schema.prisma`의 주석으로 만든다. **손으로 고치지 않는다** — 마이그레이션을 적용한 뒤 명령을 다시 돌린다.
> 엑셀 판: `docs/db/DB_테이블정의서.xlsx` · 이름 규칙: `docs/db-conventions.md`

테이블 73개 · 칼럼 1176개

## 목차

| 영역 | 테이블 | 모델 | 설명 |
| --- | --- | --- | --- |
| 인증·권한 | [`tb_account`](#tb_account) | Account | 로그인 수단: 아이디·비밀번호 로그인의 비밀번호(암호화된 값)가 여기에 저장된다 |
| 인증·권한 | [`tb_perm_group`](#tb_perm_group) | PermissionGroup | 권한그룹: 권한 코드 묶음 (예: "센터 운영자", "화주 담당자") |
| 인증·권한 | [`tb_perm_group_perm`](#tb_perm_group_perm) | PermissionGroupPermission | 권한그룹에 들어 있는 권한 코드 (그룹을 지우면 함께 지워진다) |
| 인증·권한 | [`tb_session`](#tb_session) | Session | 로그인 세션 (Better Auth) |
| 인증·권한 | [`tb_user`](#tb_user) | User | 사용자: 로그인 계정과 유형·소속 (Better Auth user 표 — 이름·구조 유지, 0011·0037) |
| 인증·권한 | [`tb_user_center`](#tb_user_center) | UserCenter | 센터 직원 ↔ 소속 센터 (한 직원이 여러 센터를 맡을 수 있다) 직원이 소속된 센터는 지울 수 없다 (Restrict) |
| 인증·권한 | [`tb_user_favorite_menu`](#tb_user_favorite_menu) | UserFavoriteMenu | 사용자별 사이드바 즐겨찾기 메뉴 (docs/decisions/0022) 메뉴는 주소(href)로 구분한다 (메뉴 목록: src/config/navigation.ts). 추가한 순서(createdAt)대로 보여준다 권한이 사라지거나 목록에서 없어진 메뉴는 화면에서만 숨기고 기록은 남긴다 (권한이 돌아오면 다시 보임) |
| 인증·권한 | [`tb_user_grid_setting`](#tb_user_grid_setting) | UserGridSetting | 사용자별 목록 그리드 설정: 사용자 + 그리드 이름(DataGrid id) 하나에 한 줄 (docs/decisions/0021) settings 모양은 src/components/data-grid/settings.ts의 gridSettingsSchema (읽을 때 검사, 깨지면 기본값) (화면이 기억하는 그 밖의 고르기 값은 tb_user_pref — 두 표는 용도가 달라 따로 둔다, 0084 ④-3 M17) |
| 인증·권한 | [`tb_user_perm_group`](#tb_user_perm_group) | UserPermissionGroup | 사용자 ↔ 권한그룹 (한 사용자가 여러 그룹에 속할 수 있다) 사용자가 남아 있는 그룹은 지울 수 없다 (Restrict): 실수로 여러 사람의 권한이 사라지는 것을 막는다 |
| 인증·권한 | [`tb_user_perm_override`](#tb_user_perm_override) | UserPermissionOverride | 사용자별 권한 예외: 같은 사용자·같은 코드에는 하나만 (추가와 제외가 동시에 있을 수 없다) |
| 인증·권한 | [`tb_user_pref`](#tb_user_pref) | UserPref | 사용자 개인 설정 (docs/decisions/0056): 화면이 기억하는 고르기 값 (예: 라벨 인쇄 양식·코드 종류) 키는 코드에 정한 것만 (src/lib/prefs/user-prefs.ts), 값은 키마다 입력 규칙으로 검사한다 |
| 인증·권한 | [`tb_verification`](#tb_verification) | Verification | 인증 확인값 (Better Auth — 비밀번호 재설정 등) |
| 운영사·조직 | [`tb_operator`](#tb_operator) | Operator | 운영사 (docs/specs/operator.md, docs/decisions/0024·0039·0040): 플랫폼을 쓰는 3PL 회사 운영사마다 센터·화주사·공통코드·사용자를 따로 가진다. [1차] = DB·화면, [2차] = DB만(기본값) — 화면은 이후 플랫폼이 정하는 코드(유형·상태·사업자 구분·과세·요금제 등)는 상수 src/config/operator-codes.ts + DB 검사 조건 |
| 운영사·조직 | [`tb_operator_contact`](#tb_operator_contact) | OperatorContact | 운영사 담당자 [1차] (최대 5명, 화면에서 정한 순서대로). 감사 칸 없이 운영사 이력으로 본다 (0038, 사용자 결정) |
| 운영사·조직 | [`tb_operator_service`](#tb_operator_service) | OperatorService | 운영사 제공 서비스 [2차]: 운영사 공통코드 SERVICE_TYPE (운영사 이력으로 본다) |
| 운영사·조직 | [`tb_operator_setting`](#tb_operator_setting) | OperatorSetting | 운영사 설정 (docs/decisions/0092): 키-값. 키 목록·기본값·검사 규칙은 src/config/operator-settings.ts 행이 없으면 기본값을 쓴다. 값은 JSON (숫자·글자·예/아니오·비움) |
| 운영사·조직 | [`tb_operator_temp_zone`](#tb_operator_temp_zone) | OperatorTempZone | 운영사 취급 온도대 [2차]: TEMP_ZONE (AMBIENT·CHILLED·FROZEN·CONSTANT, 상수 + 검사 조건) |
| 운영사·조직 | [`tb_operator_unit`](#tb_operator_unit) | OperatorUnit | 운영사별 단위 설정 (docs/decisions/0079): 시스템 기본 단위를 운영사마다 사용 여부·소수 자리수 바꾼 단위만 줄이 생긴다 (줄이 없으면 시스템 단위의 값). 운영사 추가 단위는 자기 칸을 쓴다 실제 값 = 이 줄의 값 ?? 단위의 값 (src/lib/units/unit-status.ts) |
| 센터·창고·로케이션 | [`tb_center`](#tb_center) | Center | 센터: 운영사의 물류센터 (docs/decisions/0026) 코드 (0025·0084): id(내부) / code(사용자 코드, 같은 운영사 안에서 중복 금지, 필수) / 외부 코드(ExternalCode) |
| 센터·창고·로케이션 | [`tb_center_contact`](#tb_center_contact) | CenterContact | 센터 담당자 (0073): 운영사 담당자와 같은 모양, 최대 10명, 대표 1명 (센터 저장 때 함께 저장) |
| 센터·창고·로케이션 | [`tb_center_temp_zone`](#tb_center_temp_zone) | CenterTempZone | 센터 취급 온도대 (0073): 운영사 TEMP_ZONE 상수 재사용 |
| 센터·창고·로케이션 | [`tb_location`](#tb_location) | Location | 로케이션: 재고가 실제로 놓이는 한 칸, 바코드로 스캔하는 최소 단위 (docs/decisions/0028, 0075) |
| 센터·창고·로케이션 | [`tb_warehouse`](#tb_warehouse) | Warehouse | 창고: 센터 안에서 용도와 재고 성격이 같은 공간의 묶음 (docs/decisions/0027, 0074, docs/db-conventions.md) 유형(WAREHOUSE_TYPE)·온도대(TEMP_ZONE)·상태·기본 재고상태는 플랫폼 상수 + DB 검사 조건 (src/config/operator-codes.ts) |
| 센터·창고·로케이션 | [`tb_zone`](#tb_zone) | Zone | 구역: 창고 안에서 같은 방식으로 운영되는 로케이션 묶음 (docs/decisions/0075). 예: A구역(랙 보관), P구역(피킹) |
| 권역·주소 | [`tb_address_norm_cache`](#tb_address_norm_cache) | AddressNormCache | 주소 정제 결과 캐시 (운영사 공통): 정리한 주소 + 원본 우편번호의 해시 |
| 권역·주소 | [`tb_region_bjd`](#tb_region_bjd) | RegionBjd | 법정동 (운영사 공통, 적재 스크립트로만 갱신): 시도2 + 시군구3 + 읍면동3 + 리2 |
| 권역·주소 | [`tb_region_center_map`](#tb_region_center_map) | RegionCenterMap | 우편번호별 배송센터 배정 (운영사별): (운영사, 우편번호, 온도대)에 센터 하나. 행이 없으면 미배정 |
| 권역·주소 | [`tb_region_center_map_hist`](#tb_region_center_map_hist) | RegionCenterMapHist | 배정 변경 이력: 우편번호마다 전·후 센터 (비어 있으면 미배정) |
| 권역·주소 | [`tb_region_change_batch`](#tb_region_change_batch) | RegionChangeBatch | 권역 변경 작업 단위 (운영사별): 사용자 작업 한 번 = 한 줄. 작업 유형은 상수 REGION_CHANGE_TYPE |
| 권역·주소 | [`tb_region_load_hist`](#tb_region_load_hist) | RegionLoadHist | 지역 마스터 적재 이력 (운영사 공통): 적재 한 번 = 한 줄 |
| 권역·주소 | [`tb_region_zip`](#tb_region_zip) | RegionZip | 우편번호 (5자리 기초구역번호, 운영사 공통) |
| 권역·주소 | [`tb_region_zip_bjd`](#tb_region_zip_bjd) | RegionZipBjd | 우편번호 ↔ 법정동 (N:M): 2개 이상 법정동에 걸치면 경계 우편번호 |
| 단위·팔레트 | [`tb_pallet_type`](#tb_pallet_type) | PalletType | 팔레트 종류 (0083): PLT 계산 기준. 시스템 기본(operator_id NULL) + 운영사 행 — 운영사 행이 같은 코드의 시스템 행을 덮어쓴다 |
| 단위·팔레트 | [`tb_unit`](#tb_unit) | Unit | 단위 기준정보: 시스템 기본 단위 + 운영사 추가 단위 (docs/decisions/0078) |
| 화주사 | [`tb_shipper`](#tb_shipper) | Shipper | 화주사 (docs/decisions/0035, 0080 — 정의서 docs/specs/shipper.md, 표 이름은 tb_shipper 유지) 코드 3층 (0084): id(내부) / code(화주사코드, 비우면 자동 체번 SH0001, 수정 불가) / custCode(운영사 ERP 코드 등) + 외부 코드(ExternalCode) |
| 화주사 | [`tb_shipper_center`](#tb_shipper_center) | ShipperCenter | 화주사의 이용 센터 (화주사 ↔ 센터, 1개 이상) — 센터 직원은 자기 센터를 이용하는 화주사만 본다 기본 센터는 화주당 1개 (부분 고유), 센터별 운영 설정 재정의는 비어 있으면 화주 값 (0080, 화면은 2차) |
| 화주사 | [`tb_shipper_contact`](#tb_shipper_contact) | ShipperContact | 화주사 담당자 (운영사 담당자와 같은 모양, 화주사만 최대 10명 — 0080), 대표 1명, 담당 업무는 공통코드 CONTACT_ROLE 연동 담당(if_contact_yn): 화주당 최대 1명, 이메일 필수 (API 키 발급·만료 알림 받는 사람) |
| 연동 API | [`tb_api_client`](#tb_api_client) | ApiClient | API 키: 형식 {환경}_{식별부}_{비밀부} (예: live_ak7f2c9x_…) — 식별부로 찾고 전체를 해시 비교 화주·환경별 사용 중(ACTIVE) 키는 최대 2개 (교체 기간에 새 키·옛 키를 함께 쓰게) |
| 연동 API | [`tb_api_client_event`](#tb_api_client_event) | ApiClientEvent | 키 이력 (감사 로그): 발급·수정·폐기·만료를 한 줄씩 (누가·언제·바뀐 내용) |
| 연동 API | [`tb_api_client_ip`](#tb_api_client_ip) | ApiClientIp | 허용 IP (하나도 없으면 모든 IP 허용) |
| 연동 API | [`tb_api_client_scope`](#tb_api_client_scope) | ApiClientScope | 키 권한 (상수 API_SCOPE: CUSTOMER_READ … STOCK_READ) |
| 연동 API | [`tb_api_idempotency`](#tb_api_idempotency) | ApiIdempotency | 멱등 처리: 같은 키 + 같은 Idempotency-Key → 처음 응답을 그대로 (24시간 뒤 지움) |
| 연동 API | [`tb_api_rate_bucket`](#tb_api_rate_bucket) | ApiRateBucket | 호출 한도 카운터: 키별 1분 구간마다 한 줄 (고정 구간, 지난 구간은 지움) |
| 연동 API | [`tb_api_request_item`](#tb_api_request_item) | ApiRequestItem | 건별 결과 (등록 API의 배열 한 건마다) |
| 연동 API | [`tb_api_request_log`](#tb_api_request_log) | ApiRequestLog | API 요청 로그: 요청 하나에 한 줄 (응답을 보낸 뒤 저장). 본문은 개인정보를 가린 뒤 저장하고 90일 뒤 비운다 |
| 거래처·납품처 | [`tb_customer`](#tb_customer) | Customer | 거래처 (docs/decisions/0043): 화주사의 고객사 — 출고(MVP 이후) 때 물건을 받는 곳 코드 3층 (0084): id(내부) / code(거래처코드, 비우면 자동 체번 {화주 접두어}C000001, 화주 안에서 고유·수정 불가) / custCode(화주 시스템 거래처코드) + 외부 코드(ExternalCode CUSTOMER) |
| 거래처·납품처 | [`tb_customer_contact`](#tb_customer_contact) | CustomerContact | 거래처 담당자 (담당자 표 4개 공통 모양, 0084) |
| 거래처·납품처 | [`tb_ship_to`](#tb_ship_to) | ShipTo | 납품처: 물건이 실제로 도착하는 곳 (0082). 거래처 하나에 여러 곳, 기본 납품처 정확히 1곳, 사용 중 1곳 이상 납품처마다 배송센터가 정해진다 (assignShipToCenter: 연동 IF / 권역 자동 AUTO / 화면 수동 MANUAL) |
| 품목 | [`tb_item`](#tb_item) | Item | 품목 (docs/decisions/0041, 0083): 화주사가 맡긴 상품의 관리 단위 코드 3층 (0084): id(내부) / code(품목코드, 비우면 자동 체번 {화주 접두어}S000001, 화주 안에서 고유·수정 불가) / custCode(화주 시스템 품목코드) + 외부 코드(ExternalCode ITEM) 기한·LOT·시리얼 관리 여부는 상속하지 않는 명시값: 신규 등록 때 화주 실제 값을 복사하고, 이후 화주 설정이 바뀌어도 그대로 (재고 구조를 정하므로, 0083) |
| 품목 | [`tb_item_barcode`](#tb_item_barcode) | ItemBarcode | 품목 바코드 (0083): 단위별 여러 개, 단위별 대표 1개. 같은 화주 안에서 바코드 하나는 품목·단위 하나만 가리킨다 |
| 품목 | [`tb_item_unit`](#tb_item_unit) | ItemUnit | 품목 단위·환산·규격 (0083): 품목이 쓰는 단위마다 1행, 레벨(BASE·INNER·BOX·PLT)별 1행. 기본단위 행도 반드시 있다 환산수량은 기본단위 기준 (예: 생수 BOX = 24 EA, PLT = 1,440 EA), 소수 자리는 기본단위의 소수 자리수까지 (KG면 2.5 가능) 체적은 BOX 기준, PLT 행은 팔레트 적재 정보(종류·TI·HI)로 자동 계산 |
| 품목 | [`tb_item_unit_hist`](#tb_item_unit_hist) | ItemUnitHist | 품목 단위 환산수량 변경 이력 (0083): 미완료 ASN·주문이 없을 때만 바꿀 수 있고, 바꾸면 남긴다 |
| 입고 | [`tb_asn`](#tb_asn) | Asn | ASN 헤더 |
| 입고 | [`tb_asn_line`](#tb_asn_line) | AsnLine | ASN 라인 (헤더와 통째로 바뀌는 하위 표: 감사 칸은 헤더 이력으로 본다) 수량은 모두 기본단위. 잔량 = max(예정 − 누적 확정, 0), 초과 = max(누적 확정 − 예정, 0) 은 저장하지 않고 계산한다 |
| 입고 | [`tb_inbound_inspection`](#tb_inbound_inspection) | InboundInspection | 입고 검수 결과 (docs/decisions/0053): ASN 라인 하나에 여러 건 (로트·유통기한이 다르게 도착하면 나눠 적는다) 검수 수량(정상)만 입고 확정할 수 있고, 불량 수량은 기록만 한다. 수량은 모두 기본단위 |
| 입고 | [`tb_inbound_label`](#tb_inbound_label) | InboundLabel | 관리 라벨 (docs/decisions/0054): 검수 결과 하나 → 라벨 여러 장 (라벨 단위 입수량으로 나누고 마지막 장은 나머지, 0003 결정 6) 라벨 번호는 하나뿐이고, 같은 라벨을 다시 인쇄(재발행)하면 인쇄 횟수만 는다 |
| 입고 | [`tb_inbound_receipt`](#tb_inbound_receipt) | InboundReceipt | 입고확정 문서: 확정할 때마다 하나 (부분 확정이면 ASN 하나에 여러 개) |
| 입고 | [`tb_inbound_receipt_line`](#tb_inbound_receipt_line) | InboundReceiptLine | 입고확정 라인: 확정 수량이 입고대기 창고의 어느 재고 줄이 됐는지 (적치는 이 줄의 재고만) |
| 입고 | [`tb_putaway`](#tb_putaway) | Putaway | 적치 기록 (docs/decisions/0058): 입고확정 라인의 재고를 입고대기 창고 → 보관 로케이션으로 옮긴 한 번 실제 재고 이동은 재고 변경 공통 함수(moveStock)가 하고, 여기는 어느 확정분을 어디로 얼마나 옮겼는지 남긴다 |
| 재고 | [`tb_stock`](#tb_stock) | Stock | 재고 (docs/decisions/0044, 0003 결정 4): 한 줄 = 재고 주소 하나의 지금 수량 재고 주소: 센터 + 창고 + 로케이션 + 화주사 + 품목 + 로트번호 + 유통기한 - 수량은 직접 고치지 않는다: 재고 변경 공통 함수(이력 기록과 한 트랜잭션)로만 바꾼다 (CLAUDE.md) - 수량은 기본단위, Decimal. 로트·유통기한을 쓰지 않는 품목은 비어 있다(null) - 같은 주소는 한 줄: 로케이션 + 품목 + 로트 + 유통기한 고유 (빈 칸도 같게 본다 — NULLS NOT DISTINCT, 마이그레이션 SQL에서) - 센터·창고·화주사는 로케이션·품목에서 정해지지만 조회가 빠르도록 함께 둔다 (재고 변경 함수가 맞춰 넣는다) - 수량이 0이 돼도 줄은 남긴다 (이력이 이 줄을 가리킨다) |
| 재고 | [`tb_stock_adjust`](#tb_stock_adjust) | StockAdjust | ─ 재고 실사·조정 (M6, docs/decisions/0061) ─────────────── 작업자가 등록하고(등록) 관리자가 확정하면(확정) 재고가 바뀐다 (권한 stock.adjustments.create / confirm) |
| 재고 | [`tb_stock_adjust_line`](#tb_stock_adjust_line) | StockAdjustLine | 실사·조정 줄: 재고 줄 하나 (로케이션 + 품목 + 로트 + 유통기한) |
| 재고 | [`tb_stock_txn`](#tb_stock_txn) | StockTxn | 재고 이력 (docs/decisions/0044): 수량이 바뀐 한 번 = 한 줄. 지우거나 고치지 않는 기록 (DB가 막는다) 주소 칸은 그때 모습 그대로 함께 둔다 (재고 줄과 같지만, 이력만 봐도 알 수 있게) |
| 공통·설정 | [`tb_code_group`](#tb_code_group) | CodeGroup | 공통코드 (docs/decisions/0030): 코드 그룹(서랍) → 코드(서랍 속 물건) 2단계 분류·표시용 값만 공통코드로 관리한다. 프로그램이 값에 따라 동작을 바꾸는 값(창고 유형 등)은 상수 + VARCHAR + CHECK로 둔다 (0084) 업무 표에는 코드 글자(CodeItem.code)를 그대로 저장한다 (예: 담당자 업무 'INBOUND') |
| 공통·설정 | [`tb_code_item`](#tb_code_item) | CodeItem | 공통코드 항목: 그룹 안의 코드·이름 (docs/decisions/0030) |
| 공통·설정 | [`tb_ext_code`](#tb_ext_code) | ExternalCode | 외부 코드 매핑 (docs/decisions/0025): 우리 기준정보 ↔ SAP·ERP 등 외부 시스템 코드 한 줄 = 연동 상대 + 대상 종류 + 대상 id + 외부 코드 - 같은 운영사·같은 연동 상대·같은 종류 안에서 외부 코드 중복 금지 - 한 대상은 연동 상대마다 외부 코드 1개 |
| 기타 | [`tb_carrier`](#tb_carrier) | Carrier | 운송사 (0094): 택배사·화물·자차·용차. 운영사마다 한 벌 — 새 운영사에 기본 7곳을 복사한다 (src/config/defaults/carriers.ts) |
| 기타 | [`tb_carrier_contract`](#tb_carrier_contract) | CarrierContract | 운송 계약 (0094): 센터(·화주)별 택배사 계약 — 고객코드·집하 점소·송장번호 대역 화주를 비우면 센터 공용 계약. 출고 때 고르는 순서: 화주×센터 계약 → 센터 공용 계약 → 화주 기본 택배사 |
| 기타 | [`tb_file`](#tb_file) | File | 첨부파일 (docs/decisions/0091): 파일 정보. 바이트는 저장소(src/lib/files/storage.ts)에 storage_key로 있다 지우지 않는 기록이 아니라 실제로 지운다 (대상에서 떼면 파일도 지운다) — 공통 칸(버전·논리 삭제) 없음 |
| 기타 | [`tb_file_link`](#tb_file_link) | FileLink | 첨부파일 대상 연결 (0091): 여러 장 붙는 곳 — ITEM 품목(IMAGE 이미지) · INSPECTION 검수(PHOTO 사진). 파일 하나는 한 곳에만 |
| 기타 | [`tb_login_hist`](#tb_login_hist) | LoginHist | 로그인 이력 (docs/decisions/0093): 시도마다 한 줄 — SUCCESS 성공 / FAIL 실패 / LOCKED 잠김 / DISABLED 사용 중지·운영사 정지 없는 아이디로 시도하면 user_id 없이 아이디 글자만. 운영사는 그 사용자의 운영사 (플랫폼 관리자·없는 아이디는 비움) |
| 기타 | [`tb_numbering_rule`](#tb_numbering_rule) | NumberingRule | 체번 규칙 (docs/decisions/0084): 대상별 코드·문서번호 모양 operator_id NULL = 시스템 기본 규칙, 값이 있으면 그 운영사의 재정의 (같은 대상이면 운영사 행이 이긴다) 번호 = 접두어(고정 문자 / 화주 code_prefix / 상위 코드) + 구분 문자 + 날짜 + 구분자 + 일련번호 |
| 기타 | [`tb_numbering_seq`](#tb_numbering_seq) | NumberingSeq | 체번 현재값 (docs/decisions/0084): 운영사 × 대상 × 범위 × 주기마다 마지막 번호 발급은 한 문장으로 원자적 증가 (INSERT … ON CONFLICT DO UPDATE … RETURNING) — MAX()+1 금지 이력이 아니라 카운터라 FK를 두지 않는다 (scope_id는 범위에 따라 운영사 0·화주사·거래처 키) |

## tb_account

- 영역: 인증·권한 · 모델: `Account`
- 로그인 수단: 아이디·비밀번호 로그인의 비밀번호(암호화된 값)가 여기에 저장된다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `acct_id` | 계정 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `provider_account_id` | 제공자 계정 ID |  | TEXT | N |  |  |
| 3 | `provider_id` | 제공자 ID |  | TEXT | N |  |  |
| 4 | `user_id` | 사용자 ID |  | BIGINT | N |  | FK → tb_user.user_id |
| 5 | `access_token` | 접근 토큰 |  | TEXT | Y |  |  |
| 6 | `refresh_token` | 갱신 토큰 |  | TEXT | Y |  |  |
| 7 | `id_token` | ID 토큰 |  | TEXT | Y |  |  |
| 8 | `access_token_expires_at` | 접근 토큰 만료 일시 |  | TIMESTAMP(3) | Y |  |  |
| 9 | `refresh_token_expires_at` | 갱신 토큰 만료 일시 |  | TIMESTAMP(3) | Y |  |  |
| 10 | `scope` | 범위 |  | TEXT | Y |  |  |
| 11 | `password` | 비밀번호 |  | TEXT | Y |  |  |
| 12 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |

**인덱스**

- `tb_account_user_id_idx`: `CREATE INDEX tb_account_user_id_idx ON tb_account (user_id)`

## tb_perm_group

- 영역: 인증·권한 · 모델: `PermissionGroup`
- 권한그룹: 권한 코드 묶음 (예: "센터 운영자", "화주 담당자")

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `perm_group_id` | 권한그룹 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `perm_group_nm` | 권한그룹 명 |  | VARCHAR(50) | N |  | UK |
| 3 | `description` | 설명 |  | VARCHAR(200) | Y |  |  |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 6 | `app_area_cd` | 앱 면적 코드 | 이 그룹이 다루는 영역: 그 영역의 권한만 담고, 맞는 유형의 사용자에게만 배정한다 (등록 후 변경 불가) | VARCHAR(20) | N | ADMIN |  |
| 7 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 8 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 9 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 10 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 11 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |

**고유 인덱스**

- `tb_perm_group_operator_id_perm_group_nm_key`: `CREATE UNIQUE INDEX tb_perm_group_operator_id_perm_group_nm_key ON tb_perm_group (operator_id, perm_group_nm) WHERE (del_yn = 'N'::bpchar)`

**검사 조건**

- `tb_perm_group_app_area_cd_check`: `CHECK ((app_area_cd) IN ('ADMIN', 'PORTAL'))`
- `tb_perm_group_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`

## tb_perm_group_perm

- 영역: 인증·권한 · 모델: `PermissionGroupPermission`
- 권한그룹에 들어 있는 권한 코드 (그룹을 지우면 함께 지워진다)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `perm_group_id` | 권한그룹 ID |  | BIGINT | N |  | PK FK → tb_perm_group.perm_group_id |
| 2 | `perm_cd` | 권한 코드 |  | VARCHAR(100) | N |  | PK |

## tb_session

- 영역: 인증·권한 · 모델: `Session`
- 로그인 세션 (Better Auth)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `session_id` | 세션 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `expires_at` | 만료 일시 |  | TIMESTAMP(3) | N |  |  |
| 3 | `token` | 토큰 |  | TEXT | N |  | UK |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 6 | `ip_address` | IP 주소 |  | TEXT | Y |  |  |
| 7 | `user_agent` | 사용자 에이전트 |  | TEXT | Y |  |  |
| 8 | `user_id` | 사용자 ID |  | BIGINT | N |  | FK → tb_user.user_id |

**고유 인덱스**

- `tb_session_token_key`: `CREATE UNIQUE INDEX tb_session_token_key ON tb_session (token)`

**인덱스**

- `tb_session_user_id_idx`: `CREATE INDEX tb_session_user_id_idx ON tb_session (user_id)`

## tb_user

- 영역: 인증·권한 · 모델: `User`
- 사용자: 로그인 계정과 유형·소속 (Better Auth user 표 — 이름·구조 유지, 0011·0037)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `user_nm` | 사용자 명 |  | TEXT | N |  |  |
| 3 | `email` | 이메일 | 아이디 로그인을 쓰므로 이메일이 없는 사용자는 내부용 주소를 자동으로 채운다 (사용자 관리 작업에서) | TEXT | N |  | UK |
| 4 | `email_verified` | 이메일 인증 |  | BOOLEAN | N | false |  |
| 5 | `image` | 이미지 |  | TEXT | Y |  |  |
| 6 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 7 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 8 | `username` | 아이디 | 로그인 아이디 (username 플러그인) | TEXT | Y |  | UK |
| 9 | `display_username` | 표시 아이디 |  | TEXT | Y |  |  |
| 10 | `user_type_cd` | 사용자 유형 코드 |  | VARCHAR(20) | N |  |  |
| 11 | `shipper_id` | 화주사 ID | 화주사 사용자의 소속 화주사 (화주사 사용자만, DB 검사 조건으로 강제: tb_user_shipper_matches_type) | BIGINT | Y |  | FK → tb_shipper.shipper_id |
| 12 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 13 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 14 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 15 | `status_cd` | 상태 코드 | false면 로그인·사용 불가 (퇴사자 등). 기록 보존을 위해 계정을 지우지 않고 막는다 | VARCHAR(20) | N | ACTIVE |  |
| 16 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트, 0039). 플랫폼 관리자만 비어 있고 나머지 유형은 반드시 있다 (DB 검사 조건 tb_user_operator_matches_type) | BIGINT | Y |  | FK → tb_operator.operator_id |
| 17 | `password_change_req_yn` | 비밀번호 변경 요청 여부 | 'Y'면 임시 비밀번호 상태 — 비밀번호를 바꾸기 전에는 다른 화면·작업을 쓸 수 없다 (새 계정·관리자 재설정, 0086) | CHAR(1) | N | N |  |
| 18 | `tel_no` | 전화 번호 | 연락처·부서·직책·사번 (0093) | VARCHAR(20) | Y |  |  |
| 19 | `dept_nm` | 부서 명 |  | VARCHAR(50) | Y |  |  |
| 20 | `position_nm` | 직위 명 |  | VARCHAR(50) | Y |  |  |
| 21 | `emp_no` | emp 번호 |  | VARCHAR(30) | Y |  |  |
| 22 | `login_fail_cnt` | login 실패 수 | 로그인 실패 잠금 (5회 연속 → 30분, 0093): 성공하면 0, 관리자가 풀 수 있다 | INTEGER | N | 0 |  |
| 23 | `locked_until` | locked until |  | TIMESTAMP(3) | Y |  |  |
| 24 | `last_login_at` | 마지막 login 일시 |  | TIMESTAMP(3) | Y |  |  |
| 25 | `last_login_ip` | 마지막 login IP |  | VARCHAR(45) | Y |  |  |

**고유 인덱스**

- `tb_user_email_key`: `CREATE UNIQUE INDEX tb_user_email_key ON tb_user (email)`
- `tb_user_username_key`: `CREATE UNIQUE INDEX tb_user_username_key ON tb_user (username)`

**인덱스**

- `tb_user_operator_id_idx`: `CREATE INDEX tb_user_operator_id_idx ON tb_user (operator_id)`
- `tb_user_shipper_id_idx`: `CREATE INDEX tb_user_shipper_id_idx ON tb_user (shipper_id)`

**검사 조건**

- `tb_user_login_fail_cnt_check`: `CHECK (login_fail_cnt >= 0)`
- `tb_user_operator_matches_type`: `CHECK (((user_type_cd) = 'PLATFORM') = (operator_id IS NULL))`
- `tb_user_password_change_req_yn_check`: `CHECK (password_change_req_yn IN ('Y', 'N')`
- `tb_user_shipper_matches_type`: `CHECK (((user_type_cd) = 'SHIPPER') = (shipper_id IS NOT NULL))`
- `tb_user_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`
- `tb_user_user_type_cd_check`: `CHECK ((user_type_cd) IN ('OPERATOR', 'CENTER', 'SHIPPER', 'PLATFORM'))`

## tb_user_center

- 영역: 인증·권한 · 모델: `UserCenter`
- 센터 직원 ↔ 소속 센터 (한 직원이 여러 센터를 맡을 수 있다) 직원이 소속된 센터는 지울 수 없다 (Restrict)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N |  | PK FK → tb_user.user_id |
| 2 | `center_id` | 센터 ID |  | BIGINT | N |  | PK FK → tb_center.center_id |
| 3 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**인덱스**

- `tb_user_center_center_id_idx`: `CREATE INDEX tb_user_center_center_id_idx ON tb_user_center (center_id)`

## tb_user_favorite_menu

- 영역: 인증·권한 · 모델: `UserFavoriteMenu`
- 사용자별 사이드바 즐겨찾기 메뉴 (docs/decisions/0022) 메뉴는 주소(href)로 구분한다 (메뉴 목록: src/config/navigation.ts). 추가한 순서(createdAt)대로 보여준다 권한이 사라지거나 목록에서 없어진 메뉴는 화면에서만 숨기고 기록은 남긴다 (권한이 돌아오면 다시 보임)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N |  | PK FK → tb_user.user_id |
| 2 | `menu_href` | 메뉴 주소 |  | VARCHAR(200) | N |  | PK |
| 3 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

## tb_user_grid_setting

- 영역: 인증·권한 · 모델: `UserGridSetting`
- 사용자별 목록 그리드 설정: 사용자 + 그리드 이름(DataGrid id) 하나에 한 줄 (docs/decisions/0021) settings 모양은 src/components/data-grid/settings.ts의 gridSettingsSchema (읽을 때 검사, 깨지면 기본값) (화면이 기억하는 그 밖의 고르기 값은 tb_user_pref — 두 표는 용도가 달라 따로 둔다, 0084 ④-3 M17)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N |  | PK FK → tb_user.user_id |
| 2 | `grid_cd` | 그리드 코드 |  | VARCHAR(50) | N |  | PK |
| 3 | `settings` | 설정 |  | JSONB | N |  |  |
| 4 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |

## tb_user_perm_group

- 영역: 인증·권한 · 모델: `UserPermissionGroup`
- 사용자 ↔ 권한그룹 (한 사용자가 여러 그룹에 속할 수 있다) 사용자가 남아 있는 그룹은 지울 수 없다 (Restrict): 실수로 여러 사람의 권한이 사라지는 것을 막는다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N |  | PK FK → tb_user.user_id |
| 2 | `perm_group_id` | 권한그룹 ID |  | BIGINT | N |  | PK FK → tb_perm_group.perm_group_id |
| 3 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**인덱스**

- `tb_user_perm_group_perm_group_id_idx`: `CREATE INDEX tb_user_perm_group_perm_group_id_idx ON tb_user_perm_group (perm_group_id)`

## tb_user_perm_override

- 영역: 인증·권한 · 모델: `UserPermissionOverride`
- 사용자별 권한 예외: 같은 사용자·같은 코드에는 하나만 (추가와 제외가 동시에 있을 수 없다)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N |  | PK FK → tb_user.user_id |
| 2 | `perm_cd` | 권한 코드 |  | VARCHAR(100) | N |  | PK |
| 3 | `effect_cd` | 효과 코드 |  | VARCHAR(20) | N |  |  |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**검사 조건**

- `tb_user_perm_override_effect_cd_check`: `CHECK ((effect_cd) IN ('GRANT', 'DENY'))`

## tb_user_pref

- 영역: 인증·권한 · 모델: `UserPref`
- 사용자 개인 설정 (docs/decisions/0056): 화면이 기억하는 고르기 값 (예: 라벨 인쇄 양식·코드 종류) 키는 코드에 정한 것만 (src/lib/prefs/user-prefs.ts), 값은 키마다 입력 규칙으로 검사한다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `user_id` | 사용자 ID |  | BIGINT | N |  | PK FK → tb_user.user_id |
| 2 | `pref_key` | 설정 키 |  | VARCHAR(50) | N |  | PK |
| 3 | `pref_value` | 설정 가액 |  | JSONB | N |  |  |
| 4 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |

## tb_verification

- 영역: 인증·권한 · 모델: `Verification`
- 인증 확인값 (Better Auth — 비밀번호 재설정 등)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `verification_id` | 인증 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `identifier` | 식별자 |  | TEXT | N |  |  |
| 3 | `value` | 가액 |  | TEXT | N |  |  |
| 4 | `expires_at` | 만료 일시 |  | TIMESTAMP(3) | N |  |  |
| 5 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 6 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |

**인덱스**

- `tb_verification_identifier_idx`: `CREATE INDEX tb_verification_identifier_idx ON tb_verification (identifier)`

## tb_operator

- 영역: 운영사·조직 · 모델: `Operator`
- 운영사 (docs/specs/operator.md, docs/decisions/0024·0039·0040): 플랫폼을 쓰는 3PL 회사 운영사마다 센터·화주사·공통코드·사용자를 따로 가진다. [1차] = DB·화면, [2차] = DB만(기본값) — 화면은 이후 플랫폼이 정하는 코드(유형·상태·사업자 구분·과세·요금제 등)는 상수 src/config/operator-codes.ts + DB 검사 조건

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_nm` | 운영사 명 |  | VARCHAR(100) | N |  |  |
| 3 | `biz_reg_no` | 사업자등록번호 | 사업자등록번호·법인등록번호·전화번호는 하이픈 없이 숫자만 (0029) | CHAR(10) | N |  |  |
| 4 | `ceo_nm` | 대표자 명 |  | VARCHAR(50) | Y |  |  |
| 5 | `biz_condition` | 업태 | 업태 / 종목 (거래명세서·세금계산서용) | VARCHAR(100) | Y |  |  |
| 6 | `biz_item` | 종목 |  | VARCHAR(100) | Y |  |  |
| 7 | `tel_no` | 전화 번호 | ② 연락처·주소 [1차] | VARCHAR(15) | Y |  |  |
| 8 | `fax_no` | 팩스 번호 |  | VARCHAR(15) | Y |  |  |
| 9 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 10 | `zip_cd` | 우편번호 | 주소: 카카오 우편번호 서비스로 검색해 채우고, 상세주소만 직접 입력. 지번주소는 검색 결과를 자동 저장 | VARCHAR(10) | Y |  |  |
| 11 | `addr1` | 주소 |  | VARCHAR(200) | Y |  |  |
| 12 | `addr2` | 상세주소 |  | VARCHAR(200) | Y |  |  |
| 13 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 14 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 15 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 16 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 17 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 18 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 19 | `status_cd` | 상태 코드 | 운영 상태 OPERATOR_STATUS: PENDING 대기 / ACTIVE 운영 / SUSPENDED 정지 / TERMINATED 해지 ACTIVE가 아니면 그 운영사의 사용자는 로그인·사용할 수 없다 (플랫폼 관리자가 바꾼다, 0039) | VARCHAR(20) | N | ACTIVE |  |
| 20 | `addr_jibun` | 주소 지번 |  | VARCHAR(200) | Y |  |  |
| 21 | `alloc_rule_cd` | 할당 규칙 코드 | 재고할당 규칙 ALLOC_RULE | VARCHAR(20) | N | FIFO |  |
| 22 | `billing_basis_cd` | 청구 기준 코드 |  | VARCHAR(20) | Y |  |  |
| 23 | `billing_email` | 청구 이메일 |  | VARCHAR(100) | Y |  |  |
| 24 | `biz_entity_cd` | 사업자 구분 코드 | 사업자 구분 BIZ_ENTITY (CORP 법인 / INDIVIDUAL 개인), 법인등록번호는 법인일 때만 | VARCHAR(20) | N | CORP |  |
| 25 | `bonded_yn` | 보세 여부 |  | CHAR(1) | N | N |  |
| 26 | `closing_day` | 마감 일 | 정산 마감일: 1~31일, 99 = 말일 | SMALLINT | N | 99 |  |
| 27 | `contract_end_dt` | 계약 종료 일자 | 비어 있으면 무기한 | DATE | Y |  |  |
| 28 | `contract_start_dt` | 계약 시작 일자 |  | DATE | N | CURRENT_DATE |  |
| 29 | `corp_reg_no` | 법인 등록 번호 |  | CHAR(13) | Y |  |  |
| 30 | `country_cd` | 국가 코드 | 국가 ISO 3166 (화면 미노출) | CHAR(2) | N | KR |  |
| 31 | `currency_cd` | 통화 코드 | ④ 운영 기본값 [2차] (센터·화주가 상속) | CHAR(3) | N | KRW |  |
| 32 | `customs_yn` | 세관 여부 |  | CHAR(1) | N | N |  |
| 33 | `establish_dt` | 설립 일자 |  | DATE | Y |  |  |
| 34 | `expiry_mgmt_yn` | 기한 관리 여부 |  | CHAR(1) | N | N |  |
| 35 | `ext_attr` | 확장속성 | ⑦ 확장·시스템 | JSONB | Y |  |  |
| 36 | `freight_license_no` | 운송 특허 번호 |  | VARCHAR(30) | Y |  |  |
| 37 | `gln_cd` | GLN 코드 |  | VARCHAR(13) | Y |  |  |
| 38 | `homepage_url` | 홈페이지 URL |  | VARCHAR(200) | Y |  |  |
| 39 | `lang_cd` | 언어 코드 |  | VARCHAR(5) | N | ko-KR |  |
| 40 | `latitude` | 위도 | 좌표 (주소 검색이 주지 않아 지금은 비어 있다) | DECIMAL(10,7) | Y |  |  |
| 41 | `logo_file_id` | 로고 파일 ID | 로고·직인 이미지 (첨부파일, 0091) | BIGINT | Y |  | FK → tb_file.file_id |
| 42 | `longitude` | 경도 |  | DECIMAL(10,7) | Y |  |  |
| 43 | `lot_mgmt_yn` | LOT 관리 여부 |  | CHAR(1) | N | N |  |
| 44 | `max_center_cnt` | 최대 센터 수 |  | INTEGER | Y |  |  |
| 45 | `max_shipper_cnt` | 최대 화주사 수 |  | INTEGER | Y |  |  |
| 46 | `max_user_cnt` | 최대 사용자 수 | 비어 있으면 무제한 | INTEGER | Y |  |  |
| 47 | `operator_cd` | 운영사 코드 | ① 기본 정보 [1차] 운영사코드: 영문 대문자·숫자·_- 2~20자, 등록 후 바꿀 수 없다. 관리자 아이디 admin.{코드 소문자} | VARCHAR(20) | N |  | UK |
| 48 | `operator_nm_en` | 운영사 명 영문 |  | VARCHAR(100) | Y |  |  |
| 49 | `operator_short_nm` | 운영사 약칭 명 |  | VARCHAR(50) | Y |  |  |
| 50 | `operator_type_cd` | 운영사 유형 코드 | 운영사 유형 OPERATOR_TYPE (3PL 기본) | VARCHAR(20) | N | 3PL |  |
| 51 | `plan_cd` | 요금제 코드 | ⑤ 계약·요금제 [2차] (플랫폼만) | VARCHAR(20) | N | TRIAL |  |
| 52 | `print_company_nm` | 출력 회사 명 | ⑥ 출력 설정 [2차] (파일 표가 생기면 로고·직인에 외래 키를 건다) | VARCHAR(100) | Y |  |  |
| 53 | `remark` | 비고 | 비고 [1차, 기본 정보 아래] | VARCHAR(1000) | Y |  |  |
| 54 | `sales_channel_cd` | 영업 채널 코드 | 유입 경로 (플랫폼 관리자만 표시, 값 목록은 아직 정하지 않음) | VARCHAR(20) | Y |  |  |
| 55 | `serial_mgmt_yn` | 시리얼 관리 여부 |  | CHAR(1) | N | N |  |
| 56 | `ship_cutoff_time` | 출고 마감 시각 |  | TIME WITHOUT TIME ZONE | Y |  |  |
| 57 | `stamp_file_id` | 도장 파일 ID |  | BIGINT | Y |  | FK → tb_file.file_id |
| 58 | `status_reason` | 상태 사유 | 상태변경 사유 (정지·해지로 바꿀 때 필수) | VARCHAR(200) | Y |  |  |
| 59 | `sub_biz_no` | 종 사업자 번호 |  | CHAR(4) | Y |  |  |
| 60 | `tax_invoice_email` | 세금계산서 이메일 |  | VARCHAR(100) | Y |  |  |
| 61 | `tax_type_cd` | 세금 유형 코드 | 과세유형 TAX_TYPE | VARCHAR(20) | N | GENERAL |  |
| 62 | `timezone` | 시간대 |  | VARCHAR(50) | N | Asia/Seoul |  |
| 63 | `warehouse_reg_no` | 창고 등록 번호 | ③ 물류 자격 [2차] | VARCHAR(30) | Y |  |  |
| 64 | `region_auto_grade` | 권역 자동 등급 | 권역설정 (0076): 자동 지정을 허용할 주소 정제 등급 (기본 D = D 이상 자동) | CHAR(1) | N | D |  |
| 65 | `default_pallet_type_cd` | 기본 팔레트 유형 코드 | 기본 팔레트 종류 (품목 팔레트 적재의 기본값, 0083) | VARCHAR(20) | N | T11 |  |
| 66 | `weight_unit_id` | 중량 단위 ID | 표시 단위: 단위 기준정보의 중량·길이 단위 (시스템 또는 이 운영사의 단위 — 유형은 DB 트리거로 검사, 0078·0084) 기본값은 시스템 KG·CM 단위 (DB 함수 system_unit_id) | BIGINT | N | system_unit_id('KG') | FK → tb_unit.unit_id |
| 67 | `length_unit_id` | 길이 단위 ID |  | BIGINT | N | system_unit_id('CM') | FK → tb_unit.unit_id |

**고유 인덱스**

- `tb_operator_operator_cd_key`: `CREATE UNIQUE INDEX tb_operator_operator_cd_key ON tb_operator (operator_cd) WHERE (del_yn = 'N'::bpchar)`

**검사 조건**

- `tb_operator_alloc_rule_cd_check`: `CHECK ((alloc_rule_cd) IN (('FIFO'), ('FEFO'), ('LIFO'))`
- `tb_operator_billing_basis_cd_check`: `CHECK ((billing_basis_cd IS NULL) OR ((billing_basis_cd) IN (('FIXED'), ('USAGE'), ('MIXED')))`
- `tb_operator_biz_entity_cd_check`: `CHECK ((biz_entity_cd) IN (('CORP'), ('INDIVIDUAL'))`
- `tb_operator_closing_day_check`: `CHECK (((closing_day >= 1) AND (closing_day <= 31)) OR (closing_day = 99))`
- `tb_operator_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_operator_number_digits_check`: `CHECK ((biz_reg_no ~ '^[0-9]{10}$') AND ((corp_reg_no IS NULL) OR (corp_reg_no ~ '^[0-9]{13}$')) AND ((sub_biz_no IS NULL) OR (sub_biz_no ~ '^[0-9]{4}$')))`
- `tb_operator_operator_cd_check`: `CHECK ((operator_cd) ~ '^[A-Z0-9_-]{2,20}$')`
- `tb_operator_operator_type_cd_check`: `CHECK ((operator_type_cd) IN ('3PL', 'FULFILLMENT', 'IN_HOUSE', 'FORWARDING', 'MIXED'))`
- `tb_operator_plan_cd_check`: `CHECK ((plan_cd) IN ('TRIAL', 'BASIC', 'STANDARD', 'ENTERPRISE'))`
- `tb_operator_region_auto_grade_check`: `CHECK (region_auto_grade IN ('A', 'B', 'C', 'D')`
- `tb_operator_status_cd_check`: `CHECK ((status_cd) IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'))`
- `tb_operator_status_reason_check`: `CHECK (((status_cd) <> ALL (ARRAY['SUSPENDED', 'TERMINATED'])) OR (status_reason IS NOT NULL))`
- `tb_operator_tax_type_cd_check`: `CHECK ((tax_type_cd) IN (('GENERAL'), ('SIMPLE'), ('EXEMPT'))`
- `tb_operator_yn_check`: `CHECK ((bonded_yn IN ('Y', 'N') AND (customs_yn IN ('Y', 'N') AND (lot_mgmt_yn IN ('Y', 'N') AND (expiry_mgmt_yn IN ('Y', 'N') AND (serial_mgmt_yn IN ('Y', 'N'))`

## tb_operator_contact

- 영역: 운영사·조직 · 모델: `OperatorContact`
- 운영사 담당자 [1차] (최대 5명, 화면에서 정한 순서대로). 감사 칸 없이 운영사 이력으로 본다 (0038, 사용자 결정)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_contact_id` | 운영사 담당자 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N |  |  |
| 4 | `role_cd` | 역할 코드 | 담당 업무: 운영사 공통코드 CONTACT_ROLE의 코드 (예: INBOUND, 0030) | VARCHAR(20) | N |  |  |
| 5 | `contact_nm` | 담당자 명 |  | VARCHAR(50) | N |  |  |
| 6 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 7 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 8 | `primary_yn` | 대표 여부 | 대표 담당자 (담당자가 있으면 정확히 1명) | CHAR(1) | N | N |  |
| 9 | `dept_nm` | 부서 명 | 부서·직책·알림 수신 | VARCHAR(50) | Y |  |  |
| 10 | `notify_yn` | 알림 여부 |  | CHAR(1) | N | Y |  |
| 11 | `position_nm` | 직위 명 |  | VARCHAR(50) | Y |  |  |
| 12 | `created_at` | 등록 일시 | 감사 칸 (담당자 표 4개 같은 모양, 0084 ④-3): 등록·수정자는 prisma.ts가 채운다 | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 14 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 15 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_operator_contact_primary_key`: `CREATE UNIQUE INDEX tb_operator_contact_primary_key ON tb_operator_contact (operator_id) WHERE (primary_yn = 'Y'::bpchar)`

**인덱스**

- `tb_operator_contact_operator_id_sort_seq_idx`: `CREATE INDEX tb_operator_contact_operator_id_sort_seq_idx ON tb_operator_contact (operator_id, sort_seq)`

**검사 조건**

- `tb_operator_contact_notify_yn_check`: `CHECK (notify_yn IN ('Y', 'N')`
- `tb_operator_contact_primary_yn_check`: `CHECK (primary_yn IN ('Y', 'N')`

## tb_operator_service

- 영역: 운영사·조직 · 모델: `OperatorService`
- 운영사 제공 서비스 [2차]: 운영사 공통코드 SERVICE_TYPE (운영사 이력으로 본다)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | PK FK → tb_operator.operator_id |
| 2 | `service_cd` | 서비스 코드 |  | VARCHAR(20) | N |  | PK |

## tb_operator_setting

- 영역: 운영사·조직 · 모델: `OperatorSetting`
- 운영사 설정 (docs/decisions/0092): 키-값. 키 목록·기본값·검사 규칙은 src/config/operator-settings.ts 행이 없으면 기본값을 쓴다. 값은 JSON (숫자·글자·예/아니오·비움)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | PK FK → tb_operator.operator_id |
| 2 | `setting_key` | setting 키 |  | VARCHAR(50) | N |  | PK |
| 3 | `setting_value` | setting 가액 |  | JSONB | N |  |  |
| 4 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

## tb_operator_temp_zone

- 영역: 운영사·조직 · 모델: `OperatorTempZone`
- 운영사 취급 온도대 [2차]: TEMP_ZONE (AMBIENT·CHILLED·FROZEN·CONSTANT, 상수 + 검사 조건)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | PK FK → tb_operator.operator_id |
| 2 | `temp_zone_cd` | 온도대 코드 |  | VARCHAR(20) | N |  | PK |

**검사 조건**

- `tb_operator_temp_zone_cd_check`: `CHECK ((temp_zone_cd) IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))`

## tb_operator_unit

- 영역: 운영사·조직 · 모델: `OperatorUnit`
- 운영사별 단위 설정 (docs/decisions/0079): 시스템 기본 단위를 운영사마다 사용 여부·소수 자리수 바꾼 단위만 줄이 생긴다 (줄이 없으면 시스템 단위의 값). 운영사 추가 단위는 자기 칸을 쓴다 실제 값 = 이 줄의 값 ?? 단위의 값 (src/lib/units/unit-status.ts)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_unit_id` | 운영사 단위 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `unit_id` | 단위 ID |  | BIGINT | N |  | UK FK → tb_unit.unit_id |
| 4 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 5 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 6 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 7 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 8 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 9 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 10 | `decimal_cnt` | 소수 수 | 이 운영사의 소수 자리수 (비우면 시스템 단위 값, 0~6) | INTEGER | Y |  |  |

**고유 인덱스**

- `tb_operator_unit_operator_id_unit_id_key`: `CREATE UNIQUE INDEX tb_operator_unit_operator_id_unit_id_key ON tb_operator_unit (operator_id, unit_id)`

**인덱스**

- `tb_operator_unit_unit_id_idx`: `CREATE INDEX tb_operator_unit_unit_id_idx ON tb_operator_unit (unit_id)`

**검사 조건**

- `tb_operator_unit_decimal_range`: `CHECK ((decimal_cnt IS NULL) OR ((decimal_cnt >= 0) AND (decimal_cnt <= 6)))`
- `tb_operator_unit_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`

## tb_center

- 영역: 센터·창고·로케이션 · 모델: `Center`
- 센터: 운영사의 물류센터 (docs/decisions/0026) 코드 (0025·0084): id(내부) / code(사용자 코드, 같은 운영사 안에서 중복 금지, 필수) / 외부 코드(ExternalCode)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `center_id` | 센터 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `center_cd` | 센터 코드 | 시스템 코드: CT000001 (내부용 불변 코드) ① 기본 정보 (docs/decisions/0073, docs/specs/center.md) 센터코드: 영문 대문자·숫자 1~20자, 필수, 등록 후 바꿀 수 없음 (라벨·문서에 찍힌다) | VARCHAR(20) | N |  | UK |
| 3 | `center_nm` | 센터 명 |  | VARCHAR(100) | N |  |  |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 6 | `addr1` | 주소 |  | VARCHAR(200) | Y |  |  |
| 7 | `addr2` | 상세주소 |  | VARCHAR(200) | Y |  |  |
| 8 | `fax_no` | 팩스 번호 |  | VARCHAR(15) | Y |  |  |
| 9 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 10 | `zip_cd` | 우편번호 |  | VARCHAR(10) | Y |  |  |
| 11 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 12 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 13 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 14 | `status_cd` | 상태 코드 | 운영 상태 (상수 CENTER_STATUS): PREPARING 준비중 / ACTIVE 운영중 / SUSPENDED 일시중지 / CLOSED 폐쇄 폐쇄만 데이터 범위에서 빠지고, 새 업무(입고·재고 등) 고르기는 운영중만 | VARCHAR(20) | N | PREPARING |  |
| 15 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 16 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 17 | `addr_jibun` | 주소 지번 |  | VARCHAR(200) | Y |  |  |
| 18 | `alloc_rule_cd` | 할당 규칙 코드 |  | VARCHAR(20) | Y |  |  |
| 19 | `biz_reg_no` | 사업자등록번호 | 운영사와 다를 때만 (NULL = 운영사 값), 숫자만 | CHAR(10) | Y |  |  |
| 20 | `bonded_area_cd` | 보세 면적 코드 |  | VARCHAR(20) | Y |  |  |
| 21 | `bonded_license_no` | 보세 특허번호 |  | VARCHAR(30) | Y |  |  |
| 22 | `bonded_type_cd` | 보세 유형 코드 |  | VARCHAR(20) | Y |  |  |
| 23 | `bonded_yn` | 보세 여부 | ④ 시설 자격 (1차: 보세 여부 / 2차: 나머지 — 보세 칸은 나중에 tb_center_bonded로 옮길 수 있다) | CHAR(1) | N | N |  |
| 24 | `ceiling_height_m` | 천장 높이(m) |  | DECIMAL(5,2) | Y |  |  |
| 25 | `center_nm_en` | 센터 명 영문 |  | VARCHAR(100) | Y |  |  |
| 26 | `center_short_nm` | 센터 약칭 명 |  | VARCHAR(30) | Y |  |  |
| 27 | `center_type_cd` | 센터 유형 코드 | 센터 유형 (상수 CENTER_TYPE): OWN 자가 / LEASE 임차 / PARTNER 협력·위탁 / VIRTUAL 가상 | VARCHAR(20) | N | LEASE |  |
| 28 | `close_dt` | 운영 종료일 |  | DATE | Y |  |  |
| 29 | `country_cd` | 국가 코드 | ② 위치·연락처 (전화번호는 하이픈 없이 숫자만, 0029) | CHAR(2) | N | KR |  |
| 30 | `customs_office_cd` | 관할 세관 코드 |  | VARCHAR(10) | Y |  |  |
| 31 | `default_inbound_location_id` | 기본 입고 로케이션 ID | 기본 로케이션 3개: 센터 생성·보정 때 입고대기·출고대기·반품대기 창고의 DEFAULT를 연결 (ensureCenterDefaults) | BIGINT | Y |  | FK → tb_location.location_id |
| 32 | `default_outbound_location_id` | 기본 출고 로케이션 ID |  | BIGINT | Y |  | FK → tb_location.location_id |
| 33 | `default_return_location_id` | 기본 반품 로케이션 ID |  | BIGINT | Y |  | FK → tb_location.location_id |
| 34 | `directions` | 오시는길 |  | VARCHAR(1000) | Y |  |  |
| 35 | `dock_cnt` | 도크 수 |  | INTEGER | Y |  |  |
| 36 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 37 | `expiry_mgmt_yn` | 기한 관리 여부 |  | CHAR(1) | Y |  |  |
| 38 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 39 | `floor_area_m2` | 연면적(㎡) | ③ 시설 정보 (1차: 연면적·보관면적·도크 / 2차: 나머지) | DECIMAL(12,2) | Y |  |  |
| 40 | `floor_cnt` | 층 수 |  | INTEGER | Y |  |  |
| 41 | `food_storage_yn` | 식품 보관 여부 |  | CHAR(1) | N | N |  |
| 42 | `gln_cd` | GLN 코드 |  | VARCHAR(13) | Y |  |  |
| 43 | `hazmat_yn` | 위험물 여부 |  | CHAR(1) | N | N |  |
| 44 | `inbound_cutoff_time` | 입고 마감 시각 |  | TIME WITHOUT TIME ZONE | Y |  |  |
| 45 | `land_area_m2` | 대지면적(㎡) |  | DECIMAL(12,2) | Y |  |  |
| 46 | `latitude` | 위도 |  | DECIMAL(10,7) | Y |  |  |
| 47 | `longitude` | 경도 |  | DECIMAL(10,7) | Y |  |  |
| 48 | `lot_mgmt_yn` | LOT 관리 여부 |  | CHAR(1) | Y |  |  |
| 49 | `open_dt` | 운영 시작일 |  | DATE | Y |  |  |
| 50 | `pallet_capa_cnt` | 팔레트 용량 수 |  | INTEGER | Y |  |  |
| 51 | `pharma_yn` | 의약품 여부 |  | CHAR(1) | N | N |  |
| 52 | `sigungu_nm` | 시군구 명 |  | VARCHAR(50) | Y |  |  |
| 53 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 54 | `serial_mgmt_yn` | 시리얼 관리 여부 |  | CHAR(1) | Y |  |  |
| 55 | `ship_cutoff_time` | 출고 마감 시각 |  | TIME WITHOUT TIME ZONE | Y |  |  |
| 56 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 57 | `status_reason` | 상태 사유 |  | VARCHAR(200) | Y |  |  |
| 58 | `storage_area_m2` | 보관면적(㎡) |  | DECIMAL(12,2) | Y |  |  |
| 59 | `sub_biz_no` | 종 사업자 번호 |  | CHAR(4) | Y |  |  |
| 60 | `timezone` | 시간대 |  | VARCHAR(50) | Y |  |  |
| 61 | `warehouse_reg_no` | 창고 등록 번호 |  | VARCHAR(30) | Y |  |  |
| 62 | `work_days` | 운영 요일 | 월~일 Y/N 7글자 | CHAR(7) | N | YYYYYNN |  |
| 63 | `work_end_time` | 작업 종료 시각 |  | TIME WITHOUT TIME ZONE | Y |  |  |
| 64 | `work_start_time` | 작업 시작 시각 | ⑤ 운영 설정 — 상속 칸(출고 마감·타임존·할당 규칙·로트·유통기한·시리얼)은 NULL = 운영사 값 | TIME WITHOUT TIME ZONE | Y |  |  |
| 65 | `center_cust_cd` | 센터 사용자정의코드 | 사용자 정의 코드 (ERP 플랜트 등, 0093) — 운영사 안에서 겹치지 않게, 수정 가능 | VARCHAR(50) | Y |  |  |

**고유 인덱스**

- `tb_center_operator_id_center_cd_key`: `CREATE UNIQUE INDEX tb_center_operator_id_center_cd_key ON tb_center (operator_id, center_cd) WHERE (del_yn = 'N'::bpchar)`

**검사 조건**

- `tb_center_alloc_rule_cd_check`: `CHECK ((alloc_rule_cd) IN (('FIFO'), ('FEFO'), ('LIFO'))`
- `tb_center_biz_reg_no_check`: `CHECK (biz_reg_no ~ '^[0-9]{10}$')`
- `tb_center_bonded_check`: `CHECK ((bonded_yn = 'Y') OR ((bonded_type_cd IS NULL) AND (bonded_license_no IS NULL) AND (bonded_area_cd IS NULL) AND (customs_office_cd IS NULL)))`
- `tb_center_bonded_type_cd_check`: `CHECK ((bonded_type_cd) IN ('BW_COMMERCIAL', 'BW_PRIVATE', 'BONDED_FACTORY', 'GENERAL_BONDED', 'FTZ'))`
- `tb_center_center_cd_check`: `CHECK ((center_cd) ~ '^[A-Z0-9]{1,20}$')`
- `tb_center_center_type_cd_check`: `CHECK ((center_type_cd) IN ('OWN', 'LEASE', 'PARTNER', 'VIRTUAL'))`
- `tb_center_close_dt_check`: `CHECK (((status_cd) <> 'CLOSED') OR (close_dt IS NOT NULL))`
- `tb_center_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_center_facility_check`: `CHECK ((COALESCE(floor_area_m2, 0) >= 0) AND (COALESCE(storage_area_m2, 0) >= 0) AND (COALESCE(dock_cnt, 0) >= 0) AND (COALESCE(land_area_m2, 0) >= 0) AND (COALESCE(floor_cnt, 0) >= 0) AND (COALESCE(ceiling_height_m, 0) >= 0) AND (COALESCE(pallet_capa_cnt, 0) >= 0))`
- `tb_center_gln_cd_check`: `CHECK ((gln_cd) ~ '^[0-9]{13}$')`
- `tb_center_mgmt_yn_check`: `CHECK ((COALESCE(lot_mgmt_yn, 'N') IN ('Y', 'N') AND (COALESCE(expiry_mgmt_yn, 'N') IN ('Y', 'N') AND (COALESCE(serial_mgmt_yn, 'N') IN ('Y', 'N'))`
- `tb_center_status_cd_check`: `CHECK ((status_cd) IN ('PREPARING', 'ACTIVE', 'SUSPENDED', 'CLOSED'))`
- `tb_center_status_reason_check`: `CHECK (((status_cd) <> ALL (ARRAY['SUSPENDED', 'CLOSED'])) OR (status_reason IS NOT NULL))`
- `tb_center_sub_biz_no_check`: `CHECK (sub_biz_no ~ '^[0-9]{4}$')`
- `tb_center_work_days_check`: `CHECK (work_days ~ '^[YN]{7}$')`
- `tb_center_yn_check`: `CHECK ((bonded_yn IN ('Y', 'N') AND (hazmat_yn IN ('Y', 'N') AND (food_storage_yn IN ('Y', 'N') AND (pharma_yn IN ('Y', 'N'))`

## tb_center_contact

- 영역: 센터·창고·로케이션 · 모델: `CenterContact`
- 센터 담당자 (0073): 운영사 담당자와 같은 모양, 최대 10명, 대표 1명 (센터 저장 때 함께 저장)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `center_contact_id` | 센터 담당자 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `center_id` | 센터 ID |  | BIGINT | N |  | UK FK → tb_center.center_id |
| 3 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N |  |  |
| 4 | `role_cd` | 역할 코드 | 담당 업무: 운영사 공통코드 CENTER_CONTACT_ROLE의 코드 (예: MANAGER) | VARCHAR(20) | N |  |  |
| 5 | `contact_nm` | 담당자 명 |  | VARCHAR(50) | N |  |  |
| 6 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 7 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 8 | `primary_yn` | 대표 여부 |  | CHAR(1) | N | N |  |
| 9 | `dept_nm` | 부서 명 | 부서·직책·알림 수신 | VARCHAR(50) | Y |  |  |
| 10 | `position_nm` | 직위 명 |  | VARCHAR(50) | Y |  |  |
| 11 | `notify_yn` | 알림 여부 |  | CHAR(1) | N | Y |  |
| 12 | `created_at` | 등록 일시 | 감사 칸 (담당자 표 4개 같은 모양, 0084 ④-3): 등록·수정자는 prisma.ts가 채운다 | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 14 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 15 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_center_contact_primary_key`: `CREATE UNIQUE INDEX tb_center_contact_primary_key ON tb_center_contact (center_id) WHERE (primary_yn = 'Y'::bpchar)`

**인덱스**

- `tb_center_contact_center_id_sort_seq_idx`: `CREATE INDEX tb_center_contact_center_id_sort_seq_idx ON tb_center_contact (center_id, sort_seq)`

**검사 조건**

- `tb_center_contact_yn_check`: `CHECK ((primary_yn IN ('Y', 'N') AND (notify_yn IN ('Y', 'N'))`

## tb_center_temp_zone

- 영역: 센터·창고·로케이션 · 모델: `CenterTempZone`
- 센터 취급 온도대 (0073): 운영사 TEMP_ZONE 상수 재사용

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `center_id` | 센터 ID |  | BIGINT | N |  | PK FK → tb_center.center_id |
| 2 | `temp_zone_cd` | 온도대 코드 |  | VARCHAR(20) | N |  | PK |
| 3 | `area_m2` | 면적(㎡) | [2차] 면적·관리 온도 | DECIMAL(12,2) | Y |  |  |
| 4 | `min_temp` | 최소 온도 |  | DECIMAL(5,1) | Y |  |  |
| 5 | `max_temp` | 최대 온도 |  | DECIMAL(5,1) | Y |  |  |
| 6 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 7 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 8 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 9 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

**검사 조건**

- `tb_center_temp_zone_cd_check`: `CHECK ((temp_zone_cd) IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))`

## tb_location

- 영역: 센터·창고·로케이션 · 모델: `Location`
- 로케이션: 재고가 실제로 놓이는 한 칸, 바코드로 스캔하는 최소 단위 (docs/decisions/0028, 0075)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `location_id` | 로케이션 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `warehouse_id` | 창고 ID |  | BIGINT | N |  | UK FK → tb_warehouse.warehouse_id |
| 3 | `location_cd` | 로케이션 코드 | ① 기본 정보 [1차] 같은 창고 안에서 중복 금지, 등록 후 수정 불가 (라벨이 붙어 있다). 영문 대문자·숫자·'-', 글자 그대로 비교(C 정렬) | VARCHAR(30) | N |  | UK |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 6 | `row_no` | 열 | ② 위치 구성 [1차: 열·단 / 2차: 연·칸·좌표] (정보용, 일괄 생성은 코드와 같은 값) | VARCHAR(10) | Y |  |  |
| 7 | `level_no` | 단 |  | VARCHAR(10) | Y |  |  |
| 8 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 9 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 10 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 11 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 12 | `del_yn` | 삭제여부 | 코드는 삭제 안 된 것끼리만 겹치면 안 된다 (지운 코드는 다시 쓸 수 있다, 0038) 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 13 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 14 | `description` | 설명 | 목록 코드 옆 보조 문구 (예전 명칭 칸, 0071) | VARCHAR(200) | Y |  |  |
| 15 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 16 | `center_id` | 센터 ID | 센터·창고는 등록 후 불변 (센터는 창고의 센터, 조회·범위용) | BIGINT | N |  | FK → tb_center.center_id |
| 17 | `zone_id` | 구역 ID | 같은 창고의 구역만 (시스템 기본 로케이션 등은 비움) | BIGINT | Y |  | FK → tb_zone.zone_id |
| 18 | `location_type_cd` | 로케이션 유형 코드 | 공통코드 LOC_TYPE | VARCHAR(20) | N | RACK |  |
| 19 | `system_yn` | 시스템 여부 | 시스템 기본 로케이션 (시스템 기본 창고의 DEFAULT): 사용 중지·삭제 불가 | CHAR(1) | N | N |  |
| 20 | `bay_no` | 연 |  | VARCHAR(10) | Y |  |  |
| 21 | `cell_no` | 칸 |  | VARCHAR(10) | Y |  |  |
| 22 | `pos_x` | 위치 X |  | DECIMAL(10,2) | Y |  |  |
| 23 | `pos_y` | 위치 Y |  | DECIMAL(10,2) | Y |  |  |
| 24 | `width_cm` | 가로(cm) | ③ 용량 [1차: 입력만] — 저장은 cm·kg, 화면은 운영사 단위로 바꿔 보여 준다 | DECIMAL(8,2) | Y |  |  |
| 25 | `depth_cm` | 세로(cm) |  | DECIMAL(8,2) | Y |  |  |
| 26 | `height_cm` | 높이(cm) |  | DECIMAL(8,2) | Y |  |  |
| 27 | `max_cbm` | 최대 CBM |  | DECIMAL(10,4) | Y |  |  |
| 28 | `max_weight_kg` | 최대 중량(kg) |  | DECIMAL(10,2) | Y |  |  |
| 29 | `max_pallet_cnt` | 최대 팔레트 수 |  | INTEGER | Y |  |  |
| 30 | `inbound_yn` | 입고 여부 | ④ 운영 속성 [1차] — 적치·피킹·할당 가능은 NULL이면 창고 값 (getEffectiveLocationOps) | CHAR(1) | Y |  |  |
| 31 | `outbound_yn` | 출고 여부 |  | CHAR(1) | Y |  |  |
| 32 | `allocatable_yn` | 할당가능 여부 |  | CHAR(1) | Y |  |  |
| 33 | `mix_item_yn` | 혼적 품목 여부 |  | CHAR(1) | N | Y |  |
| 34 | `mix_lot_yn` | 혼적 LOT 여부 |  | CHAR(1) | N | Y |  |
| 35 | `mix_shipper_yn` | 혼적 화주사 여부 | 3PL은 화주 간 재고 섞임 방지가 기본 | CHAR(1) | N | N |  |
| 36 | `putaway_seq` | 적치 순서 |  | INTEGER | Y |  |  |
| 37 | `pick_seq` | 피킹 순서 |  | INTEGER | Y |  |  |
| 38 | `lock_yn` | 잠금 여부 | ⑤ 잠금·관리 [2차] — 잠금(일시적으로 작업 금지)은 사용 중지(장기간 안 씀)와 다르다 | CHAR(1) | N | N |  |
| 39 | `lock_reason_cd` | 잠금 사유 코드 | 공통코드 LOCK_REASON, 잠그면 필수 | VARCHAR(20) | Y |  |  |
| 40 | `lock_at` | 잠금 일시 |  | TIMESTAMP(3) | Y |  |  |
| 41 | `abc_class_cd` | ABC 분류 코드 | 공통코드 ABC_CLASS | VARCHAR(5) | Y |  |  |
| 42 | `dedicated_shipper_id` | 전용 화주사 ID |  | BIGINT | Y |  | FK → tb_shipper.shipper_id |
| 43 | `check_digit` | 체크 디지트 |  | VARCHAR(4) | Y |  |  |
| 44 | `last_count_dt` | 최근 실사일 |  | DATE | Y |  |  |
| 45 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |

**고유 인덱스**

- `tb_location_warehouse_id_location_cd_key`: `CREATE UNIQUE INDEX tb_location_warehouse_id_location_cd_key ON tb_location (warehouse_id, location_cd) WHERE (del_yn = 'N'::bpchar)`

**인덱스**

- `tb_location_center_id_location_cd_idx`: `CREATE INDEX tb_location_center_id_location_cd_idx ON tb_location (center_id, location_cd)`
- `tb_location_center_id_status_cd_del_yn_idx`: `CREATE INDEX tb_location_center_id_status_cd_del_yn_idx ON tb_location (center_id, status_cd, del_yn)`
- `tb_location_operator_id_idx`: `CREATE INDEX tb_location_operator_id_idx ON tb_location (operator_id)`
- `tb_location_warehouse_id_zone_id_status_cd_idx`: `CREATE INDEX tb_location_warehouse_id_zone_id_status_cd_idx ON tb_location (warehouse_id, zone_id, status_cd)`
- `tb_location_zone_id_idx`: `CREATE INDEX tb_location_zone_id_idx ON tb_location (zone_id)`

**검사 조건**

- `tb_location_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_location_location_cd_check`: `CHECK ((location_cd) ~ '^[A-Z0-9-]{1,30}$')`
- `tb_location_lock_check`: `CHECK ((lock_yn = 'N') OR (lock_reason_cd IS NOT NULL))`
- `tb_location_numbers_check`: `CHECK (((width_cm IS NULL) OR (width_cm >= 0)) AND ((depth_cm IS NULL) OR (depth_cm >= 0)) AND ((height_cm IS NULL) OR (height_cm >= 0)) AND ((max_cbm IS NULL) OR (max_cbm >= 0)) AND ((max_weight_kg IS NULL) OR (max_weight_kg >= 0)) AND ((max_pallet_cnt IS NULL) OR (max_pallet_cnt >= 0)) AND ((putaway_seq IS NULL) OR (putaway_seq >= 0)) AND ((pick_seq IS NULL) OR (pick_seq >= 0)))`
- `tb_location_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`
- `tb_location_system_check`: `CHECK ((system_yn = 'N') OR ((status_cd) = 'ACTIVE'))`
- `tb_location_yn_check`: `CHECK ((system_yn IN ('Y', 'N') AND (mix_item_yn IN ('Y', 'N') AND (mix_lot_yn IN ('Y', 'N') AND (mix_shipper_yn IN ('Y', 'N') AND (lock_yn IN ('Y', 'N') AND ((inbound_yn IS NULL) OR (inbound_yn IN ('Y', 'N')) AND ((outbound_yn IS NULL) OR (outbound_yn IN ('Y', 'N')) AND ((allocatable_yn IS NULL) OR (allocatable_yn IN ('Y', 'N')))`

## tb_warehouse

- 영역: 센터·창고·로케이션 · 모델: `Warehouse`
- 창고: 센터 안에서 용도와 재고 성격이 같은 공간의 묶음 (docs/decisions/0027, 0074, docs/db-conventions.md) 유형(WAREHOUSE_TYPE)·온도대(TEMP_ZONE)·상태·기본 재고상태는 플랫폼 상수 + DB 검사 조건 (src/config/operator-codes.ts)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `warehouse_id` | 창고 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `center_id` | 센터 ID | 등록 후 바꿀 수 없다 | BIGINT | N |  | UK FK → tb_center.center_id |
| 3 | `warehouse_cd` | 창고 코드 | 시스템 코드: WH000001 창고코드: 필수, 같은 센터 안에서 중복 금지, 등록 후 수정 불가 (영문 대문자·숫자·밑줄) | VARCHAR(20) | N |  | UK |
| 4 | `warehouse_nm` | 창고 명 |  | VARCHAR(100) | N |  |  |
| 5 | `warehouse_type_cd` | 창고 유형 코드 | ① 기본 정보 [1차] | VARCHAR(20) | N | STORAGE | UK |
| 6 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 7 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 8 | `temp_zone_cd` | 온도대 코드 | 센터 취급 온도대(tb_center_temp_zone) 중 하나 | VARCHAR(20) | N |  |  |
| 9 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 10 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 11 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 12 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 13 | `del_yn` | 삭제여부 | 코드는 삭제 안 된 것끼리만 겹치면 안 된다 (지운 코드는 다시 쓸 수 있다, 0038) 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 14 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 15 | `system_yn` | 시스템 여부 | 시스템 기본 창고 (센터 등록 때 자동 생성되는 입고·출고·반품 대기): 삭제·코드·유형·명칭 변경·사용 중지 불가 | CHAR(1) | N | N |  |
| 16 | `description` | 설명 |  | VARCHAR(200) | Y |  |  |
| 17 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 10 |  |
| 18 | `building_nm` | 건물 명 | ② 위치·시설 [1차: 동·층·면적 / 2차: 나머지] | VARCHAR(50) | Y |  |  |
| 19 | `floor_no` | 층 번호 |  | VARCHAR(10) | Y |  |  |
| 20 | `area_m2` | 면적(㎡) |  | DECIMAL(12,2) | Y |  |  |
| 21 | `ceiling_height_m` | 천장 높이(m) |  | DECIMAL(5,2) | Y |  |  |
| 22 | `pallet_capa_cnt` | 팔레트 용량 수 |  | INTEGER | Y |  |  |
| 23 | `storage_method_cd` | 보관 방식 코드 | 보관 방식: 운영사 공통코드 STORAGE_METHOD | VARCHAR(20) | Y |  |  |
| 24 | `bonded_yn` | 보세 여부 | 센터가 보세·위험물 자격이 있을 때만 Y | CHAR(1) | N | N |  |
| 25 | `hazmat_yn` | 위험물 여부 |  | CHAR(1) | N | N |  |
| 26 | `inbound_yn` | 입고 여부 | ③ 운영 속성 [1차]: 유형을 고르면 유형별 기본값(WAREHOUSE_TYPE_DEFAULTS)으로 채우고 고칠 수 있다 | CHAR(1) | N | Y |  |
| 27 | `outbound_yn` | 출고 여부 |  | CHAR(1) | N | Y |  |
| 28 | `allocatable_yn` | 할당가능 여부 | 이 창고 재고를 주문에 할당할 수 있는지 (가용재고 포함 여부) | CHAR(1) | N | Y |  |
| 29 | `default_stock_status_cd` | 기본 재고 상태 코드 | 이 창고에 적치될 때 기본 재고상태 (STOCK_STATUS) | VARCHAR(20) | N | NORMAL |  |
| 30 | `alloc_priority` | 할당 우선순위 | 여러 창고에 재고가 있을 때 작은 값 먼저 (1~999) | INTEGER | N | 100 |  |
| 31 | `default_location_id` | 기본 로케이션 ID | 로케이션을 정하지 않고 적치할 때 쓰는 곳 (시스템 기본 창고는 DEFAULT 로케이션) | BIGINT | Y |  | FK → tb_location.location_id |
| 32 | `manager_user_id` | 관리자 사용자 ID | ④ 관리·담당 [2차] | BIGINT | Y |  | FK → tb_user.user_id |
| 33 | `dedicated_shipper_id` | 전용 화주사 ID | 전용 화주사 (NULL = 공용 창고) | BIGINT | Y |  | FK → tb_shipper.shipper_id |
| 34 | `location_cd_prefix` | 로케이션 코드 접두 | 로케이션 일괄 생성 때 쓰는 접두어·구분자 (구분자가 없으면 '-') | VARCHAR(10) | Y |  |  |
| 35 | `location_cd_separator` | 로케이션 코드 구분자 |  | CHAR(1) | Y |  |  |
| 36 | `remark` | 비고 | ⑤ 확장 | VARCHAR(1000) | Y |  |  |
| 37 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 38 | `warehouse_cust_cd` | 창고 사용자정의코드 | 사용자 정의 코드 (ERP 저장위치 등, 0093) — 센터 안에서 겹치지 않게, 수정 가능 | VARCHAR(50) | Y |  |  |

**고유 인덱스**

- `tb_warehouse_center_id_warehouse_cd_key`: `CREATE UNIQUE INDEX tb_warehouse_center_id_warehouse_cd_key ON tb_warehouse (center_id, warehouse_cd) WHERE (del_yn = 'N'::bpchar)`
- `tb_warehouse_one_system_per_center`: `CREATE UNIQUE INDEX tb_warehouse_one_system_per_center ON tb_warehouse (center_id, warehouse_type_cd) WHERE (system_yn = 'Y'::bpchar)`

**인덱스**

- `tb_warehouse_center_id_idx`: `CREATE INDEX tb_warehouse_center_id_idx ON tb_warehouse (center_id)`
- `tb_warehouse_default_location_id_idx`: `CREATE INDEX tb_warehouse_default_location_id_idx ON tb_warehouse (default_location_id)`
- `tb_warehouse_operator_id_idx`: `CREATE INDEX tb_warehouse_operator_id_idx ON tb_warehouse (operator_id)`

**검사 조건**

- `tb_warehouse_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_warehouse_numbers_check`: `CHECK ((sort_seq >= 0) AND ((alloc_priority >= 1) AND (alloc_priority <= 999)) AND ((area_m2 IS NULL) OR (area_m2 >= 0)) AND ((ceiling_height_m IS NULL) OR (ceiling_height_m >= 0)) AND ((pallet_capa_cnt IS NULL) OR (pallet_capa_cnt >= 0)))`
- `tb_warehouse_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`
- `tb_warehouse_stock_status_check`: `CHECK ((default_stock_status_cd) IN ('NORMAL', 'HOLD', 'DAMAGED', 'QUARANTINE'))`
- `tb_warehouse_system_check`: `CHECK ((system_yn = 'N') OR (((warehouse_type_cd) IN ('INBOUND', 'OUTBOUND', 'RETURN')) AND ((status_cd) = 'ACTIVE')))`
- `tb_warehouse_temp_zone_check`: `CHECK ((temp_zone_cd) IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))`
- `tb_warehouse_type_check`: `CHECK ((warehouse_type_cd) IN ('STORAGE', 'INBOUND', 'OUTBOUND', 'RETURN', 'QC', 'DAMAGED', 'VAS', 'CROSSDOCK'))`
- `tb_warehouse_warehouse_cd_check`: `CHECK ((warehouse_cd) ~ '^[A-Z0-9_]{1,20}$')`
- `tb_warehouse_yn_check`: `CHECK ((system_yn IN ('Y', 'N') AND (bonded_yn IN ('Y', 'N') AND (hazmat_yn IN ('Y', 'N') AND (inbound_yn IN ('Y', 'N') AND (outbound_yn IN ('Y', 'N') AND (allocatable_yn IN ('Y', 'N'))`

## tb_zone

- 영역: 센터·창고·로케이션 · 모델: `Zone`
- 구역: 창고 안에서 같은 방식으로 운영되는 로케이션 묶음 (docs/decisions/0075). 예: A구역(랙 보관), P구역(피킹)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `zone_id` | 구역 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `center_id` | 센터 ID | 창고의 센터 (조회·범위용, 저장 때 창고와 맞춰 본다) | BIGINT | N |  | FK → tb_center.center_id |
| 4 | `warehouse_id` | 창고 ID | 등록 후 바꿀 수 없다 | BIGINT | N |  | UK FK → tb_warehouse.warehouse_id |
| 5 | `zone_cd` | 구역 코드 | 구역코드: 영문 대문자·숫자 1~10자, 창고 안에서 중복 금지. 로케이션 코드 앞자리로 쓴다 | VARCHAR(10) | N |  | UK |
| 6 | `zone_nm` | 구역 명 |  | VARCHAR(100) | N |  |  |
| 7 | `zone_type_cd` | 구역 유형 코드 | 공통코드 ZONE_TYPE | VARCHAR(20) | N | STORAGE |  |
| 8 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 9 | `pick_seq` | 피킹 순서 | 구역 간 피킹 동선 순서 | INTEGER | Y |  |  |
| 10 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 10 |  |
| 11 | `description` | 설명 |  | VARCHAR(200) | Y |  |  |
| 12 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 13 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 14 | `del_yn` | 삭제여부 | 논리 삭제 (0038) | CHAR(1) | N | N |  |
| 15 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 16 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 17 | `created_by` | 등록 자 | 등록·수정한 사람 아이디, 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 18 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 19 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |

**고유 인덱스**

- `tb_zone_warehouse_id_zone_cd_key`: `CREATE UNIQUE INDEX tb_zone_warehouse_id_zone_cd_key ON tb_zone (warehouse_id, zone_cd) WHERE (del_yn = 'N'::bpchar)`

**인덱스**

- `tb_zone_center_id_idx`: `CREATE INDEX tb_zone_center_id_idx ON tb_zone (center_id)`
- `tb_zone_operator_id_idx`: `CREATE INDEX tb_zone_operator_id_idx ON tb_zone (operator_id)`

**검사 조건**

- `tb_zone_numbers_check`: `CHECK ((sort_seq >= 0) AND ((pick_seq IS NULL) OR (pick_seq >= 0)) AND (del_yn IN ('Y', 'N'))`
- `tb_zone_status_check`: `CHECK ((status_cd) IN ('ACTIVE', 'INACTIVE'))`
- `tb_zone_zone_cd_check`: `CHECK ((zone_cd) ~ '^[A-Z0-9]{1,10}$')`

## tb_address_norm_cache

- 영역: 권역·주소 · 모델: `AddressNormCache`
- 주소 정제 결과 캐시 (운영사 공통): 정리한 주소 + 원본 우편번호의 해시

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `addr_hash` | 주소 해시 |  | CHAR(64) | N |  | PK |
| 2 | `raw_addr` | 원본 주소 |  | VARCHAR(500) | N |  |  |
| 3 | `grade` | 등급 | A~D, F (상수 ADDR_GRADE) | CHAR(1) | N |  |  |
| 4 | `method_cd` | 방식 코드 |  | VARCHAR(20) | N |  |  |
| 5 | `zip_cd` | 우편번호 |  | CHAR(5) | Y |  |  |
| 6 | `bjd_cd` | 법정동 코드 |  | CHAR(10) | Y |  |  |
| 7 | `sigungu_cd` | 시군구 코드 |  | CHAR(5) | Y |  |  |
| 8 | `sido_cd` | 시도 코드 |  | CHAR(2) | Y |  |  |
| 9 | `road_addr` | 도로명 주소 |  | VARCHAR(300) | Y |  |  |
| 10 | `jibun_addr` | 지번 주소 |  | VARCHAR(300) | Y |  |  |
| 11 | `bd_mgt_sn` | 건물관리번호 |  | VARCHAR(30) | Y |  |  |
| 12 | `addr_load_ver` | 주소 적재 버전 | 주소 기준 데이터 버전 (갱신 후 C·D·F 재정제 판단) | VARCHAR(20) | Y |  |  |
| 13 | `hit_cnt` | 조회 수 |  | INTEGER | N | 0 |  |
| 14 | `last_hit_at` | 마지막 조회 일시 |  | TIMESTAMP(3) | Y |  |  |
| 15 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**검사 조건**

- `tb_address_norm_cache_grade_check`: `CHECK (grade IN ('A', 'B', 'C', 'D', 'F')`

## tb_region_bjd

- 영역: 권역·주소 · 모델: `RegionBjd`
- 법정동 (운영사 공통, 적재 스크립트로만 갱신): 시도2 + 시군구3 + 읍면동3 + 리2

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `bjd_cd` | 법정동 코드 |  | CHAR(10) | N |  | PK |
| 2 | `sido_cd` | 시도 코드 |  | CHAR(2) | N |  |  |
| 3 | `sido_nm` | 시도 명 |  | VARCHAR(30) | N |  |  |
| 4 | `sigungu_cd` | 시군구 코드 |  | CHAR(5) | N |  |  |
| 5 | `sigungu_nm` | 시군구 명 |  | VARCHAR(50) | N |  |  |
| 6 | `emd_nm` | 읍면동 명 |  | VARCHAR(50) | Y |  |  |
| 7 | `ri_nm` | 리 명 |  | VARCHAR(50) | Y |  |  |
| 8 | `bjd_level` | 법정동 레벨 | 1 시도 / 2 시군구 / 3 읍면동 / 4 리 | SMALLINT | N |  |  |
| 9 | `abolished_yn` | 폐지 여부 |  | CHAR(1) | N | N |  |
| 10 | `abolished_dt` | 폐지 일자 |  | DATE | Y |  |  |
| 11 | `load_ver` | 적재 버전 |  | VARCHAR(20) | N |  |  |

**인덱스**

- `tb_region_bjd_sido_cd_idx`: `CREATE INDEX tb_region_bjd_sido_cd_idx ON tb_region_bjd (sido_cd)`
- `tb_region_bjd_sigungu_cd_idx`: `CREATE INDEX tb_region_bjd_sigungu_cd_idx ON tb_region_bjd (sigungu_cd)`

**검사 조건**

- `tb_region_bjd_cd_check`: `CHECK (bjd_cd ~ '^[0-9]{10}$')`
- `tb_region_bjd_level_check`: `CHECK ((bjd_level >= 1) AND (bjd_level <= 4))`
- `tb_region_bjd_yn_check`: `CHECK (abolished_yn IN ('Y', 'N')`

## tb_region_center_map

- 영역: 권역·주소 · 모델: `RegionCenterMap`
- 우편번호별 배송센터 배정 (운영사별): (운영사, 우편번호, 온도대)에 센터 하나. 행이 없으면 미배정

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `map_id` | 매핑 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `zip_cd` | 우편번호 |  | CHAR(5) | N |  | UK FK → tb_region_zip.zip_cd |
| 4 | `temp_zone_cd` | 온도대 코드 | 'ALL' 또는 온도대 (온도대 행이 ALL보다 먼저) | VARCHAR(20) | N | ALL | UK |
| 5 | `center_id` | 센터 ID |  | BIGINT | N |  | FK → tb_center.center_id |
| 6 | `assign_type_cd` | 지정 유형 코드 | MANUAL 사용자 지정 / SUGGESTED 신규 우편번호 자동 추천 / UPLOAD 엑셀 | VARCHAR(20) | N | MANUAL |  |
| 7 | `confirm_yn` | 확인 여부 | 추천 배정은 N으로 시작, 사용자가 확인하면 Y | CHAR(1) | N | Y |  |
| 8 | `last_batch_id` | 마지막 작업단위 ID |  | BIGINT | N |  | FK → tb_region_change_batch.batch_id |
| 9 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 10 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 11 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 12 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 13 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |

**고유 인덱스**

- `tb_region_center_map_operator_zip_temp_key`: `CREATE UNIQUE INDEX tb_region_center_map_operator_zip_temp_key ON tb_region_center_map (operator_id, zip_cd, temp_zone_cd)`

**인덱스**

- `tb_region_center_map_operator_id_center_id_idx`: `CREATE INDEX tb_region_center_map_operator_id_center_id_idx ON tb_region_center_map (operator_id, center_id)`
- `tb_region_center_map_operator_id_confirm_yn_idx`: `CREATE INDEX tb_region_center_map_operator_id_confirm_yn_idx ON tb_region_center_map (operator_id, confirm_yn)`

**검사 조건**

- `tb_region_center_map_assign_type_check`: `CHECK ((assign_type_cd) IN ('MANUAL', 'SUGGESTED', 'UPLOAD'))`
- `tb_region_center_map_confirm_check`: `CHECK (confirm_yn IN ('Y', 'N')`
- `tb_region_center_map_temp_zone_check`: `CHECK ((temp_zone_cd) IN ('ALL', 'AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))`

## tb_region_center_map_hist

- 영역: 권역·주소 · 모델: `RegionCenterMapHist`
- 배정 변경 이력: 우편번호마다 전·후 센터 (비어 있으면 미배정)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `hist_id` | 이력 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `batch_id` | 작업단위 ID |  | BIGINT | N |  | FK → tb_region_change_batch.batch_id |
| 3 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  |  |
| 4 | `zip_cd` | 우편번호 |  | CHAR(5) | N |  |  |
| 5 | `temp_zone_cd` | 온도대 코드 |  | VARCHAR(20) | N |  |  |
| 6 | `before_center_id` | 전 센터 ID |  | BIGINT | Y |  |  |
| 7 | `after_center_id` | 후 센터 ID |  | BIGINT | Y |  |  |
| 8 | `changed_at` | 변경 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**인덱스**

- `tb_region_center_map_hist_batch_id_idx`: `CREATE INDEX tb_region_center_map_hist_batch_id_idx ON tb_region_center_map_hist (batch_id)`
- `tb_region_center_map_hist_lookup_idx`: `CREATE INDEX tb_region_center_map_hist_lookup_idx ON tb_region_center_map_hist (operator_id, zip_cd, temp_zone_cd, changed_at)`

**검사 조건**

- `tb_region_center_map_hist_change_check`: `CHECK (before_center_id IS DISTINCT FROM after_center_id)`

## tb_region_change_batch

- 영역: 권역·주소 · 모델: `RegionChangeBatch`
- 권역 변경 작업 단위 (운영사별): 사용자 작업 한 번 = 한 줄. 작업 유형은 상수 REGION_CHANGE_TYPE

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `batch_id` | 작업단위 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `change_type_cd` | 변경 유형 코드 |  | VARCHAR(20) | N |  |  |
| 4 | `scope_desc` | 작업 범위 설명 |  | VARCHAR(500) | N |  |  |
| 5 | `temp_zone_cd` | 온도대 코드 |  | VARCHAR(20) | N | ALL |  |
| 6 | `target_center_id` | 대상 센터 ID | 해제 작업이면 비움 | BIGINT | Y |  | FK → tb_center.center_id |
| 7 | `changed_cnt` | 변경 수 |  | INTEGER | N | 0 |  |
| 8 | `reason` | 사유 |  | VARCHAR(500) | Y |  |  |
| 9 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 10 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |

**인덱스**

- `tb_region_change_batch_operator_id_created_at_idx`: `CREATE INDEX tb_region_change_batch_operator_id_created_at_idx ON tb_region_change_batch (operator_id, created_at)`

**검사 조건**

- `tb_region_change_batch_temp_zone_check`: `CHECK ((temp_zone_cd) IN ('ALL', 'AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))`
- `tb_region_change_batch_type_check`: `CHECK ((change_type_cd) IN ('TREE_ASSIGN', 'GRID_ASSIGN', 'PASTE', 'UPLOAD', 'UNASSIGN', 'SUGGEST', 'CONFIRM'))`

## tb_region_load_hist

- 영역: 권역·주소 · 모델: `RegionLoadHist`
- 지역 마스터 적재 이력 (운영사 공통): 적재 한 번 = 한 줄

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `load_id` | 적재 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `load_ver` | 적재 버전 | 기준 데이터 버전 (예: 202611) | VARCHAR(20) | N |  |  |
| 3 | `source_nm` | 출처 명 |  | VARCHAR(500) | N |  |  |
| 4 | `load_type_cd` | 적재 유형 코드 | FULL 전체분 / DELTA 변동분 | VARCHAR(20) | N |  |  |
| 5 | `status_cd` | 상태 코드 | RUNNING / DONE / FAILED | VARCHAR(20) | N | RUNNING |  |
| 6 | `bjd_cnt` | 법정동 수 |  | INTEGER | N | 0 |  |
| 7 | `zip_cnt` | 우편번호 수 |  | INTEGER | N | 0 |  |
| 8 | `new_cnt` | 신규 수 |  | INTEGER | N | 0 |  |
| 9 | `changed_cnt` | 변경 수 |  | INTEGER | N | 0 |  |
| 10 | `abolished_cnt` | 폐지 수 |  | INTEGER | N | 0 |  |
| 11 | `error_msg` | 오류 메시지 |  | VARCHAR(2000) | Y |  |  |
| 12 | `started_at` | 시작 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `ended_at` | 종료 일시 |  | TIMESTAMP(3) | Y |  |  |
| 14 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |

**검사 조건**

- `tb_region_load_hist_status_check`: `CHECK ((status_cd) IN (('RUNNING'), ('DONE'), ('FAILED'))`
- `tb_region_load_hist_type_check`: `CHECK ((load_type_cd) IN (('FULL'), ('DELTA'))`

## tb_region_zip

- 영역: 권역·주소 · 모델: `RegionZip`
- 우편번호 (5자리 기초구역번호, 운영사 공통)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `zip_cd` | 우편번호 |  | CHAR(5) | N |  | PK |
| 2 | `sido_cd` | 시도 코드 |  | CHAR(2) | N |  |  |
| 3 | `sigungu_cd` | 시군구 코드 |  | CHAR(5) | N |  |  |
| 4 | `rep_addr` | 대표 주소 | 화면에서 우편번호 대신 보여 줄 설명 (예: 권선로 300~420, 세권로 1~88) | VARCHAR(200) | Y |  |  |
| 5 | `addr_cnt` | 주소 수 |  | INTEGER | Y |  |  |
| 6 | `abolished_yn` | 폐지 여부 |  | CHAR(1) | N | N |  |
| 7 | `first_load_ver` | 최초 적재 버전 | 신규 우편번호 판별용 | VARCHAR(20) | N |  |  |
| 8 | `last_load_ver` | 마지막 적재 버전 |  | VARCHAR(20) | N |  |  |

**인덱스**

- `tb_region_zip_sigungu_cd_idx`: `CREATE INDEX tb_region_zip_sigungu_cd_idx ON tb_region_zip (sigungu_cd)`

**검사 조건**

- `tb_region_zip_cd_check`: `CHECK (zip_cd ~ '^[0-9]{5}$')`
- `tb_region_zip_yn_check`: `CHECK (abolished_yn IN ('Y', 'N')`

## tb_region_zip_bjd

- 영역: 권역·주소 · 모델: `RegionZipBjd`
- 우편번호 ↔ 법정동 (N:M): 2개 이상 법정동에 걸치면 경계 우편번호

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `zip_cd` | 우편번호 |  | CHAR(5) | N |  | PK FK → tb_region_zip.zip_cd |
| 2 | `bjd_cd` | 법정동 코드 |  | CHAR(10) | N |  | PK FK → tb_region_bjd.bjd_cd |
| 3 | `addr_cnt` | 주소 수 |  | INTEGER | Y |  |  |

**인덱스**

- `tb_region_zip_bjd_bjd_cd_idx`: `CREATE INDEX tb_region_zip_bjd_bjd_cd_idx ON tb_region_zip_bjd (bjd_cd)`

## tb_pallet_type

- 영역: 단위·팔레트 · 모델: `PalletType`
- 팔레트 종류 (0083): PLT 계산 기준. 시스템 기본(operator_id NULL) + 운영사 행 — 운영사 행이 같은 코드의 시스템 행을 덮어쓴다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `pallet_type_id` | 팔레트 유형 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | Y |  | UK FK → tb_operator.operator_id |
| 3 | `pallet_type_cd` | 팔레트 유형 코드 |  | VARCHAR(20) | N |  | UK |
| 4 | `pallet_type_nm` | 팔레트 유형 명 |  | VARCHAR(50) | N |  |  |
| 5 | `width_cm` | 가로(cm) | 팔레트 자체 규격·중량 | DECIMAL(8,2) | N |  |  |
| 6 | `depth_cm` | 세로(cm) |  | DECIMAL(8,2) | N |  |  |
| 7 | `height_cm` | 높이(cm) |  | DECIMAL(8,2) | N |  |  |
| 8 | `weight_kg` | 중량(kg) |  | DECIMAL(8,2) | N |  |  |
| 9 | `max_load_height_cm` | 최대 적재 높이(cm) | 권장 최대 적재 높이 (팔레트 포함)·최대 적재 중량 — 넘으면 경고 | DECIMAL(8,2) | Y |  |  |
| 10 | `max_load_weight_kg` | 최대 적재 중량(kg) |  | DECIMAL(10,2) | Y |  |  |
| 11 | `system_yn` | 시스템 여부 |  | CHAR(1) | N | N |  |
| 12 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 13 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 14 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 15 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 16 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 17 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 18 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 19 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 20 | `del_yn` | 삭제여부 | 논리 삭제 여부 ('Y' = 지움, 목록에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |

**고유 인덱스**

- `tb_pallet_type_operator_id_cd_key`: `CREATE UNIQUE INDEX tb_pallet_type_operator_id_cd_key ON tb_pallet_type (operator_id, pallet_type_cd) WHERE (del_yn = 'N'::bpchar)`
- `tb_pallet_type_system_cd_key`: `CREATE UNIQUE INDEX tb_pallet_type_system_cd_key ON tb_pallet_type (pallet_type_cd) WHERE ((operator_id IS NULL) AND (del_yn = 'N'::bpchar))`

**인덱스**

- `tb_pallet_type_operator_id_idx`: `CREATE INDEX tb_pallet_type_operator_id_idx ON tb_pallet_type (operator_id)`

**검사 조건**

- `tb_pallet_type_size_check`: `CHECK ((width_cm > 0) AND (depth_cm > 0) AND (height_cm > 0) AND (weight_kg >= 0) AND ((max_load_height_cm IS NULL) OR (max_load_height_cm > height_cm)) AND ((max_load_weight_kg IS NULL) OR (max_load_weight_kg > 0)))`
- `tb_pallet_type_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`
- `tb_pallet_type_system_check`: `CHECK ((system_yn = 'Y') = (operator_id IS NULL))`
- `tb_pallet_type_yn_check`: `CHECK ((system_yn IN ('Y', 'N') AND (del_yn IN ('Y', 'N'))`

## tb_unit

- 영역: 단위·팔레트 · 모델: `Unit`
- 단위 기준정보: 시스템 기본 단위 + 운영사 추가 단위 (docs/decisions/0078)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `unit_id` | 단위 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `unit_cd` | 단위 코드 | 등록 후 바꿀 수 없다 (ASN·검수에 이 글자가 저장된다) | VARCHAR(10) | N |  | UK |
| 3 | `unit_nm` | 단위 명 |  | VARCHAR(50) | N |  |  |
| 4 | `decimal_cnt` | 소수 수 | 소수 자리수: 수량 입력·저장·표시 자리수 (EA 0, KG 3). 0~6 | INTEGER | N | 0 |  |
| 5 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 6 | `system_yn` | 시스템 여부 | 시스템 기본 단위 (operator_id가 비어 있는 줄만 Y — DB 검사 조건) | CHAR(1) | N | N |  |
| 7 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 8 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 9 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 10 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 11 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 12 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 13 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 14 | `operator_id` | 운영사 ID | 운영사: 비어 있으면 시스템 기본 단위 (모든 운영사가 함께 보고, 운영사는 고칠 수 없다) prisma.ts가 읽을 때 "시스템 + 지금 운영사", 고칠 때 "지금 운영사"로 자동으로 거른다 | BIGINT | Y |  | UK FK → tb_operator.operator_id |
| 15 | `unit_type_cd` | 단위 유형 코드 | 등록 후 바꿀 수 없다 | VARCHAR(20) | N |  | UK |
| 16 | `unit_nm_en` | 단위 명 영문 |  | VARCHAR(50) | Y |  |  |
| 17 | `print_nm` | 출력 명 | 송장·명세서 표기 (비우면 이름) | VARCHAR(20) | Y |  |  |
| 18 | `base_yn` | 기본 여부 | 유형 기준단위 (시스템 단위 중 유형마다 하나: EA·KG·L·M·M2) | CHAR(1) | N | N |  |
| 19 | `base_unit_id` | 기본 단위 ID | 기준단위와 환산계수: 1 이 단위 = baseFactor × 기준단위 (물리 단위만, 예: G → 0.001 KG) | BIGINT | Y |  | FK → tb_unit.unit_id |
| 20 | `base_factor` | 기본 계수 |  | DECIMAL(20,10) | Y |  |  |
| 21 | `std_unit_cd` | 표준 단위 코드 | UN/ECE Rec.20 표준 단위코드 (EDI·해외 연동) | VARCHAR(10) | Y |  |  |
| 22 | `description` | 설명 |  | VARCHAR(200) | Y |  |  |
| 23 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 24 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |

**고유 인덱스**

- `tb_unit_operator_id_unit_cd_key`: `CREATE UNIQUE INDEX tb_unit_operator_id_unit_cd_key ON tb_unit (operator_id, unit_cd) WHERE (del_yn = 'N'::bpchar)`
- `tb_unit_system_unit_cd_key`: `CREATE UNIQUE INDEX tb_unit_system_unit_cd_key ON tb_unit (unit_cd) WHERE ((operator_id IS NULL) AND (del_yn = 'N'::bpchar))`
- `tb_unit_type_base_key`: `CREATE UNIQUE INDEX tb_unit_type_base_key ON tb_unit (unit_type_cd) WHERE ((base_yn = 'Y'::bpchar) AND (operator_id IS NULL))`

**인덱스**

- `tb_unit_operator_id_status_cd_idx`: `CREATE INDEX tb_unit_operator_id_status_cd_idx ON tb_unit (operator_id, status_cd)`
- `tb_unit_unit_type_cd_idx`: `CREATE INDEX tb_unit_unit_type_cd_idx ON tb_unit (unit_type_cd)`

**검사 조건**

- `tb_unit_base_factor_positive`: `CHECK ((base_factor IS NULL) OR (base_factor > 0))`
- `tb_unit_base_is_system`: `CHECK ((base_yn = 'N') OR ((operator_id IS NULL) AND (base_factor = 1) AND (base_unit_id IS NULL)))`
- `tb_unit_decimal_range`: `CHECK ((decimal_cnt >= 0) AND (decimal_cnt <= 6))`
- `tb_unit_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_unit_pack_no_factor`: `CHECK (((unit_type_cd) <> 'PACK') OR ((base_factor IS NULL) AND (base_unit_id IS NULL) AND (base_yn = 'N')))`
- `tb_unit_physical_factor`: `CHECK (((unit_type_cd) <> ALL (ARRAY['WEIGHT', 'VOLUME', 'LENGTH', 'AREA'])) OR (base_yn = 'Y') OR ((base_factor IS NOT NULL) AND (base_unit_id IS NOT NULL)))`
- `tb_unit_qty_no_factor`: `CHECK (((unit_type_cd) <> 'QTY') OR (base_yn = 'Y') OR ((base_factor IS NULL) AND (base_unit_id IS NULL)))`
- `tb_unit_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`
- `tb_unit_system_matches_operator`: `CHECK ((system_yn = 'Y') = (operator_id IS NULL))`
- `tb_unit_system_yn_check`: `CHECK (system_yn IN ('Y', 'N')`
- `tb_unit_unit_type_cd_check`: `CHECK ((unit_type_cd) IN ('QTY', 'PACK', 'WEIGHT', 'VOLUME', 'LENGTH', 'AREA'))`

## tb_shipper

- 영역: 화주사 · 모델: `Shipper`
- 화주사 (docs/decisions/0035, 0080 — 정의서 docs/specs/shipper.md, 표 이름은 tb_shipper 유지) 코드 3층 (0084): id(내부) / code(화주사코드, 비우면 자동 체번 SH0001, 수정 불가) / custCode(운영사 ERP 코드 등) + 외부 코드(ExternalCode)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `shipper_id` | 화주사 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `shipper_cd` | 화주사 코드 |  | VARCHAR(20) | N |  | UK |
| 3 | `shipper_nm` | 화주사 명 |  | VARCHAR(100) | N |  |  |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 6 | `addr1` | 주소 |  | VARCHAR(200) | Y |  |  |
| 7 | `addr2` | 상세주소 |  | VARCHAR(200) | Y |  |  |
| 8 | `biz_item` | 종목 |  | VARCHAR(100) | Y |  |  |
| 9 | `biz_reg_no` | 사업자등록번호 | 사업자등록번호·전화번호는 하이픈 없이 숫자만 (0029). 화면에서는 필수, 기존 화주는 비어 있을 수 있다 (0080) | CHAR(10) | Y |  |  |
| 10 | `biz_condition` | 업태 |  | VARCHAR(100) | Y |  |  |
| 11 | `ceo_nm` | 대표자 명 |  | VARCHAR(50) | Y |  |  |
| 12 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 13 | `fax_no` | 팩스 번호 |  | VARCHAR(15) | Y |  |  |
| 14 | `label_unit_cd` | 라벨 단위 코드 |  | VARCHAR(20) | N | PLT |  |
| 15 | `tel_no` | 전화 번호 | ② 연락처·주소 | VARCHAR(15) | Y |  |  |
| 16 | `expiry_mgmt_yn` | 기한 관리 여부 |  | CHAR(1) | Y |  |  |
| 17 | `lot_mgmt_yn` | LOT 관리 여부 | ④ 운영 설정 (상속: 비어 있으면 위 단계 값 — 0073·0080, getEffectiveSetting) 로트·유통기한은 품목 기본값으로도 쓴다 (품목에서 그대로 쓰거나 개별 지정, 0003 결정 2) | CHAR(1) | Y |  |  |
| 18 | `zip_cd` | 우편번호 |  | VARCHAR(10) | Y |  |  |
| 19 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 20 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 21 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 22 | `status_cd` | 상태 코드 | 상태 (상수 SHIPPER_STATUS, 0080): 준비중 → 운영중 → 일시정지 → 해지. 일시정지·해지는 사유 필수 해지만 데이터 범위에서 빠진다 (소속 사용자 로그인 불가) | VARCHAR(20) | N | PREPARING |  |
| 23 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 24 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 25 | `addr_jibun` | 주소 지번 |  | VARCHAR(200) | Y |  |  |
| 26 | `alloc_rule_cd` | 할당 규칙 코드 |  | VARCHAR(20) | Y |  |  |
| 27 | `api_enabled_yn` | API 사용 여부 |  | CHAR(1) | N | N |  |
| 28 | `auto_create_item_yn` | 미등록 품목 주문 허용 여부 |  | CHAR(1) | N | N |  |
| 29 | `auto_create_ship_to_yn` | 미등록 납품처 주문 허용 여부 |  | CHAR(1) | N | Y |  |
| 30 | `auto_renew_yn` | 자동 갱신 여부 |  | CHAR(1) | N | Y |  |
| 31 | `biz_entity_cd` | 사업자 구분 코드 | 사업자 구분·과세유형: 상수 BIZ_ENTITY·TAX_TYPE (운영사와 같은 값) | VARCHAR(20) | N | CORP |  |
| 32 | `closing_day` | 마감 일 | 정산 마감일 1~31, 99 = 말일. 비어 있으면 운영사 값 | SMALLINT | Y |  |  |
| 33 | `contract_end_dt` | 계약 종료 일자 | 비어 있으면 자동연장(기한 없음) | DATE | Y |  |  |
| 34 | `contract_start_dt` | 계약 시작 일자 | ③ 계약·정산 | DATE | N | CURRENT_DATE |  |
| 35 | `corp_reg_no` | 법인 등록 번호 |  | CHAR(13) | Y |  |  |
| 36 | `country_cd` | 국가 코드 |  | CHAR(2) | N | KR |  |
| 37 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 38 | `homepage_url` | 홈페이지 URL |  | VARCHAR(200) | Y |  |  |
| 39 | `if_method_cd` | 연동 방식 코드 | ⑥ 연동 (API 키 관리는 다음 작업 — 정의서 PART 2) 연동 방식: PORTAL·API·FILE·EDI | VARCHAR(20) | N | PORTAL |  |
| 40 | `industry_cd` | 업종 코드 |  | VARCHAR(20) | Y |  |  |
| 41 | `min_inbound_shelf_days` | 최소 입고 잔여유통일수 | 유통기한 잔여일 기준 (비어 있으면 검사 안 함, 상속 아님) | INTEGER | Y |  |  |
| 42 | `min_outbound_shelf_days` | 최소 출고 잔여유통일수 |  | INTEGER | Y |  |  |
| 43 | `order_no_unique_scope_cd` | 주문번호 중복 기준 코드 | 주문번호 중복 기준: SHIPPER(화주 전체 기간)·SHIPPER_DAY(일자별) | VARCHAR(20) | N | SHIPPER |  |
| 44 | `partial_ship_yn` | 부분 출고 여부 |  | CHAR(1) | N | Y |  |
| 45 | `payment_terms_days` | 결제 조건 일수 | 결제 조건: 마감 후 n일 | INTEGER | Y |  |  |
| 46 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 47 | `serial_mgmt_yn` | 시리얼 관리 여부 |  | CHAR(1) | Y |  |  |
| 48 | `settle_cycle_cd` | 정산 주기 코드 | 정산 주기: 공통코드 SETTLE_CYCLE | VARCHAR(20) | N | MONTHLY |  |
| 49 | `ship_cutoff_time` | 출고 마감 시각 |  | TIME WITHOUT TIME ZONE | Y |  |  |
| 50 | `ship_to_center_policy_cd` | 납품처 센터 정책 코드 | ⑤ 거래처·주문 정책 (포털·API 공통, 상수) 납품처 배송센터 미지정: AUTO_HOLD·AUTO_REJECT·REQUIRED | VARCHAR(20) | N | AUTO_HOLD |  |
| 51 | `shipper_nm_en` | 화주사 명 영문 | ① 기본 정보 | VARCHAR(100) | Y |  |  |
| 52 | `shipper_short_nm` | 화주사 약칭 명 |  | VARCHAR(30) | Y |  |  |
| 53 | `shipper_type_cd` | 화주사 유형 코드 | 화주 유형·업종: 공통코드 SHIPPER_TYPE·SHIPPER_INDUSTRY (표시·분류용) | VARCHAR(20) | Y |  |  |
| 54 | `shortage_policy_cd` | 부족 정책 코드 | 재고 부족 시 처리: 상수 SHORTAGE_POLICY (HOLD·PARTIAL·CANCEL_SHORT) | VARCHAR(20) | N | HOLD |  |
| 55 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 56 | `status_reason` | 상태 사유 |  | VARCHAR(200) | Y |  |  |
| 57 | `sub_biz_no` | 종 사업자 번호 |  | CHAR(4) | Y |  |  |
| 58 | `tax_invoice_email` | 세금계산서 이메일 |  | VARCHAR(100) | Y |  |  |
| 59 | `tax_type_cd` | 세금 유형 코드 |  | VARCHAR(20) | N | GENERAL |  |
| 60 | `code_prefix` | 코드접두어 | 거래처·품목 자동 체번 접두어 2글자 (I·O·0·1 제외), 운영사 안에서 고유. 하위 코드가 발행되면 바꿀 수 없다 (0084) | CHAR(2) | N |  | UK |
| 61 | `if_key_type_cd` | 연동조회키 | 연동(API·엑셀)에서 거래처·납품처·품목을 찾는 키: CODE(우리 코드) / CUST_CD(사용자 정의 코드) | VARCHAR(20) | N | CODE |  |
| 62 | `shipper_cust_cd` | 화주사 사용자정의코드 | 사용자 정의 코드 (운영사 ERP 코드 등), 운영사 안에서 고유 (값이 있을 때) | VARCHAR(50) | Y |  | UK |
| 63 | `default_carrier_id` | 기본 carrier ID | 기본 택배사: 운송 계약이 없을 때 쓴다 | BIGINT | Y |  | FK → tb_carrier.carrier_id |
| 64 | `sender_addr1` | sender 주소 |  | VARCHAR(200) | Y |  |  |
| 65 | `sender_addr2` | sender 상세주소 |  | VARCHAR(200) | Y |  |  |
| 66 | `sender_addr_type_cd` | sender 주소 유형 코드 | 보내는 주소: 상수 SENDER_ADDR_TYPE (CENTER 출고 센터·SHIPPER 화주 주소·CUSTOM 직접 입력 — 반품 회수지 겸용) | VARCHAR(20) | N | CENTER |  |
| 67 | `sender_nm` | sender 명 | ⑦ 출고 설정 (0094): 송장의 보내는 사람·기본 택배사 발송인명 (비우면 화주명)·발송 전화 (비우면 화주 대표전화) | VARCHAR(100) | Y |  |  |
| 68 | `sender_tel_no` | sender 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 69 | `sender_zip_cd` | sender 우편번호 |  | VARCHAR(10) | Y |  |  |

**고유 인덱스**

- `tb_shipper_operator_id_code_prefix_key`: `CREATE UNIQUE INDEX tb_shipper_operator_id_code_prefix_key ON tb_shipper (operator_id, code_prefix) WHERE (del_yn = 'N'::bpchar)`
- `tb_shipper_operator_id_cust_cd_key`: `CREATE UNIQUE INDEX tb_shipper_operator_id_cust_cd_key ON tb_shipper (operator_id, shipper_cust_cd) WHERE ((shipper_cust_cd IS NOT NULL) AND (del_yn = 'N'::bpchar))`
- `tb_shipper_operator_id_shipper_cd_key`: `CREATE UNIQUE INDEX tb_shipper_operator_id_shipper_cd_key ON tb_shipper (operator_id, shipper_cd) WHERE (del_yn = 'N'::bpchar)`

**검사 조건**

- `tb_shipper_alloc_rule_cd_check`: `CHECK ((alloc_rule_cd) IN (('FIFO'), ('FEFO'), ('LIFO'))`
- `tb_shipper_biz_entity_cd_check`: `CHECK ((biz_entity_cd) IN (('CORP'), ('INDIVIDUAL'))`
- `tb_shipper_closing_day_check`: `CHECK ((closing_day IS NULL) OR ((closing_day >= 1) AND (closing_day <= 31)) OR (closing_day = 99))`
- `tb_shipper_code_prefix_check`: `CHECK (code_prefix ~ '^[A-HJ-NP-Z][A-HJ-NP-Z2-9]$')`
- `tb_shipper_contract_dt_check`: `CHECK ((contract_end_dt IS NULL) OR (contract_end_dt >= contract_start_dt))`
- `tb_shipper_corp_reg_no_check`: `CHECK (corp_reg_no ~ '^[0-9]{13}$')`
- `tb_shipper_count_check`: `CHECK (((COALESCE(payment_terms_days, 0) >= 0) AND (COALESCE(payment_terms_days, 0) <= 365)) AND ((COALESCE(min_inbound_shelf_days, 0) >= 0) AND (COALESCE(min_inbound_shelf_days, 0) <= 9999)) AND ((COALESCE(min_outbound_shelf_days, 0) >= 0) AND (COALESCE(min_outbound_shelf_days, 0) <= 9999)))`
- `tb_shipper_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_shipper_expiry_mgmt_yn_check`: `CHECK (expiry_mgmt_yn IN ('Y', 'N')`
- `tb_shipper_if_key_type_cd_check`: `CHECK ((if_key_type_cd) IN ('CODE', 'CUST_CD'))`
- `tb_shipper_if_method_cd_check`: `CHECK ((if_method_cd) IN ('PORTAL', 'API', 'FILE', 'EDI'))`
- `tb_shipper_label_unit_cd_check`: `CHECK ((label_unit_cd) IN ('PLT', 'BOX'))`
- `tb_shipper_lot_mgmt_yn_check`: `CHECK (lot_mgmt_yn IN ('Y', 'N')`
- `tb_shipper_number_digits_check`: `CHECK (((biz_reg_no IS NULL) OR (biz_reg_no ~ '^[0-9]{10}$')) AND ((tel_no IS NULL) OR ((tel_no) ~ '^[0-9]{8,15}$')) AND ((fax_no IS NULL) OR ((fax_no) ~ '^[0-9]{8,15}$')))`
- `tb_shipper_order_no_scope_cd_check`: `CHECK ((order_no_unique_scope_cd) IN ('SHIPPER', 'SHIPPER_DAY'))`
- `tb_shipper_sender_addr_type_cd_check`: `CHECK ((sender_addr_type_cd) IN ('CENTER', 'SHIPPER', 'CUSTOM'))`
- `tb_shipper_ship_to_center_policy_cd_check`: `CHECK ((ship_to_center_policy_cd) IN ('AUTO_HOLD', 'AUTO_REJECT', 'REQUIRED'))`
- `tb_shipper_shortage_policy_cd_check`: `CHECK ((shortage_policy_cd) IN ('HOLD', 'PARTIAL', 'CANCEL_SHORT'))`
- `tb_shipper_status_cd_check`: `CHECK ((status_cd) IN ('PREPARING', 'ACTIVE', 'SUSPENDED', 'TERMINATED'))`
- `tb_shipper_status_reason_check`: `CHECK (((status_cd) <> ALL (ARRAY['SUSPENDED', 'TERMINATED'])) OR (status_reason IS NOT NULL))`
- `tb_shipper_sub_biz_no_check`: `CHECK (sub_biz_no ~ '^[0-9]{4}$')`
- `tb_shipper_tax_type_cd_check`: `CHECK ((tax_type_cd) IN (('GENERAL'), ('SIMPLE'), ('EXEMPT'))`
- `tb_shipper_yn_check`: `CHECK ((auto_renew_yn IN ('Y', 'N') AND (partial_ship_yn IN ('Y', 'N') AND (auto_create_ship_to_yn IN ('Y', 'N') AND (auto_create_item_yn IN ('Y', 'N') AND (api_enabled_yn IN ('Y', 'N') AND (COALESCE(serial_mgmt_yn, 'N') IN ('Y', 'N'))`

## tb_shipper_center

- 영역: 화주사 · 모델: `ShipperCenter`
- 화주사의 이용 센터 (화주사 ↔ 센터, 1개 이상) — 센터 직원은 자기 센터를 이용하는 화주사만 본다 기본 센터는 화주당 1개 (부분 고유), 센터별 운영 설정 재정의는 비어 있으면 화주 값 (0080, 화면은 2차)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | PK UK FK → tb_shipper.shipper_id |
| 2 | `center_id` | 센터 ID |  | BIGINT | N |  | PK FK → tb_center.center_id |
| 3 | `alloc_rule_cd` | 할당 규칙 코드 | 센터별 재정의 (2차 화면) | VARCHAR(20) | Y |  |  |
| 4 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 5 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 6 | `default_yn` | 기본 여부 |  | CHAR(1) | N | N |  |
| 7 | `end_dt` | 종료 일자 |  | DATE | Y |  |  |
| 8 | `expiry_mgmt_yn` | 기한 관리 여부 |  | CHAR(1) | Y |  |  |
| 9 | `lot_mgmt_yn` | LOT 관리 여부 |  | CHAR(1) | Y |  |  |
| 10 | `serial_mgmt_yn` | 시리얼 관리 여부 |  | CHAR(1) | Y |  |  |
| 11 | `ship_cutoff_time` | 출고 마감 시각 |  | TIME WITHOUT TIME ZONE | Y |  |  |
| 12 | `start_dt` | 시작 일자 |  | DATE | N | CURRENT_DATE |  |
| 13 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 14 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 15 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_shipper_center_default_key`: `CREATE UNIQUE INDEX tb_shipper_center_default_key ON tb_shipper_center (shipper_id) WHERE (default_yn = 'Y'::bpchar)`

**인덱스**

- `tb_shipper_center_center_id_idx`: `CREATE INDEX tb_shipper_center_center_id_idx ON tb_shipper_center (center_id)`

**검사 조건**

- `tb_shipper_center_alloc_rule_cd_check`: `CHECK ((alloc_rule_cd) IN (('FIFO'), ('FEFO'), ('LIFO'))`
- `tb_shipper_center_dt_check`: `CHECK ((end_dt IS NULL) OR (end_dt >= start_dt))`
- `tb_shipper_center_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'INACTIVE'))`
- `tb_shipper_center_yn_check`: `CHECK ((default_yn IN ('Y', 'N') AND (COALESCE(lot_mgmt_yn, 'N') IN ('Y', 'N') AND (COALESCE(expiry_mgmt_yn, 'N') IN ('Y', 'N') AND (COALESCE(serial_mgmt_yn, 'N') IN ('Y', 'N'))`

## tb_shipper_contact

- 영역: 화주사 · 모델: `ShipperContact`
- 화주사 담당자 (운영사 담당자와 같은 모양, 화주사만 최대 10명 — 0080), 대표 1명, 담당 업무는 공통코드 CONTACT_ROLE 연동 담당(if_contact_yn): 화주당 최대 1명, 이메일 필수 (API 키 발급·만료 알림 받는 사람)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `shipper_contact_id` | 화주사 담당자 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | UK FK → tb_shipper.shipper_id |
| 3 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N |  |  |
| 4 | `role_cd` | 역할 코드 |  | VARCHAR(20) | N |  |  |
| 5 | `contact_nm` | 담당자 명 |  | VARCHAR(50) | N |  |  |
| 6 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 7 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 8 | `primary_yn` | 대표 여부 |  | CHAR(1) | N | N |  |
| 9 | `if_contact_yn` | 연동 담당자 여부 |  | CHAR(1) | N | N |  |
| 10 | `dept_nm` | 부서 명 | 부서·직책·알림 수신 | VARCHAR(50) | Y |  |  |
| 11 | `position_nm` | 직위 명 |  | VARCHAR(50) | Y |  |  |
| 12 | `notify_yn` | 알림 여부 |  | CHAR(1) | N | Y |  |
| 13 | `created_at` | 등록 일시 | 감사 칸 (담당자 표 4개 같은 모양, 0084 ④-3): 등록·수정자는 prisma.ts가 채운다 | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 14 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 15 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 16 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_shipper_contact_if_contact_key`: `CREATE UNIQUE INDEX tb_shipper_contact_if_contact_key ON tb_shipper_contact (shipper_id) WHERE (if_contact_yn = 'Y'::bpchar)`
- `tb_shipper_contact_primary_key`: `CREATE UNIQUE INDEX tb_shipper_contact_primary_key ON tb_shipper_contact (shipper_id) WHERE (primary_yn = 'Y'::bpchar)`

**인덱스**

- `tb_shipper_contact_shipper_id_sort_seq_idx`: `CREATE INDEX tb_shipper_contact_shipper_id_sort_seq_idx ON tb_shipper_contact (shipper_id, sort_seq)`

**검사 조건**

- `tb_shipper_contact_if_contact_yn_check`: `CHECK (if_contact_yn IN ('Y', 'N')`
- `tb_shipper_contact_if_email_check`: `CHECK ((if_contact_yn = 'N') OR (email IS NOT NULL))`
- `tb_shipper_contact_notify_yn_check`: `CHECK (notify_yn IN ('Y', 'N')`
- `tb_shipper_contact_primary_yn_check`: `CHECK (primary_yn IN ('Y', 'N')`
- `tb_shipper_contact_tel_no_check`: `CHECK ((tel_no IS NULL) OR ((tel_no) ~ '^[0-9]{8,15}$'))`

## tb_api_client

- 영역: 연동 API · 모델: `ApiClient`
- API 키: 형식 {환경}_{식별부}_{비밀부} (예: live_ak7f2c9x_…) — 식별부로 찾고 전체를 해시 비교 화주·환경별 사용 중(ACTIVE) 키는 최대 2개 (교체 기간에 새 키·옛 키를 함께 쓰게)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `api_client_id` | API키 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | FK → tb_shipper.shipper_id |
| 4 | `key_nm` | 키 명 |  | VARCHAR(50) | N |  |  |
| 5 | `env_cd` | 환경 코드 | 환경: TEST(검증만, 저장 안 함 — dry-run) / LIVE | VARCHAR(20) | N |  |  |
| 6 | `key_prefix` | 키 접두 |  | VARCHAR(20) | N |  | UK |
| 7 | `key_hash` | 키 해시 |  | CHAR(64) | N |  |  |
| 8 | `status_cd` | 상태 코드 | 상태: ACTIVE / REVOKED(폐기) / EXPIRED(만료 — 만료일 지난 키를 처음 쓸 때 바뀜) | VARCHAR(20) | N | ACTIVE |  |
| 9 | `expires_at` | 만료 일시 | 비어 있으면 무기한 | TIMESTAMP(3) | Y |  |  |
| 10 | `rate_limit_per_min` | 분당 호출 한도 |  | INTEGER | N | 120 |  |
| 11 | `last_used_at` | 마지막 사용 일시 |  | TIMESTAMP(3) | Y |  |  |
| 12 | `last_used_ip` | 마지막 사용 IP |  | VARCHAR(45) | Y |  |  |
| 13 | `issued_at` | 발급 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 14 | `issued_by` | 발급 자 |  | VARCHAR(50) | N |  |  |
| 15 | `revoked_at` | 폐기 일시 |  | TIMESTAMP(3) | Y |  |  |
| 16 | `revoked_by` | 폐기 자 |  | VARCHAR(50) | Y |  |  |
| 17 | `revoke_reason` | 폐기 사유 |  | VARCHAR(200) | Y |  |  |
| 18 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 19 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 20 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 21 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 22 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |

**고유 인덱스**

- `tb_api_client_key_prefix_key`: `CREATE UNIQUE INDEX tb_api_client_key_prefix_key ON tb_api_client (key_prefix)`

**인덱스**

- `tb_api_client_shipper_id_env_cd_status_cd_idx`: `CREATE INDEX tb_api_client_shipper_id_env_cd_status_cd_idx ON tb_api_client (shipper_id, env_cd, status_cd)`

**검사 조건**

- `tb_api_client_env_cd_check`: `CHECK ((env_cd) IN (('TEST'), ('LIVE'))`
- `tb_api_client_rate_limit_check`: `CHECK ((rate_limit_per_min >= 1) AND (rate_limit_per_min <= 6000))`
- `tb_api_client_revoke_check`: `CHECK (((status_cd) <> 'REVOKED') OR ((revoked_at IS NOT NULL) AND (revoke_reason IS NOT NULL)))`
- `tb_api_client_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'REVOKED', 'EXPIRED'))`

## tb_api_client_event

- 영역: 연동 API · 모델: `ApiClientEvent`
- 키 이력 (감사 로그): 발급·수정·폐기·만료를 한 줄씩 (누가·언제·바뀐 내용)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `event_id` | 이벤트 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  |  |
| 3 | `api_client_id` | API키 ID |  | BIGINT | N |  | FK → tb_api_client.api_client_id |
| 4 | `event_cd` | 이벤트 코드 | ISSUED / UPDATED / REVOKED / EXPIRED | VARCHAR(20) | N |  |  |
| 5 | `detail` | 상세 |  | JSONB | Y |  |  |
| 6 | `actor` | 작업자 |  | VARCHAR(50) | N |  |  |
| 7 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**인덱스**

- `tb_api_client_event_api_client_id_created_at_idx`: `CREATE INDEX tb_api_client_event_api_client_id_created_at_idx ON tb_api_client_event (api_client_id, created_at)`

**검사 조건**

- `tb_api_client_event_cd_check`: `CHECK ((event_cd) IN ('ISSUED', 'UPDATED', 'REVOKED', 'EXPIRED'))`

## tb_api_client_ip

- 영역: 연동 API · 모델: `ApiClientIp`
- 허용 IP (하나도 없으면 모든 IP 허용)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `api_client_ip_id` | API키 IP ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `api_client_id` | API키 ID |  | BIGINT | N |  | FK → tb_api_client.api_client_id |
| 3 | `ip_cidr` | IP CIDR |  | VARCHAR(50) | N |  |  |
| 4 | `description` | 설명 |  | VARCHAR(100) | Y |  |  |

**인덱스**

- `tb_api_client_ip_api_client_id_idx`: `CREATE INDEX tb_api_client_ip_api_client_id_idx ON tb_api_client_ip (api_client_id)`

## tb_api_client_scope

- 영역: 연동 API · 모델: `ApiClientScope`
- 키 권한 (상수 API_SCOPE: CUSTOMER_READ … STOCK_READ)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `api_client_id` | API키 ID |  | BIGINT | N |  | PK FK → tb_api_client.api_client_id |
| 2 | `scope_cd` | 범위 코드 |  | VARCHAR(30) | N |  | PK |

**검사 조건**

- `tb_api_client_scope_cd_check`: `CHECK ((scope_cd) IN ('CUSTOMER_READ', 'CUSTOMER_WRITE', 'ITEM_READ', 'ITEM_WRITE', 'ASN_READ', 'ASN_WRITE', 'ORDER_READ', 'ORDER_WRITE', 'STOCK_READ'))`

## tb_api_idempotency

- 영역: 연동 API · 모델: `ApiIdempotency`
- 멱등 처리: 같은 키 + 같은 Idempotency-Key → 처음 응답을 그대로 (24시간 뒤 지움)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `api_client_id` | API키 ID |  | BIGINT | N |  | PK FK → tb_api_client.api_client_id |
| 2 | `idempotency_key` | 멱등 키 |  | VARCHAR(100) | N |  | PK |
| 3 | `request_hash` | 요청 해시 |  | CHAR(64) | N |  |  |
| 4 | `request_id` | 요청 ID |  | VARCHAR(40) | N |  |  |
| 5 | `http_status` | HTTP 상태 |  | INTEGER | N |  |  |
| 6 | `response_body` | 응답 본문 |  | TEXT | N |  |  |
| 7 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**인덱스**

- `tb_api_idempotency_created_at_idx`: `CREATE INDEX tb_api_idempotency_created_at_idx ON tb_api_idempotency (created_at)`

## tb_api_rate_bucket

- 영역: 연동 API · 모델: `ApiRateBucket`
- 호출 한도 카운터: 키별 1분 구간마다 한 줄 (고정 구간, 지난 구간은 지움)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `api_client_id` | API키 ID |  | BIGINT | N |  | PK FK → tb_api_client.api_client_id |
| 2 | `window_start_at` | 시간대 시작 일시 |  | TIMESTAMP(3) | N |  | PK |
| 3 | `req_cnt` | 요청 수 |  | INTEGER | N | 0 |  |

## tb_api_request_item

- 영역: 연동 API · 모델: `ApiRequestItem`
- 건별 결과 (등록 API의 배열 한 건마다)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `request_id` | 요청 ID |  | VARCHAR(40) | N |  | PK FK → tb_api_request_log.request_id |
| 2 | `seq` | 순서 |  | INTEGER | N |  | PK |
| 3 | `ext_doc_no` | 외부 문서 번호 | 화주 문서번호 (거래처코드·품목코드·ASN번호·주문번호) | VARCHAR(50) | Y |  |  |
| 4 | `result_cd` | 결과 코드 | CREATED / UPDATED / UNCHANGED / DUPLICATE / FAIL | VARCHAR(20) | N |  |  |
| 5 | `error_cd` | 오류 코드 |  | VARCHAR(30) | Y |  |  |
| 6 | `error_msg` | 오류 메시지 |  | VARCHAR(500) | Y |  |  |
| 7 | `internal_id` | 내부 ID |  | BIGINT | Y |  |  |

**검사 조건**

- `tb_api_request_item_result_cd_check`: `CHECK ((result_cd) IN ('CREATED', 'UPDATED', 'UNCHANGED', 'DUPLICATE', 'FAIL'))`

## tb_api_request_log

- 영역: 연동 API · 모델: `ApiRequestLog`
- API 요청 로그: 요청 하나에 한 줄 (응답을 보낸 뒤 저장). 본문은 개인정보를 가린 뒤 저장하고 90일 뒤 비운다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `request_id` | 요청 ID | 응답에도 넣어 화주가 문의할 때 쓴다 (req_YYYYMMDD_무작위) | VARCHAR(40) | N |  | PK |
| 2 | `operator_id` | 운영사 ID | 키 확인 전에 실패하면 비어 있다 | BIGINT | Y |  |  |
| 3 | `shipper_id` | 화주사 ID |  | BIGINT | Y |  |  |
| 4 | `api_client_id` | API키 ID |  | BIGINT | Y |  |  |
| 5 | `env_cd` | 환경 코드 |  | VARCHAR(20) | Y |  |  |
| 6 | `api_cd` | API 코드 | API 구분 (예: ME, CUSTOMER_UPSERT, ORDER_CREATE) | VARCHAR(50) | N |  |  |
| 7 | `http_method` | HTTP 방식 |  | VARCHAR(10) | N |  |  |
| 8 | `path` | 경로 |  | VARCHAR(300) | N |  |  |
| 9 | `client_ip` | 클라이언트 IP |  | VARCHAR(45) | Y |  |  |
| 10 | `idempotency_key` | 멱등 키 |  | VARCHAR(100) | Y |  |  |
| 11 | `req_at` | 요청 일시 |  | TIMESTAMP(3) | N |  |  |
| 12 | `duration_ms` | 소요(ms) |  | INTEGER | N |  |  |
| 13 | `http_status` | HTTP 상태 |  | INTEGER | N |  |  |
| 14 | `result_cd` | 결과 코드 | SUCCESS / PARTIAL / FAIL | VARCHAR(20) | N |  |  |
| 15 | `total_cnt` | 합계 수 |  | INTEGER | N | 0 |  |
| 16 | `success_cnt` | 성공 수 |  | INTEGER | N | 0 |  |
| 17 | `fail_cnt` | 실패 수 |  | INTEGER | N | 0 |  |
| 18 | `error_cd` | 오류 코드 |  | VARCHAR(30) | Y |  |  |
| 19 | `req_body` | 요청 본문 |  | TEXT | Y |  |  |
| 20 | `resp_body` | 응답 본문 |  | TEXT | Y |  |  |

**인덱스**

- `tb_api_request_log_api_client_id_req_at_idx`: `CREATE INDEX tb_api_request_log_api_client_id_req_at_idx ON tb_api_request_log (api_client_id, req_at)`
- `tb_api_request_log_operator_id_req_at_idx`: `CREATE INDEX tb_api_request_log_operator_id_req_at_idx ON tb_api_request_log (operator_id, req_at)`
- `tb_api_request_log_shipper_id_req_at_idx`: `CREATE INDEX tb_api_request_log_shipper_id_req_at_idx ON tb_api_request_log (shipper_id, req_at)`

**검사 조건**

- `tb_api_request_log_result_cd_check`: `CHECK ((result_cd) IN ('SUCCESS', 'PARTIAL', 'FAIL'))`

## tb_customer

- 영역: 거래처·납품처 · 모델: `Customer`
- 거래처 (docs/decisions/0043): 화주사의 고객사 — 출고(MVP 이후) 때 물건을 받는 곳 코드 3층 (0084): id(내부) / code(거래처코드, 비우면 자동 체번 {화주 접두어}C000001, 화주 안에서 고유·수정 불가) / custCode(화주 시스템 거래처코드) + 외부 코드(ExternalCode CUSTOMER)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `customer_id` | 거래처 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | UK FK → tb_shipper.shipper_id |
| 4 | `customer_cd` | 거래처 코드 | 시스템 코드는 내부용. 거래처코드는 화주가 쓰는 코드 그대로 — 필수·등록 후 변경 불가 (0082, API 업무 키) | VARCHAR(30) | N |  | UK |
| 5 | `customer_nm` | 거래처 명 |  | VARCHAR(200) | N |  |  |
| 6 | `biz_reg_no` | 사업자등록번호 | 사업자등록번호·전화번호는 하이픈 없이 숫자만 (0029) | CHAR(10) | Y |  |  |
| 7 | `ceo_nm` | 대표자 명 |  | VARCHAR(50) | Y |  |  |
| 8 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 9 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 10 | `zip_cd` | 우편번호 |  | CHAR(5) | Y |  |  |
| 11 | `addr1` | 주소 |  | VARCHAR(200) | Y |  |  |
| 12 | `addr2` | 상세주소 |  | VARCHAR(200) | Y |  |  |
| 13 | `bjd_cd` | 법정동 코드 | 법정동코드 10자리 (정제 결과) | CHAR(10) | Y |  |  |
| 14 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 15 | `status_cd` | 상태 코드 | 상태 (상수 CUSTOMER_STATUS): ACTIVE 거래중 / SUSPENDED 거래중지 (신규 출고요청만 막는다) | VARCHAR(20) | N | ACTIVE |  |
| 16 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 17 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 18 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 19 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 20 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 21 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 22 | `addr_grade` | 주소 등급 | 주소 정제 등급 A~F (0076 ADDR_GRADE) | CHAR(1) | Y |  |  |
| 23 | `addr_jibun` | 주소 지번 |  | VARCHAR(200) | Y |  |  |
| 24 | `addr_norm_at` | 주소 정제 일시 |  | TIMESTAMP(3) | Y |  |  |
| 25 | `customer_group_cd` | 거래처 그룹 코드 |  | VARCHAR(30) | Y |  |  |
| 26 | `customer_short_nm` | 거래처 약칭 명 |  | VARCHAR(30) | Y |  |  |
| 27 | `customer_type_cd` | 거래처 유형 코드 | 거래처 유형: 공통코드 CUSTOMER_TYPE (분류·표시), 거래처 그룹: 화주가 쓰는 그룹 (자유 입력) | VARCHAR(20) | Y |  |  |
| 28 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 29 | `fax_no` | 팩스 번호 |  | VARCHAR(15) | Y |  |  |
| 30 | `last_if_at` | 마지막연동일시 | 마지막 연동 일시 | TIMESTAMP(3) | Y |  |  |
| 31 | `last_request_id` | 마지막 요청 ID | 마지막 연동 요청 ID | VARCHAR(40) | Y |  |  |
| 32 | `min_shelf_days` | 최소 잔여유통일수 | 출고 조건 (거래처가 요구, 화주 설정보다 우선 — 적용은 출고 할당 작업에서) 비어 있으면 화주 출고 최소 잔여일 | INTEGER | Y |  |  |
| 33 | `min_shelf_ratio` | 최소 잔여기한 비율 | 전체 유통기간 대비 잔여 비율 % (예: 66.67). 일수와 둘 다 있으면 더 엄격한 쪽 | DECIMAL(5,2) | Y |  |  |
| 34 | `order_addr_mode_cd` | 주문 주소 방식 코드 | 주문 주소 사용 방식 (상수): SHIP_TO(납품처 지정) / ORDER_ADDR(주문의 수령인 주소 — 온라인몰·B2C) | VARCHAR(20) | N | SHIP_TO |  |
| 35 | `raw_addr` | 원본 주소 |  | VARCHAR(500) | Y |  |  |
| 36 | `raw_zip_cd` | 원본 우편번호 | 주소: 원본(입력·연동 그대로)은 보존하고 정제 결과는 따로 (0082) | VARCHAR(10) | Y |  |  |
| 37 | `source_cd` | 출처 코드 | 연동 정보 (읽기 전용): 등록 경로 DATA_SOURCE, 최근 연동 | VARCHAR(20) | N | SCREEN |  |
| 38 | `customer_cust_cd` | 거래처 사용자정의코드 | 사용자 정의 코드 (화주 시스템의 거래처코드), 화주 안에서 고유 (값이 있을 때) | VARCHAR(50) | Y |  | UK |
| 39 | `sigungu_nm` | 시군구 명 | 주소 정제 결과 (납품처와 같은 칸 묶음, 0084 ④-3) | VARCHAR(50) | Y |  |  |
| 40 | `bd_mgt_sn` | 건물관리번호 |  | VARCHAR(30) | Y |  |  |
| 41 | `addr_norm_method_cd` | 주소 정제 방식 코드 |  | VARCHAR(20) | Y |  |  |
| 42 | `customer_role_cd` | 거래처 역할 코드 | 역할 (0090): SALES 매출처(납품받는 곳) / PURCHASE 매입처(공급처, 납품처 없음) / BOTH 둘 다 | VARCHAR(20) | N | SALES |  |

**고유 인덱스**

- `tb_customer_shipper_id_cust_cd_key`: `CREATE UNIQUE INDEX tb_customer_shipper_id_cust_cd_key ON tb_customer (shipper_id, customer_cust_cd) WHERE ((customer_cust_cd IS NOT NULL) AND (del_yn = 'N'::bpchar))`
- `tb_customer_shipper_id_customer_cd_key`: `CREATE UNIQUE INDEX tb_customer_shipper_id_customer_cd_key ON tb_customer (shipper_id, customer_cd) WHERE (del_yn = 'N'::bpchar)`

**인덱스**

- `tb_customer_biz_reg_no_idx`: `CREATE INDEX tb_customer_biz_reg_no_idx ON tb_customer (biz_reg_no)`
- `tb_customer_bjd_cd_idx`: `CREATE INDEX tb_customer_bjd_cd_idx ON tb_customer (bjd_cd)`
- `tb_customer_operator_id_shipper_id_status_cd_idx`: `CREATE INDEX tb_customer_operator_id_shipper_id_status_cd_idx ON tb_customer (operator_id, shipper_id, status_cd)`
- `tb_customer_shipper_id_customer_nm_idx`: `CREATE INDEX tb_customer_shipper_id_customer_nm_idx ON tb_customer (shipper_id, customer_nm)`

**검사 조건**

- `tb_customer_addr_grade_check`: `CHECK (addr_grade IN ('A', 'B', 'C', 'D', 'F')`
- `tb_customer_bjd_cd_check`: `CHECK ((bjd_cd IS NULL) OR (bjd_cd ~ '^[0-9]{10}$'))`
- `tb_customer_customer_cd_check`: `CHECK ((customer_cd) ~ '^[A-Z0-9_-]{1,30}$')`
- `tb_customer_customer_role_cd_check`: `CHECK ((customer_role_cd) IN ('SALES', 'PURCHASE', 'BOTH'))`
- `tb_customer_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_customer_order_addr_mode_cd_check`: `CHECK ((order_addr_mode_cd) IN ('SHIP_TO', 'ORDER_ADDR'))`
- `tb_customer_shelf_check`: `CHECK (((COALESCE(min_shelf_days, 0) >= 0) AND (COALESCE(min_shelf_days, 0) <= 9999)) AND ((COALESCE(min_shelf_ratio, 0) >= 0) AND (COALESCE(min_shelf_ratio, 0) <= 100)))`
- `tb_customer_source_cd_check`: `CHECK ((source_cd) IN ('SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO'))`
- `tb_customer_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'SUSPENDED'))`
- `tb_customer_zip_cd_check`: `CHECK ((zip_cd IS NULL) OR (zip_cd ~ '^[0-9]{5}$'))`

## tb_customer_contact

- 영역: 거래처·납품처 · 모델: `CustomerContact`
- 거래처 담당자 (담당자 표 4개 공통 모양, 0084)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `customer_contact_id` | 거래처 담당자 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `customer_id` | 거래처 ID |  | BIGINT | N |  | UK FK → tb_customer.customer_id |
| 3 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N |  |  |
| 4 | `role_cd` | 역할 코드 |  | VARCHAR(20) | N |  |  |
| 5 | `contact_nm` | 담당자 명 |  | VARCHAR(50) | N |  |  |
| 6 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 7 | `email` | 이메일 |  | VARCHAR(100) | Y |  |  |
| 8 | `primary_yn` | 대표 여부 |  | CHAR(1) | N | N |  |
| 9 | `dept_nm` | 부서 명 | 부서·직책·알림 수신 | VARCHAR(50) | Y |  |  |
| 10 | `position_nm` | 직위 명 |  | VARCHAR(50) | Y |  |  |
| 11 | `notify_yn` | 알림 여부 |  | CHAR(1) | N | Y |  |
| 12 | `created_at` | 등록 일시 | 감사 칸 (담당자 표 4개 같은 모양, 0084 ④-3): 등록·수정자는 prisma.ts가 채운다 | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 14 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 15 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_customer_contact_primary_key`: `CREATE UNIQUE INDEX tb_customer_contact_primary_key ON tb_customer_contact (customer_id) WHERE (primary_yn = 'Y'::bpchar)`

**인덱스**

- `tb_customer_contact_customer_id_sort_seq_idx`: `CREATE INDEX tb_customer_contact_customer_id_sort_seq_idx ON tb_customer_contact (customer_id, sort_seq)`

**검사 조건**

- `tb_customer_contact_notify_yn_check`: `CHECK (notify_yn IN ('Y', 'N')`
- `tb_customer_contact_primary_yn_check`: `CHECK (primary_yn IN ('Y', 'N')`

## tb_ship_to

- 영역: 거래처·납품처 · 모델: `ShipTo`
- 납품처: 물건이 실제로 도착하는 곳 (0082). 거래처 하나에 여러 곳, 기본 납품처 정확히 1곳, 사용 중 1곳 이상 납품처마다 배송센터가 정해진다 (assignShipToCenter: 연동 IF / 권역 자동 AUTO / 화면 수동 MANUAL)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ship_to_id` | 납품처 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `shipper_id` | 화주사 ID | 조회 성능용 (거래처의 화주사와 같다) | BIGINT | N |  | FK → tb_shipper.shipper_id |
| 4 | `customer_id` | 거래처 ID |  | BIGINT | N |  | UK FK → tb_customer.customer_id |
| 5 | `ship_to_cd` | 납품처 코드 | 거래처 안에서 고유, 등록 후 변경 불가. 비우면 자동 체번 {거래처코드}-01 (기본 납품처 포함, 0084) | VARCHAR(40) | N |  | UK |
| 6 | `ship_to_nm` | 납품처 명 | 거래처명(200자)을 그대로 쓰는 기본 납품처가 있으므로 같은 길이 (H2) | VARCHAR(200) | N |  |  |
| 7 | `default_yn` | 기본 여부 |  | CHAR(1) | N | N |  |
| 8 | `system_created_yn` | 시스템 등록 여부 | 거래처 주소로 자동 만든 납품처 | CHAR(1) | N | N |  |
| 9 | `addr_sync_yn` | 주소 동기화 여부 | 기본 납품처에서만 의미: Y면 거래처 주소가 바뀔 때 함께 바뀐다 (직접 고치면 N) | CHAR(1) | N | N |  |
| 10 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 11 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 12 | `raw_zip_cd` | 원본 우편번호 | 주소·수령 정보: 원본 보존 + 정제 결과 (정제 실패면 원본을 addr1에 두고 등급 F) | VARCHAR(10) | Y |  |  |
| 13 | `raw_addr` | 원본 주소 |  | VARCHAR(500) | N |  |  |
| 14 | `zip_cd` | 우편번호 |  | CHAR(5) | Y |  |  |
| 15 | `addr1` | 주소 |  | VARCHAR(200) | N |  |  |
| 16 | `addr2` | 상세주소 |  | VARCHAR(200) | Y |  |  |
| 17 | `addr_jibun` | 주소 지번 |  | VARCHAR(200) | Y |  |  |
| 18 | `bjd_cd` | 법정동 코드 |  | CHAR(10) | Y |  |  |
| 19 | `sigungu_nm` | 시군구 명 |  | VARCHAR(50) | Y |  |  |
| 20 | `bd_mgt_sn` | 건물관리번호 |  | VARCHAR(30) | Y |  |  |
| 21 | `latitude` | 위도 |  | DECIMAL(10,7) | Y |  |  |
| 22 | `longitude` | 경도 |  | DECIMAL(10,7) | Y |  |  |
| 23 | `addr_grade` | 주소 등급 |  | CHAR(1) | N | F |  |
| 24 | `addr_norm_method_cd` | 주소 정제 방식 코드 |  | VARCHAR(20) | Y |  |  |
| 25 | `addr_norm_at` | 주소 정제 일시 |  | TIMESTAMP(3) | Y |  |  |
| 26 | `receiver_nm` | 수령 명 |  | VARCHAR(50) | Y |  |  |
| 27 | `receiver_tel_no` | 수령 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 28 | `receiver_tel_no2` | 수령 전화 번호2 |  | VARCHAR(15) | Y |  |  |
| 29 | `delivery_memo` | 배송 메모 | 배송 메모 (기사 전달, 예: 정문 경비실) | VARCHAR(200) | Y |  |  |
| 30 | `delivery_center_id` | 배송 센터 ID | 배송센터 (상수 CENTER_ASSIGN_TYPE·STATUS·CONFIRM_REASON) | BIGINT | Y |  | FK → tb_center.center_id |
| 31 | `center_assign_type_cd` | 센터 지정 유형 코드 |  | VARCHAR(20) | Y |  |  |
| 32 | `center_assign_status_cd` | 센터 지정 상태 코드 | 센터가 없으면 반드시 NEED_CONFIRM (DB 검사) | VARCHAR(20) | N | NEED_CONFIRM |  |
| 33 | `center_confirm_reason_cd` | 센터 확인 사유 코드 |  | VARCHAR(30) | Y |  |  |
| 34 | `region_center_id` | 권역 센터 ID | 권역설정 결과 (지정 센터와 비교용 — 권역 변경 때 갱신) | BIGINT | Y |  | FK → tb_center.center_id |
| 35 | `region_mismatch_yn` | 권역 불일치 여부 |  | CHAR(1) | N | N |  |
| 36 | `resolve_level_cd` | 판정 레벨 코드 | 결정 기준 ZIP / BJD / SIGUNGU (resolveCenterByAddress) | VARCHAR(20) | Y |  |  |
| 37 | `center_assigned_at` | 센터 지정 일시 |  | TIMESTAMP(3) | Y |  |  |
| 38 | `center_assigned_by` | 센터 지정 자 |  | VARCHAR(50) | Y |  |  |
| 39 | `source_cd` | 출처 코드 | 연동 정보 | VARCHAR(20) | N | SCREEN |  |
| 40 | `last_if_at` | 마지막연동일시 | 마지막 연동 일시 | TIMESTAMP(3) | Y |  |  |
| 41 | `last_request_id` | 마지막 요청 ID | 마지막 연동 요청 ID | VARCHAR(40) | Y |  |  |
| 42 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 43 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 44 | `del_yn` | 삭제여부 | 논리 삭제 여부 ('Y' = 지움, 목록에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 45 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 46 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 47 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 48 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 49 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 50 | `ship_to_cust_cd` | 납품처 사용자정의코드 | 사용자 정의 코드 (화주 시스템의 납품처코드), 거래처 안에서 고유 (값이 있을 때) | VARCHAR(50) | Y |  | UK |

**고유 인덱스**

- `tb_ship_to_customer_id_cust_cd_key`: `CREATE UNIQUE INDEX tb_ship_to_customer_id_cust_cd_key ON tb_ship_to (customer_id, ship_to_cust_cd) WHERE ((ship_to_cust_cd IS NOT NULL) AND (del_yn = 'N'::bpchar))`
- `tb_ship_to_customer_id_ship_to_cd_key`: `CREATE UNIQUE INDEX tb_ship_to_customer_id_ship_to_cd_key ON tb_ship_to (customer_id, ship_to_cd) WHERE (del_yn = 'N'::bpchar)`
- `tb_ship_to_default_key`: `CREATE UNIQUE INDEX tb_ship_to_default_key ON tb_ship_to (customer_id) WHERE ((default_yn = 'Y'::bpchar) AND (del_yn = 'N'::bpchar))`

**인덱스**

- `tb_ship_to_delivery_center_id_idx`: `CREATE INDEX tb_ship_to_delivery_center_id_idx ON tb_ship_to (delivery_center_id)`
- `tb_ship_to_operator_id_region_mismatch_yn_idx`: `CREATE INDEX tb_ship_to_operator_id_region_mismatch_yn_idx ON tb_ship_to (operator_id, region_mismatch_yn)`
- `tb_ship_to_shipper_id_center_assign_status_cd_idx`: `CREATE INDEX tb_ship_to_shipper_id_center_assign_status_cd_idx ON tb_ship_to (shipper_id, center_assign_status_cd)`
- `tb_ship_to_shipper_id_zip_cd_idx`: `CREATE INDEX tb_ship_to_shipper_id_zip_cd_idx ON tb_ship_to (shipper_id, zip_cd)`

**검사 조건**

- `tb_ship_to_addr_grade_check`: `CHECK (addr_grade IN ('A', 'B', 'C', 'D', 'F')`
- `tb_ship_to_center_assign_status_cd_check`: `CHECK ((center_assign_status_cd) IN ('ASSIGNED', 'NEED_CONFIRM'))`
- `tb_ship_to_center_assign_type_cd_check`: `CHECK ((center_assign_type_cd) IN (('IF'), ('AUTO'), ('MANUAL'))`
- `tb_ship_to_center_required_check`: `CHECK ((delivery_center_id IS NOT NULL) OR ((center_assign_status_cd) = 'NEED_CONFIRM'))`
- `tb_ship_to_confirm_reason_cd_check`: `CHECK ((center_confirm_reason_cd) IN ('ADDR_NOT_RESOLVED', 'REGION_UNASSIGNED', 'REGION_MIXED', 'NOT_SHIPPER_CENTER', 'CENTER_INACTIVE', 'INVALID_CENTER_CD'))`
- `tb_ship_to_default_active_check`: `CHECK ((default_yn = 'N') OR ((status_cd) = 'ACTIVE') OR (del_yn = 'Y'))`
- `tb_ship_to_resolve_level_cd_check`: `CHECK ((resolve_level_cd) IN ('ZIP', 'BJD', 'SIGUNGU'))`
- `tb_ship_to_ship_to_cd_check`: `CHECK ((ship_to_cd) ~ '^[A-Z0-9_-]{1,30}$')`
- `tb_ship_to_source_cd_check`: `CHECK ((source_cd) IN ('SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO'))`
- `tb_ship_to_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'INACTIVE'))`
- `tb_ship_to_yn_check`: `CHECK ((default_yn IN ('Y', 'N') AND (system_created_yn IN ('Y', 'N') AND (addr_sync_yn IN ('Y', 'N') AND (region_mismatch_yn IN ('Y', 'N') AND (del_yn IN ('Y', 'N'))`
- `tb_ship_to_zip_cd_check`: `CHECK ((zip_cd IS NULL) OR (zip_cd ~ '^[0-9]{5}$'))`

## tb_item

- 영역: 품목 · 모델: `Item`
- 품목 (docs/decisions/0041, 0083): 화주사가 맡긴 상품의 관리 단위 코드 3층 (0084): id(내부) / code(품목코드, 비우면 자동 체번 {화주 접두어}S000001, 화주 안에서 고유·수정 불가) / custCode(화주 시스템 품목코드) + 외부 코드(ExternalCode ITEM) 기한·LOT·시리얼 관리 여부는 상속하지 않는 명시값: 신규 등록 때 화주 실제 값을 복사하고, 이후 화주 설정이 바뀌어도 그대로 (재고 구조를 정하므로, 0083)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `item_id` | 품목 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | UK FK → tb_shipper.shipper_id |
| 4 | `item_cd` | 품목 코드 | ① 기본 정보: 품목코드는 화주 안에서 고유·수정 불가, 비우면 자동 체번 (0083 → 0084) | VARCHAR(50) | N |  | UK |
| 5 | `item_nm` | 품목 명 |  | VARCHAR(200) | N |  |  |
| 6 | `spec_nm` | 규격 명 | 규격 (예: 500g×24입, 1.8L) | VARCHAR(100) | Y |  |  |
| 7 | `base_unit_id` | 기본 단위 ID | ② 단위: 기본단위 = 재고를 세는 단위 (PACK 불가, 재고·거래가 생기면 수정 불가). 단위별 환산·규격은 tb_item_unit | BIGINT | N |  | FK → tb_unit.unit_id |
| 8 | `lot_mgmt_yn` | LOT 관리 여부 |  | CHAR(1) | N | N |  |
| 9 | `expiry_mgmt_yn` | 기한 관리 여부 | ⑤ 소비기한·LOT: 관리 여부 3개는 상속하지 않는 명시값 (신규 때 화주 실제 값을 복사, 이후 화주 설정 변경에 영향 없음) | CHAR(1) | N | N |  |
| 10 | `label_unit_cd` | 라벨 단위 코드 | 라벨 단위 (입고 라벨 출력, 0041) | VARCHAR(20) | Y |  |  |
| 11 | `expiry_alert_days` | 기한 알림 일수 | 임박 알림 기준일 (잔여일이 이보다 짧으면 "임박") | INTEGER | Y |  |  |
| 12 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 13 | `status_cd` | 상태 코드 | ACTIVE 사용 / INACTIVE 사용중지 / DISCONTINUED 단종 (신규 입고 불가, 재고 출고는 가능) | VARCHAR(20) | N | ACTIVE |  |
| 14 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 15 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 16 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 17 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 18 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 19 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 20 | `abc_class_cd` | ABC 분류 코드 |  | VARCHAR(5) | Y |  |  |
| 21 | `alloc_rule_cd` | 할당 규칙 코드 | NULL = 화주 값 (상속) | VARCHAR(20) | Y |  |  |
| 22 | `box_only_ship_yn` | 박스 만 출고 여부 | ⑥ 출고 조건 | CHAR(1) | N | N |  |
| 23 | `brand_nm` | 브랜드 명 |  | VARCHAR(100) | Y |  |  |
| 24 | `category1` | 분류1 |  | VARCHAR(50) | Y |  |  |
| 25 | `category2` | 분류2 |  | VARCHAR(50) | Y |  |  |
| 26 | `category3` | 분류3 |  | VARCHAR(50) | Y |  |  |
| 27 | `currency_cd` | 통화 코드 |  | CHAR(3) | Y |  |  |
| 28 | `default_inbound_unit_id` | 기본 입고 단위 ID | 기본 입고·주문단위: NULL = 자동 (입고 = BOX, 없으면 기본단위 / 주문 = 기본단위) | BIGINT | Y |  | FK → tb_unit.unit_id |
| 29 | `default_order_unit_id` | 기본 주문 단위 ID |  | BIGINT | Y |  | FK → tb_unit.unit_id |
| 30 | `expiry_input_cd` | 기한 입력 코드 |  | VARCHAR(20) | Y |  |  |
| 31 | `expiry_type_cd` | 기한 유형 코드 |  | VARCHAR(20) | Y |  |  |
| 32 | `ext_attr` | 확장속성 | 확장 속성 (JSON) | JSONB | Y |  |  |
| 33 | `fragile_yn` | 파손주의 여부 |  | CHAR(1) | N | N |  |
| 34 | `hazmat_class_cd` | 위험물 분류 코드 |  | VARCHAR(20) | Y |  |  |
| 35 | `hazmat_yn` | 위험물 여부 |  | CHAR(1) | N | N |  |
| 36 | `hs_cd` | HS 코드 |  | VARCHAR(12) | Y |  |  |
| 37 | `item_nm_en` | 품목 명 영문 |  | VARCHAR(200) | Y |  |  |
| 38 | `item_short_nm` | 품목 약칭 명 |  | VARCHAR(50) | Y |  |  |
| 39 | `item_type_cd` | 품목 유형 코드 | 품목 유형 (상수 ITEM_TYPE — SET이면 세트 품목) | VARCHAR(20) | N | GOODS |  |
| 40 | `item_value_amt` | 품목 가액 | 품목 가액 (기본단위 1개 기준, 파손·분실 보상용) | DECIMAL(15,2) | Y |  |  |
| 41 | `last_if_at` | 마지막연동일시 | 마지막 연동 일시 | TIMESTAMP(3) | Y |  |  |
| 42 | `last_request_id` | 마지막 요청 ID | 마지막 연동 요청 ID | VARCHAR(40) | Y |  |  |
| 43 | `lot_source_cd` | LOT 출처 코드 |  | VARCHAR(20) | Y |  |  |
| 44 | `maker_nm` | 제조사 명 |  | VARCHAR(100) | Y |  |  |
| 45 | `max_stack_box_cnt` | 최대 적층 박스 수 |  | INTEGER | Y |  |  |
| 46 | `min_inbound_shelf_days` | 최소 입고 잔여유통일수 | NULL = 화주 값 (상속) | INTEGER | Y |  |  |
| 47 | `min_order_qty` | 최소 주문 수량 |  | DECIMAL(15,3) | Y |  |  |
| 48 | `min_outbound_shelf_days` | 최소 출고 잔여유통일수 |  | INTEGER | Y |  |  |
| 49 | `origin_country_cd` | 원산지 국가 코드 | 원산지 (ISO 3166 두 글자) | CHAR(2) | Y |  |  |
| 50 | `pallet_box_cnt` | 팔레트 박스 수 |  | INTEGER | Y |  |  |
| 51 | `pallet_hi` | 팔레트 단수(HI) |  | INTEGER | Y |  |  |
| 52 | `pallet_ti` | 팔레트 단당박스수(TI) |  | INTEGER | Y |  |  |
| 53 | `pallet_type_cd` | 팔레트 유형 코드 | ③ 팔레트 적재: 종류 + 단당 박스 수(TI) × 단수(HI) → PLT 행 자동 계산. TI·HI 없이 팔레트당 박스 수만 넣어도 된다 | VARCHAR(20) | Y |  |  |
| 54 | `serial_mgmt_yn` | 시리얼 관리 여부 |  | CHAR(1) | N | N |  |
| 55 | `set_yn` | 세트 여부 |  | CHAR(1) | N | N |  |
| 56 | `shelf_life_days` | 총기한일수 |  | INTEGER | Y |  |  |
| 57 | `source_cd` | 출처 코드 | ⑦ 연동 정보 (거래처와 같다) | VARCHAR(20) | N | SCREEN |  |
| 58 | `storage_temp_max` | 보관 온도 최대 |  | DECIMAL(5,1) | Y |  |  |
| 59 | `storage_temp_min` | 보관 온도 최소 |  | DECIMAL(5,1) | Y |  |  |
| 60 | `temp_zone_cd` | 온도대 코드 | ④ 보관 조건 | VARCHAR(20) | N | AMBIENT |  |
| 61 | `upright_yn` | 세움보관 여부 |  | CHAR(1) | N | N |  |
| 62 | `item_cust_cd` | 품목 사용자정의코드 | 사용자 정의 코드 (화주 시스템의 품목코드), 화주 안에서 고유 (값이 있을 때) | VARCHAR(50) | Y |  | UK |

**고유 인덱스**

- `tb_item_shipper_id_cust_cd_key`: `CREATE UNIQUE INDEX tb_item_shipper_id_cust_cd_key ON tb_item (shipper_id, item_cust_cd) WHERE ((item_cust_cd IS NOT NULL) AND (del_yn = 'N'::bpchar))`
- `tb_item_shipper_id_item_cd_key`: `CREATE UNIQUE INDEX tb_item_shipper_id_item_cd_key ON tb_item (shipper_id, item_cd) WHERE (del_yn = 'N'::bpchar)`

**인덱스**

- `tb_item_base_unit_id_idx`: `CREATE INDEX tb_item_base_unit_id_idx ON tb_item (base_unit_id)`
- `tb_item_default_inbound_unit_id_idx`: `CREATE INDEX tb_item_default_inbound_unit_id_idx ON tb_item (default_inbound_unit_id)`
- `tb_item_default_order_unit_id_idx`: `CREATE INDEX tb_item_default_order_unit_id_idx ON tb_item (default_order_unit_id)`
- `tb_item_operator_id_shipper_id_status_cd_idx`: `CREATE INDEX tb_item_operator_id_shipper_id_status_cd_idx ON tb_item (operator_id, shipper_id, status_cd)`
- `tb_item_shipper_id_category1_idx`: `CREATE INDEX tb_item_shipper_id_category1_idx ON tb_item (shipper_id, category1)`
- `tb_item_shipper_id_item_nm_idx`: `CREATE INDEX tb_item_shipper_id_item_nm_idx ON tb_item (shipper_id, item_nm)`

**검사 조건**

- `tb_item_alloc_rule_cd_check`: `CHECK ((alloc_rule_cd IS NULL) OR ((alloc_rule_cd) IN (('FIFO'), ('FEFO'), ('LIFO')))`
- `tb_item_days_check`: `CHECK (((shelf_life_days IS NULL) OR ((shelf_life_days >= 1) AND (shelf_life_days <= 36500))) AND ((min_inbound_shelf_days IS NULL) OR (min_inbound_shelf_days >= 0)) AND ((min_outbound_shelf_days IS NULL) OR (min_outbound_shelf_days >= 0)))`
- `tb_item_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_item_expiry_alert_days_check`: `CHECK ((expiry_alert_days IS NULL) OR ((expiry_alert_days >= 1) AND (expiry_alert_days <= 3650)))`
- `tb_item_expiry_input_cd_check`: `CHECK ((expiry_input_cd IS NULL) OR ((expiry_input_cd) IN ('EXPIRY', 'MFG', 'BOTH')))`
- `tb_item_expiry_required_check`: `CHECK ((expiry_mgmt_yn = 'N') OR ((expiry_type_cd IS NOT NULL) AND (expiry_input_cd IS NOT NULL)))`
- `tb_item_expiry_type_cd_check`: `CHECK ((expiry_type_cd IS NULL) OR ((expiry_type_cd) IN ('CONSUME', 'SELL', 'USE', 'VALID')))`
- `tb_item_item_type_cd_check`: `CHECK ((item_type_cd) IN ('GOODS', 'PRODUCT', 'SEMI', 'RAW', 'SUB', 'SET', 'SUPPLY', 'ETC'))`
- `tb_item_label_unit_cd_check`: `CHECK ((label_unit_cd) IN ('PLT', 'BOX'))`
- `tb_item_lot_source_cd_check`: `CHECK ((lot_source_cd IS NULL) OR ((lot_source_cd) IN ('INPUT', 'MFG_DATE', 'EXPIRY_DATE', 'SYSTEM')))`
- `tb_item_lot_source_required_check`: `CHECK ((lot_mgmt_yn = 'N') OR (lot_source_cd IS NOT NULL))`
- `tb_item_pallet_check`: `CHECK (((pallet_ti IS NULL) OR (pallet_ti > 0)) AND ((pallet_hi IS NULL) OR (pallet_hi > 0)) AND ((pallet_box_cnt IS NULL) OR (pallet_box_cnt > 0)) AND ((max_stack_box_cnt IS NULL) OR (max_stack_box_cnt > 0)))`
- `tb_item_set_yn_check`: `CHECK ((set_yn = 'Y') = ((item_type_cd) = 'SET'))`
- `tb_item_shelf_life_required_check`: `CHECK ((expiry_mgmt_yn = 'N') OR ((expiry_input_cd) = 'EXPIRY') OR (shelf_life_days IS NOT NULL))`
- `tb_item_source_cd_check`: `CHECK ((source_cd) IN ('SCREEN', 'PORTAL', 'API', 'UPLOAD', 'ORDER_AUTO'))`
- `tb_item_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'INACTIVE', 'DISCONTINUED'))`
- `tb_item_temp_range_check`: `CHECK ((storage_temp_min IS NULL) OR (storage_temp_max IS NULL) OR (storage_temp_min <= storage_temp_max))`
- `tb_item_temp_zone_cd_check`: `CHECK ((temp_zone_cd) IN ('AMBIENT', 'CHILLED', 'FROZEN', 'CONSTANT'))`
- `tb_item_value_check`: `CHECK ((item_value_amt IS NULL) OR (item_value_amt >= 0))`
- `tb_item_yn_check`: `CHECK ((lot_mgmt_yn IN ('Y', 'N') AND (expiry_mgmt_yn IN ('Y', 'N') AND (serial_mgmt_yn IN ('Y', 'N') AND (hazmat_yn IN ('Y', 'N') AND (fragile_yn IN ('Y', 'N') AND (upright_yn IN ('Y', 'N') AND (box_only_ship_yn IN ('Y', 'N') AND (set_yn IN ('Y', 'N'))`

## tb_item_barcode

- 영역: 품목 · 모델: `ItemBarcode`
- 품목 바코드 (0083): 단위별 여러 개, 단위별 대표 1개. 같은 화주 안에서 바코드 하나는 품목·단위 하나만 가리킨다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `barcode_id` | 바코드 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | UK FK → tb_shipper.shipper_id |
| 4 | `item_id` | 품목 ID |  | BIGINT | N |  | UK FK → tb_item.item_id |
| 5 | `unit_id` | 단위 ID | 이 바코드를 스캔하면 이 단위로 본다 (EA 바코드, BOX 바코드) | BIGINT | N |  | UK FK → tb_unit.unit_id |
| 6 | `barcode` | 바코드 |  | VARCHAR(50) | N |  | UK |
| 7 | `barcode_type_cd` | 바코드 유형 코드 | 상수 BARCODE_TYPE (EAN13·ITF14 등은 체크디지트 검사) | VARCHAR(20) | N |  |  |
| 8 | `primary_yn` | 대표 여부 |  | CHAR(1) | N | N |  |
| 9 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 10 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 11 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 12 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 13 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |

**고유 인덱스**

- `tb_item_barcode_primary_key`: `CREATE UNIQUE INDEX tb_item_barcode_primary_key ON tb_item_barcode (item_id, unit_id) WHERE (primary_yn = 'Y'::bpchar)`
- `tb_item_barcode_shipper_id_barcode_key`: `CREATE UNIQUE INDEX tb_item_barcode_shipper_id_barcode_key ON tb_item_barcode (shipper_id, barcode)`

**인덱스**

- `tb_item_barcode_item_id_idx`: `CREATE INDEX tb_item_barcode_item_id_idx ON tb_item_barcode (item_id)`
- `tb_item_barcode_operator_id_idx`: `CREATE INDEX tb_item_barcode_operator_id_idx ON tb_item_barcode (operator_id)`
- `tb_item_barcode_unit_id_idx`: `CREATE INDEX tb_item_barcode_unit_id_idx ON tb_item_barcode (unit_id)`

**검사 조건**

- `tb_item_barcode_primary_yn_check`: `CHECK (primary_yn IN ('Y', 'N')`
- `tb_item_barcode_type_cd_check`: `CHECK ((barcode_type_cd) IN ('EAN13', 'EAN8', 'UPCA', 'ITF14', 'GS1_128', 'CODE128', 'QR', 'CUSTOM'))`

## tb_item_unit

- 영역: 품목 · 모델: `ItemUnit`
- 품목 단위·환산·규격 (0083): 품목이 쓰는 단위마다 1행, 레벨(BASE·INNER·BOX·PLT)별 1행. 기본단위 행도 반드시 있다 환산수량은 기본단위 기준 (예: 생수 BOX = 24 EA, PLT = 1,440 EA), 소수 자리는 기본단위의 소수 자리수까지 (KG면 2.5 가능) 체적은 BOX 기준, PLT 행은 팔레트 적재 정보(종류·TI·HI)로 자동 계산

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `item_unit_id` | 품목 단위 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `item_id` | 품목 ID |  | BIGINT | N |  | UK FK → tb_item.item_id |
| 3 | `unit_id` | 단위 ID | 단위 (기본단위 행은 품목의 기본단위, 나머지는 환산단위) | BIGINT | N |  | UK FK → tb_unit.unit_id |
| 4 | `conv_qty` | 환산수량 | 기본단위 환산수량: 이 단위 1개 = 기본단위 n개 (BASE는 1) | DECIMAL(18,3) | N |  |  |
| 5 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 6 | `auto_calc_yn` | 자동 계산 여부 | 자동 계산 행 (PLT: 팔레트 적재 정보로 다시 계산, 화면에서 고칠 수 없음) | CHAR(1) | N | N |  |
| 7 | `cbm` | CBM |  | DECIMAL(12,6) | Y |  |  |
| 8 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 9 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 10 | `depth_cm` | 세로(cm) |  | DECIMAL(8,2) | Y |  |  |
| 11 | `gross_weight_kg` | 총 중량(kg) |  | DECIMAL(10,3) | Y |  |  |
| 12 | `height_cm` | 높이(cm) |  | DECIMAL(8,2) | Y |  |  |
| 13 | `net_weight_kg` | 순 중량(kg) |  | DECIMAL(10,3) | Y |  |  |
| 14 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 15 | `unit_level_cd` | 단위 레벨 코드 | 단위 레벨 (상수 UNIT_LEVEL): BASE 기본 · INNER 내포장 · BOX 박스 · PLT 팔레트 — 품목마다 레벨별 1행 (0083) | VARCHAR(20) | N | BOX | UK |
| 16 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 17 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 18 | `width_cm` | 가로(cm) | 규격 (저장은 cm·kg 고정, 화면은 운영사 표시 단위로 — 0078). CBM은 가로·세로·높이로 자동 계산 | DECIMAL(8,2) | Y |  |  |

**고유 인덱스**

- `tb_item_unit_item_id_unit_id_key`: `CREATE UNIQUE INDEX tb_item_unit_item_id_unit_id_key ON tb_item_unit (item_id, unit_id)`
- `tb_item_unit_item_id_unit_level_cd_key`: `CREATE UNIQUE INDEX tb_item_unit_item_id_unit_level_cd_key ON tb_item_unit (item_id, unit_level_cd)`

**인덱스**

- `tb_item_unit_unit_id_idx`: `CREATE INDEX tb_item_unit_unit_id_idx ON tb_item_unit (unit_id)`

**검사 조건**

- `tb_item_unit_auto_calc_yn_check`: `CHECK (auto_calc_yn IN ('Y', 'N')`
- `tb_item_unit_base_conv_check`: `CHECK (((unit_level_cd) <> 'BASE') OR (conv_qty = 1))`
- `tb_item_unit_conv_qty_check`: `CHECK (conv_qty > 0)`
- `tb_item_unit_level_cd_check`: `CHECK ((unit_level_cd) IN (('BASE'), ('INNER'), ('BOX'), ('PLT'))`
- `tb_item_unit_size_check`: `CHECK (((width_cm IS NULL) OR (width_cm > 0)) AND ((depth_cm IS NULL) OR (depth_cm > 0)) AND ((height_cm IS NULL) OR (height_cm > 0)) AND ((gross_weight_kg IS NULL) OR (gross_weight_kg > 0)) AND ((net_weight_kg IS NULL) OR (net_weight_kg > 0)))`

## tb_item_unit_hist

- 영역: 품목 · 모델: `ItemUnitHist`
- 품목 단위 환산수량 변경 이력 (0083): 미완료 ASN·주문이 없을 때만 바꿀 수 있고, 바꾸면 남긴다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `item_unit_hist_id` | 품목 단위 이력 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `item_id` | 품목 ID |  | BIGINT | N |  | FK → tb_item.item_id |
| 3 | `unit_cd` | 단위 코드 |  | VARCHAR(20) | N |  |  |
| 4 | `unit_level_cd` | 단위 레벨 코드 |  | VARCHAR(20) | N |  |  |
| 5 | `before_conv_cnt` | 전 환산 수 | 바뀌기 전·후 환산수량 (추가는 before null, 삭제는 after null) | DECIMAL(18,3) | Y |  |  |
| 6 | `after_conv_cnt` | 후 환산 수 |  | DECIMAL(18,3) | Y |  |  |
| 7 | `changed_at` | 변경 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 8 | `changed_by` | 변경 자 |  | VARCHAR(50) | N |  |  |

**인덱스**

- `tb_item_unit_hist_item_id_changed_at_idx`: `CREATE INDEX tb_item_unit_hist_item_id_changed_at_idx ON tb_item_unit_hist (item_id, changed_at)`

## tb_asn

- 영역: 입고 · 모델: `Asn`
- ASN 헤더

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asn_id` | ASN ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `center_id` | 센터 ID |  | BIGINT | N |  | FK → tb_center.center_id |
| 4 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | FK → tb_shipper.shipper_id |
| 5 | `asn_no` | ASN 번호 | ASN 번호 (자동: AS + 등록일 YYMMDD + '-' + 일련번호, 운영사 전체에서 하나) | VARCHAR(20) | N |  | UK |
| 6 | `inbound_type_cd` | 입고 유형 코드 |  | VARCHAR(20) | N | SHIPPER |  |
| 7 | `reg_channel_cd` | 등록 채널 코드 |  | VARCHAR(20) | N |  |  |
| 8 | `expected_dt` | 예정 일자 | 입고 예정일 | DATE | N |  |  |
| 9 | `shipper_ref_no` | 화주사 참조 번호 | 화주사 쪽 문서 번호 (발주번호 등, 선택) | VARCHAR(50) | Y |  |  |
| 10 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 11 | `asn_status_cd` | ASN 상태 코드 |  | VARCHAR(20) | N | PLANNED |  |
| 12 | `putaway_status_cd` | 적치 상태 코드 |  | VARCHAR(20) | N | WAITING |  |
| 13 | `close_reason` | 마감 사유 |  | VARCHAR(200) | Y |  |  |
| 14 | `closed_at` | 마감 일시 |  | TIMESTAMP(3) | Y |  |  |
| 15 | `closed_by` | 마감 자 |  | VARCHAR(50) | Y |  |  |
| 16 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 17 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 18 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 19 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 20 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 21 | `del_yn` | 삭제여부 | 논리 삭제: 예정(PLANNED) 상태에서만 지울 수 있다 | CHAR(1) | N | N |  |
| 22 | `close_reason_cd` | 마감 사유 코드 | 잔량 마감 (사유 필수, 마감자·일시) 잔량 마감 사유 코드 (공통코드 ASN_CLOSE_REASON, 0087) + 사유 메모 | VARCHAR(20) | Y |  |  |
| 23 | `supplier_id` | supplier ID | 공급처 (0090): 같은 화주사의 매입처·둘 다 거래처 (선택) | BIGINT | Y |  | FK → tb_customer.customer_id |

**고유 인덱스**

- `tb_asn_operator_id_asn_no_key`: `CREATE UNIQUE INDEX tb_asn_operator_id_asn_no_key ON tb_asn (operator_id, asn_no)`

**인덱스**

- `tb_asn_center_id_asn_status_cd_idx`: `CREATE INDEX tb_asn_center_id_asn_status_cd_idx ON tb_asn (center_id, asn_status_cd)`
- `tb_asn_operator_id_idx`: `CREATE INDEX tb_asn_operator_id_idx ON tb_asn (operator_id)`
- `tb_asn_shipper_id_expected_dt_idx`: `CREATE INDEX tb_asn_shipper_id_expected_dt_idx ON tb_asn (shipper_id, expected_dt)`
- `tb_asn_supplier_id_idx`: `CREATE INDEX tb_asn_supplier_id_idx ON tb_asn (supplier_id)`

**검사 조건**

- `tb_asn_asn_status_cd_check`: `CHECK ((asn_status_cd) IN ('PLANNED', 'INSPECTING', 'PARTIAL', 'COMPLETED', 'CLOSED'))`
- `tb_asn_close_check`: `CHECK (((asn_status_cd) <> 'CLOSED') OR ((btrim((COALESCE(close_reason, ''))) <> '') AND (closed_at IS NOT NULL) AND (closed_by IS NOT NULL)))`
- `tb_asn_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_asn_inbound_type_cd_check`: `CHECK ((inbound_type_cd) IN ('SHIPPER', 'TRANSFER'))`
- `tb_asn_putaway_status_cd_check`: `CHECK ((putaway_status_cd) IN ('WAITING', 'PARTIAL', 'DONE'))`
- `tb_asn_reg_channel_cd_check`: `CHECK ((reg_channel_cd) IN ('PORTAL', 'PROXY', 'EXCEL', 'API'))`

## tb_asn_line

- 영역: 입고 · 모델: `AsnLine`
- ASN 라인 (헤더와 통째로 바뀌는 하위 표: 감사 칸은 헤더 이력으로 본다) 수량은 모두 기본단위. 잔량 = max(예정 − 누적 확정, 0), 초과 = max(누적 확정 − 예정, 0) 은 저장하지 않고 계산한다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `asn_line_id` | ASN 라인 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `asn_id` | ASN ID |  | BIGINT | N |  | UK FK → tb_asn.asn_id |
| 4 | `line_no` | 라인 번호 |  | INTEGER | N |  | UK |
| 5 | `item_id` | 품목 ID |  | BIGINT | N |  | FK → tb_item.item_id |
| 6 | `expected_qty` | 예정 수량 | 예정 수량 (기본단위) | DECIMAL(18,3) | N |  |  |
| 7 | `entry_unit_cd` | 입력 단위 코드 | 입력한 단위·수량 (화면 표시용, 예: BOX 3 → 예정 72 EA) | VARCHAR(20) | Y |  |  |
| 8 | `entry_qty` | 입력 수량 |  | DECIMAL(18,3) | Y |  |  |
| 9 | `lot_no` | LOT 번호 | 화주사가 알려 준 로트·유통기한 (참고용, 검수에서 실제 값을 넣는다) | VARCHAR(50) | Y |  |  |
| 10 | `expiry_dt` | 기한일 |  | DATE | Y |  |  |
| 11 | `confirmed_qty` | 확정 수량 | 누적 수량 (입고 확정·적치·마감 때 함께 바뀐다) | DECIMAL(18,3) | N | 0 |  |
| 12 | `putaway_qty` | 적치 수량 |  | DECIMAL(18,3) | N | 0 |  |
| 13 | `closed_qty` | 마감 수량 | 마감 때 남아 있던 잔량 (보고서용) | DECIMAL(18,3) | N | 0 |  |
| 14 | `remark` | 비고 | 비고 | VARCHAR(200) | Y |  |  |
| 15 | `mfg_dt` | mfg 일자 | 화주가 알려 준 제조일 (선택, 0089) | DATE | Y |  |  |

**고유 인덱스**

- `tb_asn_line_asn_id_line_no_key`: `CREATE UNIQUE INDEX tb_asn_line_asn_id_line_no_key ON tb_asn_line (asn_id, line_no)`

**인덱스**

- `tb_asn_line_item_id_idx`: `CREATE INDEX tb_asn_line_item_id_idx ON tb_asn_line (item_id)`
- `tb_asn_line_operator_id_idx`: `CREATE INDEX tb_asn_line_operator_id_idx ON tb_asn_line (operator_id)`

**검사 조건**

- `tb_asn_line_lot_check`: `CHECK ((lot_no IS NULL) OR ((lot_no) <> ''))`
- `tb_asn_line_no_check`: `CHECK (line_no > 0)`
- `tb_asn_line_qty_check`: `CHECK ((expected_qty > 0) AND (confirmed_qty >= 0) AND (putaway_qty >= 0) AND (putaway_qty <= confirmed_qty) AND (closed_qty >= 0) AND ((entry_qty IS NULL) OR (entry_qty > 0)))`

## tb_inbound_inspection

- 영역: 입고 · 모델: `InboundInspection`
- 입고 검수 결과 (docs/decisions/0053): ASN 라인 하나에 여러 건 (로트·유통기한이 다르게 도착하면 나눠 적는다) 검수 수량(정상)만 입고 확정할 수 있고, 불량 수량은 기록만 한다. 수량은 모두 기본단위

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `inspection_id` | 검수 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `asn_id` | ASN ID |  | BIGINT | N |  | FK → tb_asn.asn_id |
| 4 | `asn_line_id` | ASN 라인 ID |  | BIGINT | N |  | FK → tb_asn_line.asn_line_id |
| 5 | `item_id` | 품목 ID |  | BIGINT | N |  | FK → tb_item.item_id |
| 6 | `lot_no` | LOT 번호 | 로트·유통기한: 품목 설정에 따라 필수 또는 null | VARCHAR(50) | Y |  |  |
| 7 | `expiry_dt` | 기한일 |  | DATE | Y |  |  |
| 8 | `inspect_qty` | 검수 수량 | 검수 수량(정상, 확정 가능) · 불량 수량 · 그중 확정한 수량 | DECIMAL(18,3) | N |  |  |
| 9 | `defect_qty` | 불량 수량 |  | DECIMAL(18,3) | N | 0 |  |
| 10 | `confirmed_qty` | 확정 수량 |  | DECIMAL(18,3) | N | 0 |  |
| 11 | `entry_unit_cd` | 입력 단위 코드 | 입력한 단위·수량 (화면 표시용, 예: BOX 5) | VARCHAR(20) | Y |  |  |
| 12 | `entry_qty` | 입력 수량 |  | DECIMAL(18,3) | Y |  |  |
| 13 | `remark` | 비고 | 비고 | VARCHAR(200) | Y |  |  |
| 14 | `inspected_at` | 검수 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 15 | `inspected_by` | 검수 자 |  | VARCHAR(50) | N | system |  |
| 16 | `defect_reason_cd` | 불량 사유 코드 | 불량 사유 코드 (공통코드 DEFECT_REASON, 불량 수량이 있으면 필수 — 0087) | VARCHAR(20) | Y |  |  |
| 17 | `mfg_dt` | mfg 일자 | 제조일 (품목 기한 입력 방식이 제조일·둘 다면 필수, 0089) | DATE | Y |  |  |

**인덱스**

- `tb_inbound_inspection_asn_id_idx`: `CREATE INDEX tb_inbound_inspection_asn_id_idx ON tb_inbound_inspection (asn_id)`
- `tb_inbound_inspection_asn_line_id_idx`: `CREATE INDEX tb_inbound_inspection_asn_line_id_idx ON tb_inbound_inspection (asn_line_id)`
- `tb_inbound_inspection_operator_id_idx`: `CREATE INDEX tb_inbound_inspection_operator_id_idx ON tb_inbound_inspection (operator_id)`

**검사 조건**

- `tb_inbound_inspection_lot_check`: `CHECK ((lot_no IS NULL) OR ((lot_no) <> ''))`
- `tb_inbound_inspection_qty_check`: `CHECK ((inspect_qty >= 0) AND (defect_qty >= 0) AND ((inspect_qty + defect_qty) > 0) AND (confirmed_qty >= 0) AND (confirmed_qty <= inspect_qty) AND ((entry_qty IS NULL) OR (entry_qty > 0)))`

## tb_inbound_label

- 영역: 입고 · 모델: `InboundLabel`
- 관리 라벨 (docs/decisions/0054): 검수 결과 하나 → 라벨 여러 장 (라벨 단위 입수량으로 나누고 마지막 장은 나머지, 0003 결정 6) 라벨 번호는 하나뿐이고, 같은 라벨을 다시 인쇄(재발행)하면 인쇄 횟수만 는다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `label_id` | 라벨 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `label_no` | 라벨 번호 | 라벨 번호 (자동: LB + YYMMDD + '-' + 일련번호) | VARCHAR(20) | N |  | UK |
| 4 | `inspection_id` | 검수 ID |  | BIGINT | N |  | UK FK → tb_inbound_inspection.inspection_id |
| 5 | `label_seq` | 라벨 순서 | 몇 번째 장 / 모두 몇 장 (예: 2 / 3) | INTEGER | N |  | UK |
| 6 | `label_cnt` | 라벨 수 |  | INTEGER | N |  |  |
| 7 | `label_unit_cd` | 라벨 단위 코드 | 라벨 단위(PLT·BOX)와 이 장의 수량 (기본단위) | VARCHAR(20) | N |  |  |
| 8 | `label_qty` | 라벨 수량 |  | DECIMAL(18,3) | N |  |  |
| 9 | `format_ver` | 형식 버전 | 2D 코드에 담은 글자와 그 형식 버전 (항목이 늘어도 스캐너가 구분하게, 0003) | INTEGER | N |  |  |
| 10 | `payload` | 내용 |  | VARCHAR(500) | N |  |  |
| 11 | `print_cnt` | 출력 수 |  | INTEGER | N | 0 |  |
| 12 | `last_printed_at` | 마지막 출력 일시 |  | TIMESTAMP(3) | Y |  |  |
| 13 | `last_printed_by` | 마지막 출력 자 |  | VARCHAR(50) | Y |  |  |
| 14 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 15 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_inbound_label_inspection_id_label_seq_key`: `CREATE UNIQUE INDEX tb_inbound_label_inspection_id_label_seq_key ON tb_inbound_label (inspection_id, label_seq)`
- `tb_inbound_label_operator_id_label_no_key`: `CREATE UNIQUE INDEX tb_inbound_label_operator_id_label_no_key ON tb_inbound_label (operator_id, label_no)`

**인덱스**

- `tb_inbound_label_operator_id_idx`: `CREATE INDEX tb_inbound_label_operator_id_idx ON tb_inbound_label (operator_id)`

**검사 조건**

- `tb_inbound_label_check`: `CHECK ((label_qty > 0) AND (label_seq >= 1) AND (label_cnt >= label_seq) AND (format_ver >= 1) AND (print_cnt >= 0))`
- `tb_inbound_label_label_unit_cd_check`: `CHECK ((label_unit_cd) IN ('PLT', 'BOX'))`

## tb_inbound_receipt

- 영역: 입고 · 모델: `InboundReceipt`
- 입고확정 문서: 확정할 때마다 하나 (부분 확정이면 ASN 하나에 여러 개)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `receipt_id` | 입고확정 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `asn_id` | ASN ID |  | BIGINT | N |  | FK → tb_asn.asn_id |
| 4 | `receipt_no` | 입고확정 번호 | 확정 번호 (자동: RC + YYMMDD + '-' + 일련번호) | VARCHAR(20) | N |  | UK |
| 5 | `confirmed_at` | 확정 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 6 | `confirmed_by` | 확정 자 |  | VARCHAR(50) | N | system |  |
| 7 | `remark` | 비고 | 비고 | VARCHAR(200) | Y |  |  |

**고유 인덱스**

- `tb_inbound_receipt_operator_id_receipt_no_key`: `CREATE UNIQUE INDEX tb_inbound_receipt_operator_id_receipt_no_key ON tb_inbound_receipt (operator_id, receipt_no)`

**인덱스**

- `tb_inbound_receipt_asn_id_idx`: `CREATE INDEX tb_inbound_receipt_asn_id_idx ON tb_inbound_receipt (asn_id)`
- `tb_inbound_receipt_operator_id_confirmed_at_idx`: `CREATE INDEX tb_inbound_receipt_operator_id_confirmed_at_idx ON tb_inbound_receipt (operator_id, confirmed_at)`

## tb_inbound_receipt_line

- 영역: 입고 · 모델: `InboundReceiptLine`
- 입고확정 라인: 확정 수량이 입고대기 창고의 어느 재고 줄이 됐는지 (적치는 이 줄의 재고만)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `receipt_line_id` | 입고확정 라인 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `receipt_id` | 입고확정 ID |  | BIGINT | N |  | FK → tb_inbound_receipt.receipt_id |
| 4 | `asn_line_id` | ASN 라인 ID |  | BIGINT | N |  | FK → tb_asn_line.asn_line_id |
| 5 | `stock_id` | 재고 ID | 만들어진(또는 더해진) 재고 줄 = 입고대기 창고 로케이션 + 품목 + 로트 + 유통기한 | BIGINT | N |  | FK → tb_stock.stock_id |
| 6 | `stock_txn_id` | 재고 거래 ID |  | BIGINT | N |  | FK → tb_stock_txn.stock_txn_id |
| 7 | `lot_no` | LOT 번호 |  | VARCHAR(50) | Y |  |  |
| 8 | `expiry_dt` | 기한일 |  | DATE | Y |  |  |
| 9 | `confirmed_qty` | 확정 수량 | 확정 수량 (기본단위)과 그중 적치한 수량 | DECIMAL(18,3) | N |  |  |
| 10 | `putaway_qty` | 적치 수량 |  | DECIMAL(18,3) | N | 0 |  |
| 11 | `inspection_id` | 검수 ID | 어느 검수 결과를 확정했는지 (확정은 검수된 수량에서만) | BIGINT | N |  | FK → tb_inbound_inspection.inspection_id |
| 12 | `mfg_dt` | mfg 일자 | 제조일 (검수 값, 0089) | DATE | Y |  |  |

**인덱스**

- `tb_inbound_receipt_line_asn_line_id_idx`: `CREATE INDEX tb_inbound_receipt_line_asn_line_id_idx ON tb_inbound_receipt_line (asn_line_id)`
- `tb_inbound_receipt_line_inspection_id_idx`: `CREATE INDEX tb_inbound_receipt_line_inspection_id_idx ON tb_inbound_receipt_line (inspection_id)`
- `tb_inbound_receipt_line_operator_id_idx`: `CREATE INDEX tb_inbound_receipt_line_operator_id_idx ON tb_inbound_receipt_line (operator_id)`
- `tb_inbound_receipt_line_receipt_id_idx`: `CREATE INDEX tb_inbound_receipt_line_receipt_id_idx ON tb_inbound_receipt_line (receipt_id)`
- `tb_inbound_receipt_line_stock_id_idx`: `CREATE INDEX tb_inbound_receipt_line_stock_id_idx ON tb_inbound_receipt_line (stock_id)`

**검사 조건**

- `tb_inbound_receipt_line_lot_check`: `CHECK ((lot_no IS NULL) OR ((lot_no) <> ''))`
- `tb_inbound_receipt_line_qty_check`: `CHECK ((confirmed_qty > 0) AND (putaway_qty >= 0) AND (putaway_qty <= confirmed_qty))`

## tb_putaway

- 영역: 입고 · 모델: `Putaway`
- 적치 기록 (docs/decisions/0058): 입고확정 라인의 재고를 입고대기 창고 → 보관 로케이션으로 옮긴 한 번 실제 재고 이동은 재고 변경 공통 함수(moveStock)가 하고, 여기는 어느 확정분을 어디로 얼마나 옮겼는지 남긴다

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `putaway_id` | 적치 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `receipt_line_id` | 입고확정 라인 ID |  | BIGINT | N |  | FK → tb_inbound_receipt_line.receipt_line_id |
| 4 | `asn_id` | ASN ID |  | BIGINT | N |  | FK → tb_asn.asn_id |
| 5 | `item_id` | 품목 ID |  | BIGINT | N |  | FK → tb_item.item_id |
| 6 | `from_location_id` | 출발 로케이션 ID |  | BIGINT | N |  | FK → tb_location.location_id |
| 7 | `to_location_id` | 도착 로케이션 ID |  | BIGINT | N |  | FK → tb_location.location_id |
| 8 | `lot_no` | LOT 번호 |  | VARCHAR(50) | Y |  |  |
| 9 | `expiry_dt` | 기한일 |  | DATE | Y |  |  |
| 10 | `putaway_qty` | 적치 수량 |  | DECIMAL(18,3) | N |  |  |
| 11 | `txn_group_id` | 거래 그룹 ID | 재고 이력의 묶음 번호 (나감·들어옴 두 줄) | BIGINT | N |  |  |
| 12 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |

**인덱스**

- `tb_putaway_asn_id_idx`: `CREATE INDEX tb_putaway_asn_id_idx ON tb_putaway (asn_id)`
- `tb_putaway_operator_id_created_at_idx`: `CREATE INDEX tb_putaway_operator_id_created_at_idx ON tb_putaway (operator_id, created_at)`
- `tb_putaway_receipt_line_id_idx`: `CREATE INDEX tb_putaway_receipt_line_id_idx ON tb_putaway (receipt_line_id)`

**검사 조건**

- `tb_putaway_qty_check`: `CHECK ((putaway_qty > 0) AND (from_location_id <> to_location_id))`

## tb_stock

- 영역: 재고 · 모델: `Stock`
- 재고 (docs/decisions/0044, 0003 결정 4): 한 줄 = 재고 주소 하나의 지금 수량 재고 주소: 센터 + 창고 + 로케이션 + 화주사 + 품목 + 로트번호 + 유통기한 - 수량은 직접 고치지 않는다: 재고 변경 공통 함수(이력 기록과 한 트랜잭션)로만 바꾼다 (CLAUDE.md) - 수량은 기본단위, Decimal. 로트·유통기한을 쓰지 않는 품목은 비어 있다(null) - 같은 주소는 한 줄: 로케이션 + 품목 + 로트 + 유통기한 고유 (빈 칸도 같게 본다 — NULLS NOT DISTINCT, 마이그레이션 SQL에서) - 센터·창고·화주사는 로케이션·품목에서 정해지지만 조회가 빠르도록 함께 둔다 (재고 변경 함수가 맞춰 넣는다) - 수량이 0이 돼도 줄은 남긴다 (이력이 이 줄을 가리킨다)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `stock_id` | 재고 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `center_id` | 센터 ID |  | BIGINT | N |  | FK → tb_center.center_id |
| 4 | `warehouse_id` | 창고 ID |  | BIGINT | N |  | FK → tb_warehouse.warehouse_id |
| 5 | `location_id` | 로케이션 ID |  | BIGINT | N |  | UK FK → tb_location.location_id |
| 6 | `shipper_id` | 화주사 ID |  | BIGINT | N |  | FK → tb_shipper.shipper_id |
| 7 | `item_id` | 품목 ID |  | BIGINT | N |  | UK FK → tb_item.item_id |
| 8 | `lot_no` | LOT 번호 |  | VARCHAR(50) | Y |  | UK |
| 9 | `expiry_dt` | 기한일 |  | DATE | Y |  | UK |
| 10 | `stock_qty` | 재고 수량 | 수량 (기본단위). 0 이상 | DECIMAL(18,3) | N | 0 |  |
| 11 | `alloc_qty` | 할당 수량 | 할당(출고 예약) 수량: 0 이상, 수량 이하 (출고 작업에서 쓴다, 사용자 결정으로 미리 둔다) | DECIMAL(18,3) | N | 0 |  |
| 12 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 14 | `row_version` | 행버전 | 동시 처리 안전: 재고 변경 함수가 줄을 잠그고 바꾼다. 버전은 화면 확인용 | INTEGER | N | 1 |  |
| 15 | `stock_status_cd` | 재고 상태 코드 | 재고상태 (재고 주소의 일부, 0088): NORMAL 정상 / HOLD 보류 / DAMAGED 불량 / QUARANTINE 격리 — 정상만 가용 | VARCHAR(20) | N | NORMAL | UK |
| 16 | `mfg_dt` | mfg 일자 | 제조일: 이 재고 줄이 처음 생길 때의 값 — 재고 주소에는 넣지 않는다 (0089) | DATE | Y |  |  |

**고유 인덱스**

- `tb_stock_address_key`: `CREATE UNIQUE INDEX tb_stock_address_key ON tb_stock (location_id, item_id, lot_no, expiry_dt, stock_status_cd) NULLS NOT DISTINCT`

**인덱스**

- `tb_stock_center_id_shipper_id_item_id_idx`: `CREATE INDEX tb_stock_center_id_shipper_id_item_id_idx ON tb_stock (center_id, shipper_id, item_id)`
- `tb_stock_item_id_idx`: `CREATE INDEX tb_stock_item_id_idx ON tb_stock (item_id)`
- `tb_stock_operator_id_idx`: `CREATE INDEX tb_stock_operator_id_idx ON tb_stock (operator_id)`

**검사 조건**

- `tb_stock_alloc_qty_check`: `CHECK ((alloc_qty >= 0) AND (alloc_qty <= stock_qty))`
- `tb_stock_lot_no_check`: `CHECK ((lot_no IS NULL) OR ((lot_no) <> ''))`
- `tb_stock_qty_check`: `CHECK (stock_qty >= 0)`
- `tb_stock_stock_status_cd_check`: `CHECK ((stock_status_cd) IN ('NORMAL', 'HOLD', 'DAMAGED', 'QUARANTINE'))`

## tb_stock_adjust

- 영역: 재고 · 모델: `StockAdjust`
- ─ 재고 실사·조정 (M6, docs/decisions/0061) ─────────────── 작업자가 등록하고(등록) 관리자가 확정하면(확정) 재고가 바뀐다 (권한 stock.adjustments.create / confirm)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `adjust_id` | 조정 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `adjust_no` | 조정 번호 | 번호 (자동: AJ + YYMMDD + '-' + 일련번호) | VARCHAR(20) | N |  | UK |
| 4 | `adjust_type_cd` | 조정 유형 코드 |  | VARCHAR(20) | N |  |  |
| 5 | `center_id` | 센터 ID |  | BIGINT | N |  | FK → tb_center.center_id |
| 6 | `adjust_status_cd` | 조정 상태 코드 |  | VARCHAR(20) | N | DRAFT |  |
| 7 | `reason` | 사유 |  | VARCHAR(200) | Y |  |  |
| 8 | `remark` | 비고 | 비고 | VARCHAR(500) | Y |  |  |
| 9 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 10 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 11 | `confirmed_at` | 확정 일시 |  | TIMESTAMP(3) | Y |  |  |
| 12 | `confirmed_by` | 확정 자 |  | VARCHAR(50) | Y |  |  |
| 13 | `canceled_at` | 취소 일시 |  | TIMESTAMP(3) | Y |  |  |
| 14 | `canceled_by` | 취소 자 |  | VARCHAR(50) | Y |  |  |
| 15 | `reason_cd` | 사유 코드 | 사유 코드 (공통코드 ADJUST_REASON, 필수 — 0087 이전 줄은 비어 있을 수 있다) + 사유 메모 | VARCHAR(20) | Y |  |  |

**고유 인덱스**

- `tb_stock_adjust_operator_id_adjust_no_key`: `CREATE UNIQUE INDEX tb_stock_adjust_operator_id_adjust_no_key ON tb_stock_adjust (operator_id, adjust_no)`

**인덱스**

- `tb_stock_adjust_center_id_adjust_status_cd_idx`: `CREATE INDEX tb_stock_adjust_center_id_adjust_status_cd_idx ON tb_stock_adjust (center_id, adjust_status_cd)`
- `tb_stock_adjust_operator_id_created_at_idx`: `CREATE INDEX tb_stock_adjust_operator_id_created_at_idx ON tb_stock_adjust (operator_id, created_at)`

**검사 조건**

- `tb_stock_adjust_adjust_status_cd_check`: `CHECK ((adjust_status_cd) IN ('DRAFT', 'CONFIRMED', 'CANCELED'))`
- `tb_stock_adjust_adjust_type_cd_check`: `CHECK ((adjust_type_cd) IN ('COUNT', 'ADJUST'))`
- `tb_stock_adjust_check`: `CHECK ((btrim(reason) <> '') AND (((adjust_status_cd) <> 'CONFIRMED') OR ((confirmed_at IS NOT NULL) AND (confirmed_by IS NOT NULL))) AND (((adjust_status_cd) <> 'CANCELED') OR ((canceled_at IS NOT NULL) AND (canceled_by IS NOT NULL))))`

## tb_stock_adjust_line

- 영역: 재고 · 모델: `StockAdjustLine`
- 실사·조정 줄: 재고 줄 하나 (로케이션 + 품목 + 로트 + 유통기한)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `adjust_line_id` | 조정 라인 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `adjust_id` | 조정 ID |  | BIGINT | N |  | UK FK → tb_stock_adjust.adjust_id |
| 4 | `line_no` | 라인 번호 |  | INTEGER | N |  | UK |
| 5 | `stock_id` | 재고 ID |  | BIGINT | N |  | UK FK → tb_stock.stock_id |
| 6 | `system_qty` | 전산 수량 | 등록 때 재고 (참고) / 실사: 센 수량 / 조정: 바꿀 수량(±) | DECIMAL(18,3) | N |  |  |
| 7 | `counted_qty` | 실사 수량 |  | DECIMAL(18,3) | Y |  |  |
| 8 | `chg_qty` | 변경 수량 |  | DECIMAL(18,3) | Y |  |  |
| 9 | `applied_qty` | 적용 수량 | 확정 때 실제로 바꾼 수량과 재고 이력 (0이면 바꾸지 않음 → 이력 없음) | DECIMAL(18,3) | Y |  |  |
| 10 | `stock_txn_id` | 재고 거래 ID |  | BIGINT | Y |  | FK → tb_stock_txn.stock_txn_id |

**고유 인덱스**

- `tb_stock_adjust_line_adjust_id_line_no_key`: `CREATE UNIQUE INDEX tb_stock_adjust_line_adjust_id_line_no_key ON tb_stock_adjust_line (adjust_id, line_no)`
- `tb_stock_adjust_line_adjust_id_stock_id_key`: `CREATE UNIQUE INDEX tb_stock_adjust_line_adjust_id_stock_id_key ON tb_stock_adjust_line (adjust_id, stock_id)`

**인덱스**

- `tb_stock_adjust_line_operator_id_idx`: `CREATE INDEX tb_stock_adjust_line_operator_id_idx ON tb_stock_adjust_line (operator_id)`
- `tb_stock_adjust_line_stock_id_idx`: `CREATE INDEX tb_stock_adjust_line_stock_id_idx ON tb_stock_adjust_line (stock_id)`

**검사 조건**

- `tb_stock_adjust_line_check`: `CHECK (((counted_qty IS NOT NULL) AND (counted_qty >= 0) AND (chg_qty IS NULL)) OR ((chg_qty IS NOT NULL) AND (chg_qty <> 0) AND (counted_qty IS NULL)))`

## tb_stock_txn

- 영역: 재고 · 모델: `StockTxn`
- 재고 이력 (docs/decisions/0044): 수량이 바뀐 한 번 = 한 줄. 지우거나 고치지 않는 기록 (DB가 막는다) 주소 칸은 그때 모습 그대로 함께 둔다 (재고 줄과 같지만, 이력만 봐도 알 수 있게)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `stock_txn_id` | 재고 거래 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `stock_id` | 재고 ID |  | BIGINT | N |  | FK → tb_stock.stock_id |
| 4 | `center_id` | 센터 ID |  | BIGINT | N |  |  |
| 5 | `warehouse_id` | 창고 ID |  | BIGINT | N |  |  |
| 6 | `location_id` | 로케이션 ID |  | BIGINT | N |  |  |
| 7 | `shipper_id` | 화주사 ID |  | BIGINT | N |  |  |
| 8 | `item_id` | 품목 ID |  | BIGINT | N |  |  |
| 9 | `lot_no` | LOT 번호 |  | VARCHAR(50) | Y |  |  |
| 10 | `expiry_dt` | 기한일 |  | DATE | Y |  |  |
| 11 | `txn_type_cd` | 거래 유형 코드 |  | VARCHAR(20) | N |  |  |
| 12 | `chg_qty` | 변경 수량 | 변동 수량 (+ 늘어남 / − 줄어듦, 기본단위, 0 아님)과 변동 후 수량 | DECIMAL(18,3) | N |  |  |
| 13 | `after_qty` | 후 수량 |  | DECIMAL(18,3) | N |  |  |
| 14 | `txn_group_id` | 거래 그룹 ID | 묶음 번호: 이동처럼 여러 줄이 한 번의 작업일 때 같은 값 (첫 줄의 이력 키) | BIGINT | Y |  |  |
| 15 | `ref_type_cd` | 참조 유형 코드 | 원본 문서: 종류(예: RECEIPT 입고확정, ADJUSTMENT 조정) + 키 + 화면에 보일 번호 | VARCHAR(20) | Y |  |  |
| 16 | `ref_id` | 참조 ID |  | BIGINT | Y |  |  |
| 17 | `ref_no` | 참조 번호 |  | VARCHAR(50) | Y |  |  |
| 18 | `reason` | 사유 |  | VARCHAR(200) | Y |  |  |
| 19 | `txn_at` | 거래 일시 |  | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 20 | `created_by` | 등록 자 | 처리한 사람 아이디 (재고 변경 함수가 지금 작업자로 채운다) | VARCHAR(50) | N | system |  |
| 21 | `reason_cd` | 사유 코드 | 사유 (조정은 필수) 사유 코드 (조정은 ADJUST_REASON, 상태 변경은 HOLD_REASON — 공통코드, 0087) + 사유 메모 | VARCHAR(20) | Y |  |  |
| 22 | `stock_status_cd` | 재고 상태 코드 | 그때의 재고상태 (0088) | VARCHAR(20) | N | NORMAL |  |
| 23 | `mfg_dt` | mfg 일자 | 그때의 제조일 (0089) | DATE | Y |  |  |

**인덱스**

- `tb_stock_txn_item_id_txn_at_idx`: `CREATE INDEX tb_stock_txn_item_id_txn_at_idx ON tb_stock_txn (item_id, txn_at)`
- `tb_stock_txn_location_id_txn_at_idx`: `CREATE INDEX tb_stock_txn_location_id_txn_at_idx ON tb_stock_txn (location_id, txn_at)`
- `tb_stock_txn_operator_id_txn_at_idx`: `CREATE INDEX tb_stock_txn_operator_id_txn_at_idx ON tb_stock_txn (operator_id, txn_at)`
- `tb_stock_txn_ref_type_cd_ref_id_idx`: `CREATE INDEX tb_stock_txn_ref_type_cd_ref_id_idx ON tb_stock_txn (ref_type_cd, ref_id)`
- `tb_stock_txn_stock_id_txn_at_idx`: `CREATE INDEX tb_stock_txn_stock_id_txn_at_idx ON tb_stock_txn (stock_id, txn_at)`
- `tb_stock_txn_txn_group_id_idx`: `CREATE INDEX tb_stock_txn_txn_group_id_idx ON tb_stock_txn (txn_group_id)`

**검사 조건**

- `tb_stock_txn_after_qty_check`: `CHECK (after_qty >= 0)`
- `tb_stock_txn_chg_qty_check`: `CHECK (chg_qty <> 0)`
- `tb_stock_txn_lot_no_check`: `CHECK ((lot_no IS NULL) OR ((lot_no) <> ''))`
- `tb_stock_txn_reason_check`: `CHECK (((txn_type_cd) <> 'ADJUST') OR ((reason IS NOT NULL) AND ((reason) <> '')) OR (reason_cd IS NOT NULL))`
- `tb_stock_txn_stock_status_cd_check`: `CHECK ((stock_status_cd) IN ('NORMAL', 'HOLD', 'DAMAGED', 'QUARANTINE'))`
- `tb_stock_txn_txn_type_cd_check`: `CHECK ((txn_type_cd) IN ('RECEIVE', 'MOVE_OUT', 'MOVE_IN', 'ADJUST', 'STATUS_CHANGE'))`

## tb_code_group

- 영역: 공통·설정 · 모델: `CodeGroup`
- 공통코드 (docs/decisions/0030): 코드 그룹(서랍) → 코드(서랍 속 물건) 2단계 분류·표시용 값만 공통코드로 관리한다. 프로그램이 값에 따라 동작을 바꾸는 값(창고 유형 등)은 상수 + VARCHAR + CHECK로 둔다 (0084) 업무 표에는 코드 글자(CodeItem.code)를 그대로 저장한다 (예: 담당자 업무 'INBOUND')

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `code_group_id` | 코드 그룹 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `group_cd` | 그룹 코드 | 그룹 코드: 영문 대문자·숫자·밑줄 (예: CONTACT_DUTY), 등록 후 변경 불가 | VARCHAR(30) | N |  | UK |
| 3 | `group_nm` | 그룹 명 |  | VARCHAR(50) | N |  |  |
| 4 | `description` | 설명 |  | VARCHAR(200) | Y |  |  |
| 5 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 6 | `system_yn` | 시스템 여부 | 시스템 그룹: 프로그램이 직접 쓰는 그룹 (시드가 만들고, 삭제할 수 없다) | CHAR(1) | N | N |  |
| 7 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 8 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 9 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 10 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 11 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 12 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 13 | `del_yn` | 삭제여부 | 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 14 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 15 | `fault_party_yn` | fault party 여부 | 'Y'면 이 그룹의 코드마다 귀책(화주·센터·운송사·기타)을 둔다 — 사유 코드 그룹 (0087) | CHAR(1) | N | N |  |

**고유 인덱스**

- `tb_code_group_operator_id_group_cd_key`: `CREATE UNIQUE INDEX tb_code_group_operator_id_group_cd_key ON tb_code_group (operator_id, group_cd) WHERE (del_yn = 'N'::bpchar)`

**검사 조건**

- `tb_code_group_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_code_group_fault_party_yn_check`: `CHECK (fault_party_yn IN ('Y', 'N')`
- `tb_code_group_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`
- `tb_code_group_system_yn_check`: `CHECK (system_yn IN ('Y', 'N')`

## tb_code_item

- 영역: 공통·설정 · 모델: `CodeItem`
- 공통코드 항목: 그룹 안의 코드·이름 (docs/decisions/0030)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `code_item_id` | 코드 품목 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `code_group_id` | 코드 그룹 ID |  | BIGINT | N |  | UK FK → tb_code_group.code_group_id |
| 3 | `code_cd` | 코드 | 코드: 그룹 안에서 중복 금지, 등록 후 변경 불가 (업무 표에 이 글자가 저장되므로) | VARCHAR(20) | N |  | UK |
| 4 | `code_nm` | 코드명 |  | VARCHAR(50) | N |  |  |
| 5 | `description` | 설명 |  | VARCHAR(200) | Y |  |  |
| 6 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 7 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 8 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 9 | `created_by` | 등록 자 | 등록·수정한 사람 아이디(username, 자동: 현재 작업자 / 시드 seed / 기존 데이터 system), 동시 수정 막기용 버전 (docs/db-conventions.md 공통 칸) | VARCHAR(50) | N | system |  |
| 10 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 11 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 12 | `status_cd` | 상태 코드 | 사용 중지: 새로 고를 때만 숨기고, 이미 저장된 값은 이름으로 계속 보여준다 | VARCHAR(20) | N | ACTIVE |  |
| 13 | `del_yn` | 삭제여부 | 코드는 삭제 안 된 것끼리만 겹치면 안 된다 (지운 코드는 다시 쓸 수 있다, 0038) 논리 삭제: 'Y'면 지운 것 (목록·조회에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |
| 14 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 15 | `fault_party_cd` | fault party 코드 | 귀책: 그룹이 귀책을 쓸 때만 (SHIPPER·CENTER·CARRIER·ETC, 상수 FAULT_PARTY + DB 검사, 0087). 표시·집계용 | VARCHAR(20) | Y |  |  |

**고유 인덱스**

- `tb_code_item_code_group_id_code_cd_key`: `CREATE UNIQUE INDEX tb_code_item_code_group_id_code_cd_key ON tb_code_item (code_group_id, code_cd) WHERE (del_yn = 'N'::bpchar)`

**인덱스**

- `tb_code_item_code_group_id_sort_seq_idx`: `CREATE INDEX tb_code_item_code_group_id_sort_seq_idx ON tb_code_item (code_group_id, sort_seq)`
- `tb_code_item_operator_id_idx`: `CREATE INDEX tb_code_item_operator_id_idx ON tb_code_item (operator_id)`

**검사 조건**

- `tb_code_item_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_code_item_fault_party_cd_check`: `CHECK ((fault_party_cd) IN ('SHIPPER', 'CENTER', 'CARRIER', 'ETC'))`
- `tb_code_item_status_cd_check`: `CHECK ((status_cd) IN (('ACTIVE'), ('INACTIVE'))`

## tb_ext_code

- 영역: 공통·설정 · 모델: `ExternalCode`
- 외부 코드 매핑 (docs/decisions/0025): 우리 기준정보 ↔ SAP·ERP 등 외부 시스템 코드 한 줄 = 연동 상대 + 대상 종류 + 대상 id + 외부 코드 - 같은 운영사·같은 연동 상대·같은 종류 안에서 외부 코드 중복 금지 - 한 대상은 연동 상대마다 외부 코드 1개

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ext_code_id` | 외부 코드 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `ext_system_cd` | 외부 시스템 코드 | 연동 상대 키 (src/config/external-systems.ts) | VARCHAR(20) | N |  | UK |
| 3 | `entity_type_cd` | 대상 유형 코드 |  | VARCHAR(20) | N |  | UK |
| 4 | `entity_id` | 대상 ID |  | BIGINT | N |  | UK |
| 5 | `ext_cd` | 외부 코드 |  | VARCHAR(50) | N |  | UK |
| 6 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 7 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 8 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트: 같은 운영사 사람만 보고 고친다, docs/decisions/0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |

**고유 인덱스**

- `tb_ext_code_operator_id_ext_system_cd_entity_type_cd_entity_key`: `CREATE UNIQUE INDEX tb_ext_code_operator_id_ext_system_cd_entity_type_cd_entity_key ON tb_ext_code (operator_id, ext_system_cd, entity_type_cd, entity_id)`
- `tb_ext_code_operator_id_ext_system_cd_entity_type_cd_ext_cd_key`: `CREATE UNIQUE INDEX tb_ext_code_operator_id_ext_system_cd_entity_type_cd_ext_cd_key ON tb_ext_code (operator_id, ext_system_cd, entity_type_cd, ext_cd)`

**인덱스**

- `tb_ext_code_entity_type_cd_entity_id_idx`: `CREATE INDEX tb_ext_code_entity_type_cd_entity_id_idx ON tb_ext_code (entity_type_cd, entity_id)`

**검사 조건**

- `tb_ext_code_entity_type_cd_check`: `CHECK ((entity_type_cd) IN ('CENTER', 'WAREHOUSE', 'LOCATION', 'SHIPPER', 'ITEM', 'CUSTOMER', 'UNIT', 'CARRIER'))`

## tb_carrier

- 영역: 기타 · 모델: `Carrier`
- 운송사 (0094): 택배사·화물·자차·용차. 운영사마다 한 벌 — 새 운영사에 기본 7곳을 복사한다 (src/config/defaults/carriers.ts)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `carrier_id` | carrier ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | UK FK → tb_operator.operator_id |
| 3 | `carrier_cd` | carrier 코드 | 우리 코드 (필수·등록 후 불변, 예: CJ) + 사용자 정의 코드 (화주 시스템의 택배사 코드) | VARCHAR(20) | N |  | UK |
| 4 | `carrier_cust_cd` | carrier 사용자정의코드 |  | VARCHAR(50) | Y |  | UK |
| 5 | `carrier_nm` | carrier 명 |  | VARCHAR(50) | N |  |  |
| 6 | `carrier_type_cd` | carrier 유형 코드 | 운송 유형: 상수 CARRIER_TYPE (PARCEL 택배·FREIGHT 화물·OWN 자차·CHARTER 용차) | VARCHAR(20) | N | PARCEL |  |
| 7 | `invoice_digits` | 송장 digits | 송장번호 자릿수 (체크디지트 포함, 비우면 검사 안 함)·체크디지트 규칙 (상수 INVOICE_CHECK_RULE) | SMALLINT | Y |  |  |
| 8 | `invoice_check_cd` | 송장 검사 코드 |  | VARCHAR(20) | N | NONE |  |
| 9 | `tracking_url` | tracking URL | 배송 조회 주소: {invoiceNo} 자리에 송장번호 | VARCHAR(300) | Y |  |  |
| 10 | `tel_no` | 전화 번호 |  | VARCHAR(15) | Y |  |  |
| 11 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 12 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 13 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 14 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 15 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 16 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 17 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 18 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 19 | `del_yn` | 삭제여부 | 논리 삭제 여부 ('Y' = 지움, 목록에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |

**고유 인덱스**

- `tb_carrier_operator_id_carrier_cd_key`: `CREATE UNIQUE INDEX tb_carrier_operator_id_carrier_cd_key ON tb_carrier (operator_id, carrier_cd) WHERE (del_yn = 'N'::bpchar)`
- `tb_carrier_operator_id_cust_cd_key`: `CREATE UNIQUE INDEX tb_carrier_operator_id_cust_cd_key ON tb_carrier (operator_id, carrier_cust_cd) WHERE ((carrier_cust_cd IS NOT NULL) AND (del_yn = 'N'::bpchar))`

**인덱스**

- `tb_carrier_operator_id_idx`: `CREATE INDEX tb_carrier_operator_id_idx ON tb_carrier (operator_id)`

**검사 조건**

- `tb_carrier_carrier_type_cd_check`: `CHECK ((carrier_type_cd) IN ('PARCEL', 'FREIGHT', 'OWN', 'CHARTER'))`
- `tb_carrier_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_carrier_invoice_check_cd_check`: `CHECK ((invoice_check_cd) IN ('NONE', 'MOD7'))`
- `tb_carrier_invoice_digits_check`: `CHECK ((invoice_digits IS NULL) OR ((invoice_digits >= 4) AND (invoice_digits <= 20)))`
- `tb_carrier_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'INACTIVE'))`

## tb_carrier_contract

- 영역: 기타 · 모델: `CarrierContract`
- 운송 계약 (0094): 센터(·화주)별 택배사 계약 — 고객코드·집하 점소·송장번호 대역 화주를 비우면 센터 공용 계약. 출고 때 고르는 순서: 화주×센터 계약 → 센터 공용 계약 → 화주 기본 택배사

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `contract_id` | 계약 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `carrier_id` | carrier ID |  | BIGINT | N |  | FK → tb_carrier.carrier_id |
| 4 | `center_id` | 센터 ID |  | BIGINT | N |  | FK → tb_center.center_id |
| 5 | `shipper_id` | 화주사 ID |  | BIGINT | Y |  | FK → tb_shipper.shipper_id |
| 6 | `carrier_cust_no` | carrier cust 번호 | 택배사가 준 고객코드(계약번호)·집하 점소 | VARCHAR(30) | N |  |  |
| 7 | `pickup_branch_nm` | pickup branch 명 |  | VARCHAR(50) | Y |  |  |
| 8 | `invoice_start_no` | 송장 시작 번호 | 송장번호 대역: 체크디지트를 뺀 본번호 (시작·끝·다음에 쓸 번호). 실제 발번은 출고 작업에서 | VARCHAR(20) | Y |  |  |
| 9 | `invoice_end_no` | 송장 종료 번호 |  | VARCHAR(20) | Y |  |  |
| 10 | `invoice_next_no` | 송장 next 번호 |  | VARCHAR(20) | Y |  |  |
| 11 | `default_yn` | 기본 여부 | 같은 센터·화주 범위 안의 기본 계약 (택배사가 여럿일 때 먼저 쓰는 것) | CHAR(1) | N | N |  |
| 12 | `valid_from_dt` | valid 시작 일자 |  | DATE | Y |  |  |
| 13 | `valid_to_dt` | valid 대상 일자 |  | DATE | Y |  |  |
| 14 | `status_cd` | 상태 코드 | 상태 | VARCHAR(20) | N | ACTIVE |  |
| 15 | `remark` | 비고 | 비고 | VARCHAR(1000) | Y |  |  |
| 16 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 17 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 18 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 19 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 20 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |
| 21 | `del_yn` | 삭제여부 | 논리 삭제 여부 ('Y' = 지움, 목록에서 빠지고 되살릴 수 있다, 0038) | CHAR(1) | N | N |  |

**인덱스**

- `tb_carrier_contract_carrier_id_idx`: `CREATE INDEX tb_carrier_contract_carrier_id_idx ON tb_carrier_contract (carrier_id)`
- `tb_carrier_contract_center_id_shipper_id_idx`: `CREATE INDEX tb_carrier_contract_center_id_shipper_id_idx ON tb_carrier_contract (center_id, shipper_id)`
- `tb_carrier_contract_operator_id_idx`: `CREATE INDEX tb_carrier_contract_operator_id_idx ON tb_carrier_contract (operator_id)`

**검사 조건**

- `tb_carrier_contract_default_yn_check`: `CHECK (default_yn IN ('Y', 'N')`
- `tb_carrier_contract_del_yn_check`: `CHECK (del_yn IN ('Y', 'N')`
- `tb_carrier_contract_status_cd_check`: `CHECK ((status_cd) IN ('ACTIVE', 'INACTIVE'))`
- `tb_carrier_contract_valid_check`: `CHECK ((valid_to_dt IS NULL) OR (valid_from_dt IS NULL) OR (valid_from_dt <= valid_to_dt))`

## tb_file

- 영역: 기타 · 모델: `File`
- 첨부파일 (docs/decisions/0091): 파일 정보. 바이트는 저장소(src/lib/files/storage.ts)에 storage_key로 있다 지우지 않는 기록이 아니라 실제로 지운다 (대상에서 떼면 파일도 지운다) — 공통 칸(버전·논리 삭제) 없음

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `file_id` | 파일 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `storage_key` | 보관 키 | 저장소 안의 위치 ({운영사}/{연}/{월}/{무작위}) — 원래 이름은 경로에 쓰지 않는다 | VARCHAR(300) | N |  | UK |
| 4 | `original_nm` | original 명 |  | VARCHAR(255) | N |  |  |
| 5 | `mime_type` | mime 유형 |  | VARCHAR(100) | N |  |  |
| 6 | `size_bytes` | size bytes |  | BIGINT | N |  |  |
| 7 | `sha256` | sha256 | 내용 확인값 (같은 파일인지·손상 확인) | CHAR(64) | N |  |  |
| 8 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 9 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_file_storage_key_key`: `CREATE UNIQUE INDEX tb_file_storage_key_key ON tb_file (storage_key)`

**인덱스**

- `tb_file_operator_id_idx`: `CREATE INDEX tb_file_operator_id_idx ON tb_file (operator_id)`

**검사 조건**

- `tb_file_size_bytes_check`: `CHECK (size_bytes >= 0)`

## tb_file_link

- 영역: 기타 · 모델: `FileLink`
- 첨부파일 대상 연결 (0091): 여러 장 붙는 곳 — ITEM 품목(IMAGE 이미지) · INSPECTION 검수(PHOTO 사진). 파일 하나는 한 곳에만

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `file_link_id` | 파일 link ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | FK → tb_operator.operator_id |
| 3 | `file_id` | 파일 ID |  | BIGINT | N |  | UK FK → tb_file.file_id |
| 4 | `entity_type_cd` | 대상 유형 코드 |  | VARCHAR(20) | N |  |  |
| 5 | `entity_id` | 대상 ID |  | BIGINT | N |  |  |
| 6 | `purpose_cd` | purpose 코드 |  | VARCHAR(20) | N |  |  |
| 7 | `sort_seq` | 정렬순서 | 정렬 순서 | INTEGER | N | 0 |  |
| 8 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 9 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |

**고유 인덱스**

- `tb_file_link_file_id_key`: `CREATE UNIQUE INDEX tb_file_link_file_id_key ON tb_file_link (file_id)`

**인덱스**

- `tb_file_link_entity_idx`: `CREATE INDEX tb_file_link_entity_idx ON tb_file_link (entity_type_cd, entity_id)`
- `tb_file_link_operator_id_idx`: `CREATE INDEX tb_file_link_operator_id_idx ON tb_file_link (operator_id)`

**검사 조건**

- `tb_file_link_entity_type_cd_check`: `CHECK ((entity_type_cd) IN ('ITEM', 'INSPECTION'))`
- `tb_file_link_purpose_cd_check`: `CHECK ((purpose_cd) IN ('IMAGE', 'PHOTO'))`

## tb_login_hist

- 영역: 기타 · 모델: `LoginHist`
- 로그인 이력 (docs/decisions/0093): 시도마다 한 줄 — SUCCESS 성공 / FAIL 실패 / LOCKED 잠김 / DISABLED 사용 중지·운영사 정지 없는 아이디로 시도하면 user_id 없이 아이디 글자만. 운영사는 그 사용자의 운영사 (플랫폼 관리자·없는 아이디는 비움)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `login_hist_id` | login 이력 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `user_id` | 사용자 ID |  | BIGINT | Y |  | FK → tb_user.user_id |
| 3 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | Y |  |  |
| 4 | `username` | 아이디 |  | VARCHAR(50) | N |  |  |
| 5 | `result_cd` | 결과 코드 |  | VARCHAR(20) | N |  |  |
| 6 | `ip_address` | IP 주소 |  | VARCHAR(45) | Y |  |  |
| 7 | `user_agent` | 사용자 에이전트 |  | VARCHAR(300) | Y |  |  |
| 8 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**인덱스**

- `tb_login_hist_created_at_idx`: `CREATE INDEX tb_login_hist_created_at_idx ON tb_login_hist (created_at)`
- `tb_login_hist_user_id_created_at_idx`: `CREATE INDEX tb_login_hist_user_id_created_at_idx ON tb_login_hist (user_id, created_at)`

**검사 조건**

- `tb_login_hist_result_cd_check`: `CHECK ((result_cd) IN ('SUCCESS', 'FAIL', 'LOCKED', 'DISABLED'))`

## tb_numbering_rule

- 영역: 기타 · 모델: `NumberingRule`
- 체번 규칙 (docs/decisions/0084): 대상별 코드·문서번호 모양 operator_id NULL = 시스템 기본 규칙, 값이 있으면 그 운영사의 재정의 (같은 대상이면 운영사 행이 이긴다) 번호 = 접두어(고정 문자 / 화주 code_prefix / 상위 코드) + 구분 문자 + 날짜 + 구분자 + 일련번호

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `numbering_rule_id` | 체번규칙 ID |  | BIGINT | N | 자동 증가 | PK |
| 2 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | Y |  | UK FK → tb_operator.operator_id |
| 3 | `target_cd` | 대상 코드 | 대상: SHIPPER·CUSTOMER·SHIP_TO·ITEM·ASN·RECEIPT·LABEL·ADJUST (src/lib/numbering/numbering-codes.ts) | VARCHAR(20) | N |  | UK |
| 4 | `scope_cd` | 범위 코드 | 번호가 하나인 범위: OPERATOR / SHIPPER / CUSTOMER | VARCHAR(20) | N |  |  |
| 5 | `prefix_src_cd` | 접두어출처 코드 | 접두어 출처: FIXED(고정 문자) / SHIPPER_PREFIX(화주 code_prefix) / PARENT_CD(상위 코드 — 납품처) | VARCHAR(20) | N |  |  |
| 6 | `fixed_prefix` | 고정접두어 |  | VARCHAR(5) | Y |  |  |
| 7 | `type_char` | 구분문자 | 엔티티 구분 문자 (거래처 C, 품목 S) | CHAR(1) | Y |  |  |
| 8 | `separator` | 구분자 | 일련번호 앞 구분자 (전표·납품처 '-') | VARCHAR(1) | Y |  |  |
| 9 | `date_fmt_cd` | 날짜형식 코드 | 날짜: NONE / YYMMDD (운영사 타임존 기준 등록일) | VARCHAR(20) | N | NONE |  |
| 10 | `seq_len` | 일련번호자리수 | 일련번호 자리수 (2~8) | SMALLINT | N |  |  |
| 11 | `reset_cycle_cd` | 초기화주기 코드 | 일련번호 초기화 주기: NONE / DAY / MONTH / YEAR | VARCHAR(20) | N | NONE |  |
| 12 | `created_at` | 등록 일시 | 등록 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |
| 13 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N |  |  |
| 14 | `created_by` | 등록 자 | 등록자 아이디 (자동: 작업자 / seed / system) | VARCHAR(50) | N | system |  |
| 15 | `updated_by` | 수정 자 | 수정자 아이디 (자동) | VARCHAR(50) | N | system |  |
| 16 | `row_version` | 행버전 | 동시 수정 막기용 버전 (수정할 때마다 +1, 0038) | INTEGER | N | 1 |  |

**고유 인덱스**

- `tb_numbering_rule_operator_target_key`: `CREATE UNIQUE INDEX tb_numbering_rule_operator_target_key ON tb_numbering_rule (operator_id, target_cd) WHERE (operator_id IS NOT NULL)`
- `tb_numbering_rule_system_target_key`: `CREATE UNIQUE INDEX tb_numbering_rule_system_target_key ON tb_numbering_rule (target_cd) WHERE (operator_id IS NULL)`

**인덱스**

- `tb_numbering_rule_operator_id_idx`: `CREATE INDEX tb_numbering_rule_operator_id_idx ON tb_numbering_rule (operator_id)`

**검사 조건**

- `tb_numbering_rule_date_fmt_cd_check`: `CHECK ((date_fmt_cd) IN (('NONE'), ('YYMMDD'))`
- `tb_numbering_rule_fixed_prefix_check`: `CHECK ((((prefix_src_cd) = 'FIXED') = (fixed_prefix IS NOT NULL)) AND ((fixed_prefix IS NULL) OR ((fixed_prefix) ~ '^[A-Z]{1,5}$')))`
- `tb_numbering_rule_prefix_src_cd_check`: `CHECK ((prefix_src_cd) IN ('FIXED', 'SHIPPER_PREFIX', 'PARENT_CD'))`
- `tb_numbering_rule_reset_cycle_cd_check`: `CHECK ((reset_cycle_cd) IN (('NONE'), ('DAY'), ('MONTH'), ('YEAR'))`
- `tb_numbering_rule_scope_cd_check`: `CHECK ((scope_cd) IN ('OPERATOR', 'SHIPPER', 'CUSTOMER'))`
- `tb_numbering_rule_separator_check`: `CHECK ((separator IS NULL) OR ((separator) IN ('-', '_')))`
- `tb_numbering_rule_seq_len_check`: `CHECK ((seq_len >= 2) AND (seq_len <= 8))`
- `tb_numbering_rule_target_cd_check`: `CHECK ((target_cd) IN ('SHIPPER', 'CUSTOMER', 'SHIP_TO', 'ITEM', 'ASN', 'RECEIPT', 'LABEL', 'ADJUST'))`
- `tb_numbering_rule_type_char_check`: `CHECK ((type_char IS NULL) OR (type_char ~ '^[A-Z]$'))`

## tb_numbering_seq

- 영역: 기타 · 모델: `NumberingSeq`
- 체번 현재값 (docs/decisions/0084): 운영사 × 대상 × 범위 × 주기마다 마지막 번호 발급은 한 문장으로 원자적 증가 (INSERT … ON CONFLICT DO UPDATE … RETURNING) — MAX()+1 금지 이력이 아니라 카운터라 FK를 두지 않는다 (scope_id는 범위에 따라 운영사 0·화주사·거래처 키)

| No | 칼럼 | 한글명 | 설명 | 타입 | NULL | 기본값 | 키 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `operator_id` | 운영사 ID | 운영사 (멀티테넌트 키 — 다른 운영사 데이터는 보이지 않는다, 0039) | BIGINT | N |  | PK |
| 2 | `target_cd` | 대상 코드 |  | VARCHAR(20) | N |  | PK |
| 3 | `scope_id` | 범위 ID | 범위 키: OPERATOR = 0, SHIPPER = shipper_id, CUSTOMER = customer_id | BIGINT | N |  | PK |
| 4 | `period_key` | 주기키 | 주기 키: NONE = '-', DAY = 'YYMMDD', MONTH = 'YYMM', YEAR = 'YY' | VARCHAR(8) | N |  | PK |
| 5 | `last_seq` | 마지막일련번호 |  | BIGINT | N |  |  |
| 6 | `updated_at` | 수정 일시 | 수정 일시 (자동) | TIMESTAMP(3) | N | CURRENT_TIMESTAMP |  |

**검사 조건**

- `tb_numbering_seq_last_seq_check`: `CHECK (last_seq >= 0)`
