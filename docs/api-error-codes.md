# 화주 연동 API 오류코드

화주 시스템은 **오류코드(`error.code`, 건별 `errors[].code`)로 분기**합니다. 코드는 한 번 정하면 바꾸지 않고, 문구는 바뀔 수 있습니다.
코드의 출처는 `src/lib/api/api-errors.ts`이고, 이 문서와 코드가 다르면 테스트(`src/lib/api/api-docs.test.ts`)가 실패합니다. 결정 기록: `docs/decisions/0081-shipper-api.md`.

## 응답 모양

```json
{ "requestId": "req_20261117_8f3a1c2b4d5e6f70", "result": "FAIL",
  "error": { "code": "SCOPE_REQUIRED", "message": "이 API는 ITEM_WRITE 권한이 필요합니다.", "category": "권한" } }
```

- 요청 자체가 처리되면 **200**입니다(전체 성공·부분 성공 모두). 건별 오류는 `items[].errors[]`에 들어갑니다.
- 문의할 때는 `requestId`(응답 헤더 `X-Request-Id`)를 알려 주세요.

## 코드 목록

| 코드 | HTTP | 분류 | 뜻 · 화주 쪽 처리 |
| --- | --- | --- | --- |
| `API_KEY_MISSING` | 401 | 인증 | `X-API-Key` 헤더가 없음 |
| `API_KEY_INVALID` | 401 | 인증 | 키 형식이 틀리거나 없는 키 (어느 쪽인지는 알려주지 않음) |
| `API_KEY_REVOKED` | 401 | 인증 | 폐기된 키 → 운영사에 새 키 요청 |
| `API_KEY_EXPIRED` | 401 | 인증 | 만료된 키 → 운영사에 새 키 요청 |
| `HTTPS_REQUIRED` | 403 | 권한 | HTTP로 호출함 → HTTPS로 |
| `IP_NOT_ALLOWED` | 403 | 권한 | 키에 허용되지 않은 IP |
| `API_DISABLED` | 403 | 권한 | 화주의 API 사용이 꺼져 있음 |
| `OPERATOR_DISABLED` | 403 | 권한 | 운영사 이용이 중지됨 |
| `CLIENT_NOT_ACTIVE` | 403 | 권한 | 준비중 화주가 LIVE 키로 호출 → TEST 키로 검증 |
| `CLIENT_SUSPENDED` | 403 | 권한 | 일시정지 화주의 LIVE 쓰기 호출 (조회는 됨) |
| `CLIENT_TERMINATED` | 403 | 권한 | 해지된 화주 |
| `SCOPE_REQUIRED` | 403 | 권한 | 키에 이 API의 권한이 없음 |
| `INVALID_JSON` | 400 | 형식 | 본문이 JSON이 아님 |
| `VALIDATION_FAILED` | 400 | 형식 | 입력값 오류 (`field`에 칸 위치) — 건별 오류로도 옴 |
| `NOT_FOUND` | 404 | 참조 없음 | 대상(거래처·품목·ASN·주문)을 찾을 수 없음 — 건별 오류로도 옴 |
| `STATUS_NOT_ALLOWED` | 409 | 상태 불가 | 지금 상태에서는 할 수 없음 (예: 입고 시작된 ASN 수정) |
| `DUPLICATE` | 409 | 중복 | 이미 있는 문서번호 (ASN번호·주문번호) — 건별 결과 |
| `POLICY_VIOLATION` | 422 | 정책 위반 | 화주 정책에 맞지 않음 (예: 미등록 품목 주문 불허) |
| `CUSTOMER_CD_INVALID` | 400 | 형식 | 거래처 키(조회 키에 따라 `customerCd` 또는 `customerCustCd`)가 없음, `customerCd`가 영문·숫자·`-`·`_` 30자를 벗어남, 우리 코드를 바꾸려 함 — 건별 |
| `SHIP_TO_CD_INVALID` | 400 | 형식 | 납품처 키(`shipToCd` 또는 `shipToCustCd`)가 없거나 형식 오류, 한 거래처 안에서 두 번 보냄, 우리 코드를 바꾸려 함 — 건별 |
| `CUSTOMER_ADDRESS_REQUIRED` | 422 | 정책 위반 | 새 거래처에 `shipTos`도 주소도 없음 → 주소(`addr1`)를 보내거나 납품처를 함께 |
| `DEFAULT_SHIP_TO_REQUIRED` | 422 | 정책 위반 | 기본 납품처가 0곳·2곳이 되는 요청 (기본 납품처가 반려되어 없어진 새 거래처 포함) |
| `LAST_SHIP_TO_INACTIVE` | 422 | 정책 위반 | 기본·마지막 사용 중 납품처를 `INACTIVE`로 바꾸는 요청 → 다른 납품처를 먼저 기본으로 |
| `CENTER_REQUIRED` | 422 | 정책 위반 | 화주 정책이 "배송센터 필수"인데 `centerCd`가 없음 — 납품처 건별 |
| `INVALID_CENTER_CD` | 404 | 참조 없음 | 없는 센터코드 — 납품처 건별 (정책이 자동 보류면 반려 대신 "확인 필요"로 저장) |
| `NOT_SHIPPER_CENTER` | 422 | 정책 위반 | 화주가 이용하지 않는 센터 — 납품처 건별 |
| `CENTER_INACTIVE` | 409 | 상태 불가 | 일시중지·폐쇄된 센터 — 납품처 건별 |
| `ADDRESS_NOT_RESOLVED` | 422 | 정책 위반 | 주소를 확인하지 못함(정제 실패·자동 지정 등급 미만) — 정책이 자동 반려일 때 납품처 건별 |
| `REGION_UNASSIGNED` | 422 | 정책 위반 | 권역설정에 배정되지 않은 지역 — 정책이 자동 반려일 때 납품처 건별 |
| `REGION_MIXED` | 422 | 정책 위반 | 여러 센터가 섞인 지역 → `centerCd`를 보내세요 — 정책이 자동 반려일 때 납품처 건별 |
| `ITEM_CD_INVALID` | 400 | 형식 | 품목 키(조회 키에 따라 `itemCd` 또는 `itemCustCd`)가 없음, `itemCd`가 영문·숫자·`.`·`-`·`_` 50자를 벗어남, 품목코드를 바꾸려 함 — 품목 건별 |
| `BASE_UOM_INVALID` | 422 | 정책 위반 | `baseUom`이 포장 단위·사용 중지 단위, 또는 `uoms`로 기본단위를 보냄 — 품목 건별 |
| `UOM_NOT_FOUND` | 404 | 참조 없음 | 없는 단위 코드(우리 코드·외부코드 매핑 모두 없음), 포장 단위가 아닌 `uoms`, 품목에 없는 단위의 바코드 — 품목 건별 |
| `UOM_QTY_INVALID` | 422 | 정책 위반 | 환산수량 순서(BASE < INNER < BOX < PLT) 위반, 기본단위 소수 자리 초과 — 품목 건별 |
| `PALLET_TYPE_NOT_FOUND` | 404 | 참조 없음 | 없는 팔레트 종류(`pallet.type`) — 품목 건별 |
| `BARCODE_DUPLICATE` | 409 | 중복 | 같은 화주사의 다른 품목이 쓰는 바코드, 또는 한 품목에 같은 바코드 두 번 — 품목 건별 |
| `BARCODE_CHECKDIGIT` | 400 | 형식 | EAN-13·EAN-8·UPC-A·ITF-14의 자리수·체크디지트가 틀림 — 품목 건별 |
| `EXPIRY_INFO_REQUIRED` | 422 | 정책 위반 | `expiryMgmt: true`인데 `expiryType`·`expiryInput`이 없음 — 품목 건별 |
| `SHELF_LIFE_REQUIRED` | 422 | 정책 위반 | `expiryInput`이 `MFG`·`BOTH`인데 `shelfLifeDays`가 없음 — 품목 건별 |
| `LOT_SOURCE_REQUIRED` | 422 | 정책 위반 | `lotMgmt: true`인데 `lotSource`가 없음 — 품목 건별 |
| `ITEM_STOCK_EXISTS` | 409 | 상태 불가 | 재고가 있는 품목의 `baseUom`·`expiryMgmt`·`lotMgmt`·`serialMgmt` 변경 — 품목 건별 |
| `ITEM_OPEN_DOC_EXISTS` | 409 | 상태 불가 | 미완료 입고예정이 있는 품목의 관리 여부 변경, 또는 그 단위로 입력된 ASN이 있는데 환산수량 변경 — 품목 건별 |
| `IDEMPOTENCY_CONFLICT` | 409 | 중복 | 같은 `Idempotency-Key`로 다른 본문을 보냄 |
| `TOO_MANY_ITEMS` | 413 | 한도 | 한 번에 보낼 수 있는 건수(500) 초과 |
| `RATE_LIMITED` | 429 | 한도 | 분당 호출 한도 초과 → `Retry-After`초 뒤 다시 |
| `INTERNAL_ERROR` | 500 | 서버 | 서버 오류 → `requestId`로 문의 |
