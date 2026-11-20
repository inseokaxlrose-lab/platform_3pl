# 화주 연동 API 개발자 가이드 (v1)

화주 시스템(ERP·쇼핑몰·WMS 연동 모듈)이 포털을 쓰지 않고 **거래처·품목·입고예정(ASN)·출고요청**을 직접 주고받는 API입니다.
포털 화면과 같은 규칙으로 처리됩니다(포털에서 되는 일은 API에서도 같은 규칙으로 됩니다).

- 명세(OpenAPI 3.0): `GET {주소}/api/v1/openapi.json` — Swagger UI·Postman에 그대로 불러올 수 있습니다.
- 오류코드: [api-error-codes.md](api-error-codes.md)
- 설계 결정: [decisions/0081-shipper-api.md](decisions/0081-shipper-api.md)

> 지금 열려 있는 엔드포인트는 `GET /me`(연동 확인)입니다. 거래처·품목·ASN·출고요청 API는 이 문서의 공통 규칙대로 차례로 열립니다.

## 1. 연동 절차

1. **운영사에 TEST 키 발급 요청** — 운영사 관리자가 화주사 화면에서 발급합니다. 키는 발급 직후 한 번만 보이므로 안전하게 받아 보관하세요.
2. **`GET /me`로 연결 확인** — 키의 화주·환경·권한·이용 센터가 돌아오면 성공입니다.
3. **TEST 키로 개발·검증** — TEST 키는 **검증만 하고 저장하지 않습니다**(dry-run). 응답은 실제와 같은 모양이고 `dryRun: true`가 붙습니다. 형식·필수값·코드 매핑을 마음껏 확인하세요.
4. **LIVE 키 발급 요청** — 화주 서버의 고정 IP를 함께 알려 주세요(허용 IP로 등록 권장).
5. **운영 전환** — 화주 상태가 "운영중"이어야 LIVE 키로 저장됩니다(준비중에는 TEST 키만).

## 2. 인증

```http
GET /api/v1/me HTTP/1.1
Host: wms.example.com
X-API-Key: live_ak7f2c9x_9XqT…
```

- 헤더 `X-API-Key`에 키를 넣습니다. **HTTPS 전용**입니다(HTTP는 `HTTPS_REQUIRED`).
- 키 형식: `{test|live}_{식별부 8자}_{비밀부 40자}`. 키 하나가 화주를 정하므로 **URL·본문에 화주코드를 넣지 않습니다.** 본문에 다른 화주코드가 있어도 키의 화주로 처리합니다.
- 키는 서버 환경변수·비밀 저장소에 두고, 소스 코드·브라우저·앱에 넣지 마세요. 유출이 의심되면 즉시 운영사에 폐기를 요청하세요.
- **키 교체**: 환경마다 사용 중인 키를 2개까지 둘 수 있습니다. 새 키를 받아 시스템에 적용한 뒤 옛 키 폐기를 요청하면 끊김 없이 바꿀 수 있습니다.

```bash
curl -s https://wms.example.com/api/v1/me -H "X-API-Key: $WMS_API_KEY"
```

## 3. 요청

- `Content-Type: application/json`, UTF-8.
- 일시는 ISO-8601 오프셋 포함(`2026-11-17T19:53:00+09:00`), 날짜는 `YYYY-MM-DD`.
- **등록 API는 배열**로 받습니다: 본문이 배열이거나 `{ "items": [ … ] }`. 한 번에 **500건**까지(넘으면 413 `TOO_MANY_ITEMS`).
- 코드는 **화주가 쓰는 코드 그대로** 보냅니다(거래처코드·품목코드·ASN번호·주문번호). 화주 안에서 유일하면 됩니다.
- 단위 코드는 화주 코드를 받아 운영사의 외부코드 매핑으로 바꾸고, 매핑이 없으면 시스템 단위코드(EA·BOX·KG …)로 맞춥니다.

## 4. 응답 (공통 봉투)

모든 응답에 `requestId`가 있습니다(헤더 `X-Request-Id`와 같음). **문의할 때 이 값을 알려 주세요.**

한 건 조회:

```json
{ "requestId": "req_20261117_8f3a1c2b4d5e6f70", "result": "SUCCESS", "data": { … } }
```

등록(배열) — **건별 결과**를 돌려줍니다. 100건 중 3건이 오류면 97건은 처리되고 3건의 사유가 옵니다:

```json
{
  "requestId": "req_20261117_8f3a1c2b4d5e6f70",
  "result": "PARTIAL",
  "summary": { "total": 100, "success": 97, "fail": 3 },
  "items": [
    { "seq": 1, "docNo": "ORD-001", "result": "CREATED", "id": "1234" },
    { "seq": 2, "docNo": "ORD-002", "result": "FAIL",
      "errors": [ { "code": "NOT_FOUND", "field": "lines[0].itemCd", "message": "등록되지 않은 품목입니다: A123" } ] }
  ]
}
```

- `result`: `SUCCESS`(모두 성공) · `PARTIAL`(일부 실패) · `FAIL`(모두 실패 또는 요청 오류).
- 건별 `result`: `CREATED` · `UPDATED` · `UNCHANGED`(바뀐 것 없음) · `DUPLICATE`(이미 있는 문서) · `FAIL`.
- HTTP 상태: 요청 자체가 처리되면 **200**(부분 성공도 200). 인증 401 · 권한 403 · 형식 400 · 건수 초과 413 · 멱등 충돌 409 · 호출 한도 429 · 서버 오류 500.
- 오류 응답: `{ "requestId", "result": "FAIL", "error": { "code", "message", "field"?, "category" } }`. **`code`로 분기하세요**(문구는 바뀔 수 있음).

## 5. 중복 전송 (멱등)

네트워크가 끊겨 응답을 못 받았을 때 다시 보내도 **두 번 처리되지 않게** 합니다.

- 쓰기 요청에 `Idempotency-Key: {요청마다 고유한 값, 예: UUID}` 헤더를 넣으세요(24시간 유효).
  - 같은 키 + 같은 본문 → **처음 응답을 그대로** 돌려줍니다(헤더 `Idempotent-Replayed: true`). 다시 처리하지 않습니다.
  - 같은 키 + 다른 본문 → 409 `IDEMPOTENCY_CONFLICT`.
- 헤더가 없어도 **화주 문서번호 기준 중복 처리**는 항상 합니다. 같은 ASN번호·주문번호를 다시 보내면 `DUPLICATE`가 옵니다.
- 거래처·품목은 **upsert**(없으면 생성, 있으면 수정)라 같은 내용을 여러 번 보내도 안전합니다. ASN·출고요청은 생성과 수정·취소가 따로 있어 실수로 덮어쓰지 않습니다.

## 6. 조회 · 변경분 (각 조회 API 공통 규칙)

- 목록 조회는 **커서 페이징**: `?limit=100`(최대 500)으로 부르고, 응답의 `nextCursor`를 다음 요청의 `?cursor=`로 넘깁니다. `nextCursor`가 없으면 끝입니다.
- **변경분 조회**: `?updatedAfter=2026-11-17T09:00:00+09:00` — 마지막으로 조회한 뒤 바뀐 건만(입고 결과·출고 결과·송장번호 폴링용). 응답의 가장 늦은 변경 일시를 저장해 두었다가 다음에 넘기세요.

## 7. 호출 한도

- 키마다 **분당 호출 수**가 정해져 있습니다(기본 120회, 운영사가 조정).
- 모든 응답 헤더에 `X-RateLimit-Limit`(한도)·`X-RateLimit-Remaining`(이번 1분 남은 수)이 있습니다.
- 넘으면 429 `RATE_LIMITED`와 `Retry-After`(초)가 옵니다. 그 시간만큼 기다린 뒤 다시 보내세요. 대량 등록은 배열(500건)로 묶어 호출 수를 줄이세요.

## 8. 버전 · 하위 호환

- 주소는 `/api/v1/…`. 하위 호환이 깨지는 변경은 `v2`로 냅니다.
- **필드 추가는 같은 버전에서** 합니다. 화주 시스템은 **모르는 응답 필드를 무시**하도록 만들어 주세요(엄격한 스키마 검사로 실패하지 않게).
- 오류코드는 한 번 정하면 바꾸지 않습니다.

## 9. 화주 상태와 API

| 화주 상태 | TEST 키 | LIVE 키 |
| --- | --- | --- |
| 준비중 | 됨 | 안 됨 (`CLIENT_NOT_ACTIVE`) |
| 운영중 | 됨 | 됨 |
| 일시정지 | 됨 | 조회만 (쓰기는 `CLIENT_SUSPENDED`) |
| 해지 | 키 모두 폐기 | 키 모두 폐기 |

운영사가 화주의 "API 사용"을 끄면 키가 있어도 모든 호출이 `API_DISABLED`입니다.

## 10. 거래처 · 납품처 API

거래처(partner)는 화주가 물건을 파는 상대, 납품처(shipTo)는 실제로 물건을 받는 곳입니다. 출고요청은 거래처와 납품처 코드로 들어오므로, **주문보다 먼저 거래처를 연동**하세요. 필드와 화면 칸의 대응은 [`docs/api-partner-fields.md`](api-partner-fields.md)에 있습니다.

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/partners` | `PARTNER_WRITE` | 거래처 upsert (납품처 배열 포함 가능), 최대 500건 |
| GET | `/partners` | `PARTNER_READ` | 목록 (`updatedAfter`·`cursor`·`limit`) |
| GET | `/partners/{partnerCd}` | `PARTNER_READ` | 상세 (납품처 포함) |
| POST | `/partners/{partnerCd}/ship-tos` | `PARTNER_WRITE` | 납품처 upsert, 최대 500건 (건 하나 = 납품처 하나) |
| GET | `/partners/{partnerCd}/ship-tos` | `PARTNER_READ` | 납품처 목록 |

**upsert 규칙 (꼭 읽어 주세요)**

1. 업무 키는 `partnerCd`(화주 안에서 고유), 납품처는 `partnerCd + shipToCd`입니다. 둘 다 **등록 후 바꿀 수 없습니다.**
2. 이미 있는 거래처는 **보낸 필드만 고칩니다.** 안 보낸 필드는 그대로이고, `null`을 보내면 그 값을 지웁니다(필수 필드는 지울 수 없음).
3. `shipTos`는 **보낸 납품처만** 추가·수정합니다. 배열에 없는 기존 납품처는 건드리지 않습니다. 쓰지 않는 납품처는 `"status": "INACTIVE"`로 보내세요.
4. 새 거래처에 `shipTos`가 없으면 거래처 주소로 **기본 납품처**를 만듭니다(코드·이름은 거래처와 같게). 주소도 없으면 `PARTNER_ADDRESS_REQUIRED`.
5. 기본 납품처는 거래처당 정확히 1곳입니다. `"default": true`로 보내면 나머지는 기본에서 풀립니다.
6. 배송센터: `centerCd`가 있으면 그 센터(이용 센터여야 함), `null`이면 주소로 자동 지정, 안 보내면 지금 지정 그대로입니다. 정하지 못했을 때의 처리는 화주 정책에 따릅니다(대응표 문서 마지막 표).
7. 내용이 지금과 같으면 `UNCHANGED`입니다(수정일이 바뀌지 않음). 같은 요청을 다시 보내도 안전합니다.

**응답 건별 결과** — 거래처 결과 안에 납품처별 결과가 함께 옵니다.

```json
{ "seq": 1, "docNo": "P10023", "result": "CREATED", "id": "1201",
  "shipTos": [
    { "shipToCd": "P10023-01", "result": "CREATED", "addrGrade": "A", "zipCd": "06236",
      "centerCd": "ICN", "centerAssignType": "AUTO", "centerAssignStatus": "ASSIGNED", "regionMismatch": false }
  ] }
```

- `centerAssignStatus`가 `NEED_CONFIRM`이면 `confirmReason`이 함께 옵니다. 운영사가 확인해 센터를 정하면 조회 API에 반영됩니다.
- 정책으로 반려된 납품처는 `shipTos[].result = "FAIL"`과 `errors`가 오고, 거래처는 정상 처리됩니다. 단, 그 때문에 기본 납품처가 없어지는 새 거래처는 거래처도 `FAIL`입니다.
- TEST 키는 같은 결과(자동 지정될 배송센터 포함)를 계산만 하고 저장하지 않습니다.

## 11. 품목 API

품목(item)은 화주가 맡기는 상품입니다. 입고예정(ASN)·출고요청은 품목코드로 들어오므로, **입고예정보다 먼저 품목을 연동**하세요. 필드와 화면 칸·엑셀 제목의 대응은 [`docs/api-item-fields.md`](api-item-fields.md)에 있습니다.

| 메서드 | 경로 | 권한 | 설명 |
| --- | --- | --- | --- |
| POST | `/items` | `ITEM_WRITE` | 품목 upsert (단위·팔레트·바코드 포함), 최대 500건 |
| GET | `/items` | `ITEM_READ` | 목록 (`updatedAfter`·`cursor`·`limit`) |
| GET | `/items/{itemCd}` | `ITEM_READ` | 상세 (단위·바코드·PLT 계산값 포함) |

**upsert 규칙 (꼭 읽어 주세요)**

1. 업무 키는 `itemCd`(화주 안에서 고유)입니다. **등록 후 바꿀 수 없습니다.**
2. 이미 있는 품목은 **보낸 필드만 고칩니다.** 안 보낸 필드는 그대로이고, `null`을 보내면 그 값을 지웁니다(필수 필드는 지울 수 없음).
3. `uoms`·`barcodes`는 **보낸 행만** 추가·수정합니다. 지우려면 그 행에 `"delete": true`를 보내세요. 기본단위는 `baseUom`으로만 정합니다.
4. 단위 코드는 우리 단위 코드(EA·BOX·PLT 등) 또는 운영사가 **외부코드 매핑(대상: 단위)**에 등록한 화주 코드입니다. 화주가 CS·CT 같은 자기 코드를 쓰면 운영사에 매핑을 요청하세요.
5. `pallet`(종류·`ti`·`hi`, 또는 `boxQty`)를 보내면 PLT 수량·높이·중량을 계산합니다. 적재 정보가 없을 때만 `uoms`의 PLT `qtyInBase`를 직접 씁니다.
6. 새 품목에서 `expiryMgmt`·`lotMgmt`를 안 보내면 **화주 설정**을 따릅니다. 기한 관리면 `expiryType`·`expiryInput`, 제조일 입력이면 `shelfLifeDays`, LOT 관리면 `lotSource`가 필요합니다.
7. **재고나 미완료 입고예정이 있는 품목**은 `baseUom`·`expiryMgmt`·`lotMgmt`·`serialMgmt`를 바꿀 수 없습니다(`ITEM_STOCK_EXISTS`·`ITEM_OPEN_DOC_EXISTS`). 다른 필드는 고칠 수 있습니다.
8. 바코드는 같은 화주사 안에서만 겹칠 수 없습니다(`BARCODE_DUPLICATE`). EAN-13·ITF-14 등은 체크디지트를 검사합니다.
9. 내용이 지금과 같으면 `UNCHANGED`입니다(수정일이 바뀌지 않음). 같은 요청을 다시 보내도 안전합니다.

**요청 예시**

```json
[
  { "itemCd": "A10001", "itemNm": "진라면 매운맛 120g", "itemType": "PRODUCT", "baseUom": "EA",
    "uoms": [ { "uom": "BOX", "level": "BOX", "qtyInBase": 40,
                "widthCm": 52.0, "depthCm": 36.0, "heightCm": 28.0, "grossWeightKg": 5.4 } ],
    "pallet": { "type": "T11", "ti": 8, "hi": 6 },
    "expiryMgmt": true, "expiryType": "CONSUME", "expiryInput": "EXPIRY", "shelfLifeDays": 240,
    "lotMgmt": true, "lotSource": "INPUT",
    "barcodes": [ { "uom": "EA", "barcode": "8801234567893", "type": "EAN13", "primary": true } ] }
]
```

**응답 건별 결과** — 계산값과 경고(저장은 됨)가 함께 옵니다.

```json
{ "seq": 1, "docNo": "A10001", "result": "CREATED", "id": "3001",
  "volumeStatus": "OK",
  "box": { "qtyInBase": 40, "cbm": 0.052416, "grossWeightKg": 5.4 },
  "plt": { "qtyInBase": 1920, "boxQty": 48, "heightCm": 183, "cbm": 2.2143, "grossWeightKg": 284.2, "calculated": true },
  "warnings": [ { "code": "PALLET_HEIGHT_EXCEEDED", "message": "팔레트 높이 183.0cm가 권장 180cm를 넘습니다." } ] }
```

- `warnings`는 저장된 뒤 알려 주는 것입니다(체적 미등록·밀도 이상·팔레트 높이/중량 초과 등). 코드 목록은 대응표 문서에 있습니다.
- 실패한 건은 `result: "FAIL"`과 `errors[]`(`code`·`message`·`field`)가 옵니다. 한 건이 실패해도 나머지 건은 처리됩니다.
- TEST 키는 같은 결과(계산값·경고 포함)를 계산만 하고 저장하지 않습니다.

## 12. 문의

문제가 생기면 **`requestId`**, 호출 일시, 엔드포인트를 운영사에 알려 주세요. 운영사는 "연동 → API 호출 이력"에서 요청·응답 본문(개인정보는 가려 저장)과 건별 결과를 확인합니다.
